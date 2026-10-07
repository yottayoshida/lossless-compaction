import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { store } from '../src/blobs.ts';
import { exportedLine, importedLine, insideRepository, keptAs, namedThrough, plainPath, readIn, writeOut } from '../src/carry.ts';
import { blobPath, entryPath } from '../src/layout.ts';
import { PART, inputTicketText, partTicketText, recall, ticketText } from '../src/store.ts';
import type { Message } from '../src/types.ts';
import { MemoryFiles } from './helpers.ts';

const FROM = '/home/u/.claude/lossless-compaction';
const list = (files: MemoryFiles) => (path: string) => files.list(path);

/** A store holding a result A the conversation names, a part P it names, and in P a result B and an input C; D is a hash P prints. */
async function conversation(files: MemoryFiles) {
  const a = await store(files, FROM, 'Read', 'what a file held '.repeat(40));
  const b = await store(files, FROM, 'Bash', 'what a command printed '.repeat(40));
  const c = await store(files, FROM, 'Write.content', 'what was written '.repeat(40));
  const outside = await store(files, FROM, 'Grep', 'a result no ticket of the conversation names '.repeat(20));
  assert.ok(!('reason' in a) && !('reason' in b) && !('reason' in c) && !('reason' in outside));
  const d = 'd'.repeat(64);
  const partText = [
    '--- user',
    'go on',
    '[result t9]',
    ticketText({ tool: 'Bash', bytes: b.bytes, id: b.id }),
    `[call Write t8] {"file_path":"/p/x","content":"${inputTicketText({ tool: 'Write', field: 'content', bytes: c.bytes, id: c.id })}"}`,
    `sha256 of the file: ${d}`,
    `${outside.id} was mentioned in passing`,
  ].join('\n');
  const p = await store(files, FROM, PART, partText);
  assert.ok(!('reason' in p));
  const messages: Message[] = [
    { role: 'user', text: partTicketText({ part: 1, parts: 1, first: 2, last: 9, bytes: p.bytes, id: p.id }, false), toolUses: [] },
    { role: 'assistant', text: 'reading', toolUses: [{ tool_use_id: 't1', tool: 'Read', input: { file_path: '/p/f' } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: ticketText({ tool: 'Read', bytes: a.bytes, id: a.id }), isError: false }] },
  ];
  return { a: a.id, b: b.id, c: c.id, d, p: p.id, outside: outside.id, messages };
}

test('what a conversation names is its tickets and those in the shape of a ticket in its kept parts, a hash printed there being none (#116)', async () => {
  const files = new MemoryFiles();
  const named = await conversation(files);
  assert.deepEqual([...(await namedThrough(files, [FROM], named.messages))].sort(), [named.a, named.b, named.c, named.p].sort());
});

test("written out, each named result is in a new directory of the store's shape with its entry, and what is not kept is counted (#116)", async () => {
  const files = new MemoryFiles();
  const named = await conversation(files);
  const ids = await namedThrough(files, [FROM], named.messages);
  const out = await writeOut(files, [FROM], [...ids, 'e'.repeat(64)], '/carry/out');
  assert.deepEqual(out, { written: 4, missing: 1, left: 0 });
  for (const id of ids) assert.deepEqual(await keptAs(files, ['/carry/out'], id), await keptAs(files, [FROM], id));
  assert.equal(await keptAs(files, ['/carry/out'], named.outside), null, 'nothing the conversation does not name');
});

test('read in, a result comes back from the place written to; one whose text is not its name, or with no entry, is refused; past the time given, the rest is left for the next time (#116)', async () => {
  const files = new MemoryFiles();
  const named = await conversation(files);
  await writeOut(files, [FROM], await namedThrough(files, [FROM], named.messages), '/carry/out');
  const TO = '/other/machine/store';
  assert.deepEqual(await readIn(files, list(files), '/carry/out', TO, () => true), { taken: 4, there: 0, refused: 0, left: 0 });
  const back = await recall(files, [TO], named.a);
  assert.ok(!('error' in back) && back.text === 'what a file held '.repeat(40));
  // Again: there already.
  assert.deepEqual(await readIn(files, list(files), '/carry/out', TO, () => true), { taken: 0, there: 4, refused: 0, left: 0 });
  // A text changed by one character, and one with no entry: neither is taken.
  await files.write(blobPath('/carry/bad', named.a), 'what a file held '.repeat(40).replace('w', 'W'));
  await files.write(entryPath('/carry/bad', named.a), JSON.stringify({ bytes: 1, tool: 'Read' }));
  await files.write(blobPath('/carry/bad', named.b), (await files.read(blobPath(FROM, named.b))) as string);
  files.dirs.add('/carry/bad/blobs');
  assert.deepEqual(await readIn(files, list(files), '/carry/bad', '/third', () => true), { taken: 0, there: 0, refused: 2, left: 0 });
  assert.equal(await keptAs(files, ['/third'], named.a), null);
  // Past the time given: left, and taken the next time.
  let turns = 0;
  const partly = await readIn(files, list(files), '/carry/out', '/fourth', () => turns++ < 2);
  assert.ok(!('reason' in partly) && partly.taken === 2 && partly.left === 2, JSON.stringify(partly));
  assert.deepEqual(await readIn(files, list(files), '/carry/out', '/fourth', () => true), { taken: 2, there: 2, refused: 0, left: 0 });
});

test("a place inside a repository is told by a .git in it or above it, a directory or a worktree's file, through links too (#116)", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'lc-carry-')));
  await mkdir(join(root, 'repo', '.git'), { recursive: true });
  await mkdir(join(root, 'repo', 'sub'), { recursive: true });
  await mkdir(join(root, 'wt'), { recursive: true });
  await writeFile(join(root, 'wt', '.git'), 'gitdir: /elsewhere\n');
  await mkdir(join(root, 'plain'), { recursive: true });
  await symlink(join(root, 'repo', 'sub'), join(root, 'link'));
  const exists = (path: string) => stat(path).then(
    () => true,
    () => false,
  );
  const real = (dir: string) => realpath(dir).catch(() => null);
  assert.equal(await insideRepository(join(root, 'repo', 'sub', 'out'), exists, real), true, 'a .git directory above it');
  assert.equal(await insideRepository(join(root, 'wt', 'out'), exists, real), true, "a worktree's .git file above it");
  assert.equal(await insideRepository(join(root, 'link', 'out'), exists, real), true, 'through a link into a repository');
  assert.equal(await insideRepository(join(root, 'plain', 'new', 'out'), exists, real), false);
});

test('what the two commands say: how many, where, what was kept nowhere or refused, and what to do next (#116)', () => {
  assert.equal(
    exportedLine({ written: 12, missing: 1, left: 0 }, '/media/stick/carry', 'abc'),
    "wrote 12 results this conversation names to /media/stick/carry; 1 it names is kept nowhere here. To go on with it on another machine, copy that directory there, and this conversation's record, abc.jsonl, into the folder of Claude Code's projects/ there for the directory you resume it from; resume it, and type /lossless-import with the directory.",
  );
  assert.ok(exportedLine({ written: 1, missing: 0, left: 0 }, '/x', 's').startsWith('wrote 1 result this conversation names to /x. To go on'));
  assert.ok(exportedLine({ written: 1, missing: 0, left: 3 }, '/x', 's').startsWith('wrote 1 result this conversation names to /x; 3 left for want of time: type the same /lossless-export again to go on. To go on'));
  assert.equal(importedLine({ taken: 3, there: 1, refused: 0, left: 0 }), 'read in 3 results, 1 there already');
  assert.equal(
    importedLine({ taken: 1, there: 0, refused: 2, left: 5 }),
    'read in 1 result, 0 there already, 2 refused: not named by the SHA-256 of their text, with no entry that says what it is, or not to be kept here; 5 left for want of time: type it again to go on',
  );
});

test('a ticket in the middle of a line or of a result is named too, and a kept part is followed whatever its entry says it is (#116)', async () => {
  const files = new MemoryFiles();
  const changed = await store(files, FROM, 'Read', 'what a file held when it was read '.repeat(20));
  const reported = await store(files, FROM, 'Grep', 'what a search found '.repeat(30));
  const inner = await store(files, FROM, 'Bash', 'what a command printed in a part '.repeat(20));
  assert.ok(!('reason' in changed) && !('reason' in reported) && !('reason' in inner));
  // A part whose entry says it was what recall returned, as one moved out again after a recall says.
  const part = await store(files, FROM, 'mcp__lossless-compaction__recall', ['--- user', ticketText({ tool: 'Bash', bytes: inner.bytes, id: inner.id })].join('\n'));
  assert.ok(!('reason' in part));
  const messages: Message[] = [
    // The line that names a file changed on disk (ADR 0014): the ticket is at its end, not the whole line.
    { role: 'user', text: `[lossless-compaction] Changed on disk since it was read: /p/f.txt; what it held then comes back with mcp__lossless-compaction__recall id ${changed.id}.`, toolUses: [] },
    { role: 'assistant', text: 'asking', toolUses: [{ tool_use_id: 'a1', tool: 'Agent', input: {} }] },
    // An agent's report, a ticket on one of its lines among others.
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'a1', text: ['Found two places.', ticketText({ tool: 'Grep', bytes: reported.bytes, id: reported.id }), 'Both read.', ticketText({ tool: 'recall', bytes: part.bytes, id: part.id })].join('\n'), isError: false }] },
  ];
  assert.deepEqual([...(await namedThrough(files, [FROM], messages))].sort(), [changed.id, reported.id, part.id, inner.id].sort());
});

test('one result the store refuses is counted and the rest read in: only a write that fails stops it (#116)', async () => {
  const files = new MemoryFiles();
  const named = await conversation(files);
  await writeOut(files, [FROM], await namedThrough(files, [FROM], named.messages), '/carry/out');
  // An entry naming a tool the store does not take.
  await files.write(entryPath('/carry/out', named.a), JSON.stringify({ bytes: 1, tool: 'a tool name with spaces' }));
  assert.deepEqual(await readIn(files, list(files), '/carry/out', '/fifth', () => true), { taken: 3, there: 0, refused: 1, left: 0 });
});

test("a path to write out to or read in from is one from the root with no . or .. in it: a drive letter's form is refused (#116)", () => {
  for (const path of ['/media/stick/carry', '/a', '/a/b/']) assert.equal(plainPath(path), true, path);
  for (const path of ['/box/nope/../repo/out', '/a/./b', '/a/..', 'C:/carry', 'C:\\carry', 'carry', './carry', '', `/a${String.fromCharCode(0)}b`]) assert.equal(plainPath(path), false, path);
});

test('written out in part for want of time, the same directory is gone on with: what it holds already is passed over without spending time (#116)', async () => {
  const files = new MemoryFiles();
  const named = await conversation(files);
  const ids = await namedThrough(files, [FROM], named.messages);
  let asked = 0;
  const first = await writeOut(files, [FROM], ids, '/carry/part', () => asked++ < 2);
  assert.deepEqual(first, { written: 2, missing: 0, left: 2 });
  // Again into the same directory: the two there are passed over before time is looked at, and the rest written.
  asked = 0;
  assert.deepEqual(await writeOut(files, [FROM], ids, '/carry/part', () => asked++ < 2), { written: 4, missing: 0, left: 0 });
  assert.equal(asked, 2, 'time looked at for the two not there only');
});
