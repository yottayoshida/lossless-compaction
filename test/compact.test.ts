import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHARS_PER_TOKEN, REASONS, charsOf, compact, countFrom, leftUndone, noticeLine, reportLine, rounded, thinkingOf, undoneLine, weigh, weightOf, windowFrom, type Config, type Host, type Input, type Report, type WindowOf } from '../src/compact.ts';
import { moveOut, readInputTicket, readTicket, recall, ticketText, whyNotStored } from '../src/store.ts';
import type { Message } from '../src/types.ts';
import { MemoryFiles, conversation, output, sized, type Call } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';
/** Where 0.3.0 and before kept results. */
const OLD = '/home/u/.claude/jev-lossless-compaction';

const CONFIG: Config = {
  store: { write: DIR, read: [DIR] },
  // The newest result that could leave stays, and nothing else for being new.
  keepTokens: 0,
  minChars: 200,
  targetPercent: 40,
  maxAfterPercent: 60,
  // What these tests measure is results and inputs leaving; folding old calls is measured apart (test/fold.test.ts).
  fold: false,
};

/** A conversation of this many tokens has to lose half: 400 tokens, which one result of `call` covers. */
const ONE_RESULT = 800;

/** A host with files and a clock: a compaction needs nothing else of it. */
function hostWith(files: MemoryFiles) {
  let clock = 0;
  const host: Host = { files, now: () => (clock += 10) };
  return { host };
}

const call = (label: string, lines = 100): Call => ({
  tool: 'Bash',
  input: { command: `show ${label}` },
  text: output(label, lines),
});

/** Sized so that `tokens` is what the conversation's characters come to, as `compact` estimates them. */
function inputFor(messages: readonly Message[], window = 1_000_000): Input {
  const chars = messages.reduce(
    (sum, message) => sum + message.text.length + (message.toolResults ?? []).reduce((n, r) => n + r.text.length, 0),
    0,
  );
  return { messages, tokens: Math.ceil(chars / CHARS_PER_TOKEN), window, goal: messages[0]?.text ?? '' };
}

/** The results that are tickets after and were not before, with the text each replaced. */
function movedOut(before: readonly Message[], after: readonly Message[]) {
  const original = new Map(before.flatMap((m) => m.toolResults ?? []).map((r) => [r.tool_use_id, r.text]));
  return after
    .flatMap((m) => m.toolResults ?? [])
    .filter((r) => r.text !== original.get(r.tool_use_id))
    .map((r) => ({ id: r.tool_use_id, ticket: readTicket(r.text), was: original.get(r.tool_use_id) ?? '' }));
}

test('match: every result that left the conversation is on disk byte for byte', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d'), call('e')]);

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  const moved = movedOut(before, messages);
  assert.ok(moved.length >= 1, 'nothing was moved out');
  for (const { ticket, was } of moved) {
    assert.ok(ticket, 'a result changed into something that is not a ticket');
    assert.equal(files.files.get(`${DIR}/blobs/${ticket.id}.txt`), was);
    assert.equal(ticket.bytes, Buffer.byteLength(was, 'utf8'));
  }
});

test('reachable: every ticket in the conversation gives its result back', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d'), call('e')]);

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  const tickets = messages.flatMap((m) => m.toolResults ?? []).filter((r) => readTicket(r.text));
  const original = new Map(before.flatMap((m) => m.toolResults ?? []).map((r) => [r.tool_use_id, r.text]));
  assert.ok(tickets.length >= 2, 'one ticket would pass with every ticket pointing at the same file');
  for (const result of tickets) {
    assert.deepEqual(await recall(files, DIR, readTicket(result.text)?.id), { text: original.get(result.tool_use_id) });
  }
});

test('the same conversation compacted twice leaves the same files and the same conversation', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d'), call('e')]);
  const first = await compact(inputFor(before), CONFIG, hostWith(files).host);
  const disk = files.snapshot();
  const writes = files.writes.length;

  const second = await compact(inputFor(before), CONFIG, hostWith(files).host);

  assert.deepEqual(files.snapshot(), disk);
  assert.equal(files.writes.length, writes);
  assert.deepEqual(second.messages, first.messages);
});

test('a later compaction moves more out and leaves what an earlier one stored as it is', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d'), call('e'), call('f')]);
  const first = await compact(inputFor(before), CONFIG, hostWith(files).host);
  const disk = files.snapshot();
  const earlier = movedOut(before, first.messages);

  // Every length is a candidate now, so a ticket would be one too if tickets were not told apart.
  const second = await compact(inputFor(first.messages), { ...CONFIG, minChars: 0 }, hostWith(files).host);

  assert.ok(second.report.moved >= 1, 'the second pass had nothing to do, so it shows nothing');
  for (const [path, text] of Object.entries(disk)) assert.equal(files.files.get(path), text, path);
  const after = new Map(second.messages.flatMap((m) => m.toolResults ?? []).map((r) => [r.tool_use_id, r.text]));
  for (const { id, ticket, was } of earlier) {
    assert.deepEqual(readTicket(after.get(id) ?? ''), ticket);
    assert.deepEqual(await recall(files, DIR, ticket?.id), { text: was });
  }
});

test('smaller: results leave until the estimate is under the target, and the report says what is left', async () => {
  const files = new MemoryFiles();
  const before = conversation(Array.from({ length: 12 }, (_, i) => call(`step ${i + 1}`)));
  const input = inputFor(before);

  const { enough, report, messages } = await compact(input, CONFIG, hostWith(files).host);

  assert.equal(enough, true);
  assert.ok(report.tokensAfter <= input.tokens / 2, `${report.tokensAfter} of ${input.tokens}`);
  assert.ok(report.charsAfter < report.charsBefore / 2);
  // No more than it takes: the newest candidates are still in the conversation.
  assert.ok(report.moved < report.candidates);
  assert.equal(movedOut(before, messages).length, report.moved);
});

test('not enough: when the window is still too full afterwards, the caller is told to let the built-in compaction run', async () => {
  const talk = 'The person explains the problem at length. '.repeat(400);
  const before = conversation([call('a', 20), call('b', 20), call('c', 20)], talk);
  const input = inputFor(before);
  // The window is nearly full, and what may leave is a small part of what fills it.
  const full = { ...input, window: Math.ceil(input.tokens * 1.1) };

  const tight = await compact(full, CONFIG, hostWith(new MemoryFiles()).host);
  const roomy = await compact({ ...input, window: input.tokens * 10 }, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(tight.report.moved >= 1);
  assert.ok(tight.report.tokensAfter > (full.window * 60) / 100);
  assert.equal(tight.enough, false);
  // The same conversation in a window with room: what was moved out is kept.
  assert.equal(roomy.report.moved, tight.report.moved);
  assert.equal(roomy.enough, true);
});

test('what fills the window but is not the conversation does not make a compaction fail', async () => {
  // The shape that was measured: a system prompt and tool definitions larger than the conversation.
  const before = conversation(Array.from({ length: 10 }, (_, i) => call(`file ${i + 1}`, 400)));
  const input = { ...inputFor(before), window: 200_000 };
  const around = { ...input, tokens: input.tokens + 60_000 };

  const { enough, report } = await compact(around, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(report.moved >= 5);
  // What is left counts what no compaction makes smaller.
  assert.ok(report.tokensAfter > 60_000, `${report.tokensAfter}`);
  assert.ok(report.tokensAfter < 120_000, `${report.tokensAfter}`);
  assert.equal(report.window, 200_000);
  assert.equal(enough, true);
});

test('when a summary of what is left could not make room either, the built-in compaction is not called for', async () => {
  // The shape that was measured: most of what is in use is not the conversation, and compaction comes early.
  const before = conversation(Array.from({ length: 10 }, (_, i) => call(`file ${i + 1}`, 400)));
  const input = inputFor(before, 67_000);
  const around = { ...input, tokens: input.tokens + 60_000 };

  const { enough, report } = await compact(around, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(report.moved >= 5);
  assert.ok(report.tokensAfter > (67_000 * 60) / 100, `${report.tokensAfter}`);
  assert.equal(enough, true);
});

/** Twelve results, with what is not the conversation and the thinking every compaction drops on top (#24). */
function withThinking(fixedTokens: number, thinking: number, window: number, tokensPerChar = 1 / CHARS_PER_TOKEN): Input {
  const messages = conversation(Array.from({ length: 12 }, (_, i) => call(`step ${i + 1}`)));
  const said = Math.ceil(charsOf(messages) * tokensPerChar);
  const tokens = fixedTokens + said + thinking;
  // The density as `countFrom` makes it: what the conversation comes to, over its weighted characters.
  return { messages, tokens, count: { fixedTokens, density: said / weightOf(messages) }, window, goal: messages[0]?.text ?? '' };
}

test('a conversation that fits once its thinking is gone is not handed to the built-in summary', async () => {
  // Counted from `tokens`, 41,556 are in use afterwards: 756 over 60 % of the window, less than
  // the conversation left, so the summary would be called for. Without the thinking it is 11,556.
  const input = withThinking(10_000, 30_000, 68_000);

  const { enough, report } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(report.moved > 0);
  assert.equal(report.counted, true);
  assert.ok(report.tokensAfter < 12_000, `${report.tokensAfter}`);
  assert.equal(enough, true);
});

test('however much of what is in use is thinking, something is still moved out', async () => {
  // Thinking is two thirds of `tokens`. A goal of half of `tokens`, set against a size
  // without the thinking, would need nothing, move nothing, and hand the conversation over.
  const input = withThinking(10_000, 60_000, 1_000_000);

  const { enough, report } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);
  const without = await compact(withThinking(10_000, 0, 1_000_000), CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(without.report.moved > 0);
  // As much leaves as from the same conversation without thinking: what is needed is measured as what stays.
  assert.equal(report.moved, without.report.moved);
  assert.equal(enough, true);
});

test('counted from what stays, a conversation that is still too full afterwards is still handed over', async () => {
  // What is not the conversation alone is near 60 % of the window: a summary of what is left could make room.
  const input = withThinking(23_000, 30_000, 40_000);

  const { enough, report } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(report.moved > 0);
  assert.ok(report.tokensAfter > (40_000 * 60) / 100, `${report.tokensAfter}`);
  assert.equal(enough, false);
});

test('without what is not the conversation, sizes are estimated from what is in use and not counted', async () => {
  const { count: _count, ...input } = withThinking(10_000, 30_000, 68_000);

  const { enough, report } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.equal(report.counted, false);
  assert.ok(report.tokensAfter > 40_000, `${report.tokensAfter}`);
  // The decision as it was before #24.
  assert.equal(enough, false);
});

test('a conversation that counts near a token a character is still handed over when it is too full', async () => {
  // The same conversation, in a session whose own figure is a token a character, as Japanese runs:
  // counted at three characters a token it would be said to fit.
  const dense = withThinking(10_000, 0, 20_000, 1);
  const thin = withThinking(10_000, 0, 20_000);

  const counted = await compact(dense, CONFIG, hostWith(new MemoryFiles()).host);
  const guessed = await compact({ ...dense, ...(thin.count === undefined ? {} : { count: thin.count }) }, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(counted.report.tokensAfter > (20_000 * 60) / 100, `${counted.report.tokensAfter}`);
  assert.equal(counted.enough, false);
  assert.equal(guessed.enough, true, 'the control: at three characters a token it would have stayed');
  assert.equal((await compact(thin, CONFIG, hostWith(new MemoryFiles()).host)).enough, true);
});

/** Within a millionth: what a division by 2.3 leaves of a round figure. */
const close = (actual: number | undefined, expected: number) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) <= expected * 1e-6, `${actual} is not ${expected}`);

/** A thinking block whose signature is this long. */
const signed = (chars: number) => ({ type: 'thinking', thinking: '', signature: 's'.repeat(chars) });

test("a size is counted from the breakdown only when it can be relied on, at the conversation's own density", () => {
  const row = (name: string, tokens: number, kind = 'used') => ({ name, tokens, kind, color: '', isDeferred: kind === 'deferred' });
  const categories = [row('System prompt', 9_000), row('System tools', 21_000), row('Messages', 70_000), row('Free space', 100_000, 'free'), row('MCP tools', 5_000, 'deferred')];
  const apiUsage = { input_tokens: 10, output_tokens: 10 };
  const said = (chars: number, char = 'x'): Message[] => [{ role: 'user', text: char.repeat(chars), toolUses: [] }];

  // 70,000 tokens over 70,000 letters.
  assert.deepEqual(countFrom({ categories, apiUsage }, 100_000, [], said(70_000)), { fixedTokens: 30_000, density: 1 });
  // No floor: prose at ten characters a token is counted at that (#37).
  assert.deepEqual(countFrom({ categories, apiUsage }, 100_000, [], said(700_000)), { fixedTokens: 30_000, density: 0.1 });
  // The characters are weighted: the same row over as many digits is half the density, over Japanese a third.
  assert.equal(countFrom({ categories, apiUsage }, 100_000, [], said(70_000, '7'))?.density, 0.5);
  assert.equal(countFrom({ categories, apiUsage }, 100_000, [], said(70_000, 'あ'))?.density, 1 / 3);
  // The thinking is taken off the row: 20,000 tokens of it, told from the signatures, leave 50,000 for the same letters.
  const thinking = [{ role: 'assistant', content: [signed(600), signed(600 + 46_000)] }];
  close(countFrom({ categories, apiUsage }, 100_000, thinking, said(100_000))?.density, 0.5);
  // The control, and a signature is no character of the conversation: without the blocks it is 0.7.
  assert.equal(countFrom({ categories, apiUsage }, 100_000, [], said(100_000))?.density, 0.7);
  // What Claude Code added to the conversation as it sent it goes too: the row is spread over what was sent, what
  // was added counting at four fifths. With as many letters again sent as the 70,000 of the messages, those come to
  // 70,000 of 126,000 parts of the row.
  const reminded = [
    { role: 'user', content: [{ type: 'text', text: `${'x'.repeat(70_000)}${'r'.repeat(30_000)}` }] },
    { role: 'assistant', content: [signed(600), { type: 'tool_use', id: 't1', name: 'Read', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'r'.repeat(39_998) }] }] },
  ];
  // What was sent: 100,000 letters said, an input of two characters, a result of 39,998. No signature, id or name is among them.
  close(countFrom({ categories, apiUsage }, 100_000, reminded, said(70_000))?.density, 70_000 / 126_000);
  // Blocks that hold less than the messages do are not the conversation as it was sent: the messages are.
  assert.equal(countFrom({ categories, apiUsage }, 100_000, [{ role: 'user', content: 'x'.repeat(100) }], said(70_000))?.density, 1);
  // What cannot be read as a conversation is not counted with: what was added to it could not be told from what stays.
  assert.equal(countFrom({ categories, apiUsage }, 100_000, [{ role: 'user', content: 'x'.repeat(100) }, { role: 'system', content: 'x' }], said(70_000)), undefined);
  assert.equal(countFrom({ categories, apiUsage }, 100_000, [null], said(70_000)), undefined);
  assert.equal(countFrom({ categories, apiUsage }, 100_000, undefined, said(70_000)), undefined);
  // Not one to count with: thinking that comes out over nine tenths of the row, with the control just under,
  const most = (tokens: number) => [{ role: 'assistant', content: [signed(600), signed(600 + Math.round(tokens * 2.3))] }];
  assert.equal(countFrom({ categories, apiUsage }, 100_000, most(64_000), said(70_000)), undefined);
  close(countFrom({ categories, apiUsage }, 100_000, most(62_000), said(70_000))?.density, 8_000 / 70_000);
  // a density no tokenizer comes to, either way, and a conversation without a character.
  assert.equal(countFrom({ categories, apiUsage }, 100_000, [], said(10_000)), undefined);
  assert.equal(countFrom({ categories, apiUsage }, 100_000, [], said(7_000_000)), undefined);
  assert.equal(countFrom({ categories, apiUsage }, 100_000, [], []), undefined);
  // Not Claude Code's own figure: estimated from characters when it gave none.
  assert.equal(countFrom({ categories, apiUsage }, undefined, [], said(70_000)), undefined);
  // Before a response, what the rows are reconciled to is missing.
  assert.equal(countFrom({ categories, apiUsage: null }, 100_000, [], said(70_000)), undefined);
  assert.equal(countFrom({ categories: categories.filter((r) => r.name !== 'Messages'), apiUsage }, 100_000, [], said(70_000)), undefined);
  // Out of range either way.
  assert.equal(countFrom({ categories, apiUsage }, 30_000, [], said(70_000)), undefined);
  assert.equal(countFrom({ categories: [row('Messages', 70_000)], apiUsage }, 100_000, [], said(70_000)), undefined);
  assert.equal(countFrom(undefined, 100_000, [], said(70_000)), undefined);
});

test('the thinking of a conversation is told from its signatures: what they run to beyond the shortest of them', () => {
  const api = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: [signed(600), { type: 'text', text: 'x'.repeat(5000) }] },
    { role: 'assistant', content: [signed(600 + 2300), { type: 'tool_use', id: 't1', name: 'Read', input: { path: 'a' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'body' }] }] },
    { role: 'assistant', content: [signed(600 + 23_000)] },
  ];
  // 25,300 characters beyond three times the shortest, at 2.3 a token.
  close(thinkingOf(api), 11_000);
  // One block alone is the shortest: what it thought cannot be told.
  assert.equal(thinkingOf([api[4]]), 0);
  // Thinking that was redacted is no thinking block, whatever it carries, and a block without a signature is not the
  // shortest: neither adds or takes away.
  const unsigned = [
    { role: 'assistant', content: [{ type: 'redacted_thinking', data: 'd'.repeat(9000), signature: 's'.repeat(100) }] },
    { role: 'assistant', content: [{ type: 'thinking', thinking: 'aloud' }, { type: 'thinking', thinking: '', signature: '' }] },
  ];
  close(thinkingOf([...api, ...unsigned]), 11_000);
  assert.equal(thinkingOf(unsigned), 0);
  assert.equal(thinkingOf(undefined), 0);
});

test('a digit weighs as two characters and a character that is not ASCII as three', () => {
  assert.equal(weigh('abc def\n'), 8);
  assert.equal(weigh('2026-10-02'), 8 * 2 + 2);
  assert.equal(weigh('受付の記録'), 15);
  assert.equal(weigh(''), 0);
  // Of a conversation: what was said, the calls' inputs and the results, as its characters are counted.
  const messages: Message[] = [
    { role: 'user', text: '直す', toolUses: [] },
    { role: 'assistant', text: 'ok', toolUses: [{ tool_use_id: 't1', tool: 'Read', input: { n: 7 }, text: 'not counted on this side' }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: 'line 12', isError: false }] },
  ];
  assert.equal(weightOf(messages), 6 + 2 + (JSON.stringify({ n: 7 }).length + 1) + (7 + 2));
  assert.equal(charsOf(messages), 2 + 2 + JSON.stringify({ n: 7 }).length + 7);
});

test('what a compaction measures against is where Claude Code compacts on its own, else the window, and where it came from is told apart (#141)', () => {
  assert.deepEqual(windowFrom({ window: 200_000, breakdown: { autoCompactThreshold: 68_000 } }, 1), { size: 68_000, of: 'auto' });
  // Off where Claude Code says so: its declarations give no size then.
  assert.deepEqual(windowFrom({ window: 200_000, breakdown: { isAutoCompactEnabled: false } }, 1), { size: 200_000, of: 'off' });
  // No breakdown came back, or one with no size and nothing said of automatic compaction: nothing is known of it, and
  // the line says nothing of it.
  assert.deepEqual(windowFrom({ window: 200_000 }, 1), { size: 200_000, of: 'window' });
  assert.deepEqual(windowFrom({ window: 200_000, breakdown: {} }, 1), { size: 200_000, of: 'window' });
  assert.deepEqual(windowFrom({ window: 200_000, breakdown: { isAutoCompactEnabled: true, autoCompactThreshold: 0 } }, 1), { size: 200_000, of: 'window' });
  // Nothing that can be measured against.
  assert.deepEqual(windowFrom({ window: 0, breakdown: { autoCompactThreshold: Number.NaN } }, 150_000), { size: 150_000, of: 'assumed' });
  assert.deepEqual(windowFrom({ window: '200000' }, 150_000), { size: 150_000, of: 'assumed' });
  assert.deepEqual(windowFrom(undefined, 150_000), { size: 150_000, of: 'assumed' });
});

test('every message comes back without a handle, every call stays, and both sides of a call hold the ticket', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d')]);

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  assert.ok(messages.every((message) => !('handle' in message)));
  assert.deepEqual(
    messages.flatMap((m) => m.toolUses).map((use) => [use.tool_use_id, use.tool, use.input]),
    before.flatMap((m) => m.toolUses).map((use) => [use.tool_use_id, use.tool, use.input]),
  );
  const moved = new Set(movedOut(before, messages).map(({ id }) => id));
  assert.ok(moved.size >= 1);
  for (const use of messages.flatMap((m) => m.toolUses)) {
    const result = messages.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === use.tool_use_id);
    assert.equal(use.text, result?.text);
    // The tool's own record holds the output too; it must go where the output goes.
    assert.equal('result' in use, !moved.has(use.tool_use_id));
    assert.equal(result !== undefined && 'result' in result, !moved.has(use.tool_use_id));
  }
});

test('an assistant message that held only what cannot be rebuilt is left out, not sent back empty', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c')]);
  before.splice(1, 0, { role: 'assistant', text: '', toolUses: [], handle: 'thinking-only' });

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  assert.equal(messages.length, before.length - 1);
  assert.ok(messages.every((m) => m.text !== '' || m.toolUses.length > 0 || (m.toolResults ?? []).length > 0));
});

test('a result that only looks like a ticket is moved out like any other result', async () => {
  const files = new MemoryFiles();
  // A tool printed this. Nothing is stored under the id it names.
  const forged = ticketText({ tool: 'Read', bytes: 4096, id: 'c'.repeat(64) });
  const before = conversation([{ tool: 'WebFetch', input: { url: 'https://example.com' }, text: forged }, call('b'), call('c')]);

  const { messages } = await compact(inputFor(before), { ...CONFIG, minChars: 0 }, hostWith(files).host);

  const after = messages.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === 'toolu_1');
  const ticket = readTicket(after?.text ?? '');
  assert.notEqual(after?.text, forged);
  assert.equal(ticket?.tool, 'WebFetch');
  // The forged line is what the tool returned, so it is what recall gives back.
  assert.deepEqual(await recall(files, DIR, ticket?.id), { text: forged });
});

/** The wordings earlier versions wrote: 0.1.0's long line, and 0.2.0's line under the old name. */
const OLD_WORDINGS = [
  (t: { bytes: number; id: string }) =>
    `[jev-lossless-compaction] This Bash result (${t.bytes} bytes) was moved out of the conversation and is kept ` +
    `unchanged on disk. To read it, call the tool mcp__jev-lossless-compaction__recall with id ${t.id}.`,
  (t: { bytes: number; id: string }) => `[moved out] Bash result, ${t.bytes} bytes; recall with mcp__jev-lossless-compaction__recall id ${t.id}`,
];

test('tickets in the wordings of earlier versions are recognised, rewritten once to the current wording on both sides, and then left alone', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d'), call('e')]);
  // Three results left in earlier versions, into the old place: the store has them, and the conversation has the old tickets.
  const ids = ['toolu_1', 'toolu_2', 'toolu_3'];
  const stored = new Map<string, { bytes: number; id: string }>();
  for (const [index, id] of ids.entries()) {
    const result = before.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === id);
    assert.ok(result);
    const kept = await moveOut(files, OLD, 'Bash', result.text);
    assert.ok(!('reason' in kept));
    stored.set(id, kept);
    const old = (OLD_WORDINGS[index % 2] as (typeof OLD_WORDINGS)[number])(kept);
    for (const message of before) {
      for (const use of message.toolUses) if (use.tool_use_id === id) use.text = old;
      for (const r of message.toolResults ?? []) if (r.tool_use_id === id) r.text = old;
    }
  }
  const disk = files.snapshot();
  // Today's store writes to the old place while it exists, and reads the new one as well.
  const config = { ...CONFIG, store: { write: OLD, read: [OLD, DIR] }, minChars: 0 };

  const first = await compact(inputFor(before), config, hostWith(files).host);

  const after = new Map(first.messages.flatMap((m) => m.toolResults ?? []).map((r) => [r.tool_use_id, r.text]));
  const calls = new Map(first.messages.flatMap((m) => m.toolUses).map((u) => [u.tool_use_id, u.text]));
  for (const id of ids) {
    const kept = stored.get(id);
    assert.ok(kept);
    const now = `[moved out] Bash result, ${kept.bytes} bytes; recall with mcp__lossless-compaction__recall id ${kept.id}`;
    assert.equal(after.get(id), now, `${id} on the result's side`);
    assert.equal(calls.get(id), now, `${id} on the call's side`);
  }
  assert.equal(first.report.notMoved.differs, undefined);
  // Nothing already stored was written again, and the old tickets were not taken for results to move out.
  for (const [path, text] of Object.entries(disk)) assert.equal(files.files.get(path), text, path);
  assert.equal(first.report.moved, first.report.candidates);
  // d alone: e is the newest and stays, a to c are tickets.
  assert.equal(first.report.candidates, 1);
  // What left today, d, has a ticket in the new wording that reads back and recalls.
  const fresh = readTicket(after.get('toolu_4') ?? '');
  assert.ok(fresh);
  assert.deepEqual(await recall(files, [OLD], fresh.id), { text: output('d', 100) });

  // Compacted again, nothing changes: the wording is already the current one.
  const second = await compact(inputFor(first.messages), config, hostWith(files).host);
  assert.deepEqual(second.messages, first.messages);
  for (const [path, text] of Object.entries(disk)) assert.equal(files.files.get(path), text, path);
});

test('a ticket whose result is kept in the other place is recognised as stored, not moved out again', async () => {
  const NEW = '/home/u/.claude/lossless-compaction';
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c')]);
  // a's result sits in the new place; the store writes to the old one and reads the new one as well.
  const result = before.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === 'toolu_1');
  assert.ok(result);
  const kept = await moveOut(files, NEW, 'Bash', result.text);
  assert.ok(!('reason' in kept));
  for (const message of before) {
    for (const use of message.toolUses) if (use.tool_use_id === 'toolu_1') use.text = kept.text;
    for (const r of message.toolResults ?? []) if (r.tool_use_id === 'toolu_1') r.text = kept.text;
  }
  const disk = files.snapshot();

  const { messages, report } = await compact(inputFor(before), { ...CONFIG, store: { write: OLD, read: [OLD, NEW] }, minChars: 0 }, hostWith(files).host);

  // a stays a ticket: it was not a candidate, and nothing was written for it anywhere.
  assert.equal(report.candidates, 1);
  assert.equal(messages.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === 'toolu_1')?.text, kept.text);
  for (const [path, text] of Object.entries(disk)) assert.equal(files.files.get(path), text, path);
  assert.ok(![...files.files.keys()].some((path) => path.startsWith(`${OLD}/blobs/${kept.id}`)));
});

test('the allowance is set in tokens and measured in characters, three to a token', async () => {
  const before = conversation([sized('a.zig', 25_000), sized('b.zig', 25_000), sized('c.zig', 25_000)]);

  // 20,000 tokens is 60,000 characters: the newest two fit, the oldest is the one candidate.
  const { report } = await compact(inputFor(before), { ...CONFIG, keepTokens: 20_000 }, hostWith(new MemoryFiles()).host);

  assert.equal(report.candidates, 1);
});

test('rules decide the order: a result a later call made obsolete leaves before the oldest', async () => {
  const again = { tool: 'Bash', input: { command: 'show a' }, text: output('a, second run', 100) };
  // Room for one result to leave. The oldest is a; the third call ran a again, so a is obsolete.
  const before = conversation([call('a'), call('b'), again, call('d'), call('e')], 'x');
  const input = { ...inputFor(before), tokens: ONE_RESULT };

  const { messages } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.deepEqual(movedOut(before, messages).map(({ id }) => id), ['toolu_1']);
});

test('rules decide the order: of results that are not obsolete, the one sharing least with the goal leaves first', async () => {
  // The goal names beta and delta; alpha, gamma and eps share nothing with it, and alpha is the oldest of those.
  const calls = ['alpha', 'beta', 'gamma', 'delta', 'eps'].map((label) => call(label));
  const before = conversation(calls, 'show beta and show delta');
  const input = { ...inputFor(before), tokens: ONE_RESULT };

  const { messages } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.deepEqual(movedOut(before, messages).map(({ id }) => id), ['toolu_1']);
  // The goal naming alpha as well makes gamma the first to leave.
  const named = conversation(calls, 'show alpha and show beta and show delta');
  const other = await compact({ ...inputFor(named), tokens: ONE_RESULT }, CONFIG, hostWith(new MemoryFiles()).host);
  assert.deepEqual(movedOut(named, other.messages).map(({ id }) => id), ['toolu_3']);
});

test('a result whose call holds another text stays in the conversation, on both sides, as it was', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d')]);
  const use = before.flatMap((m) => m.toolUses).find((u) => u.tool_use_id === 'toolu_1');
  assert.ok(use);
  use.text = `${use.text}\n[a line only the call's side has]`;

  const { messages, report } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  const after = messages.flatMap((m) => m.toolUses).find((u) => u.tool_use_id === 'toolu_1');
  const result = messages.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === 'toolu_1');
  assert.ok(movedOut(before, messages).length >= 1, 'nothing was moved out, so nothing was shown');
  assert.equal(after?.text, use.text);
  assert.deepEqual(after?.result, use.result);
  assert.equal(result?.text, output('a', 100));
  // The report says so, as it says why the store left a result in place.
  assert.equal(report.notMoved['call-differs'], 1);
});

test('a result that cannot be stored stays in the conversation and is counted', async () => {
  const files = new MemoryFiles();
  files.corrupt = (text) => text.replace('value', 'VALUE');
  const before = conversation([call('a'), call('b'), call('c'), call('d')]);

  const { messages, report, enough } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  assert.equal(movedOut(before, messages).length, 0);
  assert.equal(report.moved, 0);
  assert.equal(report.notMoved.differs, report.candidates);
  assert.equal(enough, false);
});

test('the line names a size of the context only when it was counted from what stays', async () => {
  const counted = await compact(withThinking(10_000, 30_000, 68_000), CONFIG, hostWith(new MemoryFiles()).host);
  const { count: _count, ...input } = withThinking(10_000, 30_000, 68_000);
  const guessed = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  // Counted: in tokens, before as Claude Code gave it and after as counted, and no characters (#141).
  const fig = (n: number | undefined) => (n ?? NaN).toLocaleString('en-US');
  assert.equal(counted.report.tokensBefore, withThinking(10_000, 30_000, 68_000).tokens);
  assert.match(
    reportLine(counted.report),
    new RegExp(`^moved out 11 of 12 tool results; about ${fig(counted.report.tokensBefore)} tokens in use before, about ${fig(counted.report.tokensAfter)} after, of the 68,000 at which Claude Code compacts on its own; \\d+ ms$`),
  );
  assert.equal(guessed.report.tokensBefore, undefined);
  assert.match(reportLine(guessed.report), /^moved out 11 of 12 tool results; the conversation from [\d,]+ to [\d,]+ characters; \d+ ms$/);
});

/**
 * A tokenizer for these tests: a letter or a sign comes to a quarter of a token, a digit
 * to half, a character that is not ASCII to three quarters, which is the ratio `weigh`
 * takes, as the signatures of `session` grow at the 2.3 characters a token the plugin
 * takes, and what `session` adds comes to the four fifths the plugin takes. So these
 * tests hold that every size is counted one way, from one end of a compaction to the
 * other; they do not hold that the weights, the 2.3 or the four fifths are right. That
 * is measured: the probes in bench/results/2026-10-02-estimate, and the test that reads
 * them (test/bench.test.ts).
 */
function tokensIn(text: string): number {
  let total = 0;
  for (const char of text) total += char >= '0' && char <= '9' ? 0.5 : char.charCodeAt(0) > 127 ? 0.75 : 0.25;
  return total;
}

const spoken = (messages: readonly Message[]): number =>
  messages.reduce(
    (sum, m) =>
      sum + tokensIn(m.text) + m.toolUses.reduce((n, u) => n + tokensIn(JSON.stringify(u.input)), 0) + (m.toolResults ?? []).reduce((n, r) => n + tokensIn(r.text), 0),
    0,
  );

/**
 * A session as Claude Code tells of it: the rows of its breakdown, and the conversation
 * with its blocks, where each thinking block has a signature as long as its tokens make
 * it. `truth` is what a conversation handed back would come to in the next request.
 */
function session(messages: readonly Message[], fixed: number, window: number, thinking: readonly number[] = [], added = '') {
  const thought = thinking.reduce((sum, tokens) => sum + tokens, 0);
  const said = Math.round(spoken(messages));
  // What Claude Code sent with the conversation and no message holds: in the row, and gone once the messages are rebuilt.
  // It comes to four fifths of what as many characters of the messages do, which is what the plugin takes it to.
  const extra = Math.round(tokensIn(added) * 0.8);
  const row = (name: string, tokens: number) => ({ name, tokens, kind: 'used' });
  const breakdown = { categories: [row('System prompt', fixed), row('Messages', said + thought + extra)], apiUsage: { input_tokens: 1 } };
  const api = [
    { role: 'assistant', content: thinking.map((tokens) => signed(600 + Math.round(tokens * 2.3))) },
    ...(added === ''
      ? []
      : [
          ...messages.map((m) => ({
            role: m.role,
            content: [
              { type: 'text', text: m.text },
              ...m.toolUses.map((use) => ({ type: 'tool_use', id: use.tool_use_id, name: use.tool, input: use.input })),
              ...(m.toolResults ?? []).map((result) => ({ type: 'tool_result', tool_use_id: result.tool_use_id, content: result.text })),
            ],
          })),
          { role: 'user', content: [{ type: 'text', text: added }] },
        ]),
  ];
  const tokens = fixed + said + thought + extra;
  const count = countFrom(breakdown, tokens, api, messages);
  const input: Input = { messages, tokens, window, goal: '', ...(count === undefined ? {} : { count }) };
  return { input, count, said, truth: (after: readonly Message[]) => fixed + spoken(after) };
}

/** Within half a percent. */
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= expected * 0.005, `${actual} is not within half a percent of ${Math.round(expected)}`);

const PROSE = 'the quick brown fox jumps over the lazy dog and '; // 48 letters and spaces

test('pasted prose in English is counted at what it comes to, and a conversation that fits is not handed over (#37)', async () => {
  // 240,000 letters that stay whatever leaves: 60,000 tokens, where a third of a token a character says 80,000.
  const before = conversation(Array.from({ length: 12 }, (_, i) => call(`step ${i + 1}`, 1000)), PROSE.repeat(5000));
  const { input, count, truth } = session(before, 10_000, 140_000);
  assert.ok(count !== undefined && count.density < 0.3, `${count?.density}`);

  const { messages, enough, report } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.equal(report.moved, 11);
  near(report.tokensAfter, truth(messages));
  assert.ok(report.tokensAfter < (140_000 * 60) / 100, `${report.tokensAfter}`);
  assert.equal(enough, true);
  // The control: counted at a third, as it was before, the same conversation is handed to the summary.
  const floored = await compact({ ...input, count: { fixedTokens: 10_000, density: 1 / CHARS_PER_TOKEN } }, CONFIG, hostWith(new MemoryFiles()).host);
  assert.equal(floored.report.moved, 11);
  assert.equal(floored.enough, false);
});

test('the thinking a session holds makes the size after neither higher nor lower (#37)', async () => {
  const before = conversation(Array.from({ length: 12 }, (_, i) => call(`step ${i + 1}`, 300)));
  const plain = session(before, 10_000, 1_000_000);
  // 37,000 tokens of thinking on top of the same conversation, about as much again.
  const thought = session(before, 10_000, 1_000_000, [0, 5_000, 20_000, 12_000]);
  assert.ok(plain.count !== undefined && thought.count !== undefined);
  assert.ok(thought.input.tokens > plain.input.tokens * 1.5, 'the control: the thinking is a large part of what is in use');
  close(thought.count.density, plain.count.density);

  const without = await compact(plain.input, CONFIG, hostWith(new MemoryFiles()).host);
  const { messages, report } = await compact(thought.input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(report.moved > 0);
  assert.equal(report.moved, without.report.moved);
  assert.equal(report.tokensAfter, without.report.tokensAfter);
  near(report.tokensAfter, thought.truth(messages));
});

test('what Claude Code added to the conversation as it sent it is not counted as staying (#37)', async () => {
  const before = conversation(Array.from({ length: 12 }, (_, i) => call(`step ${i + 1}`, 300)));
  const plain = session(before, 10_000, 1_000_000);
  // Reminders and the text of commands, three quarters as much again as the messages hold, and thinking on top.
  const added = '<system-reminder>\nThe task tools have not been used recently. 念のため確認する。\n</system-reminder>\n'.repeat(900);
  const real = session(before, 10_000, 1_000_000, [0, 9_000], added);
  assert.ok(plain.count !== undefined && real.count !== undefined);
  assert.ok(real.input.tokens > plain.input.tokens * 1.5, 'the control: what goes is a large part of what is in use');
  near(real.count.density, plain.count.density);

  const { messages, report } = await compact(real.input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(report.moved > 0);
  near(report.tokensAfter, real.truth(messages));
  // What is needed is measured without it as well: as much leaves as from the conversation alone.
  assert.equal(report.moved, (await compact(plain.input, CONFIG, hostWith(new MemoryFiles()).host)).report.moved);
});

test('Japanese left after logs are moved out is counted at what it comes to (#37)', async () => {
  // 31,500 characters of Japanese stay; the results that leave are ASCII.
  const before = conversation(Array.from({ length: 12 }, (_, i) => call(`step ${i + 1}`, 1000)), '受付の記録を確かめ、貸し出しの手順を直す。'.repeat(1500));
  const { input, said, truth } = session(before, 10_000, 1_000_000);

  const { messages, report } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(report.moved >= 6, `${report.moved}`);
  near(report.tokensAfter, truth(messages));
  // The control: at one figure for every character, what stays comes out well under what it is.
  const flat = 10_000 + (charsOf(messages) * said) / charsOf(before);
  assert.ok(flat < truth(messages) * 0.85, `${Math.round(flat)} of ${Math.round(truth(messages))}`);
});

test('results leave until what is in use is at the goal and no further, saved measured the way the size after is (#37)', async () => {
  // Thirty results of the same size, and a goal of half of what is in use.
  const calls = Array.from({ length: 30 }, (_, i) => call(`step ${i + 1}`, 300));
  const before = conversation(calls, PROSE.repeat(1250));
  const { input, truth } = session(before, 10_000, 1_000_000);
  assert.ok(input.count !== undefined);
  const goal = input.tokens / 2;
  const one = Math.max(...calls.map((c) => tokensIn(c.text)));

  const counted = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  // At the goal, and the last result that left was needed to get there.
  assert.ok(counted.report.tokensAfter <= goal + 1, `${counted.report.tokensAfter} of ${goal}`);
  assert.ok(counted.report.tokensAfter > goal - one, `${counted.report.tokensAfter} of ${goal}, a result is ${one}`);
  near(counted.report.tokensAfter, truth(counted.messages));

  // Two of the first round cannot be stored: the round falls short by an eighth, and others leave in their place.
  const files = new MemoryFiles();
  files.corrupt = (text) => (/^step (3|9) line/.test(text) ? text.replace('value', 'VALUE') : text);
  const short = await compact(input, CONFIG, hostWith(files).host);
  assert.equal(short.report.notMoved.differs, 2);
  assert.equal(short.report.moved, counted.report.moved);
  assert.ok(short.report.tokensAfter <= goal + 1, `${short.report.tokensAfter} of ${goal}`);
  assert.ok(short.report.tokensAfter > goal - one, `${short.report.tokensAfter} of ${goal}, a result is ${one}`);

  // Without a count, as before: characters at three a token, of what is in use.
  const { count: _count, ...rest } = input;
  const guessed = await compact(rest, CONFIG, hostWith(new MemoryFiles()).host);
  const guessedGoal = rest.tokens / 2;
  assert.equal(guessed.report.tokensAfter, Math.round(rest.tokens - (guessed.report.charsBefore - guessed.report.charsAfter) / CHARS_PER_TOKEN));
  assert.ok(guessed.report.tokensAfter <= guessedGoal + 1, `${guessed.report.tokensAfter} of ${guessedGoal}`);
  assert.ok(guessed.report.tokensAfter > guessedGoal - Math.max(...calls.map((c) => c.text.length)) / CHARS_PER_TOKEN);
  assert.notEqual(guessed.report.moved, counted.report.moved, 'the control: the two ways of measuring differ on this conversation');
});

test('when the thinking is not one to count with, the size is not counted and the line names none (#37)', async () => {
  const before = conversation(Array.from({ length: 12 }, (_, i) => call(`step ${i + 1}`, 300)));
  const said = Math.round(spoken(before));
  // Signatures that say twenty parts in twenty-one of the conversation are thinking.
  const { input, count } = session(before, 10_000, 1_000_000, [0, said * 20]);
  assert.equal(count, undefined);
  // The control: at eight parts in nine it is counted.
  assert.notEqual(session(before, 10_000, 1_000_000, [0, said * 8]).count, undefined);

  const { report } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.equal(report.counted, false);
  assert.match(reportLine(report), /^moved out \d+ of 12 tool results; the conversation from [\d,]+ to [\d,]+ characters; \d+ ms$/);
});

test('a conversation that is mostly tickets already is counted at what it comes to when compacted again (#37)', async () => {
  const files = new MemoryFiles();
  const first = conversation(Array.from({ length: 20 }, (_, i) => call(`step ${i + 1}`, 300)));
  const once = await compact(session(first, 10_000, 1_000_000).input, CONFIG, hostWith(files).host);
  assert.ok(once.report.moved >= 9, `${once.report.moved}`);
  // The work goes on: eight results more, on top of what was handed back.
  const later = Array.from({ length: 8 }, (_, i) => call(`later ${i + 1}`, 300)).flatMap((c, i): Message[] => {
    const id = `toolu_later_${i + 1}`;
    return [
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: id, tool: c.tool, input: c.input, text: c.text }] },
      { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text: c.text, isError: false }] },
    ];
  });
  const { input, truth } = session([...once.messages, ...later], 10_000, 1_000_000);
  assert.ok(input.count !== undefined);

  const { messages, report } = await compact(input, CONFIG, hostWith(files).host);

  assert.ok(report.moved > 0);
  assert.ok(messages.flatMap((m) => m.toolResults ?? []).filter((r) => readTicket(r.text)).length > once.report.moved);
  near(report.tokensAfter, truth(messages));
  assert.ok(report.tokensAfter <= input.tokens / 2 + 1, `${report.tokensAfter} of ${input.tokens / 2}`);
});

test('a /compact run by hand with nothing to move out and room left is left undone, and only then (ADR 0015)', () => {
  // The benchmark's `short` as it stood: 28,546 tokens in use where Claude Code compacts at 167,000.
  const room = { trigger: 'manual', instructions: undefined, inUse: 28_546, window: 167_000, maxAfterPercent: 75, candidates: 0 };
  assert.equal(leftUndone(room), true);

  // By hand only: an automatic compaction runs because the conversation is full, and one a plugin asks for is not the person's.
  for (const trigger of ['auto', 'plugin', 'precompute', undefined]) assert.equal(leftUndone({ ...room, trigger }), false, `${trigger}`);
  // Only with nothing that could leave: a candidate that was not written goes on as before.
  assert.equal(leftUndone({ ...room, candidates: 1 }), false);
  // Instructions are for a summary; white space alone is none.
  assert.equal(leftUndone({ ...room, instructions: 'keep the plan' }), false);
  for (const instructions of ['', '  \n\t']) assert.equal(leftUndone({ ...room, instructions }), true, JSON.stringify(instructions));

  // The line is `maxAfterPercent` of the size Claude Code compacts at: at it the conversation stays, a token over it goes on.
  assert.equal(leftUndone({ ...room, inUse: 125_250 }), true);
  assert.equal(leftUndone({ ...room, inUse: 125_251 }), false);
  // Under the size itself and over the line: not all of the size is room.
  assert.equal(leftUndone({ ...room, inUse: 166_000 }), false);
  // The setting moves the line: at 1 it is under any conversation, at 100 it is the size.
  assert.equal(leftUndone({ ...room, maxAfterPercent: 1 }), false);
  assert.equal(leftUndone({ ...room, inUse: 166_000, maxAfterPercent: 100 }), true);
});

test('the line a /compact left undone shows names what is in use only when Claude Code gave the figure (ADR 0015)', () => {
  assert.equal(
    undoneLine(28_546, 167_000),
    "nothing to move out, 28,546 tokens in use, of the 167,000 at which Claude Code compacts on its own: the conversation is left as it is. /compact with instructions runs Claude Code's summary",
  );
  assert.equal(
    undoneLine(28_546, 1_000_000, { fixed: 4_607, first: 49 }, 'off'),
    "nothing to move out, 28,546 tokens in use, of the model's 1,000,000-token window (automatic compaction is off): the conversation is left as it is; of what is in use, 4,607 are sent with every request (the system prompt, tools, memory and the like), 49 the first message and 23,890 the rest. /compact with instructions runs Claude Code's summary",
  );
  // Made up from characters, a figure holds no system prompt and no tools: none is shown.
  assert.equal(undoneLine(null, 167_000), "nothing to move out: the conversation is left as it is. /compact with instructions runs Claude Code's summary");
});

/** A compaction's report as the tests of its line take it: six of twenty-one results out, counted, at where Claude Code compacts. */
const SAID: Report = {
  results: 21,
  candidates: 9,
  moved: 6,
  inputs: 0,
  folded: 0,
  images: 0,
  charsBefore: 844_544,
  charsAfter: 548_237,
  tokensBefore: 160_412,
  tokensAfter: 52_357,
  counted: true,
  window: 167_000,
  notMoved: {},
  writeErrors: [],
  ms: 61,
};

test('the line names what each of its figures counts and, in words, why any result stayed, and the notice says it short: each kind, word for word (#141)', () => {
  const { tokensBefore: _before, ...uncounted } = SAID;
  assert.equal(
    reportLine(SAID),
    'moved out 6 of 21 tool results; about 160,412 tokens in use before, about 52,357 after, of the 167,000 at which Claude Code compacts on its own; 61 ms',
  );
  assert.equal(noticeLine(SAID), 'moved out 6 of 21 tool results · ~52k of 167k tokens, where Claude Code compacts · 61 ms');
  // What the size is measured against, as far as Claude Code said where it came from.
  const of = (windowOf: WindowOf, window: number) => ({ ...SAID, window, windowOf });
  assert.equal(
    reportLine(of('off', 1_000_000)),
    "moved out 6 of 21 tool results; about 160,412 tokens in use before, about 52,357 after, of the model's 1,000,000-token window (automatic compaction is off); 61 ms",
  );
  assert.equal(noticeLine(of('off', 1_000_000)), "moved out 6 of 21 tool results · ~52k of the model's 1.0M-token window · 61 ms");
  assert.equal(reportLine(of('window', 1_000_000)), "moved out 6 of 21 tool results; about 160,412 tokens in use before, about 52,357 after, of the model's 1,000,000-token window; 61 ms");
  assert.equal(
    reportLine(of('assumed', 200_000)),
    'moved out 6 of 21 tool results; about 160,412 tokens in use before, about 52,357 after, of an assumed 200,000-token window (Claude Code gave none); 61 ms',
  );
  assert.equal(noticeLine(of('assumed', 200_000)), 'moved out 6 of 21 tool results · ~52k of an assumed 200k-token window · 61 ms');
  // Not counted: the conversation in characters alone, and the notice names no size.
  const guessed = { ...uncounted, counted: false };
  assert.equal(reportLine(guessed), 'moved out 6 of 21 tool results; the conversation from 844,544 to 548,237 characters; 61 ms');
  assert.equal(noticeLine(guessed), 'moved out 6 of 21 tool results · 61 ms');
  // Handed over as it was: what was in use, and what the plugin counts of it less the thinking, which is no size it came to.
  assert.equal(
    reportLine({ ...SAID, moved: 0 }, 'given'),
    'moved out 0 of 21 tool results; about 160,412 tokens in use, about 52,357 less the thinking, images and what Claude Code attached, of the 167,000 at which Claude Code compacts on its own; 61 ms',
  );
  assert.equal(reportLine({ ...guessed, moved: 0 }, 'given'), 'moved out 0 of 21 tool results; 61 ms');
  // All else a compaction moves out, the newest turns reached into, and a time of seconds.
  const all = { ...SAID, images: 2, inputs: 2, bodies: 1, folded: 3, recent: 3, ms: 1500 };
  assert.equal(
    reportLine(all),
    'moved out 6 of 21 tool results, 2 images with them and 2 tool inputs, the middle of 1 long message, 3 old tool calls folded into lists; about 160,412 tokens in use before, about 52,357 after, of the 167,000 at which Claude Code compacts on its own; 1.5 s; 3 of these from the newest turns',
  );
  // Results that stayed, by reason in words, with what the host said of a write that failed.
  const stayed = { ...SAID, notMoved: { 'too-large': 1, 'write-failed': 2 }, writeErrors: ['ENOSPC'] };
  assert.ok(reportLine(stayed).endsWith('; 61 ms; 3 left in place: 1 too large to keep (over about 4 MB), 2 could not be written (ENOSPC)'), reportLine(stayed));
  assert.equal(noticeLine(stayed), 'moved out 6 of 21 tool results · ~52k of 167k tokens, where Claude Code compacts · 61 ms · 3 left in place, see the transcript');
  // Rounded for a notice: no thousand thousands.
  assert.deepEqual([950, 1_000, 52_357, 999_499, 999_600, 1_000_000, 967_000].map(rounded), ['950', '1k', '52k', '999k', '1.0M', '1.0M', '967k']);
});

test("no code of the plugin's own for why a result stayed reaches a line: every reason, alone, in words (#141)", () => {
  const CODES = /\b(?:tool-name|too-large|symlink|not-a-file|differs|write-failed|call-differs)\b/;
  const reasons = Object.keys(REASONS) as (keyof typeof REASONS)[];
  assert.deepEqual(reasons.sort(), ['call-differs', 'differs', 'not-a-file', 'symlink', 'too-large', 'tool-name', 'write-failed']);
  for (const reason of reasons) {
    const one = { ...SAID, notMoved: { [reason]: 1 } };
    for (const line of [reportLine(one), noticeLine(one), whyNotStored({ reason: reason === 'call-differs' ? 'differs' : reason })]) {
      assert.doesNotMatch(line, CODES, `${reason}: ${line}`);
    }
    assert.ok(reportLine(one).endsWith(`; 1 left in place: 1 ${REASONS[reason]}`), reason);
  }
});

/**
 * Every call has its result in the message right after it, and every result answers a call in the message right
 * before it: what Claude Code needs of messages without a handle (it answers a call otherwise as lost to an internal
 * error, and drops a result that answers none).
 */
function eachCallAnsweredNext(messages: readonly Message[]): void {
  messages.forEach((message, at) => {
    const next = new Set((messages[at + 1]?.toolResults ?? []).map((result) => result.tool_use_id));
    for (const use of message.toolUses) assert.ok(next.has(use.tool_use_id), `the call ${use.tool_use_id} at ${at} is answered in the message right after it`);
    const before = new Set((messages[at - 1]?.toolUses ?? []).map((use) => use.tool_use_id));
    for (const result of message.toolResults ?? []) assert.ok(before.has(result.tool_use_id), `the result ${result.tool_use_id} at ${at} answers a call right before it`);
  });
}

/** A call message of one block, as Claude Code keeps a block of a response, and the message of one result. */
const use = (id: string, said = ''): Message => ({ role: 'assistant', text: said, toolUses: [{ tool_use_id: id, tool: 'Bash', input: { command: `show ${id}` }, text: output(id, 100) }], handle: `h-${id}` });
const answer = (id: string): Message => ({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text: output(id, 100), isError: false }], handle: `h-r-${id}` });
const words = (role: 'user' | 'assistant', text: string): Message => ({ role, text, toolUses: [], handle: `h-${text}` });
const shape = (messages: readonly Message[]) => messages.map((m) => [m.role, m.text, m.toolUses.map((one) => one.tool_use_id), (m.toolResults ?? []).map((one) => one.tool_use_id)]);

test('calls made side by side, kept one message each with their results after them in the order they ended, come back as one call message and one of results', async () => {
  const files = new MemoryFiles();
  // As Claude Code handed them over in a real session: three calls, then their results, the slowest last.
  const before: Message[] = [words('user', 'Look at the three files.'), words('assistant', 'Reading all three.'), use('a'), use('b', 'And b, which is slower.'), use('c'), answer('c'), answer('b'), answer('a'), words('assistant', 'All three read.')];

  const { messages, report } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  assert.ok(report.moved > 0);
  eachCallAnsweredNext(messages);
  assert.deepEqual(shape(messages), [
    ['user', 'Look at the three files.', [], []],
    // What was said before the calls stays a message of its own: nothing waited then.
    ['assistant', 'Reading all three.', [], []],
    ['assistant', 'And b, which is slower.', ['a', 'b', 'c'], []],
    ['user', '', [], ['c', 'b', 'a']],
    ['assistant', 'All three read.', [], []],
  ]);
  // What was moved out is a ticket, and what was not is the result as it was.
  for (const result of messages[3]!.toolResults ?? []) {
    const ticket = readTicket(result.text);
    if (ticket) assert.deepEqual(await recall(files, DIR, ticket.id), { text: output(result.tool_use_id, 100) });
    else assert.equal(result.text, output(result.tool_use_id, 100));
  }
});

test('a result written while the response was still making calls joins the others, after all of its calls', async () => {
  // As a record holds it (Claude Code 2.1.288): a call, another, the first's result, a third, the others' results.
  const before: Message[] = [words('user', 'Check.'), use('p'), use('q'), answer('p'), use('r'), answer('q'), answer('r'), words('assistant', 'Checked.')];

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(new MemoryFiles()).host);

  eachCallAnsweredNext(messages);
  assert.deepEqual(shape(messages), [
    ['user', 'Check.', [], []],
    ['assistant', '', ['p', 'q', 'r'], []],
    ['user', '', [], ['p', 'q', 'r']],
    ['assistant', 'Checked.', [], []],
  ]);
});

test('what a person said while calls ran comes after their results, as Claude Code hands it to the model', async () => {
  const before: Message[] = [words('user', 'Go.'), use('a'), use('b'), answer('a'), words('user', 'Also look at d.'), answer('b'), words('assistant', 'Done.')];

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(new MemoryFiles()).host);

  eachCallAnsweredNext(messages);
  assert.deepEqual(shape(messages), [
    ['user', 'Go.', [], []],
    ['assistant', '', ['a', 'b'], []],
    ['user', '', [], ['a', 'b']],
    ['user', 'Also look at d.', [], []],
    ['assistant', 'Done.', [], []],
  ]);
});

test('where every call is answered right after it, every message comes back as it stood: nothing is put together', async () => {
  // What was said before a call is a message of its own, and two responses meet with nothing between them.
  const before: Message[] = [words('user', 'Go.'), words('assistant', 'Let me look.'), use('a'), answer('a'), use('b'), answer('b'), words('assistant', 'Done.'), words('assistant', 'And one more thing.')];

  const { messages } = await compact(inputFor(before), { ...CONFIG, minChars: 1_000_000 }, hostWith(new MemoryFiles()).host);

  assert.deepEqual(
    messages,
    before.map(({ handle: _handle, ...rest }) => rest),
  );
});

test('a call whose result is nowhere is not waited for, and an assistant message that holds results is not joined to another', async () => {
  // A call cut off before it was answered, then one that was; and a message of a kind Claude Code does not make.
  const odd: Message = { role: 'assistant', text: '', toolUses: [], toolResults: [{ tool_use_id: 'z', text: 'z', isError: false }], handle: 'h-odd' };
  const before: Message[] = [words('user', 'Go.'), use('cut'), use('b'), answer('b'), use('c'), words('user', 'Meanwhile.'), odd, words('user', 'Later.'), answer('c')];

  const { messages } = await compact(inputFor(before), { ...CONFIG, minChars: 1_000_000 }, hostWith(new MemoryFiles()).host);

  // The odd message ends the response that waited: what was said meanwhile stands before it, and nothing waits after it.
  assert.deepEqual(shape(messages), [
    ['user', 'Go.', [], []],
    ['assistant', '', ['cut'], []],
    ['assistant', '', ['b'], []],
    ['user', '', [], ['b']],
    ['assistant', '', ['c'], []],
    ['user', 'Meanwhile.', [], []],
    ['assistant', '', [], ['z']],
    ['user', 'Later.', [], []],
    ['user', '', [], ['c']],
  ]);
});

test('what a person said before the first result comes after the results too, not between the calls and them', async () => {
  const before: Message[] = [words('user', 'Go.'), use('a'), use('b'), words('user', 'Also look at d.'), answer('a'), answer('b'), words('assistant', 'Done.')];

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(new MemoryFiles()).host);

  eachCallAnsweredNext(messages);
  assert.deepEqual(shape(messages), [
    ['user', 'Go.', [], []],
    ['assistant', '', ['a', 'b'], []],
    ['user', '', [], ['a', 'b']],
    ['user', 'Also look at d.', [], []],
    ['assistant', 'Done.', [], []],
  ]);
});

test('a call waits only for a result further on: an id answered before it, or answered already, waits for nothing and ends nothing', async () => {
  // Shapes Claude Code is not known to make: the same id twice, and a result before its call. Each stays where it stood.
  const twice: Message[] = [words('user', 'Go.'), use('x'), answer('x'), use('x'), words('user', 'hi'), words('assistant', 'Reply to hi.'), words('user', 'next'), use('y'), answer('y'), words('assistant', 'Done.')];
  const early: Message[] = [words('user', 'Go.'), answer('z'), use('z'), words('user', 'hi'), words('assistant', 'Reply to hi.')];
  // A message that holds a call and its own result: what answers the call is in it, not further on.
  const own: Message = { ...use('w'), toolResults: [{ tool_use_id: 'w', text: 'w', isError: false }], handle: 'h-own' };
  const inOne: Message[] = [words('user', 'Go.'), own, words('user', 'hi'), words('assistant', 'Reply to hi.')];
  for (const before of [twice, early, inOne]) {
    const { messages } = await compact(inputFor(before), { ...CONFIG, minChars: 1_000_000 }, hostWith(new MemoryFiles()).host);
    assert.deepEqual(shape(messages), shape(before));
  }
});

const write = (file: string, chars: number): Call => ({
  tool: 'Write',
  input: { file_path: file, content: `${file}\n${'w'.repeat(chars - file.length - 1)}` },
  text: 'File created successfully.',
});

/** Sized from every character a compaction counts, the inputs included: what was in use when nothing is known of what is not the conversation. */
const inUse = (messages: readonly Message[], window = 1_000_000): Input => ({ messages, tokens: Math.ceil(charsOf(messages) / CHARS_PER_TOKEN), window, goal: messages[0]?.text ?? '' });

/** The long values handed to calls, by the id of the call, as they stand in a conversation. */
const inputValues = (messages: readonly Message[]) => new Map(messages.flatMap((m) => m.toolUses).map((use) => [use.tool_use_id, use.input]));

test('when results are not enough, the long values handed to a write tool leave as well, each stored whole, and the call still names its file (ADR 0020)', async () => {
  const files = new MemoryFiles();
  const before = conversation([write('a.ts', 3000), write('b.ts', 3000), write('c.ts', 3000)]);

  const { messages, report, enough } = await compact(inUse(before), CONFIG, hostWith(files).host);

  const was = inputValues(before);
  const now = inputValues(messages);
  // The two older files' content left; the newest stays, whatever its size.
  for (const id of ['toolu_1', 'toolu_2']) {
    const line = String(now.get(id)?.['content']);
    const ticket = readInputTicket(line);
    assert.ok(ticket, `${id}: ${line.slice(0, 80)}`);
    assert.equal(ticket.tool, 'Write');
    assert.equal(ticket.field, 'content');
    assert.deepEqual(await recall(files, DIR, ticket.id), { text: was.get(id)?.['content'] });
    assert.equal(now.get(id)?.['file_path'], was.get(id)?.['file_path']);
  }
  assert.equal(now.get('toolu_3')?.['content'], was.get('toolu_3')?.['content']);
  assert.equal(report.moved, 0);
  assert.equal(report.inputs, 2);
  assert.equal(enough, true);
  assert.match(reportLine(report), /^moved out 0 of 3 tool results and 2 tool inputs; /);
  // What was handed in is not changed: the rebuilt conversation is a copy.
  assert.equal(inputValues(before).get('toolu_1')?.['content'], was.get('toolu_1')?.['content']);
  assert.ok(String(before[1]?.toolUses[0]?.input['content']).startsWith('a.ts\n'));
});

test('inputs leave only once results are not enough: where results reach the target, every input stays as it was', async () => {
  const files = new MemoryFiles();
  const before = conversation([write('a.ts', 2500), call('x', 400), call('y', 400), call('z', 400), write('b.ts', 2500)]);

  const { messages, report } = await compact(inUse(before), CONFIG, hostWith(files).host);

  assert.ok(report.moved > 0);
  assert.equal(report.inputs, 0);
  assert.deepEqual(inputValues(messages), inputValues(before));
});

test('a long value inside a list of edits leaves, and the other edits of the call stand as they were', async () => {
  const files = new MemoryFiles();
  const value = `NEW\n${'n'.repeat(4000)}`;
  const before = conversation([
    { tool: 'MultiEdit', input: { file_path: 'a.ts', edits: [{ old_string: 'x', new_string: 'y' }, { old_string: 'p', new_string: value }] }, text: 'Applied 2 edits.' },
    write('b.ts', 4000),
  ]);

  const { messages, report } = await compact(inUse(before), CONFIG, hostWith(files).host);

  assert.equal(report.inputs, 1);
  const edits = inputValues(messages).get('toolu_1')?.['edits'] as { old_string: string; new_string: string }[];
  assert.deepEqual(edits[0], { old_string: 'x', new_string: 'y' });
  assert.equal(edits[1]?.old_string, 'p');
  const ticket = readInputTicket(String(edits[1]?.new_string));
  assert.ok(ticket);
  assert.equal(ticket.field, 'new_string');
  assert.deepEqual(await recall(files, DIR, ticket.id), { text: value });
});

test('a value that left at an earlier compaction stays its ticket, and a second compaction writes nothing new for it', async () => {
  const files = new MemoryFiles();
  const before = conversation([write('a.ts', 3000), write('b.ts', 3000), write('c.ts', 3000)]);

  const once = await compact(inUse(before), CONFIG, hostWith(files).host);
  const written = files.writes.length;
  const twice = await compact(inUse(once.messages), CONFIG, hostWith(files).host);

  assert.deepEqual(inputValues(twice.messages), inputValues(once.messages));
  assert.equal(twice.report.inputs, 0);
  assert.equal(files.writes.length, written);
});

test('a value that cannot be stored stays in its call, as it was, and is counted', async () => {
  const files = new MemoryFiles();
  files.corrupt = (text) => `${text}!`;
  const before = conversation([write('a.ts', 3000), write('b.ts', 3000)]);

  const { messages, report } = await compact(inUse(before), CONFIG, hostWith(files).host);

  assert.equal(report.inputs, 0);
  assert.deepEqual(inputValues(messages), inputValues(before));
  assert.equal(report.notMoved.differs, 1);
});

test('inputs leave until what is in use is at the target and no further: the oldest first, and those after stay', async () => {
  const files = new MemoryFiles();
  const before = conversation([write('a.ts', 6000), write('b.ts', 6000), write('c.ts', 6000), write('d.ts', 6000), write('e.ts', 6000)]);
  // About 10,000 tokens in use and half of it to lose: each value saves about 5,900 characters, so three cover it and a fourth is not needed.
  const { messages, report } = await compact(inUse(before), CONFIG, hostWith(files).host);

  const left = [...inputValues(messages).entries()].filter(([, input]) => readInputTicket(String(input['content'])) !== null).map(([id]) => id);
  assert.deepEqual(left, ['toolu_1', 'toolu_2', 'toolu_3']);
  assert.equal(report.inputs, 3);
});

test("a result moved out leaves a ticket that says how many lines it held, whatever its tool, and the ticket stays as it is when compacted again (#149)", async () => {
  const files = new MemoryFiles();
  const fetched: Call = { tool: 'WebFetch', input: { url: 'https://example.com' }, text: output('page', 100) };
  const before = conversation([call('a'), fetched, call('c')]);
  const config = CONFIG;

  const first = await compact(inputFor(before), config, hostWith(files).host);

  const after = new Map(first.messages.flatMap((m) => m.toolResults ?? []).map((r) => [r.tool_use_id, r.text]));
  const shown = readTicket(after.get('toolu_1') ?? '');
  assert.ok(shown);
  assert.equal(after.get('toolu_1'), ticketText(shown));
  assert.equal(shown.lines, 100);
  // From the web as well.
  const web = readTicket(after.get('toolu_2') ?? '');
  assert.ok(web);
  assert.equal(after.get('toolu_2'), ticketText(web));
  assert.equal(web.lines, 100);
  // On the call's side too, as on the result's.
  assert.equal(first.messages.flatMap((m) => m.toolUses).find((u) => u.tool_use_id === 'toolu_1')?.text, after.get('toolu_1'));

  const second = await compact(inputFor(first.messages), config, hostWith(files).host);
  assert.deepEqual(second.messages, first.messages);
});
