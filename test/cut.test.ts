import assert from 'node:assert/strict';
import { test } from 'node:test';

import { changedLine, shownAgainNote } from '../src/changed.ts';
import { compact, mayStay, reportLine, tokensOf, type Config, type Count, type Report } from '../src/compact.ts';
import { cutLine, decide, keepOldest, type Asked, type Decision } from '../src/cut.ts';
import { ticketsIn } from '../src/find.ts';
import { KEPT, KEPT_UNSUMMARIZED, keepConversation, messageText, namedThroughParts } from '../src/keep.ts';
import { goalOf } from '../src/select.ts';
import { PART, moveOut, partTicketText, readPartTicket, readTicket, recall } from '../src/store.ts';
import type { Message } from '../src/types.ts';
import { DiskFiles, MemoryFiles } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';
const STORE = { write: DIR, read: [DIR] };
// Letters only: a digit weighs double, and the sizes below are meant to be read off the lengths.
const prose = (chars: number) => 'p'.repeat(chars);
const COUNT: Count = { fixedTokens: 10_000, density: 1 / 3 };

/** One turn: the person says `said` characters, a file is read, the model answers. Four messages. */
function turn(n: number, said: number, read = 90): Message[] {
  return [
    { role: 'user', text: `turn ${n} ${prose(said)}`, toolUses: [] },
    { role: 'assistant', text: `reading ${n}`, toolUses: [{ tool_use_id: `t${n}`, tool: 'Read', input: { file_path: `/p/f${n}.txt` } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `t${n}`, text: `r${n} ${prose(read)}`, isError: false }] },
    { role: 'assistant', text: `done ${n}`, toolUses: [] },
  ];
}
const talk = (turns: number, said: number, read = 90): Message[] => Array.from({ length: turns }, (_, at) => turn(at + 1, said, read)).flat();

/** A window of 100,000 with 75 % allowed to stay, cut down to that line, the newest 2,000 tokens left alone. */
function ask(messages: readonly Message[], over: Partial<Asked> = {}): Asked {
  const count = 'count' in over ? over.count : COUNT;
  return {
    messages,
    tokens: Math.round((count?.fixedTokens ?? 0) + tokensOf(messages, count)),
    count,
    window: 100_000,
    maxAfterPercent: 75,
    cutTo: 75_000,
    keepTokens: 2_000,
    instructions: undefined,
    ...over,
  };
}

const isSaid = (message: Message) => message.role === 'user' && (message.toolResults?.length ?? 0) === 0;
const answers = (message: Message) => message.role === 'user' && (message.toolResults?.length ?? 0) > 0;
/** The places a conversation of turns may be cut at: where the person speaks, and right after results came back. */
const places = (messages: readonly Message[]) => messages.map((_, at) => at).filter((at) => at > 1 && (isSaid(messages[at] as Message) || answers(messages[at - 1] as Message)));
/** What is in use with the messages from `after` up to `at` gone and nothing put in their place. */
const without = (asked: Asked, after: number, at: number) => asked.tokens - tokensOf(asked.messages.slice(after, at), asked.count);

function back(decision: Decision): Extract<Decision, { hand: 'back' }> {
  assert.equal(decision.hand, 'back', JSON.stringify(decision));
  return decision as Extract<Decision, { hand: 'back' }>;
}

// 30 turns of 9,000 characters each: 3,000 tokens a turn, 90,000 and the 10,000 that are not the conversation.
const FULL = talk(30, 9_000);
// Nine turns of 10,000 tokens and a little, with no call: the only places to cut are where the person speaks, 10,000
// tokens apart, which is far more than any list comes to. So where a cut has to fall can be read off the figures.
const WIDE: Message[] = Array.from({ length: 9 }, (_, at): Message[] => [
  { role: 'user', text: `turn ${at + 1} ${prose(30_000)}`, toolUses: [] },
  { role: 'assistant', text: 'noted', toolUses: [] },
]).flat();

test('a summary that was asked for is given: /compact with instructions is never cut', () => {
  assert.deepEqual(decide(ask(FULL, { instructions: 'keep the plan' })), { hand: 'summary' });
  assert.deepEqual(decide(ask(FULL, { instructions: '  \n' })).hand, 'back', 'white space is no instruction');
  assert.deepEqual(decide(ask(talk(2, 300), { instructions: 'keep the plan' })), { hand: 'summary' }, 'with room or without');
});

test('a conversation under the line once rebuilt is handed back with nothing cut, where its size is counted from what stays', () => {
  const small = talk(10, 9_000); // 40,000 of 100,000
  assert.deepEqual(decide(ask(small)), { hand: 'back', after: 0, at: 0, tokensAfter: ask(small).tokens, over: false });
});

test('where sizes are not counted from what stays, a conversation that looks under the line is cut all the same, down to the size it is given', () => {
  // 30,000 in use by the characters, of 100,000: under the line. But the compaction was asked for, by Claude Code where
  // it is full, and the figure may be too low; nothing says it fits once rebuilt. It is cut to half, as the hook would ask.
  const small = talk(10, 9_000);
  const asked = ask(small, { count: undefined, cutTo: 15_000 });
  assert.ok(asked.tokens < 75_000, `${asked.tokens}`);
  const decision = back(decide(asked));
  assert.ok(decision.after === 1 && decision.at > 1 && !decision.over, JSON.stringify(decision));
  assert.ok(decision.tokensAfter <= 15_000 && decision.tokensAfter > 15_000 - 3_500, `${decision.tokensAfter}`);
  // With no place to cut, it goes to the summary as before.
  assert.deepEqual(decide(ask([{ role: 'user', text: prose(9_000), toolUses: [] }], { count: undefined, cutTo: 1_000 })), { hand: 'summary' });
  // Nor is a conversation smaller than keepTokens cut for looking under the line: every place in it would leave less than that.
  assert.deepEqual(decide(ask(talk(3, 300), { count: undefined, cutTo: 100 })), { hand: 'summary' });
  // Counted, the same conversation is handed back as it is: it is known to fit.
  assert.equal(back(decide(ask(small, { cutTo: 15_000 }))).at, 0);
});

test('less than keepTokens is left where nothing short of that brings the conversation under the line', () => {
  // A paste of 80,000 tokens right behind the first message, and little after it: cut there, 2 tokens and a
  // question stay, far less than the 20,000 keepTokens asks for. Left alone, all of it would go to a summary.
  const pasted: Message[] = [
    { role: 'user', text: 'Two rules for this work.', toolUses: [] },
    { role: 'user', text: prose(240_000), toolUses: [] },
    { role: 'assistant', text: 'noted', toolUses: [] },
    { role: 'user', text: 'and now?', toolUses: [] },
  ];
  const decision = back(decide(ask(pasted, { keepTokens: 20_000 })));
  assert.deepEqual([decision.after, decision.at, decision.over], [1, 3, false], 'the paste and its answer go; the first message and the question stay');
  // What is not the conversation, a few tokens of it, and a list estimated at fourteen lines for a paste of 240,000 bytes.
  assert.ok(decision.tokensAfter > 10_000 && decision.tokensAfter < 12_000, `${decision.tokensAfter}`);
  // The oldest place past keepTokens that fits, not the newest: with 70,000 to leave alone, seven turns of WIDE stay
  // and are over the line; one more would fit, list or no list, so five stay behind the first, not one.
  const wide = back(decide(ask(WIDE, { keepTokens: 70_000 })));
  assert.deepEqual([wide.after, wide.at], [1, 8]);
  // Where what keepTokens leaves is under the line, nothing more goes, however low the size it is given: four turns are 40,000.
  assert.equal(back(decide(ask(WIDE, { keepTokens: 40_000, cutTo: 0 }))).at, 10);
});

test('over the line, the oldest messages go and the first stays: cut at the oldest place that brings it down', () => {
  // 100,000 and a little in use. The first turn stays. With five more and what is not the conversation that is
  // 70,000, under the line of 75,000 with a list beside it; with six more it is 80,000, list or no list.
  const asked = ask(WIDE);
  assert.ok(asked.tokens > mayStay(asked.window, asked.maxAfterPercent), `${asked.tokens} in use`);
  const decision = back(decide(asked));
  assert.deepEqual([decision.after, decision.at, decision.over], [1, 8, false], 'the reply to the first turn and three turns go');
  assert.ok(decision.tokensAfter <= 75_000 && decision.tokensAfter >= without(asked, 1, 8), `${decision.tokensAfter} afterwards: what stays, and a list`);
  assert.ok(without(asked, 1, 6) > 75_000, 'the place before it leaves more than may stay');
  // In a conversation of calls, a cut ends where the person speaks or right after results came back.
  const called = back(decide(ask(FULL)));
  assert.ok(called.after === 1 && places(FULL).includes(called.at) && called.tokensAfter <= 75_000, `cut at ${called.at}`);
});

test('a cut goes down to the size it is given, never above the line, and the newest messages stay while they add up to keepTokens', () => {
  const at = (cutTo: number, keepTokens = 2_000) => back(decide(ask(WIDE, { cutTo, keepTokens })));
  // To half the window: the first turn, two more and what is not the conversation come to 40,000; with three more, 50,000 and a little.
  assert.equal(at(50_000).at, 14);
  assert.ok(at(50_000).tokensAfter <= 50_000 && without(ask(WIDE), 1, 12) > 50_000);
  assert.deepEqual(at(100_000), at(75_000), 'a size above the line is the line');
  assert.equal(at(75_000).at, 8);
  // A size it cannot reach: the newest place that still leaves keepTokens of the conversation, and no further.
  assert.deepEqual([at(0).after, at(0).at, at(0).over], [1, 16, false], 'the first turn and the last stay');
  // With more to leave alone, less is cut: three turns are 30,000 and a little. The first message is not among them.
  assert.equal(at(0, 30_000).at, 12);
  assert.equal(at(0, 30_100).at, 10);
});

test('the first message is cut with the rest only where the conversation does not fit with it', () => {
  // What was pasted first is 80,000 tokens: left in front, nothing behind it can be cut that brings the rest under the line.
  const pasted: Message[] = [{ role: 'user', text: prose(240_000), toolUses: [] }, { role: 'assistant', text: 'noted', toolUses: [] }, ...talk(5, 9_000)];
  const decision = back(decide(ask(pasted)));
  assert.deepEqual([decision.after, decision.at], [0, 2], 'it goes, and what it was answered with');
  assert.ok(decision.tokensAfter < 30_000, `${decision.tokensAfter}`);
  // The same turns behind a first message of ordinary size: it stays.
  assert.equal(back(decide(ask([...turn(0, 9_000), ...talk(30, 9_000)]))).after, 1);
});

test('a cut never falls between a call and its result, nor while another call of the same turn waits for one', () => {
  // Two calls in one reply, their results handed back in two messages; a call that was interrupted and never answered.
  const parallel: Message[] = [
    { role: 'user', text: `first ${prose(9_000)}`, toolUses: [] },
    { role: 'assistant', text: 'interrupted', toolUses: [{ tool_use_id: 'lost', tool: 'Bash', input: { command: 'sleep' } }] },
    { role: 'user', text: `go on ${prose(9_000)}`, toolUses: [] },
    {
      role: 'assistant',
      text: 'two at once',
      toolUses: [
        { tool_use_id: 'a', tool: 'Read', input: { file_path: '/p/a' } },
        { tool_use_id: 'b', tool: 'Read', input: { file_path: '/p/b' } },
      ],
    },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'a', text: prose(9_000), isError: false }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'b', text: prose(9_000), isError: false }] },
    { role: 'assistant', text: 'both read', toolUses: [] },
  ];
  // A little over the line, the first message staying: cut up to 3 it comes to about 73,800, up to 5 to 70,800, up to 6 to 67,800.
  const messages = [...parallel, ...talk(18, 9_000)];
  const asked = ask(messages);
  assert.ok(asked.tokens > 75_000 && without(asked, 1, 3) < 74_000 && without(asked, 1, 5) < 71_000 && without(asked, 1, 6) > 67_000, `${asked.tokens}`);
  const cuts = new Map<number, number>();
  for (let cutTo = 60_000; cutTo <= 75_000; cutTo += 1_000) cuts.set(cutTo, back(decide(ask(messages, { cutTo }))).at);
  const seen = new Set(cuts.values());
  // Up to 3 would do, but there the model has said nothing yet of what the person just asked: no place to end a cut.
  // Up to 5 would do, but `b` still waits for its result. The cut ends at 6, once both are back; and the call
  // that never got a result is waited for by nothing, or no place behind it could be taken at all.
  assert.equal(cuts.get(75_000), 6);
  assert.ok(!seen.has(2) && !seen.has(3) && !seen.has(4) && !seen.has(5), [...seen].join(','));
});

test('where the newest messages alone are over the line the summary runs as before, since it can still make them smaller', () => {
  // The last thing said is 240,000 characters: 80,000 tokens, which no cut in front of it takes away.
  const pasted = [...talk(5, 9_000), { role: 'user' as const, text: prose(240_000), toolUses: [] }];
  assert.deepEqual(decide(ask(pasted)), { hand: 'summary' });
  assert.deepEqual(decide(ask(pasted, { cutTo: 0, keepTokens: 0 })), { hand: 'summary' }, 'however deep the cut');
  // One message and nothing in front of it: there is no place to cut.
  assert.deepEqual(decide(ask([{ role: 'user', text: prose(300_000), toolUses: [] }])), { hand: 'summary' });
});

test('what is not the conversation can be over the line by itself: cut as far as it goes and handed back, unless all of it is over the window', () => {
  // 80,000 of system prompt and tools, 15,000 of conversation: a summary could take away 15,000 at most, and 20,000 are over.
  const count: Count = { fixedTokens: 80_000, density: 1 / 3 };
  const decision = back(decide(ask(talk(5, 9_000), { count })));
  assert.ok(decision.over && decision.after === 1 && decision.at > 1, JSON.stringify(decision));
  assert.ok(decision.tokensAfter > 75_000 && decision.tokensAfter <= 100_000, `${decision.tokensAfter}`);
  // 99,000 that are not the conversation: what stays of it puts the whole over the window, which is not handed back.
  assert.deepEqual(decide(ask(talk(5, 9_000), { count: { fixedTokens: 99_000, density: 1 / 3 } })), { hand: 'summary' });
});

test('without a count the size is what was in use less the characters cut over three, and a list', () => {
  // 100,000 in use by Claude Code's figure; the messages hold 270,000 characters, 30,000 a turn.
  const asked = ask(WIDE, { count: undefined, tokens: 100_000 });
  const decision = back(decide(asked));
  assert.deepEqual([decision.after, decision.at], [1, 8]);
  const gone = tokensOf(WIDE.slice(1, 8), undefined);
  assert.ok(Math.abs(gone - 30_000) < 100, `${gone} tokens cut`);
  assert.ok(decision.tokensAfter >= 100_000 - gone && decision.tokensAfter <= 75_000, `${decision.tokensAfter}`);
});

/** The parts a list names, read back in order. */
async function partsOf(files: MemoryFiles, list: string): Promise<string[]> {
  const out: string[] = [];
  for (const line of list.split('\n')) {
    const part = readPartTicket(line);
    if (part === null) continue;
    const got = await recall(files, [DIR], part.id);
    assert.ok('text' in got, line);
    out.push(got.text);
  }
  return out;
}

test('the oldest messages come back from the list as they were said, and what stays around them is handed back untouched', async () => {
  const files = new MemoryFiles();
  const asked = ask(FULL);
  const decision = back(decide(asked));
  assert.equal(decision.after, 1);
  const cut = await keepOldest(files, STORE,asked, decision.after, decision.at);
  assert.ok('messages' in cut, JSON.stringify(cut));

  const [first, list, ...rest] = cut.messages;
  assert.deepEqual(first, FULL[0], 'the first message stays where it was');
  assert.deepEqual(rest, FULL.slice(decision.at), 'what follows is what was there');
  assert.ok(list !== undefined && list.role === 'user' && list.toolUses.length === 0 && list.toolResults === undefined);
  const lines = list.text.split('\n');
  assert.equal(lines[0], `${KEPT_UNSUMMARIZED}, in ${cut.parts} part${cut.parts === 1 ? '' : 's'}; recall a part by its id.`);
  assert.equal(lines.length, cut.parts + 1, 'a line for each part and nothing else');
  assert.ok(!list.text.includes('summary replaces') && !list.text.includes('before the summary'), 'no summary is spoken of');

  // Results under INLINE_BYTES stay in the text, so the parts read in order are the messages written one after another.
  const parts = await partsOf(files, list.text);
  assert.equal(parts.length, cut.parts);
  assert.equal(parts.join(''), FULL.slice(1, decision.at).map((message) => `${messageText(message)}\n`).join(''));
  const tickets = lines.slice(1).map((line) => readPartTicket(line));
  assert.equal(tickets[0]?.first, 2, 'the messages are numbered as they stood in the conversation');
  assert.equal(tickets.at(-1)?.last, decision.at);

  // What it comes to is counted again from the list as written, and is no more than was estimated before writing.
  assert.equal(cut.tokensAfter, Math.round(asked.tokens - tokensOf(FULL.slice(1, decision.at), COUNT) + tokensOf([list], COUNT)));
  assert.ok(cut.tokensAfter <= decision.tokensAfter, `${cut.tokensAfter} written, ${decision.tokensAfter} estimated`);
  assert.ok(cut.tokensAfter <= 75_000);
});

test('find is offered the parts a cut left, as it is those kept before a summary', async () => {
  const files = new MemoryFiles();
  const asked = ask(FULL);
  const decision = back(decide(asked));
  const cut = await keepOldest(files, STORE,asked, decision.after, decision.at);
  assert.ok('messages' in cut);
  const offered = ticketsIn(cut.messages).filter((ticket) => ticket.tool === PART);
  assert.equal(offered.length, cut.parts);
  assert.match(offered[0]?.about ?? '', /^part 1 of \d+ of the kept conversation, messages 2-\d+$/);
  // And the goal a compaction orders results by is what the person said, not the list.
  assert.ok(!goalOf(cut.messages, undefined).includes('[lossless-compaction]'));
  assert.ok(goalOf(cut.messages, undefined).includes('turn 30'));
});

test('a long result among the oldest messages leaves as a ticket inside its part, and comes back whole', async () => {
  const files = new MemoryFiles();
  const long = `log ${prose(30_000)}`;
  const messages = [...turn(1, 9_000), ...turn(2, 9_000, 0), ...talk(28, 9_000).slice(8)];
  (messages[6] as Message).toolResults = [{ tool_use_id: 't2', text: long, isError: false }];
  const asked = ask(messages, { cutTo: 50_000 });
  const decision = back(decide(asked));
  assert.ok(decision.at > 7);
  const cut = await keepOldest(files, STORE,asked, decision.after, decision.at);
  assert.ok('messages' in cut);
  const joined = (await partsOf(files, (cut.messages[decision.after] as Message).text)).join('');
  assert.ok(!joined.includes(long), 'not in the text of the part');
  const ticket = joined.split('\n').map(readTicket).find((one) => one !== null && one.bytes === long.length);
  assert.ok(ticket, 'a ticket in its place');
  assert.deepEqual(await recall(files, [DIR], ticket.id), { text: long });
});

test('no file is named as changed where no summary ran, though the same messages kept before a summary name it', async () => {
  // Read whole, then changed on disk: what the message after a summary says, for Claude Code shows the file again there.
  const numbered = 'one\ntwo\nthree'.split('\n').map((text, at) => `${at + 1}\t${text}`).join('\n');
  const messages: Message[] = [
    { role: 'user', text: 'read it', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'r', tool: 'Read', input: { file_path: '/p/notes.txt' } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'r', text: numbered, isError: false }] },
    { role: 'assistant', text: 'read', toolUses: [] },
    { role: 'user', text: 'and now?', toolUses: [] },
  ];
  const disk = () => {
    const files = new MemoryFiles();
    files.files.set('/p/notes.txt', 'one\ntwo\nthree, and a fourth\n');
    return files;
  };
  const summarized = await keepConversation(disk(), DIR, messages);
  assert.ok('text' in summarized && summarized.text.startsWith(KEPT) && summarized.text.includes('Changed on disk'), 'the control: before a summary it is named');

  const cut = await keepOldest(disk(), STORE, { messages, tokens: 1_000, count: undefined }, 1, 4);
  assert.ok('messages' in cut);
  assert.ok(!(cut.messages[1] as Message).text.includes('Changed on disk'));
});

test('files a summary named as changed are named again by the list once its message is cut, so a file shown again is still told from its reading', async () => {
  const path = '/p/notes.txt';
  const reading = '1\tone\n2\ttwo\n3\tthree';
  /** A disk holding the file as it is now, and the store holding what the `Read` returned then. */
  const disk = async (now: string) => {
    const files = new MemoryFiles();
    files.files.set(path, now);
    const stored = await moveOut(files, DIR, 'Read', reading);
    assert.ok('id' in stored);
    return { files, id: stored.id };
  };
  // A conversation as it stands after a summary: the summary, the plugin's message naming the file, and what was said since.
  const summarized = (id: string, since: Message[] = []): Message[] => [
    { role: 'user', text: 'This session is being continued from a previous conversation. Summary: notes were read.', toolUses: [] },
    { role: 'user', text: `${KEPT}, in 1 part; recall a part by its id.\n${changedLine(path, id)}`, toolUses: [] },
    ...talk(30, 9_000),
    ...since,
  ];
  // The file as Claude Code shows it again: the call that would have read it, then its text as it is on disk.
  const shown = `Called the Read tool with the following input: ${JSON.stringify({ file_path: path })}\nResult of calling the Read tool:\n1\tas it is now`;

  // Still not what was read: the list names it with the id of the reading, and the note stands for the file as before the cut.
  const changed = await disk('one\ntwo\nthree, and a fourth');
  const messages = summarized(changed.id);
  const note = shownAgainNote(messages, shown);
  assert.ok(note !== null && note.includes(changed.id), 'the control: before the cut the plugin has the note');
  const asked = ask(messages);
  const decision = back(decide(asked));
  assert.ok(decision.after === 1 && decision.at > 2, 'the summary stays in front, and the message that named the file is among those cut');
  const cut = await keepOldest(changed.files, STORE, asked, decision.after, decision.at);
  assert.ok('messages' in cut);
  assert.ok((cut.messages[1] as Message).text.split('\n').includes(changedLine(path, changed.id)), 'named again');
  assert.equal(shownAgainNote(cut.messages, shown), note);
  assert.ok(cut.tokensAfter <= decision.tokensAfter, `${cut.tokensAfter} written, ${decision.tokensAfter} estimated: the estimate left room for the line`);

  // The file is what was read once more: nothing is named, and the file is shown as Claude Code shows it.
  const same = await disk('one\ntwo\nthree');
  const restored = await keepOldest(same.files, STORE, ask(summarized(same.id)), decision.after, decision.at);
  assert.ok('messages' in restored);
  assert.ok(!(restored.messages[1] as Message).text.includes('Changed on disk'));
  assert.equal(shownAgainNote(restored.messages, shown), null);

  // Written by the conversation since, in messages that stay behind the cut: the whole conversation is read for it, so it is not named.
  const written: Message[] = [
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'w', tool: 'Write', input: { file_path: path, content: 'one\ntwo\nthree, and a fourth' } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'w', text: 'File updated', isError: false }] },
  ];
  const since = await disk('one\ntwo\nthree, and a fourth');
  const rewritten = ask(summarized(since.id, written));
  const afterWrite = back(decide(rewritten));
  assert.ok(afterWrite.at < rewritten.messages.length - 2, 'the write stays');
  const kept = await keepOldest(since.files, STORE, rewritten, afterWrite.after, afterWrite.at);
  assert.ok('messages' in kept);
  assert.ok(!(kept.messages[1] as Message).text.includes('Changed on disk'));
});

test('the estimate a cut is decided by leaves room for the lines that name changed files, as many and as long as they can be', async () => {
  // Ten files a summary named, under paths near the longest a line may hold, all still not what was read.
  const files = new MemoryFiles();
  const named: string[] = [];
  for (let n = 0; n < 10; n += 1) {
    const path = `/p/${'d'.repeat(480)}/f${n}.txt`;
    files.files.set(path, `changed ${n}`);
    const stored = await moveOut(files, DIR, 'Read', `1\tread ${n}`);
    assert.ok('id' in stored);
    named.push(changedLine(path, stored.id));
  }
  // A little over the line, so that little is cut and the list of parts is short: the lines that name files are most of the list.
  const messages: Message[] = [
    { role: 'user', text: 'This session is being continued from a previous conversation. Summary: ten files were read.', toolUses: [] },
    { role: 'user', text: [`${KEPT}, in 1 part; recall a part by its id.`, ...named].join('\n'), toolUses: [] },
    ...WIDE.slice(0, 14),
  ];
  const asked = ask(messages);
  assert.ok(asked.tokens > 75_000 && asked.tokens < 85_000, `${asked.tokens} in use`);
  const decision = back(decide(asked));
  const cut = await keepOldest(files, STORE, asked, decision.after, decision.at);
  assert.ok('messages' in cut);
  const list = (cut.messages[1] as Message).text.split('\n');
  // Newest first, as after a summary; which comes first is not what is held here.
  assert.deepEqual(list.filter((line) => line.startsWith('Changed on disk')).sort(), [...named].sort(), 'all ten are named again');
  assert.ok(list.length <= 14, 'and they are most of the list');
  // Written, it is no more than what was estimated before writing, and under the line it was decided to be under.
  assert.ok(cut.tokensAfter <= decision.tokensAfter, `${cut.tokensAfter} written, ${decision.tokensAfter} estimated`);
  assert.ok(cut.tokensAfter <= 75_000);
});

test('when a part cannot be written nothing is cut', async () => {
  const files = new DiskFiles(false);
  files.full = (path) => path.includes('/blobs/');
  const asked = ask(FULL);
  const decision = back(decide(asked));
  const cut = await keepOldest(files, STORE,asked, decision.after, decision.at);
  assert.deepEqual(cut, { failed: 'write-failed', code: 'ENOSPC' });
});

test('cut a second time, the list of the first cut is among what is kept, and its parts are still reached through the new ones', async () => {
  const files = new MemoryFiles();
  const first = ask(FULL);
  const before = back(decide(first));
  const once = await keepOldest(files, STORE,first, before.after, before.at);
  assert.ok('messages' in once);
  const firstIds = (once.messages[1] as Message).text.split('\n').map((line) => readPartTicket(line)?.id).filter((id) => id !== undefined);

  // The conversation goes on until it is over the line again.
  const grown = [...once.messages, ...Array.from({ length: 12 }, (_, at) => turn(100 + at, 9_000)).flat()];
  const second = ask(grown);
  const decision = back(decide(second));
  assert.ok(decision.after === 1 && decision.at > 2, 'the first message stays again, and the first list goes with the rest');
  const twice = await keepOldest(files, STORE,second, decision.after, decision.at);
  assert.ok('messages' in twice);
  assert.deepEqual(twice.messages[0], FULL[0], 'what was said first is still in front');
  const list = (twice.messages[1] as Message).text;
  assert.ok(!firstIds.some((id) => list.includes(id)), 'the new list names the new parts alone');
  const joined = (await partsOf(files, list)).join('');
  for (const id of firstIds) assert.ok(joined.includes(id), 'the first list is written in a part');

  // What a clean-up keeps: every id the transcript names, and those written in the parts it names.
  const named = (list.split('\n').map((line) => readPartTicket(line)?.id).filter((id) => id !== undefined)) as string[];
  const reached = await namedThroughParts(files, [DIR], new Set(named));
  assert.ok(reached instanceof Set);
  for (const id of firstIds) assert.ok(reached.has(id), 'followed through the part that holds the first list');
});

const CONFIG: Config = { store: { write: DIR, read: [DIR] }, keepTokens: 2_000, minChars: 2_000, targetPercent: 40, maxAfterPercent: 75 };

/** One compaction as the hook runs it up to the hand-over, then what is decided of it. */
async function compacted(messages: readonly Message[], count: Count | undefined, tokens: number) {
  const files = new MemoryFiles();
  let clock = 0;
  const outcome = await compact({ messages, tokens, ...(count === undefined ? {} : { count }), window: 100_000, goal: '' }, CONFIG, { files, now: () => (clock += 5) });
  const asked: Asked = {
    messages: outcome.messages,
    tokens: outcome.report.tokensAfter,
    count,
    window: 100_000,
    maxAfterPercent: CONFIG.maxAfterPercent,
    // As the hook hands it: the size moving results out aimed at.
    cutTo: outcome.target,
    keepTokens: CONFIG.keepTokens,
    instructions: undefined,
  };
  return { files, outcome, asked, decision: decide(asked) };
}

test('what the built-in summary was handed for its size is cut instead, down to the size moving results out aimed at', async () => {
  // Too much left: 29 turns of prose, and results of 6,000 characters that leave. 87,000 of prose stay, and 10,000 that are no conversation.
  const mixed = talk(29, 9_000, 6_000);
  // Nothing to move out: no result reaches minChars.
  const said = talk(30, 9_000);
  for (const [name, messages, count] of [
    ['too much left', mixed, COUNT],
    ['nothing to move out', said, COUNT],
    ['too much left, sizes not counted', mixed, undefined],
    ['nothing to move out, sizes not counted', said, undefined],
  ] as const) {
    const before = Math.round((count?.fixedTokens ?? 0) + tokensOf(messages, count));
    const { files, outcome, asked, decision } = await compacted(messages, count, before);
    // The control: as `compact()` leaves it, this is a conversation the hook handed to the summary.
    assert.equal(outcome.enough, false, name);
    assert.equal(outcome.report.moved > 0, name.startsWith('too much'), name);
    assert.ok(outcome.report.tokensAfter > 75_000, `${name}: ${outcome.report.tokensAfter} after moving out`);
    // 40 % of the window, which is under half of what was in use.
    assert.equal(outcome.target, 40_000, name);

    const { after, at } = back(decision);
    assert.ok(after === 1 && at > 1, name);
    const cut = await keepOldest(files, STORE,asked, after, at);
    assert.ok('messages' in cut, name);
    assert.ok(cut.tokensAfter <= 40_000, `${name}: ${cut.tokensAfter} handed back`);
    // One turn less cut would have left it over the target: it is cut no further than it has to be.
    assert.ok(cut.tokensAfter > 40_000 - 3_500, `${name}: ${cut.tokensAfter}`);
    // Every id the list names is read back, and the parts in order are the messages that were cut, results as tickets where they left.
    const parts = await partsOf(files, (cut.messages[1] as Message).text);
    assert.equal(parts.join(''), outcome.messages.slice(1, at).map((message) => `${messageText(message)}\n`).join(''), name);
    assert.ok(cut.messages.every((message) => message.handle === undefined), 'nothing handed back carries a handle');
  }
});

test('the line says no summary ran, which messages were kept and in how many parts, around the report of what was handed back', () => {
  const report: Report = { results: 612, candidates: 30, moved: 23, inputs: 0, folded: 0, images: 0, charsBefore: 3_000_000, charsAfter: 2_400_000, tokensAfter: 483_027, counted: true, window: 967_000, notMoved: {}, writeErrors: [], ms: 140 };
  assert.equal(
    cutLine(report, { first: 2, last: 526, of: 1306, parts: 12, over: false }),
    'no summary, messages 2-526 of 1306 kept in 12 parts: moved 23 of 612 tool results out (3000000 -> 2400000 chars, about 483027 of 967000 tokens in use) in 140 ms',
  );
  assert.equal(cutLine(report, { first: 1, last: 2, of: 9, parts: 1, over: true }), `no summary, messages 1-2 of 9 kept in 1 part: ${reportLine(report)}; still over what may stay in use, which a summary would not change`);
  assert.equal(cutLine(report, null), `no summary, nothing to cut: ${reportLine(report)}`);
});

test('a part kept in place of a summary has a ticket that speaks of none, and both wordings are read', () => {
  const id = 'a'.repeat(64);
  const one = { part: 2, parts: 3, first: 40, last: 80, bytes: 1234, id };
  assert.equal(partTicketText(one, false), `[moved out] conversation, part 2 of 3, messages 40-80, 1234 bytes; recall with mcp__lossless-compaction__recall id ${id}`);
  assert.equal(partTicketText(one), `[moved out] conversation before the summary, part 2 of 3, messages 40-80, 1234 bytes; recall with mcp__lossless-compaction__recall id ${id}`);
  for (const text of [partTicketText(one, false), partTicketText(one, true)]) assert.deepEqual(readPartTicket(text), { tool: 'conversation', ...one });
  // The result of a tool named `conversation` is a result, not a part.
  const result = `[moved out] conversation result, 1234 bytes; recall with mcp__lossless-compaction__recall id ${id}`;
  assert.equal(readPartTicket(result), null);
  assert.deepEqual(readTicket(result), { tool: 'conversation', bytes: 1234, id });
  assert.equal(readTicket(partTicketText(one, false)), null);
});

test('the oldest messages are cut though a result among them holds half of a character, kept with U+FFFD in its place (#70)', async () => {
  const files = new MemoryFiles();
  files.corrupt = (text) => new TextDecoder().decode(new TextEncoder().encode(text));
  const lone = String.fromCharCode(0xdc00);
  const result = `${'a'.repeat(500)}${lone}b`;
  const messages: Message[] = [
    { role: 'user', text: 'read it', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't1', tool: 'Read', input: { file_path: '/p/a.txt' } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: result, isError: false }] },
    { role: 'assistant', text: 'done', toolUses: [] },
  ];

  const cut = await keepOldest(files, STORE, { messages, tokens: 1_000, count: undefined }, 1, 3);
  assert.ok('messages' in cut, JSON.stringify(cut));
  const joined = (await partsOf(files, (cut.messages[1] as Message).text)).join('');
  const expected = messages.slice(1, 3).map((message) => `${messageText(message)}\n`).join('').replace(lone, String.fromCharCode(0xfffd));
  assert.equal(joined, expected);
});
