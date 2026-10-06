import assert from 'node:assert/strict';
import { test } from 'node:test';

import { digest } from '../src/ask.ts';
import { HEAD_CHARS, MIN_DIGITS, NAMED_ON_REFUSAL, VALUED_LISTED, VALUE_DIGITS, WHOLE_UP_TO, find, lineHolds, mayStandFor, phrasesOf, shown, ticketsIn, valuesOf, type FindInput } from '../src/find.ts';
import { FIND_TOOL, RECALL_TOOL, moveInputOut, moveOut, partTicketText, ticketText } from '../src/store.ts';
import type { Http, Message } from '../src/types.ts';
import { MemoryFiles, TOLD, conversation, ok, output, questionsOf, recordingHttp, trusting, type Call, type Sent } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';
const TYPESAFE = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as const;

const refuse: Http = async () => {
  throw new Error('nothing may be sent in this test');
};

const call = (label: string, lines = 30, tool = 'Bash'): Call => ({
  tool,
  input: tool === 'Bash' ? { command: `show ${label}` } : { file_path: `${label}.md` },
  text: output(label, lines),
});

/**
 * A conversation in which every call's result has been moved out: the store
 * holds the text, and both sides of the call hold the ticket.
 */
async function compacted(files: MemoryFiles, calls: readonly Call[], leave: readonly number[] = []): Promise<Message[]> {
  const messages = conversation(calls);
  for (const [index, entry] of calls.entries()) {
    if (leave.includes(index + 1)) continue;
    const stored = await moveOut(files, DIR, entry.tool, entry.text);
    assert.ok(!('reason' in stored));
    for (const message of messages) {
      for (const use of message.toolUses) if (use.tool_use_id === `toolu_${index + 1}`) use.text = stored.text;
      for (const result of message.toolResults ?? []) if (result.tool_use_id === `toolu_${index + 1}`) result.text = stored.text;
    }
  }
  return messages;
}

function keysOf(sent: Sent): string[] {
  const question = questionsOf(sent)['q'] as { criteria?: Record<string, string> } | undefined;
  return Object.keys(question?.criteria ?? {});
}

function optionsOf(sent: Sent): string[] {
  const question = questionsOf(sent)['q'] as { criteria?: Record<string, string> } | undefined;
  return Object.values(question?.criteria ?? {});
}

/** An answer giving `winner` probability `p` and the rest an even share. */
function answer(keys: readonly string[], winner: string | null, p = 0.95) {
  const rest = keys.length > 1 ? (winner === null ? 1 : 1 - p) / (winner === null ? keys.length : keys.length - 1) : 1;
  return ok({ answers: { q: { type: 'choice', choice: winner ?? keys[0], probabilities: Object.fromEntries(keys.map((key) => [key, key === winner ? p : rest])) } } });
}

const input = (files: MemoryFiles, messages: Message[], question: unknown, http: Http = refuse, extra: Partial<FindInput> = {}): FindInput => ({
  files,
  dirs: [DIR],
  messages,
  provider: TYPESAFE,
  http,
  question,
  ...extra,
});

test('found: the text of the result Jev picks comes back unchanged, under one line saying which and how likely', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't2'));

  const text = await find(input(files, messages, 'Which result shows b?', http));

  assert.equal(sent.length, 1);
  const [head, ...body] = text.split('\n\n');
  assert.match(head ?? '', /^\[found\] Bash result, \d+ bytes; id [0-9a-f]{64}; probability 0\.95$/);
  assert.equal(body.join('\n\n'), output('b', 30));
  // What Jev was shown: "none of these", then the call and a digest of each result, never the whole text.
  const shownOptions = optionsOf(sent[0] as Sent);
  assert.equal(shownOptions.length, 4);
  assert.deepEqual(keysOf(sent[0] as Sent), ['none', 't1', 't2', 't3']);
  assert.ok(shownOptions[0]?.startsWith('None of these'));
  assert.ok(shownOptions[2]?.startsWith('Bash called with {"command":"show b"}; '));
  assert.ok(!shownOptions[2]?.includes('b line 20:'));
});

test('not found: when "none of these" wins, no text comes back and the answer says so', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http } = recordingHttp((request) => answer(keysOf(request), 'none', 0.9));

  const text = await find(input(files, messages, 'Which result shows z?', http));

  assert.ok(text.startsWith('[not found] None of the moved-out results seems to be about that'), text);
  assert.ok(!text.includes('line 1:'));
  // Jev sees the start of each result only: the answer says so and how to look further, so that an agent does not stop at it (#38).
  assert.ok(text.includes('first lines') && text.includes('can be missed') && text.includes(`read the results with ${RECALL_TOOL}`), text);
});

test('when "none of these" is among the likeliest but not decisive, the list says so', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http } = recordingHttp(() =>
    ok({ answers: { q: { type: 'choice', choice: 'none', probabilities: { none: 0.4, t1: 0.35, t2: 0.2, t3: 0.05 } } } }),
  );

  const text = await find(input(files, messages, 'Which?', http));

  const lines = text.split('\n');
  assert.equal(lines[0], '[not sure] The likeliest results, most likely first:');
  assert.ok(lines[1]?.includes('show a') && lines[1].includes('probability 0.35'));
  assert.equal(lines.at(-1), '- or none of them; probability 0.40');
});

test('not sure: two results splitting the probability get listed, with their ids, and no text comes back', async () => {
  const files = new MemoryFiles();
  const calls = Array.from({ length: 95 }, (_, i) => call(`step ${i + 1}`));
  const messages = await compacted(files, calls);
  const { http } = recordingHttp((request) => {
    const keys = keysOf(request);
    const probabilities = Object.fromEntries(keys.map((key) => [key, 0]));
    if (keys.includes('t7')) probabilities['t7'] = 0.5;
    if (keys.includes('t8')) probabilities['t8'] = 0.5;
    if (keys.includes('t9')) probabilities['t9'] = 0.001;
    return ok({ answers: { q: { type: 'choice', choice: 't7', probabilities } } });
  });

  const text = await find(input(files, messages, 'Which result shows step 7?', http));

  const lines = text.split('\n');
  assert.equal(lines[0], '[not sure] The likeliest results, most likely first:');
  assert.equal(lines.length, 4);
  assert.ok(lines[1]?.includes('show step 7') && lines[1].includes('probability 0.50'));
  assert.ok(lines[2]?.includes('show step 8') && lines[2].includes('probability 0.50'));
  assert.equal(lines.filter((line) => line.includes(`recall with ${RECALL_TOOL} id `)).length, 3);
  assert.ok(!text.includes('step 7 line 1:'));
});

test('a likeliest result that is not far enough ahead is listed too', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http } = recordingHttp(() =>
    ok({ answers: { q: { type: 'choice', choice: 't1', probabilities: { none: 0, t1: 0.55, t2: 0.3, t3: 0.15 } } } }),
  );

  const text = await find(input(files, messages, 'Which?', http));

  assert.ok(text.startsWith('[not sure]'), text);
  // Far enough ahead, but under half: listed as well.
  const under = await compacted(new MemoryFiles(), [call('a'), call('b'), call('c'), call('d'), call('e')]);
  const low = recordingHttp(() =>
    ok({ answers: { q: { type: 'choice', choice: 't1', probabilities: { none: 0, t1: 0.45, t2: 0.15, t3: 0.14, t4: 0.13, t5: 0.13 } } } }),
  );
  assert.ok((await find(input(files, under, 'Which?', low.http))).startsWith('[not sure]'));
});

test('a quoted phrase that one result holds returns that result without asking Jev', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);

  const text = await find(input(files, messages, 'Which result has "c line 17: value" in it?'));

  const [head, ...body] = text.split('\n\n');
  assert.match(head ?? '', /^\[found\] Bash result, \d+ bytes; id [0-9a-f]{64}; matched the quoted phrase "c line 17: value"$/);
  assert.equal(body.join('\n\n'), output('c', 30));
});

test('a quoted phrase that several results hold narrows the choice to them', async () => {
  const files = new MemoryFiles();
  const shared = { tool: 'Bash', input: { command: 'show d' }, text: `${output('d', 30)}\nc line 17: value 3` };
  const messages = await compacted(files, [call('a'), call('b'), call('c'), shared]);
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't2'));

  const text = await find(input(files, messages, 'Which result has "c line 17: value" and shows d?', http));

  assert.equal(sent.length, 1);
  assert.deepEqual(optionsOf(sent[0] as Sent).map((option) => option.split(';')[0]), [
    'None of these: the result the question is about is not among the moved-out results.',
    'Bash called with {"command":"show c"}',
    'Bash called with {"command":"show d"}',
  ]);
  assert.ok(text.startsWith('[found] Bash result'));
  assert.ok(text.endsWith('c line 17: value 3'));
});

test('two quoted phrases narrow to the results that hold both', async () => {
  const files = new MemoryFiles();
  const both = { tool: 'Bash', input: { command: 'show d' }, text: `${output('d', 30)}\nc line 17: value 3` };
  const messages = await compacted(files, [call('a'), call('b'), call('c'), both]);

  const text = await find(input(files, messages, 'Which has "c line 17: value" and "d line 3: value"?'));

  assert.ok(text.startsWith('[found] Bash result'));
  assert.ok(text.endsWith('c line 17: value 3'));
});

test('a quoted phrase too short to narrow by, or one nothing holds, leaves every result in the choice', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't1'));

  await find(input(files, messages, 'Which has "c line 17"?', http));
  await find(input(files, messages, 'Which has "nothing holds this line"?', http));
  // An identifier in backticks is not a phrase: c holds it, and the choice is still everyone's.
  await find(input(files, messages, 'Which has `c line 17: value 3`?', http));

  assert.deepEqual(sent.map((request) => keysOf(request).length), [4, 4, 4]);
  assert.deepEqual(phrasesOf('Which "c line 17" or `a phrase of twelve` or "x" or "a phrase of twelve"?'), ['a phrase of twelve']);
});

test("tickets that stand for this plugin's own tools' results, and repeated ids, are not offered", async () => {
  const files = new MemoryFiles();
  const calls = [call('a'), call('b'), call('c')];
  const messages = await compacted(files, calls);
  // A text of its own, so that only the tool's name keeps these out.
  const own = await moveOut(files, DIR, RECALL_TOOL, output('own', 30));
  assert.ok(!('reason' in own));
  const first = ticketsIn(messages)[0];
  assert.ok(first);
  const tickets = [
    ticketText({ tool: RECALL_TOOL, bytes: own.bytes, id: own.id }),
    ticketText({ tool: FIND_TOOL, bytes: own.bytes, id: own.id }),
    `[moved out] recall result, ${own.bytes} bytes; recall with ${RECALL_TOOL} id ${own.id}`,
    `[moved out] find result, ${own.bytes} bytes; recall with ${RECALL_TOOL} id ${own.id}`,
    // What 0.1.0 wrote for its own recall tool, and what 0.2.0 wrote, under the old name.
    `[jev-lossless-compaction] This mcp__jev-lossless-compaction__recall result (${own.bytes} bytes) was moved out of the conversation and is kept unchanged on disk. To read it, call the tool mcp__jev-lossless-compaction__recall with id ${own.id}.`,
    `[moved out] recall result, ${own.bytes} bytes; recall with mcp__jev-lossless-compaction__recall id ${own.id}`,
    // A result of another tool that happens to be the same text as a's: the id again.
    ticketText({ tool: 'Bash', bytes: first.bytes, id: first.id }),
  ];
  tickets.forEach((ticket, i) => {
    messages.push({ role: 'assistant', text: '', toolUses: [{ tool_use_id: `toolu_x${i}`, tool: 'Bash', input: {}, text: ticket }] });
    messages.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `toolu_x${i}`, text: ticket, isError: false }] });
  });
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't1'));

  assert.equal(ticketsIn(messages).length, 3);
  await find(input(files, messages, 'Which?', http));
  assert.deepEqual(keysOf(sent[0] as Sent), ['none', 't1', 't2', 't3']);
});

test('tickets written under the old name, in either wording, are offered and read back from where they were written', async () => {
  const OLD = '/home/u/.claude/jev-lossless-compaction';
  const NEW = '/home/u/.claude/lossless-compaction';
  const files = new MemoryFiles();
  const messages = conversation([call('a'), call('b'), call('c')]);
  const wordings = [
    (t: { tool: string; bytes: number; id: string }) => `[moved out] ${t.tool} result, ${t.bytes} bytes; recall with mcp__jev-lossless-compaction__recall id ${t.id}`,
    (t: { tool: string; bytes: number; id: string }) =>
      `[jev-lossless-compaction] This ${t.tool} result (${t.bytes} bytes) was moved out of the conversation and is kept unchanged on disk. To read it, call the tool mcp__jev-lossless-compaction__recall with id ${t.id}.`,
  ];
  for (const [index, label] of ['a', 'b'].entries()) {
    const stored = await moveOut(files, OLD, 'Bash', output(label, 30));
    assert.ok(!('reason' in stored));
    const line = (wordings[index] as (typeof wordings)[number])(stored);
    for (const message of messages) {
      for (const use of message.toolUses) if (use.tool_use_id === `toolu_${index + 1}`) use.text = line;
      for (const result of message.toolResults ?? []) if (result.tool_use_id === `toolu_${index + 1}`) result.text = line;
    }
  }
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't2'));

  const text = await find(input(files, messages, 'Which result shows b?', http, { dirs: [NEW, OLD] }));

  assert.deepEqual(keysOf(sent[0] as Sent), ['none', 't1', 't2']);
  assert.ok(text.startsWith('[found] Bash result'), text);
  assert.ok(text.endsWith(output('b', 30)));
});

test('with more results than one request takes, one that wins a later request is found', async () => {
  const files = new MemoryFiles();
  const calls = Array.from({ length: 100 }, (_, i) => call(`step ${i + 1}`, 5));
  const messages = await compacted(files, calls);
  const { http, sent } = recordingHttp((request) => {
    const keys = keysOf(request);
    // The first request is flat; the one holding t90 points at it; the last round agrees.
    return answer(keys, keys.includes('t90') ? 't90' : null);
  });

  const text = await find(input(files, messages, 'Which result shows step 90?', http));

  // "none of these" rides in every request and is not carried as a finalist.
  const sizes = sent.map((request) => keysOf(request).length);
  assert.deepEqual(sizes.slice(0, 2), [81, 21]);
  assert.equal(sent.length, 3);
  assert.ok((sizes[2] ?? 0) <= 7, `${sizes[2]} in the last request`);
  const last = keysOf(sent[2] as Sent);
  assert.equal(last.filter((key) => key === 'none').length, 1);
  assert.ok(last.includes('t90'));
  assert.ok(text.startsWith('[found] Bash result'));
  assert.ok(text.endsWith(output('step 90', 5)));
});

test('when Jev cannot be asked, the answer says so by status alone', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b')]);
  const echo = `unauthorized: Bearer ${TYPESAFE.key}`;
  const { http } = recordingHttp(() => ({ status: 401, ok: false, text: echo }));

  const text = await find(input(files, messages, 'Which?', http));

  assert.equal(text, '[lossless-compaction] Jev could not be asked: HTTP 401.');
  const thrown = await find(
    input(files, messages, 'Which?', async () => {
      throw new Error(`down, key ${TYPESAFE.key}`);
    }),
  );
  assert.ok(!thrown.includes(TYPESAFE.key));
  assert.ok(thrown.includes('could not be reached'));
});

test('nothing moved out, a subagent, no key, no question: each is answered without asking anything', async () => {
  const files = new MemoryFiles();
  const kept = conversation([call('a')]);
  const messages = await compacted(files, [call('a')]);

  assert.ok((await find(input(files, kept, 'Which?'))).includes('No ticket of a moved-out result is in this conversation'));
  // A subagent's call is told where what a summary replaced went: kept in parts, read back by id (ADR 0026).
  const toSubagent = await find(input(files, messages, 'Which?', refuse, { agentId: 'agent-1' }));
  assert.ok(toSubagent.includes("find does not look in a subagent's conversation") && toSubagent.includes('recall reads one by its id'), toSubagent);
  assert.ok((await find(input(files, messages, 'Which?', refuse, { provider: null }))).includes('find needs a Jev key'));
  assert.ok((await find(input(files, messages, undefined))).includes('Ask in words'));
  assert.ok((await find(input(files, messages, '   '))).includes('Ask in words'));
  // A subagent's call reads nothing: the store is not even looked at.
  const looked = files.looked.length;
  await find(input(files, messages, 'Which?', refuse, { agentId: 'agent-1' }));
  assert.equal(files.looked.length, looked);
});

test('a large stored text is digested from its head only, cut at a line, and a key that begins there is blanked to the end', async () => {
  const files = new MemoryFiles();
  const pem = ['-----BEGIN', ' PRIVATE KEY-----'].join('');
  const base64 = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='.repeat(2);
  // The key begins about 4 KB in, inside the head, and runs far past the 8 KB the head is cut at.
  const head = [...Array.from({ length: 100 }, (_, i) => `line ${i + 1} ${'y'.repeat(30)}`), pem, base64].join('\n');
  const tail = `${`${base64}\n`.repeat(9000)}-----END PRIVATE KEY-----\n`;
  const large = { tool: 'Bash', input: { command: 'show large' }, text: head + '\n' + tail };
  assert.ok(large.text.length > 256 * 1024);
  const messages = await compacted(files, [large, call('b')]);
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't2'));

  await find(input(files, messages, 'Which?', http));

  const option = optionsOf(sent[0] as Sent)[0] ?? '';
  assert.ok(!option.includes(base64.slice(0, 12)), option);
  assert.ok(!option.includes('BEGIN'), option);
  // What the head holds once blanked: the key from its BEGIN to the end of the head, and nothing of it after.
  const head8k = shown(large.text);
  assert.ok(head8k.length <= 8 * 1024);
  assert.ok(head8k.includes(pem));
  assert.ok(digest(head8k, 20_000).includes('[redacted]'));
  assert.ok(!digest(head8k, 20_000).includes(base64.slice(0, 12)));
  assert.equal(shown(output('small', 10)), output('small', 10));
});

test('a result whose stored text no longer matches its id is not offered, and the others still are', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const damaged = ticketsIn(messages)[1];
  assert.ok(damaged);
  files.files.set(`${DIR}/blobs/${damaged.id}.txt`, 'changed on disk');
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't1'));

  const text = await find(input(files, messages, 'Which?', http));

  assert.deepEqual(keysOf(sent[0] as Sent), ['none', 't1', 't2']);
  assert.ok(text.startsWith('[found] Bash result'));
});

test('not found with a quoted phrase: it was looked for in the whole of each result, so the answer says so and not that a value can be missed', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http } = recordingHttp((request) => answer(keysOf(request), 'none', 0.9));

  const text = await find(input(files, messages, 'Which result has "z line 99: nothing" in it?', http));

  assert.ok(text.startsWith('[not found] None of the moved-out results holds the quoted phrase as written, looked for in the whole of each'), text);
  assert.ok(!text.includes('can be missed'), text);
});

test('when several results hold the quoted phrase and Jev says none, they are listed rather than said to be none', async () => {
  const files = new MemoryFiles();
  const shared = { tool: 'Bash', input: { command: 'show d' }, text: `${output('d', 30)}\nc line 17: value 3` };
  const messages = await compacted(files, [call('a'), call('b'), call('c'), shared]);
  const { http } = recordingHttp((request) => answer(keysOf(request), 'none', 0.9));

  const text = await find(input(files, messages, 'Which result has "c line 17: value" and shows nothing else?', http));

  assert.ok(text.startsWith('[not sure] The likeliest results, most likely first:'), text);
  assert.equal(text.split('\n').filter((line) => line.includes(`recall with ${RECALL_TOOL} id `)).length, 2, text);
  assert.ok(text.includes('show c') && text.includes('show d'), text);
  assert.match(text, /- or none of them; probability 0\.90$/);
});

// --- values a question names (#55) ---

test('the values a question names: runs with two digits or more, used only when one has three', () => {
  assert.deepEqual(valuesOf('Which earlier result held a line reading "d8923051"?'), ['d8923051']);
  assert.deepEqual(valuesOf('Which earlier result listed a station that reported 618 units at step 17?'), ['618', '17']);
  assert.deepEqual(valuesOf('Which earlier result held the record numbered 9-0203?'), ['9-0203']);
  assert.deepEqual(valuesOf('Which earlier result gave the reference code RX-5323-T?'), ['RX-5323-T']);
  assert.deepEqual(valuesOf('What ran at 10:30:05.'), ['10:30:05']);
  // A value named twice is one value.
  assert.deepEqual(valuesOf('Was 4821 the serial, 4821?'), ['4821']);
  // One digit is no value: a count, an ordinal, the number in a file's name stand beside the value without being needed on its line.
  assert.deepEqual(valuesOf('Which of the 2 logs shows status 500?'), ['500']);
  assert.deepEqual(valuesOf('Where is order 2-0077 in log7.txt, the 3rd one?'), ['2-0077']);
  // No value of three digits: nothing is looked for.
  assert.deepEqual(valuesOf('Of the 2 log files looked at near the start, which was to be left as it is?'), []);
  assert.deepEqual(valuesOf('Which result is from version 1.2 of log7.txt, at step 17 of 42?'), []);
  assert.deepEqual(valuesOf('Which earlier result was what the shell script printed?'), []);
  assert.deepEqual([MIN_DIGITS, VALUE_DIGITS], [3, 2]);
  // A number written with commas between its digits is cut by them, and no run of it is the number: it gives no value.
  assert.deepEqual(valuesOf('Which result had the total $9,821.50?'), []);
  assert.deepEqual(valuesOf('Which result listed the 1,234,567 rows of build 4821?'), ['4821']);
  assert.deepEqual(valuesOf('Which result had the 12,345 lines of build 4821?'), ['4821']);
  // A comma of the sentence is no such comma.
  assert.deepEqual(valuesOf('At step 17, 618 units: which result?'), ['17', '618']);
  // A run ends at its last letter or digit, however much punctuation follows, and a long question is read in no time.
  assert.deepEqual(valuesOf(`serial 4821${'.'.repeat(50)} and build 77:`), ['4821', '77']);
  const began = performance.now();
  assert.deepEqual(valuesOf(`a${'.'.repeat(200_000)}b 4821`), ['4821']);
  assert.ok(performance.now() - began < 500);
});

test('a line holds the values when every one of them is on it, each a word of its own', () => {
  assert.ok(lineHolds('a\nstation 6922 reported 618 units at step 17\nb', ['618', '17']));
  // On two lines; with a letter or a digit right before or after it; none asked for.
  assert.ok(!lineHolds('reported 618 units\nat step 17', ['618', '17']));
  assert.ok(!lineHolds('station 16180 and step 17', ['618', '17']));
  assert.ok(!lineHolds('checksum d8923051f', ['d8923051']));
  assert.ok(!lineHolds('tag v1.2.3 at 2026-10-03T12:30:05Z', ['1.2.3']) && !lineHolds('tag v1.2.3 at 2026-10-03T12:30:05Z', ['12:30:05']));
  assert.ok(!lineHolds('python 13.12', ['3.12']));
  assert.ok(!lineHolds('anything 618', []));
  // Joined to another word by a hyphen, a point, a colon or an underscore it is still a word: a key and its value, a name and its number.
  for (const line of ['job-4821 done', 'build_4821 ok', 'ERR:4821', '17:4821 passed', 'record 1-4821', 'x 0.4821', '4821-rc1 tagged', '4821.log written']) assert.ok(lineHolds(line, ['4821']), line);
  assert.ok(lineHolds('status:500', ['500']) && lineHolds('sha256:9e3817e8abcd', ['9e3817e8abcd']) && lineHolds('python 3.12.1', ['3.12']));
  // Next to punctuation, at the end of a sentence, after a sign: a word. Another letter case is another value.
  assert.ok(lineHolds('code (RX-5323-T), filed.', ['RX-5323-T']));
  assert.ok(lineHolds('it was 0077.', ['0077']) && lineHolds('offset -5000', ['5000']) && lineHolds('{"limit":250}', ['250']));
  assert.ok(!lineHolds('code rx-5323-t', ['RX-5323-T']));
  // A character of a pattern in the value is taken as written.
  assert.ok(lineHolds('at 10.30 sharp', ['10.30']) && !lineHolds('at 10x30 sharp', ['10.30']));
});

const deep = (label: string, line: string): Call => ({ tool: 'Bash', input: { command: `show ${label}` }, text: `${output(label, 30)}\n${line}\n${output(`${label}x`, 30)}` });
const sayingNone = () => recordingHttp((request) => answer(keysOf(request), 'none', 0.9));
const toldOf = (sent: readonly Sent[]) => optionsOf(sent[0] as Sent).map((option) => TOLD.exec(option)?.[0] ?? '');

test('a value one result alone holds further down: Jev is told so of that result, and what it then chooses is returned', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), deep('b', 'serial 4821 passed at 10:30:05'), call('c')]);
  const jev = trusting();

  const text = await find(input(files, messages, 'Which result had the serial 4821?', jev.http));
  // Jev was asked, once; of none and the three results, only the one that holds the value was said to.
  assert.equal(jev.sent.length, 1);
  assert.deepEqual(toldOf(jev.sent), ['', '', 'One of its lines holds "4821".', '']);
  // The line itself is not sent: the value is in the question, and that is all that is said of the middle of the result.
  assert.ok(!JSON.stringify(jev.sent).includes('passed at'));
  const [head, ...body] = text.split('\n\n');
  assert.match(head ?? '', /^\[found\] Bash result, \d+ bytes; id [0-9a-f]{64}; probability 0\.95; the one result with a line holding "4821"$/);
  assert.ok(body.join('\n\n').includes('serial 4821 passed'));
  // Two values on that one line are both said.
  const both = trusting();
  await find(input(files, messages, 'Which result had 4821 at 10:30:05?', both.http));
  assert.deepEqual(toldOf(both.sent)[2], 'One of its lines holds "4821" and "10:30:05".');
});

test('the values are those of the question as it is sent: a secret blanked there, or a value past where it is cut, is told of no result', async () => {
  // Put together here so that no line of this file has the shape of a real credential.
  const secret = ['gh', 'p_', 'a1B2c3D4'.repeat(5)].join('');
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), deep('b', `the token was ${secret} then`), deep('c', 'serial 4821 passed at 10:30:05'), call('d')]);
  const tolds = (sent: readonly Sent[]) => toldOf(sent).filter((told) => told !== '');

  // Named in the question, the secret is blanked in what Jev is asked. No piece of it goes out beside a result, and nothing is said of the result that holds it.
  const jev = trusting();
  const text = await find(input(files, messages, `Which result held ${secret}?`, jev.http));
  assert.equal(jev.sent.length, 1);
  for (let at = 0; at + 8 <= secret.length; at += 1) assert.ok(!JSON.stringify(jev.sent).includes(secret.slice(at, at + 8)), `piece at ${at}`);
  assert.ok(JSON.stringify(jev.sent).includes('[redacted]'));
  assert.deepEqual(tolds(jev.sent), []);
  assert.ok(!text.includes(secret));

  // A value past the 2,000 characters a question is cut at is not in what Jev is asked, and is told of no result; before the cut it is.
  const filler = 'Which of the results was it? '.repeat(70);
  assert.ok(filler.length > 2000);
  const late = trusting();
  await find(input(files, messages, `${filler}The one with serial 4821.`, late.http));
  assert.ok(!JSON.stringify(late.sent).includes('4821'));
  assert.deepEqual(tolds(late.sent), []);
  const early = trusting();
  await find(input(files, messages, `The one with serial 4821. ${filler}`, early.http));
  assert.deepEqual(tolds(early.sent), ['One of its lines holds "4821".']);
});

test('a result is not given because a line of it holds the value: Jev choosing another is returned, and Jev saying none gets it named, not given', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), deep('b', 'checksum sha256 of build 4821'), call('c')]);
  // Asked about something else, Jev takes the third: that one comes back, the result holding the value does not.
  const other = recordingHttp((request) => answer(keysOf(request), 't3'));
  const chosen = await find(input(files, messages, 'Which result shows c, from build 4821?', other.http));
  assert.ok(chosen.startsWith('[found] Bash result') && chosen.includes('probability 0.95') && !chosen.includes('line holding') && !chosen.includes('checksum sha256'), chosen.slice(0, 200));
  // Jev takes none of them: the one that holds the value is named for the agent to read, and its text is not handed over as the answer.
  const said = await find(input(files, messages, 'Which result is about build 4821?', sayingNone().http));
  const lines = said.split('\n');
  assert.equal(lines[0], '[not sure] None of the moved-out results seems to be about that from its call and first lines, but one has a line holding "4821":');
  assert.equal(lines.length, 2);
  assert.match(lines[1] ?? '', new RegExp(`^- Bash called with \\{"command":"show b"\\}; \\d+ bytes; recall with ${RECALL_TOOL} id [0-9a-f]{64}$`));
  assert.ok(!said.includes('checksum sha256'));
});

test('a value several results hold: Jev is told of none of them, and when it takes none they are named, the likeliest first, eight at most', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [deep('a', 'serial 4821 passed'), call('b'), deep('c', 'serial 4821 failed')]);
  // Told the same of each, Jev was measured taking the first for the answer: nothing is said of either.
  const trusted = trusting();
  await find(input(files, messages, 'Which result had the serial 4821?', trusted.http));
  assert.deepEqual(toldOf(trusted.sent), ['', '', '', '']);
  // Not sure: the list of the likeliest three (none of them, a and b here) says which of them hold the value.
  const unsure = recordingHttp((request) => answer(keysOf(request), null));
  const listed = (await find(input(files, messages, 'Which result had the serial 4821?', unsure.http))).split('\n');
  assert.equal(listed[0], '[not sure] The likeliest results, most likely first:');
  assert.deepEqual(
    listed.slice(1).filter((line) => line.startsWith('- Bash')).map((line) => [/show (\w)/.exec(line)?.[1], line.includes('; one of its lines holds "4821"; recall with')]),
    [['a', true], ['b', false]],
  );
  // None: both named, in the order Jev ranked them.
  const none = recordingHttp((request) => {
    const keys = keysOf(request);
    return ok({ answers: { q: { type: 'choice', choice: 'none', probabilities: Object.fromEntries(keys.map((key) => [key, key === 'none' ? 0.9 : key === 't3' ? 0.06 : 0.02])) } } });
  });
  const named = (await find(input(files, messages, 'Which result had the serial 4821?', none.http))).split('\n');
  assert.equal(named[0], '[not sure] None of the moved-out results seems to be about that from its call and first lines, but 2 have a line holding "4821":');
  assert.ok(named[1]?.includes('show c') && named[2]?.includes('show a') && named.length === 3, named.join('\n'));

  const filesMany = new MemoryFiles();
  const ten = await compacted(filesMany, Array.from({ length: 10 }, (_, i) => deep(`r${i}`, `serial 4821 run ${i}`)));
  const many = (await find(input(filesMany, ten, 'Which result had the serial 4821?', sayingNone().http))).split('\n');
  assert.ok(many[0]?.includes('but 10 have a line holding "4821":'));
  assert.equal(many.length, 1 + VALUED_LISTED + 1);
  assert.equal(many.at(-1), '- and 2 more: say more of what is asked for to tell them apart');
});

test('values no line holds together, or a question with no value: nothing is said to Jev of lines, and its none is answered as before', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), deep('b', 'serial 4821 passed\nat 11:45:00'), call('c')]);
  // Two values on two lines of one result: looked for, not held, and the answer says what was and was not looked for.
  const two = sayingNone();
  const said = await find(input(files, messages, 'Which result had 4821 at 11:45:00?', two.http));
  assert.deepEqual(toldOf(two.sent), ['', '', '', '']);
  assert.ok(said.startsWith('[not found] None of the moved-out results has a line holding "4821" and "11:45:00" as a word of its own'), said);
  for (const part of ['on different lines', 'in another letter case', 'only part of a longer word or number', 'the number of a line', 'a kept part of the conversation', 'quote twelve characters or more', `read the results with ${RECALL_TOOL}`]) {
    assert.ok(said.includes(part), part);
  }
  assert.ok(!said.includes('can be missed') && !said.includes('as written, and'), said);
  // A count beside the value is no value: the result that holds the value alone is told of.
  const count = trusting();
  assert.ok((await find(input(files, messages, 'Which of the 2 results had 4821?', count.http))).startsWith('[found] Bash result'));
  assert.deepEqual(toldOf(count.sent)[2], 'One of its lines holds "4821".');
  // No value of three digits: the answer of before.
  const plain = sayingNone();
  const before = await find(input(files, messages, 'Which of the 2 results is line 17 of?', plain.http));
  assert.deepEqual(toldOf(plain.sent), ['', '', '', '']);
  assert.ok(before.startsWith('[not found] None of the moved-out results seems to be about that') && before.includes('can be missed'), before);
});

test('the number Read puts in front of a line is not the value, and a column of numbers in another tool\'s result is', async () => {
  const files = new MemoryFiles();
  const read = (label: string): Call => ({ tool: 'Read', input: { file_path: `${label}.md` }, text: Array.from({ length: 300 }, (_, i) => `${i + 1}\t${label} says nothing of note`).join('\n') });
  const table: Call = { tool: 'Bash', input: { command: 'cat rows.tsv' }, text: Array.from({ length: 300 }, (_, i) => `${i + 1}\trow of the table`).join('\n') };
  // Two files read whose line 250 says nothing of 250, and one table whose first column is its own: the table alone holds it.
  const messages = await compacted(files, [read('a'), read('b'), table, call('c')]);
  const jev = sayingNone();

  const said = await find(input(files, messages, 'Which result mentioned 250?', jev.http));
  assert.deepEqual(toldOf(jev.sent), ['', '', '', 'One of its lines holds "250".', '']);
  assert.ok(said.includes('but one has a line holding "250":') && said.includes('cat rows.tsv'), said);
});

test('a quoted phrase is looked for first, and where it narrowed the choice the values are looked for among those left', async () => {
  const files = new MemoryFiles();
  const one = await compacted(files, [deep('a', 'serial 4821 passed'), call('b'), call('c')]);
  const text = await find(input(files, one, 'Which result has "c line 17: value" and the serial 4821?'));
  assert.match(text.split('\n\n')[0] ?? '', /matched the quoted phrase "c line 17: value"$/);

  // The phrase is in two results, the serial in one of them and in a third: Jev chooses between the two, told of the one that holds the serial.
  const filesTwo = new MemoryFiles();
  const two = await compacted(filesTwo, [deep('a', 'serial 4821 passed'), deep('c', 'the build went through cleanly'), deep('d', 'the build went through cleanly\nserial 4821 again')]);
  const jev = trusting();
  const question = 'Which result has "the build went through" and the serial 4821?';
  assert.deepEqual(valuesOf(question), ['4821']);
  const chosen = await find(input(filesTwo, two, question, jev.http));
  assert.equal(jev.sent.length, 1);
  assert.deepEqual(toldOf(jev.sent), ['', '', 'One of its lines holds "4821".']);
  assert.ok(chosen.startsWith('[found] Bash result') && chosen.includes('serial 4821 again'), chosen.slice(0, 160));
});

test('the head of a large text with no line break to cut at is never cut inside a character (#70)', () => {
  for (let n = HEAD_CHARS - 5; n <= HEAD_CHARS + 2; n += 1) {
    const head = shown(`${'w'.repeat(n)}${'🎉'.repeat(WHOLE_UP_TO)}`);
    assert.ok(!/\p{Surrogate}/u.test(head) && head.length <= HEAD_CHARS, `at ${n}`);
  }
});

test('a long value of a call\'s input that left is one of the results find chooses among, told by the call as it stands now (ADR 0020)', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('build')]);
  const content = `export const LIMIT = 4096;\n${output('lib/limits.ts', 60)}`;
  const moved = await moveInputOut(files, DIR, 'Write', 'content', content);
  assert.ok(!('reason' in moved));
  messages.push({ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'toolu_w', tool: 'Write', input: { file_path: 'lib/limits.ts', content: moved.text } }] });
  messages.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'toolu_w', text: 'File created successfully.', isError: false }] });

  const stored = ticketsIn(messages);
  assert.equal(stored.length, 2);
  const written = stored[1]!;
  assert.equal(written.id, moved.id);
  assert.equal(written.line, moved.text);
  assert.match(written.about, /^the content handed to Write, called with /);
  assert.ok(written.about.includes('lib/limits.ts'));
  // What Jev would be told of the call holds the ticket where the value was, and nothing of the value.
  assert.ok(!written.about.includes('LIMIT = 4096'));

  // Asked for a phrase the written file alone holds, find gives it back whole, without asking Jev.
  const found = await find(input(files, messages, 'Which file set "export const LIMIT = 4096"?'));
  assert.ok(found.includes(content), found.slice(0, 200));
  assert.ok(found.includes(moved.id));
});

test('a long input value kept inside a part is one find chooses among, as it is before the part is kept', async () => {
  const files = new MemoryFiles();
  const content = `export const LIMIT = 8192;\n${output('lib/part.ts', 60)}`;
  const moved = await moveInputOut(files, DIR, 'Write', 'content', content);
  assert.ok(!('reason' in moved));
  // A kept part holds an input's value on its own line, after the field's name (src/keep.ts).
  const part = `--- assistant\n[call Write toolu_w] {"file_path":"lib/part.ts"}\nfile_path:\nlib/part.ts\ncontent:\n${moved.text}\n`;
  const stored = await moveOut(files, DIR, 'conversation', part);
  assert.ok(!('reason' in stored));
  const messages: Message[] = [{ role: 'user', text: `[lossless-compaction] kept\n${partTicketText({ part: 1, parts: 1, first: 1, last: 1, bytes: stored.bytes, id: stored.id })}`, toolUses: [] }];

  const found = await find(input(files, messages, 'Which file set "export const LIMIT = 8192"?'));
  assert.ok(found.includes(content), found.slice(0, 200));
});

test('a refused id is answered with the tickets of the conversation it may stand for: those that begin as it does, then the kept parts (#107)', () => {
  const read = (n: number, id: string): Message[] => [
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: `t${n}`, tool: 'Read', input: { file_path: `/w/logs/log-0${n}.txt` } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `t${n}`, text: ticketText({ tool: 'Read', bytes: 1000 + n, id }), isError: false }] },
  ];
  const near = '6c7cc4406e6e8fb60cea6af41ecebabf800a6089e1b0ae27489e5ada8ef3b822';
  const nearer = '6c7cc44fe'.padEnd(64, '1');
  const far = 'a'.repeat(64);
  const part = 'b'.repeat(64);
  const messages: Message[] = [
    { role: 'user', text: 'Read the logs.', toolUses: [] },
    ...read(4, near),
    ...read(5, nearer),
    ...read(6, far),
    { role: 'user', text: partTicketText({ part: 1, parts: 1, first: 2, last: 9, bytes: 4000, id: part }), toolUses: [] },
  ];
  const said = mayStandFor('6c7cc4406e8', messages).split('\n');
  // What begins most as the id given first, then the next, then the kept part; not what begins otherwise.
  assert.equal(said[1], 'The tickets of this conversation it may stand for:');
  assert.ok(said[2]?.includes('/w/logs/log-04.txt') && said[2].endsWith(`id ${near}`), said[2] ?? '');
  assert.ok(said[3]?.includes('/w/logs/log-05.txt') && said[3].endsWith(`id ${nearer}`), said[3] ?? '');
  assert.ok(said[4]?.includes('part 1 of 1 of the kept conversation') && said[4].endsWith(`id ${part}`), said[4] ?? '');
  assert.equal(said.length, 5);
  assert.ok(said.slice(2).every((line) => line.includes(`recall with ${RECALL_TOOL} id `)));
  // Nothing begins as it does: the parts still, where the tickets they hold are.
  assert.ok(mayStandFor('ffff0000', messages).endsWith(`id ${part}`));
  // Nothing begins as it does and no part: said so.
  assert.match(mayStandFor('ffff0000', messages.slice(0, -1)), /^\nNo ticket of this conversation begins as that id does/);
  // The id given is written in the conversation: nothing is stored under it here, and no other result is offered in its
  // place; the kept parts still are, as a copy written whole can stand beside a ticket a part alone holds.
  assert.deepEqual(mayStandFor(near, messages).split('\n').slice(1), [
    'That id is written in this conversation, and nothing is stored under it here. The parts kept from the conversation hold tickets of their own:',
    `- part 1 of 1 of the kept conversation, messages 2-9; 4000 bytes; recall with ${RECALL_TOOL} id ${part}`,
  ]);
  assert.equal(mayStandFor(near, messages.slice(0, -1)), '\nThat id is written in this conversation, and nothing is stored under it here.');
  // A conversation with no ticket, a subagent's: nothing added.
  assert.equal(mayStandFor('6c7cc4406e8', []), '');
  // Never more than NAMED_ON_REFUSAL.
  const many = Array.from({ length: 9 }, (_, n) => read(n, `6c7c${String(n).repeat(60)}`)).flat();
  assert.equal(mayStandFor('6c7c', many).split('\n').length - 2, NAMED_ON_REFUSAL);
});
