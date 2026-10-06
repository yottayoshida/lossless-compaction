import assert from 'node:assert/strict';
import { test } from 'node:test';

import { find } from '../src/find.ts';
import { INLINE_BYTES, KEPT, PART_BYTES, cut, keepConversation, keepThenSummarize, messageText, messagesFromApi, namedThroughParts } from '../src/keep.ts';
import { goalOf } from '../src/select.ts';
import { bytesOf, isStored, readPartTicket, readTicket, recall } from '../src/store.ts';
import type { Http, Message } from '../src/types.ts';
import { MAX_OFFERED } from '../src/find.ts';
import { OPTIONS_PER_REQUEST } from '../src/ask.ts';
import { moveOut, partTicketText } from '../src/store.ts';
import { MemoryFiles, conversation, ok, output, questionsOf, recordingHttp } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';
const TYPESAFE = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as const;
const refuse: Http = async () => {
  throw new Error('nothing may be sent in this test');
};

/** The part tickets of the message put after a summary. */
const partLines = (text: string) => text.split('\n').filter((line) => readPartTicket(line) !== null);

async function partsOf(files: MemoryFiles, text: string): Promise<string[]> {
  const out: string[] = [];
  for (const line of partLines(text)) {
    const got = await recall(files, [DIR], readPartTicket(line)?.id);
    assert.ok('text' in got, line);
    out.push(got.text);
  }
  return out;
}

async function kept(files: MemoryFiles, messages: readonly Message[]): Promise<string> {
  const done = await keepConversation(files, DIR, messages);
  assert.ok('text' in done, JSON.stringify(done));
  return done.text;
}

const WRITTEN = 'export function parse(input: string) {\n  return input.split("\\n");\n}\n\n// 日本語のコメントも そのまま';

function coding(): Message[] {
  return [
    { role: 'user', text: 'Fix the parser.\nKeep it dependency-free.', toolUses: [] },
    {
      role: 'assistant',
      text: 'Writing the parser.',
      toolUses: [{ tool_use_id: 'toolu_w', tool: 'Write', input: { file_path: '/p/parse.ts', content: WRITTEN } }],
    },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'toolu_w', text: 'File created', isError: false }] },
    { role: 'assistant', text: 'Reading the log.', toolUses: [{ tool_use_id: 'toolu_r', tool: 'Bash', input: { command: 'cat build.log' } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'toolu_r', text: output('build', 60), isError: true }] },
  ];
}

test('a kept conversation holds every text, input value and result as it was, the parts read in order being the messages in order', async () => {
  const files = new MemoryFiles();
  const messages = coding();
  const text = await kept(files, messages);
  const parts = await partsOf(files, text);
  const joined = parts.join('');
  for (const piece of ['Fix the parser.\nKeep it dependency-free.', 'Writing the parser.', WRITTEN, '/p/parse.ts', 'cat build.log', 'File created']) {
    assert.ok(joined.includes(piece), piece);
  }
  // The long result left as a ticket, whose text is stored as it was.
  const ticket = joined.split('\n').map(readTicket).find((t) => t !== null);
  assert.ok(ticket, 'a result ticket in the part');
  assert.equal(ticket.tool, 'Bash');
  const back = await recall(files, [DIR], ticket.id);
  assert.deepEqual(back, { text: output('build', 60) });
  assert.ok(joined.includes('[result toolu_r error]'), 'a failed result says so');
});

test('the parts read in order are exactly the messages written one after another, each ending in a line break', async () => {
  const files = new MemoryFiles();
  // Nothing long enough to leave as a ticket, so the written form can be rebuilt here.
  const messages: Message[] = [
    { role: 'user', text: 'a\nb', toolUses: [] },
    { role: 'assistant', text: 'c', toolUses: [{ tool_use_id: 't1', tool: 'Grep', input: { pattern: 'x', n: 3 } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: 'one\ntwo', isError: false }] },
  ];
  const parts = await partsOf(files, await kept(files, messages));
  assert.equal(parts.join(''), messages.map((message) => `${messageText(message)}\n`).join(''));
});

test('no part is over PART_BYTES bytes: a long input leaves on its own, and a long text is cut at lines, then inside a line', async () => {
  const files = new MemoryFiles();
  const bigInput = 'const x = 1;\n'.repeat(4000); // 52,000 bytes
  const japanese = 'あいうえお'.repeat(4000); // 60,000 bytes on one line
  const messages: Message[] = [
    { role: 'user', text: `${'long line of prose\n'.repeat(3000)}${japanese}`, toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'tw', tool: 'Write', input: { file_path: '/p/x.ts', content: bigInput } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'tw', text: 'ok', isError: false }] },
  ];
  const text = await kept(files, messages);
  const parts = await partsOf(files, text);
  assert.ok(parts.length >= 3, `${parts.length} parts`);
  for (const part of parts) assert.ok(bytesOf(part) <= PART_BYTES, `${bytesOf(part)} bytes`);
  const joined = parts.join('');
  assert.ok(joined.includes(japanese), 'the Japanese line is whole once the parts are joined');
  const input = joined.split('\n').map(readTicket).find((t) => t?.tool === 'Write.content');
  assert.ok(input, 'the long input left as a ticket named for its call and field');
  assert.deepEqual(await recall(files, [DIR], input.id), { text: bigInput });
  // The ticket line says which messages each part holds, and they cover all three.
  const tickets = partLines(text).map((line) => readPartTicket(line));
  assert.equal(tickets[0]?.first, 1);
  assert.equal(tickets.at(-1)?.last, 3);
});

test('cut keeps every character whole and loses nothing', () => {
  const text = `ab\n${'漢'.repeat(50)}\nend`;
  const pieces = cut(text, 20);
  assert.equal(pieces.join(''), text);
  for (const piece of pieces) assert.ok(bytesOf(piece) <= 20, piece);
});

test("a conversation read with its blocks keeps text, calls and results, says which images and documents are not kept, leaves thinking out and writes other kinds as JSON", async () => {
  const api = [
    { role: 'user', content: [{ type: 'text', text: 'Look at this.' }, { type: 'image', source: { type: 'base64', data: 'AAAA' } }] },
    {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'private reasoning' },
        { type: 'text', text: 'Reading it.' },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/p/a.md' } },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: 'heading' }, { type: 'document', source: {} }] },
        { type: 'web_search_result', url: 'https://example.com/x' },
      ],
    },
    { role: 'assistant', content: 'A plain string.' },
  ];
  const messages = messagesFromApi(api);
  assert.ok(messages);
  const files = new MemoryFiles();
  const joined = (await partsOf(files, await kept(files, messages))).join('');
  for (const piece of ['Look at this.', '[image not kept]', 'Reading it.', '[call Read tu1]', '/p/a.md', 'heading', '[document not kept]', 'https://example.com/x', 'A plain string.']) {
    assert.ok(joined.includes(piece), piece);
  }
  assert.ok(!joined.includes('private reasoning'), 'thinking is not kept');
  assert.equal(messagesFromApi('not a list'), null);
  assert.equal(messagesFromApi([{ role: 'system', content: '' }]), null);
});

test('a part that cannot be written keeps nothing', async () => {
  const files = new MemoryFiles();
  files.corrupt = (text) => `${text}!`;
  const done = await keepConversation(files, DIR, coding());
  assert.ok('failed' in done);
});

const skipped = (why: string) => ({ skip: why }) as never;
const summary = { role: 'user' as const, text: 'This session is being continued from a previous conversation.', toolUses: [], handle: 's' };
const after = { role: 'assistant' as const, text: 'done', toolUses: [], handle: 'a' };

test('the conversation is kept before the summary runs, the summary runs once, and the tickets stand right after it', async () => {
  const files = new MemoryFiles();
  const said: string[] = [];
  let runs = 0;
  let writtenWhenRun = -1;
  const r = await keepThenSummarize(files, { dir: DIR, messages: coding() }, (text) => said.push(text), async () => {
    runs += 1;
    writtenWhenRun = files.writes.length;
    return { messages: [summary, after] };
  }, skipped);
  assert.equal(runs, 1);
  assert.ok(writtenWhenRun > 0, 'written before the summary ran');
  assert.equal(r.messages.length, 3);
  assert.equal(r.messages[0], summary);
  assert.equal(r.messages[2], after);
  const added = r.messages[1] as Message;
  assert.equal(added.role, 'user');
  assert.equal(added.handle, undefined);
  assert.ok(added.text.startsWith(KEPT));
  for (const line of partLines(added.text)) assert.ok(await isStored(files, [DIR], line), line);
  assert.match(said.join('\n'), /kept the conversation in 1 part before the built-in summary/);
});

test('when nothing can be kept, the summary runs once and is handed back as it was, and the compaction says why', async () => {
  for (const [name, keep, files] of [
    ['no place', { unkept: 'there is no place to keep it in' }, new MemoryFiles()],
    ['a failed write', { dir: DIR, messages: coding() }, Object.assign(new MemoryFiles(), { corrupt: (text: string) => `${text}!` })],
  ] as const) {
    const said: string[] = [];
    let runs = 0;
    const back = { messages: [summary, after] };
    const r = await keepThenSummarize(files, keep, (text) => said.push(text), async () => {
      runs += 1;
      return back;
    }, skipped);
    assert.equal(runs, 1, name);
    assert.equal(r, back, name);
    assert.match(said.join('\n'), /nothing of the conversation is kept before the built-in summary/, name);
  }
});

test('a skip, or a compaction with no messages, is handed back as it is, and a skip is not reported as kept', async () => {
  const skip: { skip: string; messages?: undefined } = { skip: 'blocked by a PreCompact hook' };
  const said: string[] = [];
  assert.equal(await keepThenSummarize(new MemoryFiles(), { dir: DIR, messages: coding() }, (text) => said.push(text), async () => skip, skipped), skip);
  assert.match(said.join('\n'), /no summary ran, so nothing was added/);
  assert.doesNotMatch(said.join('\n'), /^kept the conversation/m);
  const empty = await keepThenSummarize(new MemoryFiles(), { dir: DIR, messages: coding() }, () => {}, async () => ({ messages: [] }), skipped);
  assert.deepEqual(empty.messages, []);
});

test('find brings back a result that was inside a summarized conversation, and one from a conversation summarized twice', async () => {
  const files = new MemoryFiles();
  const first = conversation([{ tool: 'Bash', input: { command: 'git show 1a2b3c' }, text: `${output('first', 40)}\nthe refusal was ENOSYS on epoll_pwait2` }]);
  const text1 = await kept(files, first);
  const second: Message[] = [summary as Message, { role: 'user', text: text1, toolUses: [] }, ...conversation([{ tool: 'Bash', input: { command: 'ls' }, text: output('second', 40) }])];
  const text2 = await kept(files, second);
  const now: Message[] = [summary as Message, { role: 'user', text: text2, toolUses: [] }];

  const answer = await find({ files, dirs: [DIR], messages: now, provider: TYPESAFE, http: refuse, question: 'which result says "ENOSYS on epoll_pwait2"?' });
  assert.match(answer, /^\[found\] Bash result/);
  assert.ok(answer.includes('the refusal was ENOSYS on epoll_pwait2'));
});

test('a kept part of the conversation is not looked through for a value: what was asked stands in it beside what came back (#55)', async () => {
  const files = new MemoryFiles();
  // The person named the serial, and the agent asked find for it: both are in the part, and no result holds it.
  const talk: Message[] = [
    { role: 'user', text: 'Find where the serial 4821 came from.', toolUses: [] },
    ...conversation([{ tool: 'Bash', input: { command: 'ls' }, text: output('listing', 40) }]),
  ];
  const now: Message[] = [summary as Message, { role: 'user', text: await kept(files, talk), toolUses: [] }];
  const { http, sent } = recordingHttp((request) => {
    const keys = Object.keys((questionsOf(request)['q'] as { criteria?: Record<string, string> }).criteria ?? {});
    return ok({ answers: { q: { type: 'choice', choice: 'none', probabilities: Object.fromEntries(keys.map((key) => [key, key === 'none' ? 0.9 : 0.1 / (keys.length - 1)])) } } });
  });

  const answer = await find({ files, dirs: [DIR], messages: now, provider: TYPESAFE, http, question: 'Which result had the serial 4821?' });
  assert.ok(sent.length >= 1);
  assert.ok(!JSON.stringify(sent).includes('One of its lines holds'), 'no option is said to hold it');
  assert.match(answer, /^\[not found\] None of the moved-out results has a line holding "4821" as a word of its own/);
});

test('a long input kept in a part is offered to Jev by the call it is of, not by the result written above it (#72)', async () => {
  const files = new MemoryFiles();
  // The Write alone is over PART_BYTES, so its content leaves the part as a ticket of its own, after the Read's result.
  const talk: Message[] = [
    ...conversation([{ tool: 'Read', input: { file_path: 'src/a.ts' }, text: output('a', 40) }]),
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'toolu_w', tool: 'Write', input: { file_path: 'src/b.ts', content: 'b'.repeat(PART_BYTES + 1) } }] },
  ];
  const now: Message[] = [summary as Message, { role: 'user', text: await kept(files, talk), toolUses: [] }];
  const offered: string[] = [];
  const { http } = recordingHttp((request) => {
    const criteria = (questionsOf(request)['q'] as { criteria?: Record<string, string> }).criteria ?? {};
    offered.push(...Object.values(criteria));
    const keys = Object.keys(criteria);
    return ok({ answers: { q: { type: 'choice', choice: 'none', probabilities: Object.fromEntries(keys.map((key) => [key, key === 'none' ? 0.9 : 0.1 / (keys.length - 1)])) } } });
  });

  await find({ files, dirs: [DIR], messages: now, provider: TYPESAFE, http, question: 'What did src/a.ts say?' });
  const written = offered.filter((option) => option.includes('It reads: bbbb'));
  const read = offered.filter((option) => option.includes('It reads: a line 1'));
  assert.equal(written.length, 1, offered.join('\n'));
  assert.match(written[0] ?? '', /^Write called with \{"file_path":"src\/b\.ts"/);
  assert.equal(read.length, 1, offered.join('\n'));
  assert.match(read[0] ?? '', /^Read called with \{"file_path":"src\/a\.ts"\}/);
});

test('find reads at most MAX_PARTS parts', async () => {
  const files = new MemoryFiles();
  const lines: string[] = [];
  for (let index = 0; index < 64; index += 1) {
    lines.push(...partLines(await kept(files, [{ role: 'user', text: `filler ${index}`, toolUses: [] }])));
  }
  const last = await kept(files, conversation([{ tool: 'Bash', input: { command: 'x' }, text: `${output('far', 40)}\nthe needle phrase is here` }]));
  const ask = (parts: readonly string[]) =>
    find({ files, dirs: [DIR], messages: [{ role: 'user', text: parts.join('\n'), toolUses: [] }], provider: TYPESAFE, http: refuse, question: 'where is "the needle phrase is here"?' });
  assert.match(await ask([...lines.slice(0, 63), ...partLines(last)]), /^\[found\]/, 'the 64th part is read');
  assert.doesNotMatch(await ask([...lines, ...partLines(last)]), /^\[found\]/, 'the 65th is not');
});

test('a part ticket counts as stored only when an entry of its size is under its id', async () => {
  const files = new MemoryFiles();
  const [line] = partLines(await kept(files, [{ role: 'user', text: 'hello', toolUses: [] }]));
  assert.ok(line);
  assert.ok(await isStored(files, [DIR], line));
  assert.equal(await isStored(files, [DIR], line.replace(/, (\d+) bytes;/, (_, n) => `, ${Number(n) + 1} bytes;`)), false);
  assert.equal(await isStored(files, [DIR], line.replace(/id [0-9a-f]{64}$/, `id ${'0'.repeat(64)}`)), false);
});

test('the message put after a summary is not taken for what the person is working on', () => {
  const messages: Message[] = [
    { role: 'user', text: 'Make the parser dependency-free.', toolUses: [] },
    { role: 'user', text: `${KEPT}, in 1 part; recall a part by its id.`, toolUses: [] },
  ];
  assert.equal(goalOf(messages, undefined), 'Make the parser dependency-free.');
});

test('results and inputs shorter than INLINE_BYTES stay in the part as they were', async () => {
  const files = new MemoryFiles();
  const short = 'x'.repeat(INLINE_BYTES - 1);
  const joined = (await partsOf(files, await kept(files, conversation([{ tool: 'Bash', input: { command: 'echo' }, text: short }])))).join('');
  assert.ok(joined.includes(short));
});

test('find offers at most MAX_OFFERED tickets from kept parts, so a long session still gets an answer', async () => {
  const files = new MemoryFiles();
  const lines: string[] = [];
  for (let index = 0; index < 1300; index += 1) {
    const moved = await moveOut(files, DIR, 'Bash', `${output(`r${index}`, 3)}\n${'y'.repeat(500)}`);
    assert.ok(!('reason' in moved));
    lines.push(`--- user`, `[result t${index}]`, moved.text);
  }
  const part = await moveOut(files, DIR, 'conversation', `${lines.join('\n')}\n`);
  assert.ok(!('reason' in part));
  const line = partTicketText({ part: 1, parts: 1, first: 1, last: 1300, bytes: part.bytes, id: part.id });
  let offered = 0;
  const { http, sent } = recordingHttp((request) => {
    const criteria = ((request.body as { questions?: { q?: { criteria?: Record<string, string> } } }).questions?.q?.criteria) ?? {};
    const keys = Object.keys(criteria);
    offered += keys.filter((key) => key !== 'none').length;
    return ok({ answers: { q: { type: 'choice', choice: keys[0], probabilities: Object.fromEntries(keys.map((key, i) => [key, i === 0 ? 0.9 : 0.1 / keys.length])) } } });
  });
  const answer = await find({ files, dirs: [DIR], messages: [{ role: 'user', text: line, toolUses: [] }], provider: TYPESAFE, http, question: 'which one?' });
  assert.doesNotMatch(answer, /could not be asked/);
  assert.ok(sent.length <= 24, `${sent.length} requests`);
  // The first round offers every option once: the part and at most MAX_OFFERED in all.
  const firstRound = Math.ceil(MAX_OFFERED / OPTIONS_PER_REQUEST);
  assert.ok(sent.length > firstRound - 1, `${sent.length} requests`);
  // The first round offers each option once; every later request offers the three likeliest of earlier ones.
  const later = sent.length - firstRound;
  assert.ok(offered - later * 3 * OPTIONS_PER_REQUEST <= MAX_OFFERED + 1, `${offered} options offered over ${sent.length} requests`);
});

test('a part of an earlier summary is followed even when the results already fill MAX_OFFERED', async () => {
  const files = new MemoryFiles();
  const deep = await kept(files, conversation([{ tool: 'Bash', input: { command: 'x' }, text: `${output('deep', 40)}\nthe needle sits in the earliest summary` }]));
  const lines: string[] = [];
  for (let index = 0; index < MAX_OFFERED + 50; index += 1) {
    const moved = await moveOut(files, DIR, 'Bash', `${output(`f${index}`, 3)}\n${'z'.repeat(500)}`);
    assert.ok(!('reason' in moved));
    lines.push('--- user', `[result t${index}]`, moved.text);
  }
  // The earlier summary's tickets come last in this part, after every result.
  lines.push('--- user', deep);
  const part = await moveOut(files, DIR, 'conversation', `${lines.join('\n')}\n`);
  assert.ok(!('reason' in part));
  const line = partTicketText({ part: 1, parts: 1, first: 1, last: 2, bytes: part.bytes, id: part.id });
  const options: string[] = [];
  const { http } = recordingHttp((request) => {
    const criteria = (request.body as { questions?: { q?: { criteria?: Record<string, string> } } }).questions?.q?.criteria ?? {};
    options.push(...Object.values(criteria));
    const keys = Object.keys(criteria);
    return ok({ answers: { q: { type: 'choice', choice: keys[0], probabilities: Object.fromEntries(keys.map((key, i) => [key, i === 0 ? 0.9 : 0.1 / keys.length])) } } });
  });
  await find({ files, dirs: [DIR], messages: [{ role: 'user', text: line, toolUses: [] }], provider: TYPESAFE, http, question: 'which one?' });
  // The earlier summary's part (messages 1-4 of the first conversation) is still offered.
  assert.ok(options.some((text) => text.startsWith('part 1 of 1 of the kept conversation, messages 1-4')), 'the earlier part is followed');
});

test('keeping a conversation as large as Claude Code hands a plugin takes well under the hook\'s ten seconds', async () => {
  const files = new MemoryFiles();
  const messages: Message[] = [];
  for (let index = 0; index < 2048; index += 1) {
    messages.push({ role: 'assistant', text: 'Next step.', toolUses: [{ tool_use_id: `t${index}`, tool: 'Read', input: { file_path: `/p/f${index}.ts` } }] });
    messages.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `t${index}`, text: output(`f${index}`, 40), isError: false }] });
  }
  messages.push({ role: 'user', text: 'あ'.repeat(200_000), toolUses: [] });
  const started = performance.now();
  const done = await keepConversation(files, DIR, messages);
  const ms = performance.now() - started;
  assert.ok('text' in done);
  assert.ok(ms < 5000, `${Math.round(ms)} ms`);
});

test('a collection keeps what a kept part names: its results, and the parts of an earlier summary and theirs', async () => {
  const files = new MemoryFiles();
  const first = conversation([{ tool: 'Bash', input: { command: 'git show 1a2b' }, text: output('first', 40) }]);
  const text1 = await kept(files, first);
  const second: Message[] = [summary as Message, { role: 'user', text: text1, toolUses: [] }, ...conversation([{ tool: 'Bash', input: { command: 'ls' }, text: output('second', 40) }])];
  const text2 = await kept(files, second);
  const [outer] = partLines(text2).map((line) => readPartTicket(line)?.id);
  assert.ok(outer);
  // What a transcript would name after the second summary: the outer part alone.
  const named = await namedThroughParts(files, [DIR], new Set([outer]));
  assert.ok(!('stop' in named));
  const stored = [...files.files.keys()].filter((path) => path.includes('/blobs/')).map((path) => path.slice(-68, -4));
  for (const id of stored) assert.ok(named.has(id), `${id} is kept`);
});

test('a collection stops when a kept part it is to follow cannot be read', async () => {
  const files = new MemoryFiles();
  const text = await kept(files, conversation([{ tool: 'Bash', input: { command: 'x' }, text: output('a', 40) }]));
  const id = readPartTicket(partLines(text)[0] ?? '')?.id as string;
  files.files.delete(`${DIR}/blobs/${id}.txt`);
  const named = await namedThroughParts(files, [DIR], new Set([id]));
  assert.ok('stop' in named);
  // An id that is not a part is not opened.
  const plain = await namedThroughParts(files, [DIR], new Set(['f'.repeat(64)]));
  assert.deepEqual(plain, new Set(['f'.repeat(64)]));
});

// #70: a half of a character with no other half, which UTF-8 cannot hold, made the part read back other than written.
const utf8Disk = () => {
  const files = new MemoryFiles();
  files.corrupt = (text) => new TextDecoder().decode(new TextEncoder().encode(text));
  return files;
};
const LONE = String.fromCharCode(0xd83c);
const REPLACEMENT = String.fromCharCode(0xfffd);
const withSurrogate = /\p{Surrogate}/u;

test('a call whose one-line input would be cut inside an emoji keeps the conversation, the line whole (#70)', async () => {
  const files = utf8Disk();
  const command = `${'x'.repeat(281)}${'🎉'.repeat(20)}`;
  const messages: Message[] = [
    { role: 'user', text: 'run it', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't1', tool: 'Bash', input: { command } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: 'ok', isError: false }] },
  ];

  const kept = await keepConversation(files, DIR, messages);
  assert.ok('text' in kept, JSON.stringify(kept));
  const joined = (await partsOf(files, kept.text)).join('');
  assert.ok(joined.includes(`command:\n${command}\n`), 'the value as it was');
  const call = joined.split('\n').find((line) => line.startsWith('[call Bash t1] '));
  assert.ok(call !== undefined && !withSurrogate.test(call) && !call.includes(REPLACEMENT), String(call));
});

test('a result holding half of a character is kept with U+FFFD in its place, everything else as it was (#70)', async () => {
  const result = `${'a'.repeat(500)}${LONE}b`;
  const messages: Message[] = [
    { role: 'user', text: 'read it', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't1', tool: 'Read', input: { file_path: '/p/a.txt' } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: result, isError: false }] },
  ];
  const expected = messages.map((message) => `${messageText(message)}\n`).join('').replace(LONE, REPLACEMENT);

  const files = utf8Disk();
  // The control: the result alone cannot be moved out, so it stays in the part's text.
  assert.deepEqual(await moveOut(files, DIR, 'Read', result), { reason: 'differs' });
  const kept = await keepConversation(files, DIR, messages);
  assert.ok('text' in kept, JSON.stringify(kept));
  assert.equal((await partsOf(files, kept.text)).join(''), expected);
});

test("keeping a conversation of 4096 messages and six million characters takes well under the second Claude Code gives a hook's handler of a failure (#102)", async () => {
  // Measured at 59 ms on the machine this was written on: the handler waits on the host's writes for free, and this is
  // the rest, writes to memory included. Half the second, so that a slow machine does not fail it.
  const calls = Array.from({ length: 2047 }, (_, at) => ({ tool: 'Bash', input: { command: `show ${at}` }, text: output(`r${at}`, 120) }));
  const messages = conversation(calls);
  assert.equal(messages.length, 4096);
  const started = performance.now();
  const kept = await keepConversation(new MemoryFiles(), DIR, messages);
  const ms = performance.now() - started;
  assert.ok('text' in kept);
  assert.ok(ms < 500, `${Math.round(ms)} ms`);
});
