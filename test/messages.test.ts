import assert from 'node:assert/strict';
import { test } from 'node:test';

import { eachOnce, gathered, sessionOf } from '../bench/messages.ts';

/** A record's rows, as Claude Code writes them: each block of a response on its own row. */
const row = (value: Record<string, unknown>) => JSON.stringify(value);
const user = (text: string) => row({ type: 'user', message: { role: 'user', content: text } });
const block = (text: string, input = 10) => row({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }], usage: { input_tokens: input } } });
const boundary = (uuid: string, trigger = 'auto') => row({ type: 'system', subtype: 'compact_boundary', uuid, compactMetadata: { trigger } });

test('each compaction is counted in entries, a row each, and in messages, a turn each, and told a summary from a rebuild (#115)', () => {
  const text = [
    row({ type: 'user', entrypoint: 'cli', message: { role: 'user', content: 'start' } }),
    block('one'),
    block('two'),
    block('three'),
    user('next'),
    block('four'),
    // Not counted: a subagent's row, and what is no message.
    row({ type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [] } }),
    row({ type: 'progress' }),
    boundary('b1'),
    // Rebuilt by the plugin: the conversation as it handed it back follows the boundary.
    user('[moved out] Read result, 900 bytes; recall with mcp__lossless-compaction__recall id ' + 'a'.repeat(64)),
    block('five', 250_000),
    boundary('b2', 'manual'),
    row({ type: 'user', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued…' } }),
    block('six'),
  ].join('\n');
  const session = sessionOf('s', text);
  assert.equal(session.interactive, true);
  assert.equal(session.window, 1_000_000, 'a request sent more than 200,000 tokens');
  assert.deepEqual(
    session.compactions.map(({ kind, trigger, entries, messages }) => ({ kind, trigger, entries, messages })),
    [
      { kind: 'rebuilt', trigger: 'auto', entries: 6, messages: 4 },
      { kind: 'summary', trigger: 'manual', entries: 2, messages: 2 },
    ],
  );
  // `claude -p` is no interactive session, and a window never past 200,000 is that of 200,000.
  const run = sessionOf('p', [row({ type: 'user', entrypoint: 'sdk-cli', message: { role: 'user', content: 'x' } }), boundary('b9')].join('\n'));
  assert.equal(run.interactive, false);
  assert.equal(run.window, 200_000);
});

test('a compaction a fork carries over is counted once, in the first session that holds it', () => {
  const parent = sessionOf('parent', [user('a'), boundary('b1'), user('b'), boundary('b2')].join('\n'));
  const fork = sessionOf('fork', [user('a'), boundary('b1'), user('c'), boundary('b3')].join('\n'));
  assert.deepEqual(
    eachOnce([parent, fork]).map((session) => [session.name, session.compactions.map((one) => one.uuid)]),
    [
      ['parent', ['b1', 'b2']],
      ['fork', ['b3']],
    ],
  );
});

test('what a conversation gathered from an empty start is told from what a rebuilt one grew by (#115)', () => {
  const lines = (n: number) => Array.from({ length: n }, (_, at) => user(`m${at}`));
  const session = sessionOf(
    's',
    [
      ...lines(5),
      boundary('b1'),
      user('[moved out] rebuilt'),
      ...lines(6),
      boundary('b2', 'manual'),
      row({ type: 'user', isCompactSummary: true, message: { role: 'user', content: 'summary' } }),
      ...lines(2),
      boundary('b3'),
    ].join('\n'),
  );
  const { fromEmpty, afterRebuilt } = gathered([session]);
  // The first compaction and the one after the summary start from empty; the second follows a rebuilt one.
  assert.deepEqual(fromEmpty.map((one) => one.entries), [5, 3]);
  assert.deepEqual(afterRebuilt, [7 - 5]);
});

test("a fork's first compaction of its own follows the ones it carries, and is no empty start", () => {
  const parent = sessionOf('parent', [user('a'), user('b'), boundary('b1'), user('[moved out] rebuilt'), user('c'), boundary('b2')].join('\n'));
  const fork = sessionOf('fork', [user('a'), user('b'), boundary('b1'), user('[moved out] rebuilt'), user('d'), user('e'), boundary('b3')].join('\n'));
  const { fromEmpty, afterRebuilt } = gathered([parent, fork]);
  assert.deepEqual(fromEmpty.map((one) => one.entries), [2], 'b1 once, from empty');
  assert.deepEqual(afterRebuilt, [2 - 2, 3 - 2], 'b2 and b3 each follow b1, rebuilt');
});
