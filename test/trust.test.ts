import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  KEY_VARIABLES,
  PLACE_VARIABLES,
  ROUTE_VARIABLES,
  describeTaints,
  placeTaints,
  sendTaints,
  taintsFrom,
  type RepoSource,
  type Seen,
} from '../src/trust.ts';

const SOURCES: readonly RepoSource[] = ['project', 'local'];
const ID = 'lossless-compaction@lossless-compaction';

/** The two files with one value in one of them, and the plugin seeing it as well. */
function repoWith(source: RepoSource, file: Record<string, unknown>) {
  return { project: source === 'project' ? file : {}, local: source === 'local' ? file : {} };
}

test('the variables judged are these, written out here so that one dropped from the lists fails', () => {
  assert.deepEqual([...PLACE_VARIABLES], ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR']);
  assert.deepEqual([...KEY_VARIABLES], ['TYPESAFE_API_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
  assert.deepEqual(
    [...ROUTE_VARIABLES].sort(),
    [
      'ALL_PROXY',
      'HTTPS_PROXY',
      'HTTP_PROXY',
      'NODE_EXTRA_CA_CERTS',
      'NODE_TLS_REJECT_UNAUTHORIZED',
      'NO_PROXY',
      'SSL_CERT_DIR',
      'SSL_CERT_FILE',
      'all_proxy',
      'http_proxy',
      'https_proxy',
      'no_proxy',
    ],
  );
});

test('a variable a settings file writes as a number or a boolean counts, as the text it reaches the plugin as', () => {
  const taints = taintsFrom(
    { project: { env: { NODE_TLS_REJECT_UNAUTHORIZED: 0 } }, local: { env: { SSL_CERT_DIR: true } } },
    { env: { NODE_TLS_REJECT_UNAUTHORIZED: '0', SSL_CERT_DIR: 'true' }, options: {} },
  );
  assert.deepEqual(taints, [
    { kind: 'env', name: 'NODE_TLS_REJECT_UNAUTHORIZED', source: 'project' },
    { kind: 'env', name: 'SSL_CERT_DIR', source: 'local' },
  ]);
});

test('started in your home directory, the project file is your own settings, and nothing in it counts', () => {
  const user = { env: { TYPESAFE_API_KEY: 'mine' }, pluginConfigs: { [ID]: { options: { storeDir: '/mine' } } } };
  const seen: Seen = { env: { TYPESAFE_API_KEY: 'mine' }, options: { storeDir: '/mine' } };
  assert.deepEqual(taintsFrom({ project: user, local: {}, user }, seen), []);
  // The same file elsewhere, with the user settings different, is the repository's.
  assert.equal(taintsFrom({ project: user, local: {}, user: {} }, seen)?.length, 2);
  // A local file is never the user's, whatever it holds.
  assert.equal(taintsFrom({ project: {}, local: user, user }, seen)?.length, 2);
});

test('a setting that is not text is unset for ask.ts and store.ts, so it does not stand for yours either', () => {
  const taints = taintsFrom({ project: { env: { HOME: '/repo' } } }, { env: { HOME: '/repo' }, options: { storeDir: 7 } });
  assert.ok(taints);
  // storeDirFrom(7) builds the default from HOME, so HOME from the repository decides the place.
  assert.deepEqual(placeTaints(taints, { storeDir: 7 }), [{ kind: 'env', name: 'HOME', source: 'project' }]);
  const keys = taintsFrom({ project: { env: { TYPESAFE_API_KEY: 'r' } } }, { env: { TYPESAFE_API_KEY: 'r' }, options: { apiKey: 1 } });
  assert.ok(keys);
  assert.deepEqual(sendTaints(keys, { apiKey: 1 }), [{ kind: 'env', name: 'TYPESAFE_API_KEY', source: 'project' }]);
});

test('a place variable the repository set and the plugin sees decides where results go, unless storeDir is yours', () => {
  for (const source of SOURCES) {
    for (const name of PLACE_VARIABLES) {
      const seen: Seen = { env: { [name]: '/repo/chose/this' }, options: {} };
      const taints = taintsFrom(repoWith(source, { env: { [name]: '/repo/chose/this' } }), seen);
      assert.ok(taints, `${source} ${name}`);
      assert.deepEqual(placeTaints(taints, seen.options), [{ kind: 'env', name, source }], `${source} ${name}`);
      // With a storeDir of your own the variable builds nothing.
      assert.deepEqual(placeTaints(taints, { storeDir: '/mine' }), [], `${source} ${name} beside storeDir`);
      assert.deepEqual(sendTaints(taints, seen.options), [], `${source} ${name} is not a send value`);
    }
  }
});

test('a key variable from the repository decides where find sends only when the key is read from the environment', () => {
  for (const source of SOURCES) {
    for (const name of KEY_VARIABLES) {
      const seen: Seen = { env: { [name]: 'repo-value' }, options: {} };
      const taints = taintsFrom(repoWith(source, { env: { [name]: 'repo-value' } }), seen);
      assert.ok(taints);
      assert.deepEqual(sendTaints(taints, seen.options), [{ kind: 'env', name, source }], `${source} ${name}`);
      assert.deepEqual(sendTaints(taints, { apiKey: 'mine' }), [], `${source} ${name} beside a key of yours`);
      assert.deepEqual(placeTaints(taints, seen.options), [], `${source} ${name} is not a place value`);
    }
  }
});

test('a proxy or certificate variable from the repository stops find whoever holds the key', () => {
  for (const source of SOURCES) {
    for (const name of ROUTE_VARIABLES) {
      const seen: Seen = { env: { [name]: 'http://127.0.0.1:9' }, options: { apiKey: 'mine' } };
      const taints = taintsFrom(repoWith(source, { env: { [name]: 'http://127.0.0.1:9' } }), seen);
      assert.ok(taints);
      assert.deepEqual(sendTaints(taints, seen.options), [{ kind: 'env', name, source }], `${source} ${name}`);
    }
  }
});

test("the plugin's own settings from a repository file count only when the plugin sees them", () => {
  for (const source of SOURCES) {
    for (const [name, value, which] of [
      ['storeDir', '/repo/store', 'place'],
      ['apiKey', 'repo-key', 'send'],
      ['provider', 'cloudflare', 'send'],
      ['cloudflareAccountId', 'a'.repeat(32), 'send'],
      ['model', 'repo-model', 'send'],
    ] as const) {
      const file = { pluginConfigs: { [ID]: { options: { [name]: value } } } };
      const seen: Seen = { env: {}, options: { [name]: value } };
      const taints = taintsFrom(repoWith(source, file), seen);
      assert.ok(taints);
      const expected = [{ kind: 'option', name, source }];
      assert.deepEqual(which === 'place' ? placeTaints(taints, seen.options) : sendTaints(taints, seen.options), expected, `${source} ${name}`);
      // Measured on 2.1.286: Claude Code does not hand a repository's pluginConfigs to the plugin. Then nothing counts.
      assert.deepEqual(taintsFrom(repoWith(source, file), { env: {}, options: {} }), [], `${source} ${name} not handed over`);
    }
  }
});

test('a value the repository set that did not reach the plugin counts for nothing', () => {
  // Measured on 2.1.286: HOME from .claude/settings.json does not reach the plugin, which sees the real one.
  const taints = taintsFrom(
    { project: { env: { HOME: '/repo/home', TYPESAFE_API_KEY: 'repo-key' } }, local: { env: { HTTPS_PROXY: 'http://repo' } } },
    { env: { HOME: '/Users/me', TYPESAFE_API_KEY: 'my-key', HTTPS_PROXY: 'http://mine' }, options: {} },
  );
  assert.deepEqual(taints, []);
});

test('the same value in your own environment and nowhere in the repository counts for nothing', () => {
  const seen: Seen = { env: { HOME: '/Users/me', TYPESAFE_API_KEY: 'k', HTTPS_PROXY: 'http://proxy' }, options: { storeDir: '/mine' } };
  assert.deepEqual(taintsFrom({ project: {}, local: {} }, seen), []);
  assert.deepEqual(taintsFrom({ project: { env: {}, pluginConfigs: { other: { options: { storeDir: '/mine' } } } } }, seen), []);
});

test('settings files that could not be read leave no way to tell the repository from you', () => {
  assert.equal(taintsFrom(null, { env: {}, options: {} }), null);
  assert.equal(describeTaints(null), "the repository's settings files could not be read, so no value is known to be yours");
});

test('the line that says why names each value and the file it came from', () => {
  assert.equal(
    describeTaints([
      { kind: 'env', name: 'HTTPS_PROXY', source: 'project' },
      { kind: 'option', name: 'storeDir', source: 'local' },
    ]),
    'env.HTTPS_PROXY from .claude/settings.json, storeDir from .claude/settings.local.json',
  );
});

test('a plugin id of another plugin that starts with this one is not this one', () => {
  const file = { pluginConfigs: { 'lossless-compaction-extra@x': { options: { storeDir: '/x' } } } };
  assert.deepEqual(taintsFrom({ project: file }, { env: {}, options: { storeDir: '/x' } }), []);
  const inline = { pluginConfigs: { 'lossless-compaction': { options: { storeDir: '/x' } } } };
  assert.deepEqual(taintsFrom({ project: inline }, { env: {}, options: { storeDir: '/x' } }), [{ kind: 'option', name: 'storeDir', source: 'project' }]);
});
