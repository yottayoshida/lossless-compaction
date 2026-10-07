import assert from 'node:assert/strict';
import { test } from 'node:test';

import { storeReport } from '../src/health.ts';
import { machinePath, machinesDir } from '../src/layout.ts';
import { stateIn } from '../src/lifetime.ts';
import { machineFileFrom, machineIdOf, markName, marksIn, noteMachine, readMarks, readableSessions, sharedWith, takeOffMarks, unreadMarks, type Mark } from '../src/machine.ts';
import type { DirEntry } from '../src/types.ts';
import { MemoryFiles } from './helpers.ts';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const DIR = '/home/u/.claude/lossless-compaction';
const FILE = '/home/u/.local/state/lossless-compaction/machine.json';
const ROOT = '/home/u/.claude/projects';

/**
 * `ln` and `rm -f` as they act on the files: a link onto a file that is there fails and leaves both as they were.
 * `beforeLink`, when given, is waited for before each link: a session can be held between making its file and
 * linking it. `noLn`: no command can be started, as on a host without them.
 */
function commands(files: MemoryFiles, options: { noLn?: boolean; beforeLink?: () => Promise<void> } = {}) {
  let links = 0;
  const run = async (argv: readonly string[]) => {
    const [program = '', ...args] = argv;
    if (options.noLn === true) throw new Error('no such file');
    const operands = args.filter((arg) => arg !== '--' && !arg.startsWith('-'));
    if (program.endsWith('/ln')) {
      if (operands.length === 0) return { exitCode: 1 };
      links += 1;
      await options.beforeLink?.();
      const [from = '', to = ''] = operands;
      if (files.files.has(to)) return { exitCode: 1 };
      files.files.set(to, files.files.get(from) as string);
      return { exitCode: 0 };
    }
    if (program.endsWith('/rm')) {
      for (const path of operands) files.files.delete(path);
      return { exitCode: 0 };
    }
    throw new Error(`not a command here: ${program}`);
  };
  return { run, links: () => links };
}

function list(files: MemoryFiles, refuse: readonly string[] = []) {
  return async (path: string): Promise<DirEntry[]> => {
    if (refuse.includes(path)) throw new Error('EACCES');
    return (await files.list(path)) as DirEntry[];
  };
}

test("a machine's id is kept under the home directory, outside Claude Code's, and only an absolute home has one", () => {
  assert.equal(machineFileFrom('/home/u'), FILE);
  assert.equal(machineFileFrom('/home/u/'), FILE);
  assert.equal(machineFileFrom('C:\\Users\\u'), 'C:\\Users\\u/.local/state/lossless-compaction/machine.json');
  assert.equal(machineFileFrom('home/u'), null);
  assert.equal(machineFileFrom(''), null);
  assert.equal(machineFileFrom(undefined), null);
});

test('a machine\'s id is made once and read after; two sessions making it together keep one, whichever linked first (ADR 0032)', async () => {
  const files = new MemoryFiles();
  // The second session has made its own file and links it only once the first has read its id back: a link that
  // wrote over the file would leave the two holding two ids.
  let firstDone = (): void => undefined;
  const gate = new Promise<void>((resolve) => (firstDone = resolve));
  let seen = 0;
  const { run, links } = commands(files, { beforeLink: async () => ((seen += 1) === 2 ? gate : undefined) });
  const first = machineIdOf(files, run, FILE);
  const second = machineIdOf(files, run, FILE);
  const one = await first;
  firstDone();
  const two = await second;
  assert.match(one ?? '', /^[0-9a-f]{32}$/);
  assert.equal(links(), 2, 'both made a file and linked it');
  assert.equal(one, two, 'one id for the machine');
  assert.equal(await machineIdOf(files, run, FILE), one, 'read after');
  assert.deepEqual([...files.files.keys()].filter((path) => path.endsWith('.part')), [], 'nothing left beside it');
  // A file in the way that holds no id: none, and the session marks the store by its own name.
  const other = new MemoryFiles();
  await other.write(FILE, '{"id":"not one"}');
  assert.equal(await machineIdOf(other, commands(other).run, FILE), null);
  // Where no command can be started, the id is written in place, and nothing is left beside it.
  const bare = new MemoryFiles();
  const id = await machineIdOf(bare, commands(bare, { noLn: true }).run, FILE);
  assert.match(id ?? '', /^[0-9a-f]{32}$/);
  assert.deepEqual([...bare.files.keys()], [FILE]);
});

test('a mark keeps when its machine first marked the store, when last, and its latest three sessions, newest first', async () => {
  const files = new MemoryFiles();
  const name = 'a'.repeat(32);
  await noteMachine(files, DIR, name, 's1', NOW - 3 * DAY);
  for (const [at, session] of [[NOW - 2 * DAY, 's2'], [NOW - DAY, 's3'], [NOW - DAY / 2, 's2'], [NOW, 's4']] as const) await noteMachine(files, DIR, name, session, at);
  assert.deepEqual(JSON.parse(files.files.get(machinePath(DIR, name)) as string), { first: NOW - 3 * DAY, last: NOW, sessions: ['s4', 's2', 's3'] });
  // A machine with no id marks under its session's name; a name or session of another shape is not written.
  assert.equal(markName(null, 's9'), 'session-s9');
  assert.equal(markName(name, 's9'), name);
  assert.equal(markName(null, '../x'), null);
  await noteMachine(files, DIR, '../x', 's1', NOW);
  assert.ok(![...files.files.keys()].some((path) => path.includes('..')));
});

test('the marks of every place results are read from, one for each name; a machines directory that is there but cannot be listed is not known', async () => {
  const files = new MemoryFiles();
  const OLD = '/home/u/.claude/jev-lossless-compaction';
  const [self, other] = ['a'.repeat(32), 'b'.repeat(32)];
  assert.deepEqual(await marksIn(files, list(files), [DIR, OLD]), [], 'none yet');
  await noteMachine(files, DIR, self, 's1', NOW - DAY);
  await noteMachine(files, OLD, self, 's2', NOW);
  await noteMachine(files, OLD, other, 'o1', NOW - 2 * DAY);
  await noteMachine(files, DIR, 'session-z1', 'z1', NOW - DAY);
  // Not a mark: a name of another shape. A mark whose file does not read is one of no session.
  await files.write(`${machinesDir(DIR)}/notes.json`, '{}');
  await files.write(machinePath(DIR, 'c'.repeat(32)), 'not json');
  const marks = new Map(((await marksIn(files, list(files), [DIR, OLD])) ?? []).map((mark) => [mark.name, mark]));
  assert.deepEqual([...marks.keys()].sort(), ['a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32), 'session-z1']);
  assert.deepEqual(marks.get(self), { name: self, sessions: ['s1', 's2'], first: NOW - DAY, last: NOW });
  assert.deepEqual(marks.get('c'.repeat(32)), { name: 'c'.repeat(32), sessions: [], first: 0, last: 0 });
  assert.equal(await marksIn(files, list(files, [machinesDir(OLD)]), [DIR, OLD]), null);
});

test('a mark none of whose sessions has a transcript here keeps a clean-up from running; this session\'s, and a container\'s made again over the same transcripts, do not (ADR 0032)', async () => {
  const files = new MemoryFiles();
  // This machine's transcripts: one of its earlier sessions, and one of the container it was before being made again.
  await files.write(`${ROOT}/-work/mine-1.jsonl`, '{}');
  await files.write(`${ROOT}/-other/before-1.jsonl`, '{}');
  const mark = (name: string, sessions: string[]): Mark => ({ name, sessions, first: NOW - DAY, last: NOW });
  const marks = [mark('a'.repeat(32), ['now', 'mine-1']), mark('c'.repeat(32), ['before-1', 'before-0']), mark('b'.repeat(32), ['away-1', 'away-2'])];
  const readable = await readableSessions(files, list(files), [ROOT, '/gone/projects'], marks);
  assert.deepEqual([...(readable ?? [])].sort(), ['before-1', 'mine-1']);
  const self = 'a'.repeat(32);
  assert.deepEqual(unreadMarks(marks, self, 'now', readable as Set<string>).map((one) => one.name), ['b'.repeat(32)]);
  assert.match(sharedWith(marks, self, 'now', readable) ?? '', /^the store is used from another machine as well/);
  // Its own mark alone, and a container's made again over the same transcripts: it goes on.
  assert.equal(sharedWith(marks.slice(0, 2), self, 'now', readable), null);
  // This machine's own mark is never another machine's, whichever sessions it lists: two sessions writing it together
  // may leave the one at hand out.
  assert.equal(sharedWith([mark(self, ['gone-1', 'gone-2'])], self, 'now', readable), null);
  // A mark under another name that lists this session — written while this machine had no id — is this machine's too.
  assert.equal(sharedWith([mark('c'.repeat(32), ['now'])], self, 'now', readable), null);
  // A machine that could not keep an id is seen by its session's mark; this session's own such mark is not in the way.
  assert.match(sharedWith([mark('session-away', ['away'])], null, 'now', readable) ?? '', /another machine/);
  assert.equal(sharedWith([mark('session-now', ['now'])], 'session-now', 'now', readable), null);
  // What cannot be told stops it: marks, or a place transcripts are kept in, that cannot be listed.
  assert.match(sharedWith(null, self, 'now', readable) ?? '', /could not be listed/);
  assert.equal(await readableSessions(files, list(files, [ROOT]), [ROOT], marks), null);
  assert.match(sharedWith(marks, self, 'now', null) ?? '', /could not be listed/);
});

test('the marks of other names whose transcripts are read here are taken off at a clean-up, in every place, before their transcripts go; this machine\'s own and another machine\'s stay (ADR 0032)', async () => {
  const files = new MemoryFiles();
  const OLD = '/home/u/.claude/jev-lossless-compaction';
  const [self, before, away] = ['a'.repeat(32), 'c'.repeat(32), 'b'.repeat(32)];
  // A container made again over the same transcripts, and a session's own mark where no id could be kept.
  await files.write(`${ROOT}/-work/before-1.jsonl`, '{}');
  await files.write(`${ROOT}/-work/idless-1.jsonl`, '{}');
  await noteMachine(files, DIR, self, 'now', NOW);
  await noteMachine(files, DIR, before, 'before-1', NOW - DAY);
  await noteMachine(files, OLD, before, 'before-1', NOW - DAY);
  await noteMachine(files, DIR, 'session-idless-1', 'idless-1', NOW - DAY);
  await noteMachine(files, DIR, away, 'away-1', NOW - DAY);
  const marks = (await marksIn(files, list(files), [DIR, OLD])) as Mark[];
  const readable = (await readableSessions(files, list(files), [ROOT], marks)) as Set<string>;
  const taken = readMarks(marks, self, 'now', readable).map((mark) => mark.name).sort();
  assert.deepEqual(taken, [before, 'session-idless-1'].sort());
  const removed: string[] = [];
  await takeOffMarks(async (path) => (removed.push(path), files.files.delete(path), undefined), [DIR, OLD], taken);
  const left = ((await marksIn(files, list(files), [DIR, OLD])) as Mark[]).map((mark) => mark.name).sort();
  assert.deepEqual(left, [self, away].sort(), 'its own and another machine\'s stay');
  assert.ok(removed.includes(`${OLD}/machines/${before}.json`), 'taken off in every place');
  // Once taken off, the container's transcripts going later stop nothing; the other machine's mark still does.
  files.files.delete(`${ROOT}/-work/before-1.jsonl`);
  const after = (await marksIn(files, list(files), [DIR, OLD])) as Mark[];
  assert.deepEqual(unreadMarks(after, self, 'now', (await readableSessions(files, list(files), [ROOT], after)) as Set<string>).map((mark) => mark.name), [away]);
  // A name of another shape is not removed.
  const odd: string[] = [];
  await takeOffMarks(async (path) => void odd.push(path), [DIR], ['../x', 'notes']);
  assert.deepEqual(odd, []);
});

test('/lossless-store lists the machines, this one first, says whose transcripts are not read here, and how the clean-up goes on (ADR 0032)', async () => {
  const files = new MemoryFiles();
  const gc = await stateIn(files, list(files), [DIR]);
  const mark = (name: string, last: number): Mark => ({ name, sessions: ['x'], first: NOW - 9 * DAY, last });
  const [self, read, away] = ['a'.repeat(32), 'c'.repeat(32), 'b'.repeat(32)];
  const text = storeReport([], gc, NOW, false, { marks: [mark(away, NOW - 2 * DAY), mark(self, NOW), mark(read, NOW - DAY)], self, unread: [away] });
  const block = text.slice(text.indexOf('machines the store is used from:'));
  assert.ok(block.startsWith(`machines the store is used from:\n  this one, ${self}: first 2026-10-11 12:00 UTC, last 2026-10-20 12:00 UTC\n`));
  assert.ok(block.includes(`  ${read}: first 2026-10-11 12:00 UTC, last 2026-10-19 12:00 UTC; its transcripts are read here\n`));
  assert.ok(block.includes(`  ${away}: first 2026-10-11 12:00 UTC, last 2026-10-18 12:00 UTC; its transcripts are not read here\n`));
  assert.ok(block.includes('removing machines/<its name>.json in each place results are kept in that has it'));
  // None in the way: no word of how to go on.
  const clear = storeReport([], gc, NOW, false, { marks: [mark(self, NOW), mark(read, NOW - DAY)], self, unread: [] });
  assert.ok(!clear.includes('The clean-up does not run while'));
  assert.ok(storeReport([], gc, NOW, false, { marks: null, self, unread: null }).includes('  their marks could not be listed'));
});
