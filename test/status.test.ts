import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { configFrom } from '../src/flow.ts';
import { NOT_TAKEN, VERSION, findFrom, statusReport, type StatusInput } from '../src/status.ts';
import { bodyTicketText, partTicketText, ticketText } from '../src/store.ts';
import type { Message } from '../src/types.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ID = (char: string) => char.repeat(64);

const NONE = { TYPESAFE_API_KEY: false, CLOUDFLARE_API_TOKEN: false };
const base = (over: Partial<StatusInput> = {}): StatusInput => ({
  claudeCode: '2.1.291',
  options: { provider: 'auto', model: 'jev-latest', targetPercent: 1, keepTokens: 20_000, minChars: 2000, maxAfterPercent: 75 },
  atStart: { registered: false, why: 'no key' },
  now: { registered: false, why: 'no key' },
  keysIn: NONE,
  messages: [],
  ...over,
});

test('the version is the one the plugin is published under', () => {
  for (const file of ['../.claude-plugin/plugin.json', '../package.json']) assert.equal((JSON.parse(read(file)) as { version: string }).version, VERSION, file);
  const market = JSON.parse(read('../.claude-plugin/marketplace.json')) as { plugins: { version: string }[] };
  assert.equal(market.plugins[0]?.version, VERSION);
});

test('/lossless-status says it runs, its version and Claude Code\'s, and each setting in use, as Claude Code hands the defaults over', () => {
  const lines = statusReport(base()).split('\n');
  assert.equal(lines[0], `version ${VERSION} on Claude Code 2.1.291: running in this session`);
  assert.equal(lines[1], 'find: not registered in this session: no key');
  assert.equal(lines[2], 'settings in use: targetPercent 1 (the default), keepTokens 20000 (the default), minChars 2000 (the default), maxAfterPercent 75 (the default)');
  assert.equal(lines[3], "find's settings: provider auto, model the default, apiKey not set, cloudflareAccountId none");
  assert.equal(lines[4], 'storeDir: the default; /lossless-store says where results are kept and how much, or why none can be');
  assert.equal(lines[5], 'this conversation: 0 tickets of what was moved out');
  assert.match(statusReport(base({ claudeCode: null })), /on Claude Code \(version not known\): running/);
});

test('a setting used at another value than was set says both, whatever the value used is', () => {
  const options = { ...base().options, targetPercent: 40, maxAfterPercent: 150, keepTokens: 'lots', minChars: '500' };
  const report = statusReport(base({ options }));
  const used = configFrom(options);
  assert.ok(report.includes('targetPercent 40 (set)'), report);
  assert.ok(report.includes(`maxAfterPercent ${used.maxAfterPercent} (set to 150; ${used.maxAfterPercent} is used)`), report);
  assert.ok(report.includes(`keepTokens ${used.keepTokens} (set to a value that is not a number; ${used.keepTokens} is used)`), report);
  // A number written as text is shown as text, whether it is taken as a number or not.
  assert.ok(report.includes(`minChars ${used.minChars} (set to "500"; ${used.minChars} is used)`), report);
  // A setting that is gone is named, not shown.
  assert.match(statusReport(base({ options: { ...options, keepNewest: 3 } })), /^keepNewest is set and no longer used: keepTokens is used instead$/m);
});

test('/lossless-status prints no key, and no value of a field a key could have been pasted into', () => {
  const secrets = ['pasted-in-the-key-field-0001', 'pasted-in-the-provider-field-0002', 'pasted-in-the-model-field-0003', 'pasted-in-a-number-field-0004'];
  const [key, provider, model, number] = secrets as [string, string, string, string];
  const report = statusReport(
    base({
      options: { ...base().options, apiKey: key, provider, model, targetPercent: number, cloudflareAccountId: 'a'.repeat(32), storeDir: '/private/place' },
      atStart: { registered: false, why: 'provider must be auto, typesafe or cloudflare' },
      keysIn: { TYPESAFE_API_KEY: true, CLOUDFLARE_API_TOKEN: true },
    }),
  );
  for (const secret of [...secrets, 'a'.repeat(32), '/private/place']) assert.ok(!report.includes(secret), secret);
  assert.ok(report.includes('provider set to a value that is not auto, typesafe or cloudflare, model set, apiKey set, cloudflareAccountId entered'), report);
  assert.ok(report.includes('storeDir: set;'), report);
});

test('find: registered and with what key, or why not, and a key in the environment the settings do not let be used (ADR 0028)', () => {
  // Where `now` is not given, the settings give now what they gave at the start.
  const said = (over: Partial<StatusInput>) => statusReport(base({ ...(over.atStart === undefined ? {} : { now: over.atStart }), ...over })).split('\n')[1];
  assert.equal(said({ atStart: { registered: true, kind: 'typesafe' }, options: { ...base().options, apiKey: 'k' } }), 'find: registered in this session: asks TypeSafe, key from your settings');
  assert.equal(
    said({ atStart: { registered: true, kind: 'typesafe' }, options: { ...base().options, provider: 'typesafe' }, keysIn: { ...NONE, TYPESAFE_API_KEY: true } }),
    'find: registered in this session: asks TypeSafe, key from the environment (TYPESAFE_API_KEY)',
  );
  assert.equal(
    said({ atStart: { registered: true, kind: 'cloudflare' }, options: { ...base().options, cloudflareAccountId: 'a'.repeat(32) } }),
    'find: registered in this session: asks Cloudflare Workers AI, key from the environment (CLOUDFLARE_API_TOKEN)',
  );
  // Kept for another tool, left unused: said only here, with what would use it.
  assert.equal(
    said({ keysIn: { ...NONE, TYPESAFE_API_KEY: true } }),
    "find: not registered in this session: no key; TYPESAFE_API_KEY is in the environment, and is used once provider is set to typesafe, unless a repository's settings put it there",
  );
  assert.equal(said({ keysIn: { ...NONE, TYPESAFE_API_KEY: true }, options: { ...base().options, provider: 'cloudflare' } }), 'find: not registered in this session: no key');
  assert.equal(said({ atStart: { registered: false, why: 'the cloudflare provider needs an account id of 32 hexadecimal characters' } }), 'find: not registered in this session: the cloudflare provider needs an account id of 32 hexadecimal characters');
  // The settings changed since the start: the tool stays as it was registered, and what they give now is said beside it.
  assert.equal(
    said({ atStart: { registered: true, kind: 'typesafe' }, now: { registered: false, why: 'no key' }, options: { ...base().options, apiKey: 'k' } }),
    'find: registered in this session: asks TypeSafe, key from your settings; with the settings now it would not be: no key',
  );
  // Claude Code did not take the tool: the settings cannot tell whether it would now, so nothing is said of them.
  assert.equal(
    said({ atStart: { registered: false, why: NOT_TAKEN }, now: { registered: true, kind: 'typesafe' }, options: { ...base().options, apiKey: 'k' } }),
    `find: not registered in this session: ${NOT_TAKEN}`,
  );
  // No record of the start, as after the plugin was loaded again for a change of its settings: what they give now, said as that.
  assert.equal(
    said({ atStart: undefined, now: { registered: true, kind: 'typesafe' }, options: { ...base().options, apiKey: 'k' } }),
    'find: not known for this session; with the settings now it would be registered: asks TypeSafe, key from your settings',
  );
});

test('the lookup for find is told as registration would take it', () => {
  assert.deepEqual(findFrom(null), { registered: false, why: 'no key' });
  assert.deepEqual(findFrom(undefined), { registered: false, why: 'looking for its key failed' });
  assert.deepEqual(findFrom({ error: 'no' }), { registered: false, why: 'no' });
  // The key itself is not kept: only the kind of the provider.
  assert.deepEqual(findFrom({ kind: 'typesafe', key: 'k', model: 'jev-latest' }), { registered: true, kind: 'typesafe' });
});

test("the conversation's tickets are counted by their shape: of results, inputs, parts and middles, each id once", () => {
  const messages: Message[] = [
    { role: 'user', text: 'Read it.', toolUses: [] },
    {
      role: 'assistant',
      text: 'Reading.',
      toolUses: [{ tool_use_id: 't1', tool: 'Read', input: { file_path: '/w/a' } }],
    },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: ticketText({ tool: 'Read', bytes: 900, id: ID('a') }), isError: false }] },
    { role: 'user', text: partTicketText({ part: 1, parts: 1, first: 2, last: 5, bytes: 80, id: ID('b') }), toolUses: [] },
    { role: 'assistant', text: `First.\n${bodyTicketText({ bytes: 5000, id: ID('c') })}\nLast.`, toolUses: [] },
    // The same ticket again is the same result.
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't3', text: ticketText({ tool: 'Read', bytes: 900, id: ID('a') }), isError: false }] },
  ];
  assert.match(statusReport(base({ messages })), /^this conversation: 3 tickets of what was moved out$/m);
});
