import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attachedOf } from '../src/attached.ts';
import { changedLine, shownAgainLine, shownAgainNote } from '../src/changed.ts';
import { find } from '../src/find.ts';
import { KEPT, keepAttached } from '../src/keep.ts';
import { ATTACHED_KEPT, moveOut, readPartTicket, recall } from '../src/store.ts';
import type { Message } from '../src/types.ts';
import { MemoryFiles, recordingHttp } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';

// The shape measured on Claude Code 2.1.291 (#105), written out by hand: a file handed over with `@`, a word a
// UserPromptSubmit hook added and one a PostToolUse hook added to a result, a reminder after a result, and the
// caveat Claude Code puts before a command's text. What is the machine's own is left out.
const FILE = '<system-reminder>\nCalled the Read tool with the following input: {"file_path":"/w/notes.txt"}\n</system-reminder>';
const READ = '<system-reminder>\nResult of calling the Read tool:\n1\tPROBE-FILE-WORD: heron\n</system-reminder>';
const HOOK = '<system-reminder>\nUserPromptSubmit hook additional context: PROBE-HOOK-WORD: walrus\n</system-reminder>';
const AFTER = '<system-reminder>\nPostToolUse hook additional context: PROBE-POST-WORD: otter\n</system-reminder>';
const CAVEAT = '<local-command-caveat>The command below was run directly in Claude Code.</local-command-caveat>';
const SAID = 'Here are my notes: @notes.txt, remember the word in them.';
const OWN = '1\tline one\n2\tline two\n3\t';

const HANDED: Message[] = [
  { role: 'user', text: SAID, toolUses: [] },
  { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'r1', tool: 'Read', input: { file_path: '/w/log.txt' } }] },
  { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'r1', text: OWN, isError: false }] },
  { role: 'assistant', text: 'Read.', toolUses: [] },
  { role: 'user', text: '<command-name>/compact</command-name>', toolUses: [] },
];

const API = [
  { role: 'user', content: [{ type: 'text', text: FILE }] },
  { role: 'user', content: [{ type: 'text', text: READ }, { type: 'text', text: HOOK }, { type: 'text', text: SAID }] },
  { role: 'assistant', content: [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: '/w/log.txt' } }] },
  // Claude Code drops the line break the result ended in and adds what came after it.
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'r1', content: `${OWN.trimEnd()}\n\n${AFTER}` }] },
  { role: 'assistant', content: [{ type: 'thinking', thinking: 'x', signature: 's' }, { type: 'text', text: 'Read.' }] },
  { role: 'user', content: [{ type: 'text', text: CAVEAT }, { type: 'text', text: '<command-name>/compact</command-name>' }] },
];

test('what Claude Code attached as it sent the messages is told from what the hook was handed: what was said and what was returned are not among it (#105)', () => {
  assert.deepEqual(attachedOf(HANDED, API), [
    { label: 'before message 1', text: FILE },
    { label: 'with message 1', text: READ },
    { label: 'with message 1', text: HOOK },
    { label: 'with message 3', text: AFTER },
    { label: 'with message 5', text: CAVEAT },
  ]);
  // A result sent as it was handed, a line break at its end or not, has nothing attached.
  const untouched = API.map((message, at) => (at === 3 ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'r1', content: OWN }] } : message));
  assert.ok(!attachedOf(HANDED, untouched).some((one) => one.label === 'with message 3'));
  // One sent other than it was handed is kept whole: twice, not lost.
  const other = API.map((message, at) => (at === 3 ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'r1', content: `${AFTER}\n${OWN}` }] } : message));
  assert.deepEqual(attachedOf(HANDED, other).filter((one) => one.label === 'with message 3'), [{ label: 'with message 3', text: `${AFTER}\n${OWN}`.trim() }]);
  // A conversation that cannot be read with its blocks holds nothing to tell.
  assert.deepEqual(attachedOf(HANDED, undefined), []);
});

test('what was attached is kept in parts under the message it came with, a block sent again written once, and the message naming them says so (#105)', async () => {
  const files = new MemoryFiles();
  const attached = [...attachedOf(HANDED, API), { label: 'with message 5', text: HOOK }];
  const kept = await keepAttached(files, DIR, attached);
  assert.ok('text' in kept, JSON.stringify(kept));
  const lines = kept.text.split('\n');
  assert.equal(lines[0], `${ATTACHED_KEPT}, in 1 part; recall a part by its id.`);
  const ticket = readPartTicket(lines[1] as string);
  assert.equal(ticket?.kind, 'attached');
  const got = await recall(files, [DIR], ticket?.id);
  assert.ok('text' in got);
  for (const text of [FILE, READ, HOOK, AFTER, CAVEAT]) assert.equal(got.text.split(text).length - 1, 1, text.slice(0, 40));
  // Each block under a heading that says whose it is: not the person's, though it stands in a message of theirs.
  assert.ok(got.text.includes('--- user\nWhat Claude Code attached with message 5:\n'));
  assert.ok(got.text.includes('(the same as attached with message 1)'), 'the hook\'s line again, named after where it first came');
  assert.ok(!got.text.includes(SAID), 'what the person said is not among it');
});

/** The conversation after a compaction: a moved-out result, and the message naming what Claude Code attached. */
async function compacted(files: MemoryFiles): Promise<Message[]> {
  const result = await moveOut(files, DIR, 'Bash', 'error: the build failed in step 4\n'.repeat(40));
  assert.ok(!('reason' in result));
  const kept = await keepAttached(files, DIR, attachedOf(HANDED, API));
  assert.ok('text' in kept);
  return [
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'b1', tool: 'Bash', input: { command: 'make' } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'b1', text: result.text, isError: false }] },
    { role: 'user', text: kept.text, toolUses: [] },
  ];
}

test('find looks through what was attached here, as it does the middle of a long message, and sends none of it to Jev (#105)', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files);
  // Quoted: found here, and nothing is asked of Jev.
  const quiet = recordingHttp(() => {
    throw new Error('nothing is to be sent to Jev');
  });
  const answer = await find({ files, dirs: [DIR], messages, question: 'Where did "PROBE-HOOK-WORD: walrus" come from?', provider: { kind: 'typesafe', key: 'k' }, http: quiet.http } as never);
  assert.ok(answer.startsWith('[found] part 1 of 1 of what Claude Code attached as it sent the messages'), answer.slice(0, 160));
  assert.ok(answer.includes(HOOK));
  assert.equal(quiet.sent.length, 0);
  // Asked in words, Jev is asked among the results; what was attached is in nothing sent to it.
  const asked = recordingHttp(() => ({ status: 500, ok: false, text: 'not now' }));
  await find({ files, dirs: [DIR], messages, question: 'which word did the hook add to my first message', provider: { kind: 'typesafe', key: 'k' }, http: asked.http } as never);
  assert.ok(asked.sent.length > 0, 'Jev was asked');
  // Not offered at all: an option for it would carry the first lines of it, whatever words those happen to be.
  for (const sent of asked.sent) {
    const body = JSON.stringify(sent.body);
    assert.ok(!body.includes('what Claude Code attached') && !body.includes('system-reminder') && !body.includes('walrus'), body.slice(0, 300));
  }
});

test('a file shown again after a summary is still told from what the summary named, the message naming what was attached standing after it (#105)', () => {
  const [path, reading] = ['/w/changing.log', 'c'.repeat(64)];
  const shown = `Called the Read tool with the following input: ${JSON.stringify({ file_path: path })}\nResult of calling the Read tool:\n1\tas it is now`;
  const messages: Message[] = [
    { role: 'user', text: 'This session is being continued from a previous conversation.', toolUses: [] },
    { role: 'user', text: `${KEPT}, in 1 part; recall a part by its id.\n${changedLine(path, reading)}`, toolUses: [] },
    { role: 'assistant', text: 'Going on.', toolUses: [] },
    { role: 'user', text: `${ATTACHED_KEPT}, in 1 part; recall a part by its id.`, toolUses: [] },
  ];
  assert.equal(shownAgainNote(messages, shown), shownAgainLine(path, reading));
});
