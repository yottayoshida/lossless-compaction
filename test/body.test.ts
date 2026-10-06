import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EDGE_CHARS, readBody, rewound, selectBodies, splitOf, wholeOf } from '../src/body.ts';
import { CHARS_PER_TOKEN, charsOf, compact, reportLine, type Config, type Input } from '../src/compact.ts';
import { find } from '../src/find.ts';
import { keepConversation } from '../src/keep.ts';
import { middleDropped, middleRefusal, placedTicketIds } from '../src/guard.ts';
import { ticketIds } from '../src/lifetime.ts';
import { goalOf } from '../src/select.ts';
import { PART, RECALL_TOOL, idMeant, isStored, moveBodyOut, moveOut, partTicketText, readBodyTicket, recall, storedAs } from '../src/store.ts';
import type { Message } from '../src/types.ts';
import { readLine } from '../bench/lib.ts';
import { MemoryFiles, recordingHttp } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';
const CONFIG: Config = { store: { write: DIR, read: [DIR] }, keepTokens: 0, minChars: 2000, targetPercent: 40, maxAfterPercent: 75 };
const said = (role: 'user' | 'assistant', text: string): Message => ({ role, text, toolUses: [] });
const inUse = (messages: readonly Message[]): Input => ({ messages, tokens: Math.ceil(charsOf(messages) / CHARS_PER_TOKEN), window: 1_000_000, goal: '' });
const host = (files: MemoryFiles) => ({ files, now: () => 0 });
/** A later long message: the newest stays whatever its size, so the one before it can leave. */
const later = (): Message[] => [said('user', pasted('Here are more notes.', 'LATER-1', 'That is all.')), said('assistant', 'Noted again.')];

/** A pasted document between what was asked of it: paragraphs of prose, with a value in the middle. */
const pasted = (ask: string, value: string, then: string) =>
  [ask, ...Array.from({ length: 12 }, (_, at) => `Paragraph ${at + 1} of the notes. ${'Words of the design notes. '.repeat(12)}${at === 6 ? ` The checksum is ${value}.` : ''}`), then].join('\n\n');

test('a long message keeps its first and last paragraphs, and the line between them names the whole message', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Read these notes and reply only: noted.', 'MIDMARK-7391', 'That was the end of the notes.');
  const before: Message[] = [said('user', 'We are testing.'), said('assistant', 'Understood.'), said('user', doc), said('assistant', 'Noted.'), ...later(), said('user', 'Go on.')];
  const { messages, report } = await compact(inUse(before), CONFIG, host(files));

  assert.equal(report.bodies, 1);
  const body = readBody((messages[2] as Message).text);
  assert.ok(body);
  assert.equal(body.head, 'Read these notes and reply only: noted.');
  assert.equal(body.tail, 'That was the end of the notes.');
  assert.deepEqual(await recall(files, DIR, body.ticket.id), { text: doc });
  assert.equal(await isStored(files, DIR, (messages[2] as Message).text.split('\n')[1] as string), true);
  // Nothing else changed: what was said around it, word for word.
  assert.deepEqual(messages.map((m) => m.text).filter((_, at) => at !== 2), before.map((m) => m.text).filter((_, at) => at !== 2));
  assert.match(reportLine(report), /^moved 0 of 0 tool results out, the middle of 1 long message \(/);
  assert.equal(readLine(`lossless-compaction: ${reportLine(report)}`)?.bodies, 1);
  // Its id is the conversation's, for the clean-up and the guard; the goal does not take the line for words said.
  assert.ok(ticketIds(messages).has(body.ticket.id) && placedTicketIds(messages).has(body.ticket.id));
  assert.ok(!goalOf(messages, undefined).includes('[moved out]'));
  // A second compaction finds it moved already, and writes nothing.
  const writes = files.writes.length;
  const again = await compact(inUse(messages), CONFIG, host(files));
  assert.equal(again.report.bodies ?? 0, 0);
  assert.equal(files.writes.length, writes);
});

test('what stays of a long message: the first, a line of this plugin, one that has no middle, and the newest unless by hand', () => {
  const doc = pasted('Ask.', 'X-1', 'End.');
  const messages: Message[] = [said('user', doc), said('user', `[lossless-compaction] ${doc}`), said('assistant', 'one\n\ntwo'), said('user', doc), said('assistant', doc)];
  // The first message stays; a line of this plugin's stays; the newest stays whatever its size.
  assert.deepEqual(selectBodies(messages, { keepChars: 0, minChars: 2000 }).map((one) => one.at), [3]);
  assert.deepEqual(selectBodies(messages, { keepChars: 0, minChars: 2000, keepNewest: false }).map((one) => one.at), [3, 4]);
  // Two paragraphs, or a long text in one fenced block between them: no middle to take out.
  assert.equal(splitOf(`Ask.\n\n${'w'.repeat(3000)}`), null);
  assert.equal(splitOf(`Ask.\n\n\`\`\`\n${'line\n\n'.repeat(600)}\`\`\``), null);
  // A fenced block is never cut inside: its blank lines are no paragraphs.
  const fenced = splitOf(`Look at this.\n\n\`\`\`\n${'code line\n\ncode line\n'.repeat(200)}\`\`\`\n\nWhat is wrong?`);
  assert.deepEqual(fenced, { head: 'Look at this.', tail: 'What is wrong?' });
});

test('a first or last paragraph longer than the edge is cut at a line, else at whole characters', () => {
  const longHead = Array.from({ length: 40 }, (_, at) => `head line ${at}`).join('\n');
  const split = splitOf(`${longHead}\n\n${'m'.repeat(3000)}\n\n${'🎉'.repeat(400)}`);
  assert.ok(split);
  assert.ok(split.head.length <= EDGE_CHARS && longHead.startsWith(split.head) && split.head.endsWith(`line ${split.head.split('\n').length - 1}`));
  assert.ok(split.tail.length <= EDGE_CHARS && split.tail.length > 0);
  assert.ok(/^(🎉)+$/.test(split.tail), 'no half of a pair at its start');
});

test('find looks through the middle of a message for a quoted phrase and gives it back, and never sends it to Jev', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Keep these notes.', 'MIDMARK-7391', 'Thanks.');
  const before: Message[] = [said('user', 'We are testing.'), said('assistant', 'Understood.'), said('user', doc), said('assistant', 'Noted.'), ...later(), said('user', 'Go on.')];
  const { messages } = await compact(inUse(before), CONFIG, host(files));
  // Anything sent would be recorded: nothing is to be.
  const { http, sent } = recordingHttp(() => {
    throw new Error('nothing of a message is sent to Jev');
  });

  const answer = await find({ files, dirs: [DIR], messages, question: 'What was the checksum in "The checksum is MIDMARK"?', provider: { kind: 'typesafe', key: 'k' }, http } as never);
  assert.ok(answer.startsWith('[found] the middle of a message of the person'), answer.slice(0, 120));
  assert.ok(answer.includes(doc));
  assert.equal(sent.length, 0, 'nothing went to Jev');
});

test('a write that holds a message without its middle is refused; the whole message, recalled, is not', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Save these notes to a file.', 'MIDMARK-7391', 'That is all of them, please keep them safe.');
  const { messages } = await compact(inUse([said('user', 'Start.'), said('assistant', 'Ok.'), said('user', doc), said('assistant', 'Will do.'), ...later(), said('user', 'Go.')]), CONFIG, host(files));
  const body = readBody((messages[2] as Message).text);
  assert.ok(body);
  const id = body.ticket.id;
  // The line dropped: refused. The middle written back in: through.
  assert.equal(middleDropped({ file_path: 'notes.md', content: `${body.head}\n${body.tail}\n` }, messages), id);
  assert.equal(middleDropped({ file_path: 'notes.md', content: `${body.head}\n\n${body.tail}` }, messages), id);
  assert.equal(middleDropped({ file_path: 'notes.md', content: doc }, messages), null);
  assert.equal(middleDropped({ file_path: 'notes.md', content: 'something else entirely' }, messages), null);
  // An id the agent copied wrong from such a line is taken for the one meant.
  const assistant: Message[] = [said('assistant', (messages[2] as Message).text)];
  assert.equal(idMeant(id.slice(0, 24), assistant), id);
  assert.equal(readBodyTicket(`[moved out] the middle of this message; recall returns the whole message, 1 bytes, head and tail included, with ${RECALL_TOOL} id ${id}`)?.id, id);
});

test('a message sent again from a rewind, still its first paragraph, the line and its last, goes in whole', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Read these notes.', 'MIDMARK-7391', 'That was all.');
  const { messages } = await compact(inUse([said('user', 'Start.'), said('assistant', 'Ok.'), said('user', doc), said('assistant', 'Noted.'), ...later(), said('user', 'Go.')]), CONFIG, host(files));
  const box = (messages[2] as Message).text;
  const read = async (id: string) => {
    const got = await recall(files, DIR, id);
    return 'error' in got ? null : got.text;
  };
  assert.equal(await wholeOf(box, read), doc);
  // Edited in the box, the first or the last paragraph no longer as kept: sent as typed.
  assert.equal(await wholeOf(box.replace('Read these notes.', 'Read these notes again.'), read), null);
  assert.equal(await wholeOf(`${box} And one more thing.`, read), null);
  // Not that shape at all, or nothing kept under the id: sent as typed.
  assert.equal(await wholeOf('Hello there.', read), null);
  assert.equal(await wholeOf(box, async () => null), null);
});

test('where a message is cut: never at leading blank lines, never inside a pair, and not where the middle is too small to be worth a line', () => {
  const middle = 'Middle paragraph. '.repeat(40);
  // Blank lines before the first paragraph are no break: the head is that paragraph, from the start of the text.
  assert.deepEqual(splitOf(`\n\nAsk.\n\n${middle}\n\nEnd.`), { head: '\n\nAsk.', tail: 'End.' });
  // A first line too long to keep whole, a pair at the edge: cut before the pair.
  const split = splitOf(`${'a'.repeat(EDGE_CHARS - 1)}🎉tail of the line\n\n${middle}\n\nx${'🎉'.repeat(400)}y`);
  assert.ok(split);
  assert.equal(split.head, 'a'.repeat(EDGE_CHARS - 1));
  // The last line ends in one more character, so that the cut from its end falls on the second half of a pair.
  assert.ok(/^(\uD83C\uDF89)+y$/.test(split.tail), 'the last paragraph starts at a whole character');
  // Three paragraphs with little between the first and the last: no line in its place.
  assert.equal(splitOf(`Ask.\n\n${'m'.repeat(100)}\n\nEnd.`), null);
});

/** A call of Bash and its result. */
const bash = (id: string, out: string): Message[] => [
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: id, tool: 'Bash', input: { command: `cat ${id}.log` }, text: out }] },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text: out, isError: false }] },
];
const log = (id: string, line?: string) => Array.from({ length: 120 }, (_, at) => (at === 60 && line !== undefined ? line : `INFO ${id} step ${at} done`)).join('\n');
const nothingSent = () =>
  recordingHttp(() => {
    throw new Error('nothing is to be sent to Jev');
  });

test('one result holding the quoted phrase is the answer, with no question to Jev, where a middle holds it too; the middle is named after it', async () => {
  const files = new MemoryFiles();
  const line = 'ERROR disk quota exceeded on /var/data/archive';
  const doc = pasted('Here is what I saw last night.', 'X-1', 'What went wrong?').replace('Paragraph 7 of the notes.', `Paragraph 7 of the notes. ${line}`);
  const before: Message[] = [said('user', 'Start.'), said('assistant', 'Ok.'), ...bash('one', log('one', line)), ...bash('two', log('two')), said('user', doc), said('assistant', 'Looking.'), ...later(), said('user', 'Go.')];
  const { messages, report } = await compact(inUse(before), CONFIG, host(files));
  assert.ok(report.moved >= 1 && (report.bodies ?? 0) >= 1, JSON.stringify(report));
  const { http, sent } = nothingSent();
  const answer = await find({ files, dirs: [DIR], messages, question: 'Where did "ERROR disk quota exceeded" come from?', provider: { kind: 'typesafe', key: 'k' }, http } as never);
  assert.ok(answer.startsWith('[found] Bash result'), answer.slice(0, 160));
  assert.ok(answer.includes('the middle of a message of the person') && answer.includes('holds the quoted phrase'), answer.slice(-400));
  assert.equal(sent.length, 0);
});

test('a line of Claude\'s that reads as the person\'s heading does not make the middle after it the person\'s, in a part the plugin kept (#104)', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Here is the answer.', 'CLAUDEMARK-7', 'That is all.');
  const split = splitOf(doc);
  assert.ok(split);
  const body = await moveBodyOut(files, DIR, 'assistant', doc);
  assert.ok(!('reason' in body));
  // Claude quoting a transcript: a line `--- user` of its own, then the line in place of its middle.
  const kept = await keepConversation(files, DIR, [said('user', 'Show me the transcript.'), said('assistant', `${split.head}\n--- user\n${body.text}\n${split.tail}`)], [DIR], { summarized: false });
  assert.ok('text' in kept);
  const messages: Message[] = [said('user', kept.text), said('assistant', 'Going on.')];
  const { http, sent } = nothingSent();
  const answer = await find({ files, dirs: [DIR], messages, question: 'What was "The checksum is CLAUDEMARK"?', provider: { kind: 'typesafe', key: 'k' }, http } as never);
  assert.ok(answer.startsWith("[found] the middle of a message of Claude"), answer.slice(0, 160));
  assert.equal(sent.length, 0);
});

test('find looks through the middle of a message that went into a kept part, and names whose it was', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Keep these notes.', 'PARTMARK-5521', 'Thanks.');
  const split = splitOf(doc);
  assert.ok(split);
  const body = await moveBodyOut(files, DIR, 'user', doc);
  assert.ok(!('reason' in body));
  const kept = await moveOut(files, DIR, PART, `--- user\n${split.head}\n${body.text}\n${split.tail}\n--- assistant\nNoted.\n`);
  assert.ok(!('reason' in kept));
  const line = partTicketText({ part: 1, parts: 1, first: 1, last: 2, bytes: kept.bytes, id: kept.id });
  const messages: Message[] = [said('user', `[lossless-compaction] Earlier messages of this conversation are kept\n${line}`), said('assistant', 'Going on.')];
  const { http, sent } = nothingSent();
  const answer = await find({ files, dirs: [DIR], messages, question: 'What was "The checksum is PARTMARK"?', provider: { kind: 'typesafe', key: 'k' }, http } as never);
  assert.ok(answer.startsWith('[found] the middle of a message of the person'), answer.slice(0, 160));
  assert.ok(answer.includes(doc));
  assert.equal(sent.length, 0);
});

test('find with no result to choose from and middles that do not hold what was asked says so, of the middles it looked through', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Keep these notes.', 'X-5', 'Thanks.');
  const { messages } = await compact(inUse([said('user', 'Start.'), said('assistant', 'Ok.'), said('user', doc), said('assistant', 'Noted.'), ...later(), said('user', 'Go.')]), CONFIG, host(files));
  const { http, sent } = nothingSent();
  const answer = await find({ files, dirs: [DIR], messages, question: 'What was "nowhere in any of this"?', provider: { kind: 'typesafe', key: 'k' }, http } as never);
  assert.ok(answer.startsWith('[not found]') && answer.includes('middle of a long message'), answer);
  assert.ok(!answer.includes('none was moved out'), answer);
  assert.equal(sent.length, 0);
});

test('the whole message written with a last paragraph said earlier too, a signature say, is not taken for one without its middle', async () => {
  const files = new MemoryFiles();
  const sign = 'Best regards from the whole team, Ana.';
  const doc = ['Notes from the team, one email after another.', sign, ...Array.from({ length: 10 }, (_, at) => `Email ${at + 1}. ${'Words of the email. '.repeat(14)}`), sign].join('\n\n');
  const { messages } = await compact(inUse([said('user', 'Start.'), said('assistant', 'Ok.'), said('user', doc), said('assistant', 'Noted.'), ...later(), said('user', 'Go.')]), CONFIG, host(files));
  const body = readBody((messages[2] as Message).text);
  assert.ok(body);
  assert.equal(body.tail, sign);
  assert.equal(middleDropped({ file_path: 'thread.md', content: doc }, messages), null);
  assert.equal(middleDropped({ file_path: 'thread.md', content: `${body.head}\n${body.tail}` }, messages), body.ticket.id);
});

test('a message without its middle handed to any tool that does not only read is refused by the hook: a tool of an MCP server and a subagent too', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Save these notes somewhere.', 'X-6', 'That is all of them, please keep them safe.');
  const { messages } = await compact(inUse([said('user', 'Start.'), said('assistant', 'Ok.'), said('user', doc), said('assistant', 'Will do.'), ...later(), said('user', 'Go.')]), CONFIG, host(files));
  const body = readBody((messages[2] as Message).text);
  assert.ok(body);
  const dropped = `${body.head}\n${body.tail}\n${'And a few words of my own after it. '.repeat(4)}`;
  type Call = ($: unknown, e: Record<string, unknown>, next: (e: unknown) => Promise<unknown>) => Promise<unknown>;
  const { register } = (await import(new URL('../hooks/move-out.ts', import.meta.url).href)) as { register: (on: (name: string, ...rest: unknown[]) => void, options: Record<string, unknown>) => void };
  const guards: Call[] = [];
  register((name, ...rest) => {
    if (name === 'tool.call' && typeof rest[0] === 'function') guards.push(rest[0] as Call);
    // What `on` returns, which the compaction hook's `.catch` is called on.
    return { catch: () => undefined };
  }, {});
  assert.equal(guards.length, 1, 'one hook stands in front of every tool');
  const guard = guards[0] as Call;
  const $ = { session: { messages: async () => messages } };
  const ran = async () => 'ran';
  for (const [tool, input] of [
    ['Write', { file_path: 'notes.md', content: dropped }],
    ['mcp__notion__notion-create-pages', { pages: [{ content: dropped }] }],
    ['Agent', { description: 'save', prompt: dropped }],
  ] as const) {
    assert.deepEqual(await guard($, { tool, tool_use_id: 'toolu_x', ...input }, ran), { deny: middleRefusal(body.ticket.id) }, tool);
  }
  // A tool known only to read goes on, and so does the whole message.
  assert.equal(await guard($, { tool: 'Grep', tool_use_id: 'toolu_y', pattern: dropped }, ran), 'ran');
  assert.equal(await guard($, { tool: 'Write', tool_use_id: 'toolu_z', file_path: 'notes.md', content: doc }, ran), 'ran');
});

test('what stays of a paragraph is never cut inside a fenced block: a block opened with backticks closes at backticks, and a long block at an edge keeps the message whole', () => {
  const middle = 'Middle paragraph of the notes. '.repeat(30);
  // Tildes inside a block of backticks open nothing, so the blank line between them is no paragraph's end.
  const block = '```md\nan example:\n~~~\n\ninside the example\n~~~\n```';
  assert.deepEqual(splitOf(`${block}\n\n${middle}\n\nEnd.`), { head: block, tail: 'End.' });
  const code = `\`\`\`ts\n${Array.from({ length: 60 }, (_, at) => `const value${at} = ${at};`).join('\n')}\n\`\`\``;
  // A line before the block in the same paragraph is what stays of it.
  assert.deepEqual(splitOf(`Look at this.\n${code}\n\n${middle}\n\nEnd.`), { head: 'Look at this.', tail: 'End.' });
  // A first or last paragraph that is a block too long to keep: the message stays whole.
  assert.equal(splitOf(`${code}\n\n${middle}\n\nEnd.`), null);
  assert.equal(splitOf(`Ask.\n\n${middle}\n\nWhat does this do?\n${code}`), null);
});

test('a message that ends with a newline and a long last paragraph comes back whole from a rewind', async () => {
  const files = new MemoryFiles();
  const last = Array.from({ length: 40 }, (_, at) => `last line ${at}`).join('\n');
  const doc = `${pasted('Read these notes.', 'X-2', 'Then this:')}\n\n${last}\n`;
  const { messages } = await compact(inUse([said('user', 'Start.'), said('assistant', 'Ok.'), said('user', doc), said('assistant', 'Noted.'), ...later(), said('user', 'Go.')]), CONFIG, host(files));
  const box = (messages[2] as Message).text;
  assert.ok(readBody(box)?.tail.endsWith('\n'));
  const read = async (id: string) => {
    const got = await recall(files, DIR, id);
    return 'error' in got ? null : got.text;
  };
  assert.equal(await wholeOf(box, read), doc);
});

test('a prompt goes in as the whole message only where the person sent it, and only for a message this plugin kept', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Read these notes.', 'X-3', 'That was all.');
  const { messages } = await compact(inUse([said('user', 'Start.'), said('assistant', 'Ok.'), said('user', doc), said('assistant', 'Noted.'), ...later(), said('user', 'Go.')]), CONFIG, host(files));
  const box = (messages[2] as Message).text;
  const kept = {
    kindOf: (id: string) => storedAs(files, [DIR], id),
    textOf: async (id: string) => {
      const got = await recall(files, DIR, id);
      return 'error' in got ? null : got.text;
    },
  };
  assert.equal(await rewound({ text: box, origin: { kind: 'composer' } }, kept), doc);
  assert.equal(await rewound({ text: box, origin: { kind: 'bridge' } }, kept), doc);
  for (const kind of ['peer', 'task-notification', 'plugin', 'channel']) assert.equal(await rewound({ text: box, origin: { kind } }, kept), null, kind);
  // A line alone is no message whose middle left, and an id that names a tool's result is not a message kept.
  const id = readBody(box)?.ticket.id as string;
  const line = box.split('\n').find((one) => readBodyTicket(one) !== null) as string;
  assert.equal(await rewound({ text: line, origin: { kind: 'composer' } }, kept), null);
  const result = await moveOut(files, DIR, 'Bash', `Read these notes.\n${'output\n'.repeat(400)}That was all.`);
  assert.ok(!('reason' in result));
  assert.equal(await rewound({ text: box.replace(id, result.id), origin: { kind: 'composer' } }, kept), null);
});

test('only what a person said and what Claude said have middles that leave: a notification or a message of another session stays whole', () => {
  const doc = pasted('Ask.', 'X-4', 'End.');
  const messages: Message[] = [
    said('user', 'Start.'),
    said('user', `<task-notification>\n${doc}\n</task-notification>`),
    said('user', `Another Claude session sent a message:\n<teammate-message teammate_id="r1" color="blue">\n${doc}\n</teammate-message>`),
    said('user', doc),
    said('assistant', doc),
  ];
  assert.deepEqual(selectBodies(messages, { keepChars: 0, minChars: 2000, keepNewest: false }).map((one) => one.at), [3, 4]);
});

test('the second round of a /compact by hand tries no middle the first tried: one that could not be written is counted once', async () => {
  const files = new MemoryFiles();
  const old = pasted('Old notes.', 'X-7', 'End of the old notes.');
  files.corrupt = (text) => (text === old ? `${text}!` : text);
  const before: Message[] = [said('user', 'Start.'), said('assistant', 'Ok.'), said('user', old), said('assistant', 'Noted.'), ...later(), said('user', 'Go.'), said('assistant', 'Going.')];
  // keepTokens 0: the first round tries the old notes and fails, keeping the newest; the second takes the newest.
  const { report } = await compact({ ...inUse(before), byHand: true }, CONFIG, host(files));
  assert.equal(report.notMoved.differs, 1);
  assert.equal(report.bodies, 1);
});

test('asked in words alone, find says the middles are looked for only by a quoted phrase or values, and names them to read', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Read these design notes.', 'X-8', 'That was all.');
  const { messages } = await compact(inUse([said('user', 'Start.'), said('assistant', 'Ok.'), said('user', doc), said('assistant', 'Noted.'), ...later(), said('user', 'Go.')]), CONFIG, host(files));
  const id = readBody((messages[2] as Message).text)?.ticket.id as string;
  const { http, sent } = nothingSent();
  const answer = await find({ files, dirs: [DIR], messages, question: 'What did the design notes say about storage?', provider: { kind: 'typesafe', key: 'k' }, http } as never);
  assert.ok(answer.includes('looked through only for a quoted phrase') && answer.includes(`recall with ${RECALL_TOOL} id ${id}`), answer);
  assert.ok(!answer.includes('[not found]') && !answer.includes('holding .'), answer);
  assert.equal(sent.length, 0);
});

test('a first and a last paragraph under 40 characters together are refused only side by side: ordinary writing with both is not', async () => {
  const files = new MemoryFiles();
  const doc = ['Summarize this:', ...Array.from({ length: 10 }, (_, at) => `Paragraph ${at + 1}. ${'Words of the pasted report. '.repeat(10)}`), 'Thanks!'].join('\n\n');
  const { messages } = await compact(inUse([said('user', 'Start.'), said('assistant', 'Ok.'), said('user', doc), said('assistant', 'Done.'), ...later(), said('user', 'Go.')]), CONFIG, host(files));
  const body = readBody((messages[2] as Message).text);
  assert.ok(body && body.head.length + body.tail.length < 40);
  assert.equal(middleDropped({ file_path: 'summary.md', content: `${body.head}\n\n${body.tail}\n${'Some words of my own after it. '.repeat(10)}` }, messages), body.ticket.id);
  assert.equal(middleDropped({ file_path: 'summary.md', content: `${body.head} ${'the report in three lines. '.repeat(3)}${body.tail}${' More words. '.repeat(20)}` }, messages), null);
  // A message that is a line alone, pasted by someone, holds no paragraphs to look for: nothing is refused for it.
  const line = (messages[2] as Message).text.split('\n').find((one) => readBodyTicket(one) !== null) as string;
  assert.equal(middleDropped({ file_path: 'a.md', content: 'x'.repeat(300) }, [said('user', line)]), null);
});

test('backticks with code after them on the same line are no fence: a message of such lines is cut as any other', () => {
  const middle = 'Middle paragraph of the notes. '.repeat(30);
  assert.deepEqual(splitOf(`Run these:\n\`\`\`npm install\`\`\`\n\n${middle}\n\n\`\`\`npm test\`\`\`\nDone.`), { head: 'Run these:\n```npm install```', tail: '```npm test```\nDone.' });
});

test('a prompt the SDK sends, as an editor or the desktop app does, goes in whole as one typed at the terminal does', async () => {
  const files = new MemoryFiles();
  const doc = pasted('Read these notes.', 'X-9', 'That was all.');
  const { messages } = await compact(inUse([said('user', 'Start.'), said('assistant', 'Ok.'), said('user', doc), said('assistant', 'Noted.'), ...later(), said('user', 'Go.')]), CONFIG, host(files));
  const kept = {
    kindOf: (id: string) => storedAs(files, [DIR], id),
    textOf: async (id: string) => {
      const got = await recall(files, DIR, id);
      return 'error' in got ? null : got.text;
    },
  };
  assert.equal(await rewound({ text: (messages[2] as Message).text, origin: { kind: 'sdk' } }, kept), doc);
});
