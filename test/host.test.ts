import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { FUNCTION_HOOKS } from '../bench/cc.ts';
import { FAILING, UNSET, ZERO, judgeCut, judgeFailed, judgeNothingToSet, judgeNotRunning, judgeRunning, judgeSessions, namedAfterCompaction, partsIn, streamOf, type Stream } from '../bench/host.ts';
import { failedLine } from '../src/flow.ts';
import { KEPT } from '../src/keep.ts';
import { PART, PLUGIN, RECALL_TOOL, idOf, partTicketText } from '../src/store.ts';

// Cut from the streams of one `npm run check:host` on Claude Code 2.1.288: the events the checks read, nothing of the machine.
const read = (label: string) => streamOf(readFileSync(new URL(`fixtures/host/${label}.jsonl`, import.meta.url), 'utf8'));

/** The recall the agent was asked for, and the Read result of the first session whose text has that id. */
async function asked(first: Stream, recalled: Stream): Promise<{ id: string; original: string }> {
  const id = String(recalled.calls.find((call) => call.name === RECALL_TOOL)?.input['id'] ?? '');
  for (const call of first.calls.filter((one) => one.name === 'Read')) {
    const text = first.results.get(call.id) ?? '';
    if ((await idOf(text)) === id) return { id, original: text };
  }
  throw new Error('no Read result of the first session has the id recall was called with');
}

const ok = (checks: { name: string; ok: boolean }[]) => checks.map((check) => `${check.ok ? 'ok' : 'FAIL'} ${check.name}`);
const failing = (checks: { name: string; ok: boolean }[]) => checks.filter((check) => !check.ok).map((check) => check.name);

test('the streams of a real run read as the checks need: every check passes on the working tree, and on a hook file Claude Code does not load', async () => {
  const [first, compact, recalled] = [read('first'), read('compact'), read('recall')];
  assert.equal(first.version, '2.1.288');
  assert.equal(first.calls.filter((call) => call.name === 'Read').length, 6);
  const { id, original } = await asked(first, recalled);
  assert.ok(original.length > 20_000);
  assert.deepEqual(failing(judgeRunning(first, compact, recalled, id, original)), [], ok(judgeRunning(first, compact, recalled, id, original)).join('\n'));
  assert.deepEqual(failing(judgeNotRunning(read('not-running-first'), read('not-running-compact'))), []);
  // Each set judged as the other fails on every count: neither judge passes whatever it is given.
  assert.deepEqual(failing(judgeNotRunning(first, compact)), ['not running: no recall', 'not running: told at the first message', 'not running: a /compact is held']);
  assert.deepEqual(failing(judgeRunning(read('not-running-first'), read('not-running-compact'), read('not-running-compact'), id, original)), [
    'recall is registered',
    'nothing is told at the first message',
    'a /compact moves results out',
    'recall gives a result back as it was',
  ]);
});

test('each check fails when the part of the stream it reads is changed, and only that check', async () => {
  const [first, compact, recalled] = [read('first'), read('compact'), read('recall')];
  const { id, original } = await asked(first, recalled);
  const running = (f: Stream, c: Stream, r: Stream, i = id, o = original) => failing(judgeRunning(f, c, r, i, o));

  assert.deepEqual(running({ ...first, tools: first.tools.filter((tool) => tool !== RECALL_TOOL) }, compact, recalled), ['recall is registered']);
  const told = { ...first, hooks: first.hooks.map((hook) => (hook.event === 'UserPromptSubmit' ? { ...hook, stdout: '{"systemMessage":"something"}' } : hook)) };
  assert.deepEqual(running(told, compact, recalled), ['nothing is told at the first message']);
  assert.deepEqual(running({ ...first, hooks: [] }, compact, recalled), ['nothing is told at the first message']);
  assert.deepEqual(running(first, { ...compact, logs: compact.logs.map((line) => line.replace(/moved \d+ of/, 'moved 0 of')) }, recalled), ['a /compact moves results out']);
  assert.deepEqual(running(first, { ...compact, logs: [] }, recalled), ['a /compact moves results out']);
  // The text recall gave back, one character off; recall called with another id; the original one character off.
  const call = recalled.calls.find((one) => one.name === RECALL_TOOL);
  assert.ok(call);
  const results = new Map(recalled.results);
  results.set(call.id, `${original.slice(0, -1)}x`);
  assert.deepEqual(running(first, compact, { ...recalled, results }), ['recall gives a result back as it was']);
  assert.deepEqual(running(first, compact, recalled, 'f'.repeat(64)), ['recall gives a result back as it was']);
  assert.deepEqual(running(first, compact, recalled, id, `${original}\n`), ['recall gives a result back as it was']);

  const [notFirst, notCompact] = [read('not-running-first'), read('not-running-compact')];
  const notRunning = (f: Stream, c: Stream) => failing(judgeNotRunning(f, c));
  assert.deepEqual(notRunning({ ...notFirst, tools: [...notFirst.tools, RECALL_TOOL] }, notCompact), ['not running: no recall']);
  assert.deepEqual(notRunning({ ...notFirst, hooks: notFirst.hooks.map((hook) => ({ ...hook, stdout: '' })) }, notCompact), ['not running: told at the first message']);
  assert.deepEqual(notRunning(notFirst, { ...notCompact, result: 'Compacted' }), ['not running: a /compact is held']);
});

test('a conversation cut in place of a summary is told from the line of a real run, and from what the store holds (ADR 0019)', () => {
  const cut = read('cut');
  const first = 'Read f1.txt, f2.txt, f3.txt, f4.txt, f5.txt, f6.txt with the Read tool, one file per call, in that order. Then reply only: read.';
  const later = `Call ${RECALL_TOOL} with the id ${'e'.repeat(64)}. Then reply only: done.`;
  // A part writes each message under its role. The first message stays in the conversation, so the part starts with the reply to it.
  const part = `--- assistant\nRead.\n--- user\n${later}\n--- assistant\ndone\n`;
  const cutting = 'a conversation too full is cut, and no summary runs';
  const kept = 'what was cut is kept, as it was said';
  const stays = 'the first message is not cut';
  const judged = (stream: Stream, parts: string[]) => failing(judgeCut(stream, parts, first, later));
  assert.deepEqual(judged(cut, [part]), [], ok(judgeCut(cut, [part], first, later)).join('\n'));
  assert.match(cut.logs[0] ?? '', /no summary, messages 2-19 of 20 kept in 1 part: /);

  // A compaction that moved results out is not one that cut; nor is one that cut nothing, or one the summary ran after.
  assert.deepEqual(judged(read('compact'), [part]), [cutting, stays]);
  assert.deepEqual(judged({ ...cut, logs: [] }, [part]), [cutting, stays]);
  assert.deepEqual(judged({ ...cut, logs: cut.logs.map((line) => line.replace('messages 2-19 of', 'messages 2-1 of')) }, [part]), [cutting]);
  assert.deepEqual(judged({ ...cut, logs: [...cut.logs, 'lossless-compaction: built-in compaction on what is left, too much is still in use: moved 0 of 7 tool results out (9 -> 9 chars) in 1 ms'] }, [part]), [cutting]);
  // Nothing in the store, or parts that do not hold what was said later as it was said.
  assert.deepEqual(judged(cut, []), [kept]);
  assert.deepEqual(judged(cut, [part.replace('Then reply only: done.', 'Then reply: done.')]), [kept]);
  // The first message cut with the rest: the line says so, or a part holds it.
  assert.deepEqual(judged({ ...cut, logs: cut.logs.map((line) => line.replace('messages 2-19 of', 'messages 1-19 of')) }, [part]), [stays]);
  assert.deepEqual(judged(cut, [`--- user\n${first}\n${part}`]), [stays]);
});

test('the parts of a store are told by their entries: a result is not one, nor an entry that cannot be read', () => {
  const store = mkdtempSync(join(tmpdir(), 'lossless-parts-'));
  assert.deepEqual(partsIn(store), [], 'a store nothing was written to');
  mkdirSync(join(store, 'index'));
  mkdirSync(join(store, 'blobs'));
  const put = (id: string, entry: string, text: string) => {
    writeFileSync(join(store, 'index', `${id}.json`), entry);
    writeFileSync(join(store, 'blobs', `${id}.txt`), text);
  };
  put('a'.repeat(64), JSON.stringify({ bytes: 9, tool: PART }), '--- user\nhello\n');
  put('b'.repeat(64), JSON.stringify({ bytes: 4, tool: 'Read' }), 'a result');
  put('c'.repeat(64), 'not json', 'left by a write that failed');
  writeFileSync(join(store, 'index', `${'d'.repeat(64)}.json`), JSON.stringify({ bytes: 1, tool: PART }));
  assert.deepEqual(partsIn(store), ['--- user\nhello\n'], 'the part alone; one whose text is gone is passed over');
});

test('every session ran on one known Claude Code, with the plugin loaded from the copy checked', () => {
  // The records have the paths taken out: each plugin was loaded from `<path>`.
  const sessions = ['first', 'compact', 'recall', 'cut', 'not-running-first', 'not-running-compact'].map((label) => ({ label, stream: read(label), pluginPath: '<path>' }));
  assert.ok(sessions.every(({ stream }) => stream.pluginPath === '<path>'));
  assert.deepEqual(failing(judgeSessions(sessions)), []);
  // Another copy loaded in one session; a version that is not known; two versions.
  const [one, ...rest] = sessions;
  assert.ok(one);
  assert.deepEqual(failing(judgeSessions([{ ...one, stream: { ...one.stream, pluginPath: '<installed copy>' } }, ...rest])), ['the plugin is loaded from the copy checked']);
  assert.deepEqual(failing(judgeSessions([{ ...one, stream: { ...one.stream, pluginPath: '' } }, ...rest])), ['the plugin is loaded from the copy checked']);
  assert.deepEqual(failing(judgeSessions([{ ...one, stream: { ...one.stream, pluginCount: 2 } }, ...rest])), ['the plugin is loaded from the copy checked']);
  assert.ok(sessions.every(({ stream }) => stream.pluginCount === 1));
  assert.deepEqual(failing(judgeSessions(sessions.map((session) => ({ ...session, stream: { ...session.stream, version: '' } })))), ['one Claude Code version, known']);
  assert.deepEqual(failing(judgeSessions([{ ...one, stream: { ...one.stream, version: '2.1.287' } }, ...rest])), ['one Claude Code version, known']);
});

test('nothing is set for the plugin to run: the variable early access asked for is unset in every session but one, at 0 there, where the plugin still runs', () => {
  const unset = `${FUNCTION_HOOKS} is unset in every session but one, and 0 there`;
  const runs = `with ${FUNCTION_HOOKS}=0 the plugin still runs`;
  const sessions = [
    { label: 'first', variable: UNSET },
    { label: 'compact', variable: UNSET },
    { label: ZERO, variable: '0' },
  ];
  // The first session of the real run stands for one that runs: recall registered, nothing told at the first message.
  assert.deepEqual(failing(judgeNothingToSet(sessions, read('first'))), []);
  // A session handed the variable at 1, as the quick start once asked, would show nothing about running without it.
  assert.deepEqual(failing(judgeNothingToSet([{ label: 'first', variable: '1' }, ...sessions.slice(1)], read('first'))), [unset]);
  // No session at 0, or none without it: what the check says was not measured.
  assert.deepEqual(failing(judgeNothingToSet(sessions.slice(0, 2), read('first'))), [unset]);
  assert.deepEqual(failing(judgeNothingToSet(sessions.slice(2), read('first'))), [unset]);
  // At 0 and not running: no recall, and told at the first message.
  assert.deepEqual(failing(judgeNothingToSet(sessions, read('not-running-first'))), [runs]);
});

test('a stream is read whatever else it holds: lines that are not JSON, and events of other kinds, are passed over', () => {
  const stream = streamOf(
    [
      'not json',
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 's', claude_code_version: '9.9.9', tools: ['Read', RECALL_TOOL] }),
      JSON.stringify({ type: 'system', subtype: 'hook_started', hook_event: 'UserPromptSubmit' }),
      JSON.stringify({ type: 'system', subtype: 'hook_response', hook_event: 'UserPromptSubmit', exit_code: 0, stdout: '' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a' } }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'one ' }, { type: 'text', text: 'two' }] }] } }),
      JSON.stringify({ type: 'result', result: 'done' }),
    ].join('\n'),
  );
  assert.equal(stream.version, '9.9.9');
  assert.deepEqual(stream.hooks, [{ event: 'UserPromptSubmit', exitCode: 0, stdout: '' }]);
  assert.deepEqual(stream.calls, [{ id: 't1', name: 'Read', input: { file_path: 'a' } }]);
  assert.equal(stream.results.get('t1'), 'one two');
  assert.equal(stream.result, 'done');
});

test('a compaction whose hook failed is told from its lines, its own store, its boundaries and its record, and each check fails on its own (#102)', () => {
  const said = 'Read f1.txt with the Read tool. Then reply only: read.';
  const thrown = FAILING.find((one) => one.patch === 'throw') as (typeof FAILING)[number];
  const timedOut = FAILING.find((one) => one.patch === 'timeout') as (typeof FAILING)[number];
  const kept = `${PLUGIN}: kept the conversation in 2 parts before the built-in summary`;
  const base: Stream = {
    ...streamOf(JSON.stringify({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual' } })),
    logs: [`${PLUGIN}: moved 5 of 6 tool results out`, `${PLUGIN}: ${failedLine({ kind: 'throw', message: thrown.repeated })}`, kept],
  };
  assert.equal(base.boundaries, 1, 'a boundary is counted');
  const parts = [`--- user\n${said}\n`, '--- assistant\nread\n'];
  const named = [{ id: 'a'.repeat(64), stored: true }];
  const failed = (stream: Stream, { held = parts, names = named, failure = thrown as { kind: string; repeated: string } } = {}) => failing(judgeFailed('throw', stream, held, names, said, failure));
  assert.deepEqual(failed(base), [], 'a line before the failure is the hook\'s own, said before it failed');
  assert.deepEqual(failed({ ...base, logs: base.logs.filter((line) => line !== base.logs[1]) }), ['throw: the failure is said', 'throw: nothing of the hook is said after it']);
  assert.deepEqual(failed(base, { failure: { kind: 'throw', repeated: 'something else' } }), ['throw: the failure is said'], 'the line names the failure the copy was made for');
  assert.deepEqual(failed(base, { failure: timedOut }), ['throw: the failure is said', 'throw: nothing of the hook is said after it'], 'and how Claude Code told it');
  assert.deepEqual(failed({ ...base, logs: [...base.logs, `${PLUGIN}: moved 5 of 6 tool results out`] }), ['throw: nothing of the hook is said after it'], 'a hook that went on after its time');
  assert.deepEqual(failed({ ...base, logs: [...base.logs, kept] }), ['throw: nothing of the hook is said after it'], 'and kept what it was handed as well');
  assert.deepEqual(failed({ ...base, logs: base.logs.slice(0, 2) }), ['throw: the conversation is kept before the summary']);
  assert.deepEqual(failed(base, { held: parts.slice(1) }), ['throw: the conversation is kept before the summary'], 'no part holds what was said');
  assert.deepEqual(failed({ ...base, boundaries: 2 }), ['throw: one compaction'], 'a summary that ran again');
  assert.deepEqual(failed({ ...base, boundaries: 0 }), ['throw: one compaction']);
  assert.deepEqual(failed(base, { names: [] }), ['throw: the conversation after it holds the tickets'], 'what the handler answered was not taken');
  assert.deepEqual(failed(base, { names: [...named, { id: 'b'.repeat(64), stored: false }] }), ['throw: the conversation after it holds the tickets']);
});

test("the parts a session's record names after its last compaction are read from the messages after its boundary (#102)", () => {
  const [before, after] = ['c'.repeat(64), 'd'.repeat(64)];
  const ticket = (id: string) => partTicketText({ part: 1, parts: 1, first: 1, last: 9, bytes: 5073, id });
  const rows = [
    { type: 'user', message: { content: `${KEPT}, in 1 part; recall a part by its id.\n${ticket(before)}` } },
    { type: 'system', subtype: 'compact_boundary' },
    { type: 'user', message: { content: 'This session is being continued from a previous conversation.' } },
    { type: 'user', message: { content: [{ type: 'text', text: `${KEPT}, in 1 part; recall a part by its id.\n${ticket(after)}` }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: ticket(before) }] } },
  ];
  assert.deepEqual(namedAfterCompaction([...rows.map((row) => JSON.stringify(row)), 'not json'].join('\n')), [after]);
  assert.deepEqual(namedAfterCompaction(JSON.stringify(rows[0])), [], 'no compaction, no part after it');
});

test('each copy test/fixtures/failing makes is of the hook file as it is: its patch applies, and to the compaction hook (#102)', () => {
  const hook = readFileSync(new URL('../hooks/move-out.ts', import.meta.url), 'utf8');
  for (const { patch } of FAILING) {
    const copy = mkdtempSync(join(tmpdir(), `lossless-failing-${patch}-`));
    mkdirSync(join(copy, 'hooks'));
    writeFileSync(join(copy, 'hooks/move-out.ts'), hook);
    const applied = spawnSync('patch', ['-p1', '-s', '-N', '-d', copy, '-i', fileURLToPath(new URL(`fixtures/failing/${patch}.patch`, import.meta.url))], { encoding: 'utf8' });
    assert.equal(applied.status, 0, `${patch}: ${applied.stdout}${applied.stderr}`);
    const changed = readFileSync(join(copy, 'hooks/move-out.ts'), 'utf8');
    assert.ok(changed !== hook && changed.includes('on purpose by bench/host.ts'), patch);
  }
});
