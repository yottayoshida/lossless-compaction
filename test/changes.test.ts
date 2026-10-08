import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CHANGES, DEFAULTS_TOLD, changesNotice, changesToTell, compareVersions, setupFrom, type Setup, type Told } from '../src/changes.ts';
import { NUMBER_SETTINGS } from '../src/flow.ts';
import { VERSION } from '../src/status.ts';
import type { Taint } from '../src/trust.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** On the defaults, as Claude Code hands them over, with a key in TypeSafe's variable that 0.7.1 sent. */
const AFFECTED: Setup = {
  options: { provider: 'auto', model: 'jev-latest', targetPercent: 1, keepTokens: 20_000, minChars: 2000, maxAfterPercent: 75 },
  keysIn: { TYPESAFE_API_KEY: true },
};

/** The plugin's own store, one key of it; whether a place results were kept in is there; the setup; and what was asked. */
function kept(initial?: unknown, used: boolean | null = true, setup: Setup = AFFECTED) {
  let value = initial;
  const writes: string[] = [];
  const asked = { used: 0, setup: 0 };
  const told: Told = {
    read: async () => value,
    write: async (version) => {
      value = version;
      writes.push(version);
    },
    used: async () => {
      asked.used += 1;
      return used;
    },
    setup: async () => {
      asked.setup += 1;
      return setup;
    },
  };
  return { told, writes, asked, value: () => value };
}

const NEXT = '0.8.0';
const said = (lines: readonly string[]) => lines.map((line) => line.replace(/^version \S+: since (\S+) .*$/, '$1'));

test('a new install is told nothing and recorded, in any session; one whose store is there is told every change that applies (#139)', async () => {
  for (const interactive of [true, false]) {
    const store = kept(undefined, false);
    assert.deepEqual(await changesToTell(store.told, NEXT, interactive), []);
    assert.deepEqual(store.writes, [NEXT], `interactive ${interactive}`);
  }
  // A version that kept no record ran before: both releases are said, each naming its own, under the version now.
  const older = kept(undefined, true);
  const lines = await changesToTell(older.told, NEXT, true);
  assert.deepEqual(said(lines), ['0.7.1', '0.8.0']);
  assert.ok(lines.every((line) => line.startsWith(`version ${NEXT}: since `)));
  assert.equal(older.value(), NEXT);
});

test('only the releases after the one last told are said, and only where they change this setup (#139)', async () => {
  assert.deepEqual(said(await changesToTell(kept('0.7.1').told, NEXT, true)), ['0.8.0']);
  // A key of the plugin's own is sent as before; with no key 0.7.1 sent, nothing changed; a provider chosen, by name
  // or by an account id, reads its variable as before.
  const unaffected: Setup[] = [
    { ...AFFECTED, options: { ...AFFECTED.options, apiKey: 'a key of its own' } },
    { ...AFFECTED, keysIn: { TYPESAFE_API_KEY: false } },
    { ...AFFECTED, options: { ...AFFECTED.options, provider: 'typesafe' } },
    { ...AFFECTED, options: { ...AFFECTED.options, cloudflareAccountId: '0123456789abcdef0123456789abcdef' } },
  ];
  for (const setup of unaffected) {
    const store = kept('0.7.1', true, setup);
    assert.deepEqual(await changesToTell(store.told, NEXT, true), [], JSON.stringify(setup));
    assert.equal(store.value(), NEXT, 'moved on all the same');
  }
  // targetPercent set to something else is not told the default changed.
  const own = { ...AFFECTED, options: { ...AFFECTED.options, targetPercent: 40 }, keysIn: { TYPESAFE_API_KEY: false } };
  assert.deepEqual(await changesToTell(kept(undefined, true, own).told, NEXT, true), []);
});

test('said once a version: a second start reads the record alone and says nothing, nor a version gone back to (#139)', async () => {
  const store = kept('0.7.1');
  assert.equal((await changesToTell(store.told, NEXT, true)).length, 1);
  assert.deepEqual(await changesToTell(store.told, NEXT, true), []);
  assert.deepEqual(store.writes, [NEXT]);
  // Every start after the first reads the record and nothing else: no place is looked at, no settings file read.
  const same = kept(NEXT);
  assert.deepEqual(await changesToTell(same.told, NEXT, true), []);
  assert.deepEqual(same.asked, { used: 0, setup: 0 });
  const back = kept('0.9.0');
  assert.deepEqual(await changesToTell(back.told, NEXT, true), []);
  assert.deepEqual(back.writes, [NEXT], 'going up again is said from here');
});

test('a session nobody is at tells nothing and moves nothing on, and the next one a person is at says it (#139)', async () => {
  const store = kept('0.7.1');
  assert.deepEqual(await changesToTell(store.told, NEXT, false), []);
  assert.deepEqual(store.writes, []);
  assert.deepEqual(said(await changesToTell(store.told, NEXT, true)), ['0.8.0']);
  const before = kept(undefined, true);
  assert.deepEqual(await changesToTell(before.told, NEXT, false), []);
  assert.deepEqual(before.writes, [], 'a store an older version made is not taken for a new install');
});

test('a setup that cannot be read, as where the repository\'s settings do not read, says nothing and moves nothing on (#139)', async () => {
  const store = kept('0.7.1');
  store.told.setup = async () => {
    throw new Error("the repository's settings files could not be read");
  };
  await assert.rejects(changesToTell(store.told, NEXT, true));
  assert.deepEqual(store.writes, [], 'the next start tries again');
  assert.equal(store.value(), '0.7.1');
});

test('with no record and no place that can be trusted, nothing is said or written (#139)', async () => {
  const store = kept(undefined, null);
  assert.deepEqual(await changesToTell(store.told, NEXT, true), []);
  assert.deepEqual(store.writes, []);
  // A record that is not a version is read as none.
  assert.deepEqual(said(await changesToTell(kept({ any: 'thing' }, true).told, NEXT, true)), ['0.7.1', '0.8.0']);
});

test("the key 0.7.1 sent is one in TypeSafe's variable, of characters a key can have, that nothing a repository's settings hold decides on (#139)", () => {
  const options = AFFECTED.options;
  const repo = (name: string): Taint => ({ kind: 'env', name, source: 'local' });
  assert.equal(setupFrom(options, { TYPESAFE_API_KEY: ' made-up-key ' }, []).keysIn.TYPESAFE_API_KEY, true);
  // None, a blank one, one a key cannot be, settings that could not be read, and the key or a proxy a repository put there.
  for (const [env, taints] of [
    [{}, []],
    [{ TYPESAFE_API_KEY: '  ' }, []],
    [{ TYPESAFE_API_KEY: 'two words' }, []],
    [{ TYPESAFE_API_KEY: 'made-up-key' }, null],
    [{ TYPESAFE_API_KEY: 'made-up-key' }, [repo('TYPESAFE_API_KEY')]],
    [{ TYPESAFE_API_KEY: 'made-up-key' }, [repo('HTTPS_PROXY')]],
  ] as const) {
    assert.equal(setupFrom(options, env, taints).keysIn.TYPESAFE_API_KEY, false, JSON.stringify([env, taints]));
  }
});

test('the defaults a line was last written for are the defaults in use: a default changed without a line fails here (#139)', () => {
  const manifest = JSON.parse(read('../.claude-plugin/plugin.json')) as { userConfig: Record<string, { default?: unknown }> };
  const defaults = Object.fromEntries(Object.entries(manifest.userConfig).filter(([, field]) => field.default !== undefined).map(([name, field]) => [name, field.default]));
  assert.deepEqual(defaults, { ...DEFAULTS_TOLD }, 'write the line in src/changes.ts, then set DEFAULTS_TOLD anew');
  for (const [name, setting] of Object.entries(NUMBER_SETTINGS)) assert.equal(DEFAULTS_TOLD[name as keyof typeof NUMBER_SETTINGS], setting.fallback, name);
});

test('each change names a release of the CHANGELOG, or the one release the changes not yet released are to become (#139)', () => {
  const changelog = read('../CHANGELOG.md');
  const released = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((match) => match[1] ?? '');
  assert.ok(released.includes(VERSION), `the CHANGELOG has ${VERSION}`);
  // Released: the Unreleased section is empty again, and a line still under a version to come would never be said.
  const unreleased = /^## \[Unreleased\]\n([\s\S]*?)^## \[/m.exec(changelog)?.[1] ?? '';
  const coming = CHANGES.filter((change) => !released.includes(change.version));
  for (const change of coming) assert.ok(compareVersions(change.version, VERSION) > 0, `${change.version} is neither released nor to come`);
  assert.ok(coming.length <= (/^- /m.test(unreleased) ? 1 : 0), `${coming.map((change) => change.version).join(', ')}: to come, with ${/^- /m.test(unreleased) ? '' : 'no '}changes not yet released`);
  for (let at = 1; at < CHANGES.length; at++) assert.ok(compareVersions((CHANGES[at - 1] as { version: string }).version, (CHANGES[at] as { version: string }).version) < 0);
  assert.throws(() => compareVersions('0.8', '0.8.0'));
  assert.equal(changesNotice(NEXT, 1), 'version 0.8.0: a change that may affect you, in the transcript');
});
