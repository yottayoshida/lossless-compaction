import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readingsIn, readFoldedReadLine } from '../src/changed.ts';
import { CHARS_PER_TOKEN, charsOf, compact, reportLine, type Config, type Input } from '../src/compact.ts';
import { FOLDABLE, isFoldedList, runsIn } from '../src/fold.ts';
import { placedTicketIds } from '../src/guard.ts';
import { ticketIds } from '../src/lifetime.ts';
import { goalOf } from '../src/select.ts';
import { PART, isStored, moveInputOut, moveOut, partTicketText, readPartTicket, recall, ticketText } from '../src/store.ts';
import { find, ticketsIn } from '../src/find.ts';
import type { Message } from '../src/types.ts';
import { MemoryFiles } from './helpers.ts';
import { readLine } from '../bench/lib.ts';

const DIR = '/home/u/.claude/lossless-compaction';
const CONFIG: Config = { store: { write: DIR, read: [DIR] }, keepTokens: 0, minChars: 2000, targetPercent: 40, maxAfterPercent: 75 };

let next = 0;
/** An assistant message of calls and the message of their results, each call a tool with an input and what it returned. */
function calls(...made: { tool: string; input: Record<string, unknown>; out: string; isError?: boolean; said?: string }[]): Message[] {
  const ids = made.map(() => `toolu_${(next += 1)}`);
  return [
    { role: 'assistant', text: made[0]?.said ?? '', toolUses: made.map((one, at) => ({ tool_use_id: ids[at] as string, tool: one.tool, input: one.input, text: one.out })) },
    { role: 'user', text: '', toolUses: [], toolResults: made.map((one, at) => ({ tool_use_id: ids[at] as string, text: one.out, isError: one.isError ?? false })) },
  ];
}
// Under minChars, and long enough that a list of it takes less room than it did.
const bash = (command: string, out = `${command}: ok\n`.repeat(60)) => ({ tool: 'Bash', input: { command, description: `Run ${command}` }, out });
const said = (role: 'user' | 'assistant', text: string): Message => ({ role, text, toolUses: [] });
const inUse = (messages: readonly Message[]): Input => ({ messages, tokens: Math.ceil(charsOf(messages) / CHARS_PER_TOKEN), window: 1_000_000, goal: '' });
const host = (files: MemoryFiles) => ({ files, now: () => 0 });
/** Whether a text holds no half of a pair: UTF-8 cannot hold one, and encoding it throws. */
const wellFormed = (text: string): boolean => {
  try {
    encodeURIComponent(text);
    return true;
  } catch {
    return false;
  }
};

/** Every call that stands has its result in the message right after it, and every result answers a call right before it. */
function pairedAsTheApiWants(messages: readonly Message[]): void {
  messages.forEach((message, at) => {
    if (message.toolUses.length === 0) return;
    const results = new Set((messages[at + 1]?.toolResults ?? []).map((result) => result.tool_use_id));
    for (const use of message.toolUses) assert.ok(results.has(use.tool_use_id), `the call ${use.tool_use_id} at ${at} has its result right after it`);
  });
  messages.forEach((message, at) => {
    for (const result of message.toolResults ?? []) assert.ok(messages[at - 1]?.toolUses.some((use) => use.tool_use_id === result.tool_use_id), `the result ${result.tool_use_id} at ${at} answers a call right before it`);
  });
}

test('old small calls fold into a list where they stood; what the person and Claude said stays word for word; the newest stay', async () => {
  const files = new MemoryFiles();
  const before: Message[] = [
    said('user', 'Check the inventory, shelf by shelf.'),
    ...calls(bash('cat shelf1.txt'), bash('cat shelf2.txt')),
    ...calls({ ...bash('cat shelf3.txt'), said: 'Shelves 1 and 2 look fine; now 3.' }),
    said('assistant', 'Shelf 3 has a slot at zero.'),
    said('user', 'Write that down, then go on with shelf 4.'),
    ...calls(bash('cat shelf4.txt')),
    said('assistant', 'Shelf 4 is fine.'),
  ];
  const { messages, report, enough } = await compact(inUse(before), { ...CONFIG, keepTokens: 150 }, host(files));

  // What was said stands, in its order.
  const texts = messages.filter((m) => m.toolUses.length === 0 && (m.toolResults?.length ?? 0) === 0 && !m.text.startsWith('[lossless-compaction]')).map((m) => m.text);
  assert.deepEqual(texts, ['Check the inventory, shelf by shelf.', 'Shelves 1 and 2 look fine; now 3.', 'Shelf 3 has a slot at zero.', 'Write that down, then go on with shelf 4.', 'Shelf 4 is fine.']);
  // Two lists: the first two calls, then the third after what Claude said with it. The newest call stays.
  const lists = messages.filter((m) => m.text.startsWith('[lossless-compaction]'));
  assert.equal(lists.length, 2);
  assert.match(lists[0]!.text, /^\[lossless-compaction\] 2 tool calls were moved out here, with what they returned; recall the part for all of it\.\n\[moved out\] conversation, part 1 of 1, messages 2-3, \d+ bytes; recall with mcp__lossless-compaction__recall id [0-9a-f]{64}\nBash: Run cat shelf1\.txt -> 61 lines\nBash: Run cat shelf2\.txt -> 61 lines$/);
  assert.ok(messages.some((m) => m.toolUses.some((use) => use.input['command'] === 'cat shelf4.txt')), 'the newest call stays');
  assert.equal(messages.flatMap((m) => m.toolUses).length, 1);
  pairedAsTheApiWants(messages);
  assert.equal(report.folded, 3);
  assert.equal(enough, true);
  assert.match(reportLine(report), /^moved 0 of 4 tool results out, 3 old tool calls folded into lists \(/);
  assert.equal(readLine(`lossless-compaction: ${reportLine(report)}`)?.folded, 3);

  // Each list's part is this store's, and gives back the calls and what they returned, whole.
  for (const list of lists) {
    const ticket = readPartTicket(list.text.split('\n')[1] as string);
    assert.ok(ticket);
    assert.equal(await isStored(files, DIR, list.text.split('\n')[1] as string), true);
    const back = await recall(files, DIR, ticket.id);
    assert.ok(!('error' in back));
  }
  const first = await recall(files, DIR, readPartTicket(lists[0]!.text.split('\n')[1] as string)!.id);
  assert.ok(!('error' in first) && first.text.includes('cat shelf1.txt: ok') && first.text.includes('[call Bash'));
  // The clean-up keeps the parts, the guard knows them, and a list is not what the person is working on.
  for (const list of lists) {
    const id = readPartTicket(list.text.split('\n')[1] as string)!.id;
    assert.ok(ticketIds(messages).has(id));
    assert.ok(placedTicketIds(messages).has(id));
  }
  assert.ok(!goalOf(messages, undefined).includes('lossless-compaction'));
});

test('what does not fold: the first message, a tool not named, a call that failed, a long result, and a message whose calls do not all fold', () => {
  const ask = { tool: 'AskUserQuestion', input: { questions: [] }, out: 'The user chose: keep it' };
  const conversation: Message[] = [
    ...calls(bash('first')),
    ...calls(bash('a')),
    ...calls(ask),
    ...calls({ ...bash('b'), isError: true }),
    ...calls(bash('c', 'x'.repeat(3000))),
    ...calls(bash('d'), ask),
    ...calls(bash('e'), bash('f')),
    said('assistant', 'done'),
  ];
  const runs = runsIn(conversation, 0, 2000);
  const folded = runs.flatMap((run) => run.messages.flatMap((m) => m.toolUses.map((use) => String(use.input['command'] ?? use.tool))));
  // The first message is message 0, the assistant one: it stays. So does its pair's other half, a result with no call left before it.
  assert.deepEqual(folded, ['a', 'e', 'f']);
  // Two calls made side by side fold together, in one run.
  assert.equal(runs.at(-1)!.messages[0]!.toolUses.length, 2);
  assert.ok(FOLDABLE.has('Bash') && !FOLDABLE.has('AskUserQuestion') && !FOLDABLE.has('TodoWrite') && !FOLDABLE.has('ExitPlanMode'));
});

test('a file read whole keeps its reading on its line: the file is still set against it, and a folded write to it says the agent changed it', async () => {
  const files = new MemoryFiles();
  const reading = Array.from({ length: 60 }, (_, at) => `${at + 1}\tline ${at + 1} of the file`).join('\n');
  const read = (path: string) => ({ tool: 'Read', input: { file_path: path }, out: reading });
  const before: Message[] = [
    said('user', 'Look at the two files.'),
    ...calls(read('/w/a.ts')),
    ...calls(read('/w/b.ts')),
    ...calls({ tool: 'Edit', input: { file_path: '/w/b.ts', old_string: 'one', new_string: 'uno' }, out: `The file has been updated.\n${reading}` }),
    said('assistant', 'Done.'),
  ];
  const { messages } = await compact(inUse(before), CONFIG, host(files));

  const list = messages.find((m) => m.text.startsWith('[lossless-compaction]'));
  assert.ok(list);
  const readLines = list.text.split('\n').map(readFoldedReadLine).filter((one) => one !== null);
  assert.deepEqual(readLines.map((one) => one.path), ['/w/a.ts', '/w/b.ts']);
  for (const one of readLines) assert.deepEqual(await recall(files, DIR, one.id), { text: reading });
  assert.ok(list.text.includes('\nEdit: /w/b.ts -> written'));
  // a.ts is a reading still; b.ts was written by the agent afterwards, and is not.
  assert.deepEqual(readingsIn(messages).map((reading) => reading.path), ['/w/a.ts']);
  // Its reading's id is the conversation's, for the clean-up and for the guard.
  assert.ok(ticketIds(messages).has(readLines[0]!.id));
  assert.ok(placedTicketIds(messages).has(readLines[0]!.id));
});

test('folding stops at the target, oldest first, and leaves the rest where it stood', async () => {
  const files = new MemoryFiles();
  const before: Message[] = [said('user', 'Run the checks.')];
  for (let n = 1; n <= 12; n += 1) before.push(...calls(bash(`check ${n}`, `check ${n} passed\n`.repeat(80))), said('assistant', `Check ${n} done.`));
  const { messages, report } = await compact(inUse(before), CONFIG, host(files));

  const lists = messages.filter((m) => m.text.startsWith('[lossless-compaction]'));
  assert.ok(lists.length > 0 && lists.length < 11, `${lists.length} lists`);
  assert.equal(report.folded, lists.length);
  // The oldest went first: what stays is a run of the newest calls.
  const left = messages.flatMap((m) => m.toolUses.map((use) => Number(String(use.input['command']).split(' ')[1])));
  assert.deepEqual(left, Array.from({ length: left.length }, (_, at) => 12 - left.length + 1 + at));
  pairedAsTheApiWants(messages);
});

test('a run that cannot be stored stays where it stood, and is counted', async () => {
  const files = new MemoryFiles();
  files.corrupt = (text) => `${text}!`;
  const before: Message[] = [said('user', 'Go.'), ...calls(bash('a')), said('assistant', 'ok'), ...calls(bash('b'))];
  const { messages, report } = await compact(inUse(before), CONFIG, host(files));

  assert.equal(report.folded, 0);
  assert.deepEqual(messages.flatMap((m) => m.toolUses.map((use) => use.input['command'])), ['a', 'b']);
  assert.ok((report.notMoved.differs ?? 0) >= 1);
});

test('calls too small to be worth a list stay where they stood, and nothing is written for them', async () => {
  const files = new MemoryFiles();
  const before: Message[] = [said('user', 'Go.'), ...calls(bash('a', 'ok')), ...calls(bash('b', 'ok')), said('assistant', 'Both fine.')];
  const { messages, report } = await compact(inUse(before), CONFIG, host(files));

  assert.equal(report.folded, 0);
  assert.deepEqual(messages.flatMap((m) => m.toolUses.map((use) => use.input['command'])), ['a', 'b']);
  assert.equal(files.writes.length, 0);
});

test('however much is still needed, the newest calls stay as they stood', async () => {
  const files = new MemoryFiles();
  const before: Message[] = [said('user', 'Run the checks.')];
  for (let n = 1; n <= 6; n += 1) before.push(...calls(bash(`check ${n}`)), said('assistant', `Check ${n} done.`));
  // Nothing is enough: what is needed is everything. The newest 500 tokens, about 1,500 characters, hold the last check.
  const { messages } = await compact(inUse(before), { ...CONFIG, targetPercent: 0, keepTokens: 500 }, host(files));

  const left = messages.flatMap((m) => m.toolUses.map((use) => use.input['command']));
  assert.deepEqual(left, ['check 6']);
  pairedAsTheApiWants(messages);
});

test('a call that holds a ticket stays where it is: a Read moved out earlier goes on being the reading of its file, and find and the guard still see it', async () => {
  const files = new MemoryFiles();
  const reading = Array.from({ length: 80 }, (_, at) => `${at + 1}\tline ${at + 1} of the big file`).join('\n');
  const moved = await moveOut(files, DIR, 'Read', reading);
  assert.ok(!('reason' in moved));
  const written = await moveInputOut(files, DIR, 'Write', 'content', 'w'.repeat(3000));
  assert.ok(!('reason' in written));
  const before: Message[] = [
    said('user', 'Look around.'),
    ...calls(bash('a')),
    // A Read whose result left at an earlier compaction, and a Write whose content did: each holds a ticket now.
    ...calls({ tool: 'Read', input: { file_path: '/w/big.ts' }, out: moved.text }),
    ...calls({ tool: 'Write', input: { file_path: '/w/new.ts', content: written.text }, out: 'File created successfully.' }),
    ...calls(bash('b')),
    said('assistant', 'Done.'),
  ];
  const { messages, report } = await compact(inUse(before), CONFIG, host(files));

  assert.ok(report.folded > 0);
  const left = messages.flatMap((m) => m.toolUses.map((use) => use.tool));
  assert.deepEqual(left, ['Read', 'Write']);
  assert.deepEqual(readingsIn(messages).map((one) => [one.path, 'id' in one ? one.id : null]), [['/w/big.ts', moved.id]]);
  assert.ok(ticketsIn(messages).some((one) => one.id === moved.id));
  assert.ok(placedTicketIds(messages).has(moved.id) && placedTicketIds(messages).has(written.id));
});

test('the newest message stays whatever its size: the call that made it is never folded', () => {
  // Over the allowance on its own, and small enough for a part: only the rule of the newest keeps it.
  const huge = 'h'.repeat(35_000);
  const conversation: Message[] = [said('user', 'Go.'), ...calls(bash('a')), ...calls(bash('b')), ...calls({ tool: 'Bash', input: { command: 'dump' }, out: huge })];
  const folded = runsIn(conversation, 30_000, 100_000).flatMap((run) => run.messages.flatMap((m) => m.toolUses.map((use) => use.input['command'])));
  assert.deepEqual(folded, ['a', 'b']);
});

test('what a call is named by in its line holds no half of a pair, nothing that turns the text, and no line break', async () => {
  const files = new MemoryFiles();
  const description = `${'d'.repeat(78)}🎉 and more`;
  const before: Message[] = [
    said('user', 'Go.'),
    ...calls({ tool: 'Bash', input: { command: 'x', description }, out: 'x: ok\n'.repeat(60) }),
    ...calls({ tool: 'Bash', input: { command: 'y', description: `turned ${String.fromCharCode(0x202e)}around here` }, out: 'y: ok\n'.repeat(60) }),
    said('assistant', 'Done.'),
  ];
  const { messages } = await compact(inUse(before), CONFIG, host(files));

  const list = messages.find((m) => m.text.startsWith('[lossless-compaction]'));
  assert.ok(list);
  assert.ok(wellFormed(list.text));
  assert.ok(list.text.includes(`Bash: ${'d'.repeat(78)}…`), list.text);
  assert.ok(list.text.includes('Bash: turned around here ->'), list.text);
});

test('a part never holds half of a pair, and calls too large for a part on their own stay', async () => {
  const files = new MemoryFiles();
  const halved = `${'q'.repeat(100)}${String.fromCharCode(0xd83c)} rest\n`.repeat(15);
  const before: Message[] = [said('user', 'Go.'), ...calls(bash('a', halved)), ...calls(bash('b')), said('assistant', 'Done.')];
  const { messages } = await compact(inUse(before), CONFIG, host(files));
  const list = messages.find((m) => m.text.startsWith('[lossless-compaction]'));
  assert.ok(list);
  const part = await recall(files, DIR, readPartTicket(list.text.split('\n')[1] as string)!.id);
  assert.ok(!('error' in part) && wellFormed(part.text) && part.text.includes(`${String.fromCharCode(0xfffd)} rest`));

  // Ten results side by side of 1,990 Japanese characters: one pair over 40,000 bytes.
  const wide = calls(...Array.from({ length: 10 }, (_, at) => bash(`j${at}`, '日'.repeat(1990))));
  assert.deepEqual(runsIn([said('user', 'Go.'), ...wide, said('assistant', 'Done.')], 0, 2000), []);
});

test('a call that holds another text than its result stays, as a result in that case does', () => {
  const conversation: Message[] = [said('user', 'Go.'), ...calls(bash('a')), said('assistant', 'Done.')];
  conversation[1]!.toolUses[0]!.text = 'what the call says it returned';
  assert.deepEqual(runsIn(conversation, 0, 2000), []);
});

test('where a whole-file reading cannot be written, its run stays where it stood, as a result that cannot be written does, and is counted', async () => {
  const files = new MemoryFiles();
  const reading = Array.from({ length: 60 }, (_, at) => `${at + 1}\tline ${at + 1}`).join('\n');
  files.corrupt = (text) => (text === reading ? `${text}!` : text);
  const before: Message[] = [said('user', 'Go.'), ...calls({ tool: 'Read', input: { file_path: '/w/a.ts' }, out: reading }), ...calls(bash('b')), said('assistant', 'Done.')];
  const { messages, report } = await compact(inUse(before), CONFIG, host(files));

  assert.equal(report.folded, 0);
  assert.equal(report.notMoved.differs, 1);
  // Nothing of the run is folded, and no part was written for it.
  assert.deepEqual(messages.flatMap((m) => m.toolUses.map((use) => use.tool)), ['Read', 'Bash']);
  assert.ok(!messages.some((m) => m.text.startsWith('[lossless-compaction]')));
  assert.ok(![...files.files.keys()].some((path) => path.includes('/index/') && (files.files.get(path) ?? '').includes('"conversation"')));
});

test('find offers the part of a list of folded calls, and does not count it among the parts it reads through', async () => {
  const files = new MemoryFiles();
  // 70 lists of folded calls, then a part kept before a summary that holds a result: past the first 64 parts.
  const before: Message[] = [said('user', 'Go.')];
  for (let n = 1; n <= 70; n += 1) before.push(...calls(bash(`c${n}`, `c${n} output\n`.repeat(60))), said('assistant', `c${n} done.`));
  before.push(said('assistant', 'All done.'));
  const { messages } = await compact(inUse(before), { ...CONFIG, targetPercent: 0 }, host(files));
  const lists = messages.filter((m) => isFoldedList(m.text));
  assert.ok(lists.length > 64, `${lists.length} lists`);

  const result = await moveOut(files, DIR, 'Bash', `the needle phrase is here\n${'x'.repeat(3000)}`);
  assert.ok(!('reason' in result));
  const kept = await moveOut(files, DIR, PART, `--- user\n[result Bash t9] \n${ticketText({ tool: 'Bash', bytes: result.bytes, id: result.id })}\n`);
  assert.ok(!('reason' in kept));
  messages.push({ role: 'user', text: `[lossless-compaction] Earlier messages of this conversation are kept\n${partTicketText({ part: 1, parts: 1, first: 1, last: 1, bytes: kept.bytes, id: kept.id })}`, toolUses: [] });

  const answer = await find({ files, dirs: [DIR], messages, question: 'Where was "the needle phrase is here"?', provider: { kind: 'typesafe', key: 'k' }, http: async () => { throw new Error('nothing is to be sent'); } } as never);
  assert.ok(answer.startsWith('[found] Bash result'), answer.slice(0, 160));
});
