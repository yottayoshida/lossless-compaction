import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FIRST_WAIT_MS,
  GC_EVERY_MS,
  GRACE_MS,
  YOUNG_MS,
  collect,
  dayOf,
  idsIn,
  liveIds,
  noteRoot,
  noteRun,
  noteStopped,
  planGc,
  restore,
  putBackNamed,
  restoreThroughParts,
  RETRY_MS,
  SENTINEL_ID,
  SET_FILES,
  noteTried,
  partIds,
  rootFor,
  sentinelOf,
  STOP_KINDS,
  stateIn,
  ticketIds,
  trashIn,
  whyNotNow,
  writeSentinel,
} from '../src/lifetime.ts';
import { store } from '../src/blobs.ts';
import { namedThroughParts } from '../src/keep.ts';
import { blobPath } from '../src/layout.ts';
import { PART, idOf, inputTicketText, partTicketText, recall, ticketText } from '../src/store.ts';
import type { List } from '../src/lifetime.ts';
import type { DirEntry, Exec } from '../src/types.ts';
import { DiskFiles, MemoryFiles, output } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const DIR = '/home/u/.claude/lossless-compaction';
const ROOT = '/home/u/.claude/projects';

const blobEntry = (id: string, age: number): DirEntry => ({ name: `${id}.txt`, kind: 'file', mtimeMs: NOW - age, isLink: false });
const hex = (seed: string) => seed.repeat(64).slice(0, 64);

/** The host's commands, run against `files` the way grep, mv, mkdir and rm treat them. */
function commands(
  files: MemoryFiles,
  options: { grepExit?: number; truncated?: boolean; refuse?: readonly string[]; dropSentinel?: boolean; mvExit?: number } = {},
) {
  const ran: string[][] = [];
  const exec: Exec = async (argv) => {
    ran.push([...argv]);
    const [program = '', ...args] = argv;
    const name = program.slice(program.lastIndexOf('/') + 1);
    if (options.refuse?.includes(name)) throw new Error(`cannot start ${program}`);
    const operands = args.slice(args.indexOf('--') + 1);
    if (name === 'grep') {
      // Each operand is a directory searched below, or a file read as it is.
      const lines: string[] = [];
      for (const [path, text] of files.files) {
        const named = operands.some((operand) => path === operand || path.startsWith(`${operand}/`));
        if (named && path.endsWith('.jsonl')) lines.push(...(text.match(/[0-9a-f]{64}/g) ?? []));
      }
      if (options.dropSentinel) lines.splice(0, lines.length, ...lines.filter((line) => line !== SENTINEL_ID));
      return { exitCode: options.grepExit ?? (lines.length > 0 ? 0 : 1), stdout: lines.map((line) => `${line}\n`).join(''), truncated: options.truncated === true };
    }
    if (name === 'mkdir') {
      // -p: every directory up to it, as the real one makes them.
      for (const dir of operands) {
        for (let cut = dir.length; cut > 0; cut = dir.lastIndexOf('/', cut - 1)) files.dirs.add(dir.slice(0, cut));
      }
      return { exitCode: 0, stdout: '', truncated: false };
    }
    if (name === 'mv') {
      // A mv that fails on every path, as a full disk or a refused permission makes BSD mv exit 1.
      if (options.mvExit !== undefined) return { exitCode: options.mvExit, stdout: '', truncated: false };
      const dest = (operands.pop() ?? '').replace(/\/$/, '');
      let exitCode = 0;
      for (const source of operands) {
        const text = files.files.get(source);
        const target = `${dest}/${source.slice(source.lastIndexOf('/') + 1)}`;
        if (text === undefined || !files.dirs.has(dest)) {
          exitCode = 1;
          continue;
        }
        if (files.files.has(target)) continue;
        files.files.delete(source);
        files.files.set(target, text);
        const mtime = files.mtimes.get(source);
        if (mtime !== undefined) files.mtimes.set(target, mtime);
      }
      return { exitCode, stdout: '', truncated: false };
    }
    if (name === 'rm') {
      for (const path of operands) files.files.delete(path);
      return { exitCode: 0, stdout: '', truncated: false };
    }
    return { exitCode: 127, stdout: '', truncated: false };
  };
  return { exec, ran };
}

const list = (files: MemoryFiles) => (path: string) => files.list(path);
const existsIn = (files: MemoryFiles) => async (path: string) => files.stat(path).then(() => true, () => false);
const SENTINEL = sentinelOf(DIR);

/** A store holding `texts` as moved-out results, each `age` old. */
async function storeWith(files: MemoryFiles, texts: readonly string[], age: number): Promise<string[]> {
  const ids: string[] = [];
  for (const text of texts) {
    const id = await idOf(text);
    await files.write(`${DIR}/blobs/${id}.txt`, text);
    await files.write(`${DIR}/index/${id}.json`, JSON.stringify({ bytes: text.length, tool: 'Read' }));
    files.mtimes.set(`${DIR}/blobs/${id}.txt`, NOW - age);
    ids.push(id);
  }
  files.dirs.add(`${DIR}/blobs`);
  files.dirs.add(`${DIR}/index`);
  return ids;
}

test('a result over a day old that no transcript names goes to the trash; a young one and a named one stay', () => {
  const [old, young, named] = [hex('a'), hex('b'), hex('c')];
  const plan = planGc([blobEntry(old, 2 * DAY), blobEntry(young, YOUNG_MS - 1), blobEntry(named, 30 * DAY)], [], new Set([named]), NOW);
  assert.deepEqual(plan, { toTrash: [old], toRestore: [], toRemove: [] });
});

test('the trash is aged by the day of its directory, not by the file: a move keeps a file old', () => {
  const id = hex('d');
  // Moved today, though written a month ago: not removed.
  assert.deepEqual(planGc([], [{ day: dayOf(NOW), id }], new Set(), NOW).toRemove, []);
  // Moved more than the grace period ago, and named by none: removed.
  assert.deepEqual(planGc([], [{ day: dayOf(NOW - GRACE_MS - DAY), id }], new Set(), NOW).toRemove, [{ day: dayOf(NOW - GRACE_MS - DAY), id }]);
  // Named again: put back, whatever its day.
  assert.deepEqual(planGc([], [{ day: dayOf(NOW - GRACE_MS - DAY), id }], new Set([id]), NOW), {
    toTrash: [],
    toRestore: [{ day: dayOf(NOW - GRACE_MS - DAY), id }],
    toRemove: [],
  });
});

test('a link or a stray name in blobs/ is never a result to move', () => {
  const link: DirEntry = { name: `${hex('e')}.txt`, kind: 'other', mtimeMs: 0, isLink: true };
  const stray: DirEntry = { name: 'notes.txt', kind: 'file', mtimeMs: 0, isLink: false };
  assert.deepEqual(planGc([link, stray], [], new Set(), NOW).toTrash, []);
});

test('the ids in transcripts are read per project; a place that is gone is dropped, one that cannot be read stops it all', async () => {
  const files = new MemoryFiles();
  const [a, b] = [hex('1'), hex('2')];
  await files.write(`${ROOT}/-proj-one/s1.jsonl`, `{"text":"recall with x id ${a}"}`);
  await files.write(`${ROOT}/-proj-two/s2.jsonl`, `{"text":"[found] id ${b}"}`);
  await files.write(`${ROOT}/-proj-two/s2.txt`, `${hex('9')}`);
  await writeSentinel(files, DIR);
  const live = await liveIds(files, list(files), commands(files).exec, existsIn(files), [ROOT, '/gone/projects'], SENTINEL);
  assert.ok(!('stop' in live));
  assert.deepEqual([...live.ids].sort(), [a, b], 'the sentinel is not an id in use');
  assert.deepEqual(live.roots, [ROOT]);

  const stopsWith = async (options: Parameters<typeof commands>[1]) =>
    JSON.stringify(await liveIds(files, list(files), commands(files, options).exec, existsIn(files), [ROOT], SENTINEL));
  assert.match(await stopsWith({ grepExit: 2 }), /did not read all/);
  // A grep ended by a signal reads as 1, which is also "nothing matched": with the sentinel, nothing-matched cannot happen.
  assert.match(await stopsWith({ grepExit: 1 }), /did not read all/);
  assert.match(await stopsWith({ dropSentinel: true }), /did not read all/);
  assert.match(await stopsWith({ truncated: true }), /more than one search/);
  assert.match(await stopsWith({ refuse: ['grep'] }), /no grep could be run/);
  // Each with its kind, which is what is recorded (ADR 0016).
  const kindOf = async (options: Parameters<typeof commands>[1]) =>
    (JSON.parse(await stopsWith(options)) as { kind?: string }).kind;
  assert.equal(await kindOf({ grepExit: 2 }), 'unread');
  assert.equal(await kindOf({ dropSentinel: true }), 'unread');
  assert.equal(await kindOf({ refuse: ['grep'] }), 'unread');
  assert.equal(await kindOf({ truncated: true }), 'too-many');
});

test('a place that is there but cannot be looked at or listed stops it all: its conversations may still be resumed', async () => {
  const files = new MemoryFiles();
  await files.write(`${ROOT}/-proj/s.jsonl`, hex('3'));
  await writeSentinel(files, DIR);
  const refusing = async (path: string) => {
    if (path === ROOT) throw new Error('EACCES');
    return files.list(path);
  };
  assert.deepEqual(await liveIds(files, refusing, commands(files).exec, existsIn(files), [ROOT], SENTINEL), { stop: `${ROOT} could not be listed`, kind: 'place' });
  // There, by exists, but stat fails as it would on EACCES or a disk gone away: not taken for gone.
  const blind = Object.assign(Object.create(files) as MemoryFiles, { stat: async () => Promise.reject(new Error('EACCES')) });
  assert.deepEqual(await liveIds(blind, list(files), commands(files).exec, existsIn(files), [ROOT], SENTINEL), { stop: `${ROOT} could not be looked at`, kind: 'place' });
});

test('with every recorded place gone, nothing is collected: an empty set would name nothing in use', async () => {
  const files = new MemoryFiles();
  await writeSentinel(files, DIR);
  assert.match(JSON.stringify(await liveIds(files, list(files), commands(files).exec, existsIn(files), ['/gone/a', '/gone/b'], SENTINEL)), /none of the places/);
});

test('a project directory that is a link stops it all: a search does not follow it', async () => {
  const files = new MemoryFiles();
  await files.write(`${ROOT}/-real/s.jsonl`, hex('4'));
  files.links.set(`${ROOT}/-linked`, '/elsewhere');
  await writeSentinel(files, DIR);
  assert.match(JSON.stringify(await liveIds(files, list(files), commands(files).exec, existsIn(files), [ROOT], SENTINEL)), /is a link/);
});

test('a recorded place that is a link is read where it leads, once where it is recorded both ways, and a clean-up keeps what only its transcripts name (ADR 0039)', async () => {
  const files = new MemoryFiles();
  const elsewhere = '/disk/projects';
  const [named, unnamed] = (await storeWith(files, [output('named behind a link', 40), output('named by none', 40)], 3 * DAY)) as [string, string];
  await files.write(`${elsewhere}/-proj/s.jsonl`, `"${named}"`);
  files.links.set(ROOT, elsewhere);
  await writeSentinel(files, DIR);
  const { exec, ran } = commands(files);
  // Recorded under the link by an earlier version, and where it leads by this one.
  const live = await liveIds(files, list(files), exec, existsIn(files), [ROOT, elsewhere], SENTINEL);
  assert.ok(!('stop' in live), JSON.stringify(live));
  assert.deepEqual(live.roots, [elsewhere]);
  assert.ok(live.ids.has(named));
  assert.equal(ran.filter((argv) => argv[0]?.endsWith('/grep') && argv.includes('-aohE')).length, 1, 'searched once');
  assert.deepEqual(await collect(list(files), exec, DIR, live.ids, NOW), { trashed: 1, restored: 0, removed: 0 });
  assert.ok(files.files.has(`${DIR}/blobs/${named}.txt`), 'what only the transcripts behind the link name went to the trash');
  assert.ok(!files.files.has(`${DIR}/blobs/${unnamed}.txt`));
});

test('a recorded place that is there and leads nowhere the host can tell stops it all', async () => {
  class Unresolved extends MemoryFiles {
    override async realPath(): Promise<string | null> {
      return null;
    }
  }
  const files = new Unresolved();
  await files.write(`${ROOT}/-proj/s.jsonl`, hex('5'));
  await writeSentinel(files, DIR);
  assert.deepEqual(await liveIds(files, list(files), commands(files).exec, existsIn(files), [ROOT], SENTINEL), { stop: `${ROOT} could not be resolved`, kind: 'place' });
});

test('a trash that is there and cannot be listed stops a collection before anything moves; one not made yet is an empty one', async () => {
  const files = new MemoryFiles();
  await storeWith(files, [output('old, named by none', 40)], 3 * DAY);
  files.dirs.add(`${DIR}/trash`);
  const refusing = async (path: string) => {
    if (path === `${DIR}/trash`) throw new Error('EACCES');
    return files.list(path);
  };
  assert.equal(await trashIn(refusing, DIR), null);
  const before = files.snapshot();
  assert.deepEqual(await collect(refusing, commands(files).exec, DIR, new Set(), NOW), { stop: `the trash of ${DIR} could not be listed`, kind: 'trash' });
  assert.deepEqual(await putBackNamed(files, refusing, commands(files).exec, [DIR], new Set()), { stop: `the trash of ${DIR} could not be listed`, kind: 'trash' });
  assert.deepEqual(files.snapshot(), before, 'something moved');
  // A store whose first clean-up has not made a trash yet goes on.
  const fresh = new MemoryFiles();
  await storeWith(fresh, [output('old, named by none', 40)], 3 * DAY);
  assert.deepEqual(await trashIn(list(fresh), DIR), []);
  assert.deepEqual(await collect(list(fresh), commands(fresh).exec, DIR, new Set(), NOW), { trashed: 1, restored: 0, removed: 0 });
});

test('a collection that runs to its end removes what a write left in tmp/ a day ago or more, and nothing else there; one that stops leaves it (#119)', async () => {
  const files = new MemoryFiles();
  await storeWith(files, [output('old, named by none', 40)], 3 * DAY);
  const tmp = `${DIR}/tmp`;
  const old = `${tmp}/${hex('a')}.txt.0f1e2d3c-4b5a-4968-8776-655443322110.part`;
  const young = `${tmp}/${hex('a')}.json.11111111-2222-4333-8444-555555555555.part`;
  const notOurs = `${tmp}/notes.txt`;
  const linked = `${tmp}/${hex('b')}.txt.22222222-3333-4444-8555-666666666666.part`;
  for (const path of [old, young, notOurs, '/elsewhere/kept.txt']) await files.write(path, 'left');
  files.links.set(linked, '/elsewhere/kept.txt');
  files.mtimes.set(old, NOW - DAY);
  files.mtimes.set(young, NOW - DAY + 1);
  files.mtimes.set(notOurs, NOW - 30 * DAY);
  files.mtimes.set(linked, NOW - 30 * DAY);
  // A collection that stops moves nothing, and removes nothing from tmp/ either.
  assert.ok('stop' in (await collect(list(files), commands(files, { refuse: ['mv'] }).exec, DIR, new Set(), NOW)));
  assert.ok(files.files.has(old));
  assert.deepEqual(await collect(list(files), commands(files).exec, DIR, new Set(), NOW), { trashed: 1, restored: 0, removed: 0 });
  assert.ok(!files.files.has(old), 'a write left a day ago stays');
  assert.ok(files.files.has(young), 'a write that may still be going was removed');
  assert.ok(files.files.has(notOurs) && files.links.has(linked) && files.files.has('/elsewhere/kept.txt'), 'what is not a write of its own was removed');
  // A first write that stopped before it made blobs/ left its part all the same: it goes.
  const first = new MemoryFiles();
  await first.write(old, 'left');
  first.mtimes.set(old, NOW - DAY);
  assert.deepEqual(await collect(list(first), commands(first).exec, DIR, new Set(), NOW), { trashed: 0, restored: 0, removed: 0 });
  assert.ok(!first.files.has(old), 'a store with no blobs/ keeps what a write left');
  // A tmp/ that is a link is no place a write puts anything: nothing is removed through it.
  const through = new MemoryFiles();
  await storeWith(through, [output('kept', 40)], 0);
  const there = `/elsewhere/tmp/${hex('c')}.txt.44444444-3333-4444-8555-666666666666.part`;
  await through.write(there, 'not ours');
  through.mtimes.set(there, NOW - 30 * DAY);
  through.links.set(tmp, '/elsewhere/tmp');
  // As the host and rm do: a path through the link lands where it leads.
  const leads = (path: string) => (path === tmp || path.startsWith(`${tmp}/`) ? `/elsewhere/tmp${path.slice(tmp.length)}` : path);
  through.dirs.add('/elsewhere/tmp');
  const listThrough = (path: string) => through.list(leads(path));
  const { exec: plain } = commands(through);
  const execThrough: Exec = (argv, timeoutMs) => plain(argv[0]?.endsWith('/rm') ? argv.map(leads) : argv, timeoutMs);
  await collect(listThrough, execThrough, DIR, new Set(), NOW);
  assert.ok(through.files.has(there), 'removed through a link where tmp/ stands');
});

test('a collection moves what no transcript names to the trash, and a week later removes it', async () => {
  const files = new MemoryFiles();
  const [kept, dropped] = await storeWith(files, [output('kept', 40), output('dropped', 40)], 3 * DAY);
  const { exec } = commands(files);

  const first = await collect(list(files), exec, DIR, new Set([kept as string]), NOW);
  assert.deepEqual(first, { trashed: 1, restored: 0, removed: 0 });
  assert.ok(files.files.has(`${DIR}/blobs/${kept}.txt`) && files.files.has(`${DIR}/index/${kept}.json`));
  const day = dayOf(NOW);
  assert.ok(files.files.has(`${DIR}/trash/${day}/${dropped}.txt`) && files.files.has(`${DIR}/trash/${day}/${dropped}.json`));
  assert.ok(!files.files.has(`${DIR}/blobs/${dropped}.txt`) && !files.files.has(`${DIR}/index/${dropped}.json`));

  // Still in the trash the next day: not removed yet.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([kept as string]), NOW + DAY), { trashed: 0, restored: 0, removed: 0 });
  // A week and a day later, named by none: removed, blob and entry.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([kept as string]), NOW + GRACE_MS + DAY), {
    trashed: 0,
    restored: 0,
    removed: 1,
  });
  assert.deepEqual([...files.files.keys()].filter((path) => path.includes('/trash/')), []);
});

test('a result in the trash that a transcript names again goes back at the next collection', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('back', 40)], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([id as string]), NOW + GRACE_MS + DAY), { trashed: 0, restored: 1, removed: 0 });
  assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`) && files.files.has(`${DIR}/index/${id}.json`));
});

test('a result written again while its old copy sat in the trash leaves no copy behind there, once no clean-up can still be moving into its day', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('again', 40)], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  // A compaction moved the same text out again: the blob is back in place, the old copy still in the trash.
  await storeWith(files, [output('again', 40)], 0);
  const inTrash = () => [...files.files.keys()].filter((path) => path.includes('/trash/')).sort();
  // The next day the copy stays: a clean-up that names it no more could still be moving into that day (ADR 0038).
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([id as string]), NOW + DAY), { trashed: 0, restored: 1, removed: 0 });
  assert.deepEqual(inTrash(), [`${DIR}/trash/${dayOf(NOW)}/${id}.json`, `${DIR}/trash/${dayOf(NOW)}/${id}.txt`]);
  // Two days on, none can: it goes.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([id as string]), NOW + 2 * DAY), { trashed: 0, restored: 1, removed: 0 });
  assert.deepEqual(inTrash(), []);
  // And the next collection has nothing more to say about it.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([id as string]), NOW + 3 * DAY), { trashed: 0, restored: 0, removed: 0 });
});

/** A clean-up's commands, the first that `at` picks held back until `go`; `reached` settles when it is. */
function holding(exec: Exec, at: (argv: readonly string[]) => boolean) {
  let reach = () => {};
  let go = () => {};
  const reached = new Promise<void>((resolve) => (reach = resolve));
  const released = new Promise<void>((resolve) => (go = resolve));
  let held = false;
  const gated: Exec = async (argv, timeoutMs) => {
    if (!held && at(argv)) {
      held = true;
      reach();
      await released;
    }
    return exec(argv, timeoutMs);
  };
  return { exec: gated, reached, go };
}

const isMv = (argv: readonly string[]) => argv[0]?.endsWith('/mv') === true;
const isRm = (argv: readonly string[]) => argv[0]?.endsWith('/rm') === true;

/** Whether `recall` gives `id` back once it is put back from the trash, as the hook does when it is asked for (I7). */
async function recalledAfterAll(files: MemoryFiles, exec: Exec, id: string): Promise<boolean> {
  await restore(list(files), exec, DIR, new Set([id]));
  return !('error' in (await recall(files, [DIR], id)));
}

test('clean-ups at once, one that names a result and others that do not, leave it to recall: a copy in the trash goes only from a day none still moves into (ADR 0038)', async () => {
  // One that does not name it has moved its entry to the trash and is about to move its text; one that names it puts
  // the entry back, finds the text still in place, and takes what the trash holds of it for a copy; the first moves the
  // text into the trash; the second removes its copy, which is now all there is of it.
  {
    const files = new MemoryFiles();
    const [named] = (await storeWith(files, [output('named again, two at once', 40)], 3 * DAY)) as [string];
    const { exec } = commands(files);
    const first = holding(exec, (argv) => isMv(argv) && argv.includes(`${DIR}/blobs/${named}.txt`));
    const firstDone = collect(list(files), first.exec, DIR, new Set(), NOW);
    await first.reached;
    const second = holding(exec, isRm);
    const secondDone = collect(list(files), second.exec, DIR, new Set([named]), NOW);
    await Promise.race([second.reached, secondDone]);
    first.go();
    await firstDone;
    second.go();
    await secondDone;
    assert.ok(await recalledAfterAll(files, exec, named), 'two clean-ups at once lost what one of them names');
  }
  // Three: one that does not name it moves it all to the trash; one that names it puts it all back and, finding it in
  // place, takes what it put back for copies; a third that does not name it moves it to the trash again; the second
  // removes its copies, which are now all there is of it.
  {
    const files = new MemoryFiles();
    const [named] = (await storeWith(files, [output('named again, three at once', 40)], 3 * DAY)) as [string];
    const { exec } = commands(files);
    await collect(list(files), exec, DIR, new Set(), NOW);
    const second = holding(exec, isRm);
    const secondDone = collect(list(files), second.exec, DIR, new Set([named]), NOW);
    await Promise.race([second.reached, secondDone]);
    await collect(list(files), exec, DIR, new Set(), NOW);
    second.go();
    await secondDone;
    assert.ok(await recalledAfterAll(files, exec, named), 'three clean-ups at once lost what one of them names');
  }
});

test('three clean-ups at once, in any order of what they list and run, leave what one of them names to recall', async () => {
  // Two that do not name it and one that does, from three starting points: in place and old, in today's trash, and in
  // the trash two days back with a copy in place. Each list and each command waits its turn, and the turns are dealt
  // at random, by seed, a thousand times.
  for (let seed = 1; seed <= 1000; seed += 1) {
    const files = new MemoryFiles();
    const [named, other] = (await storeWith(files, [output(`named ${seed}`, 20), output(`other ${seed}`, 20)], 3 * DAY)) as [string, string];
    const { exec } = commands(files);
    if (seed % 3 !== 0) await collect(list(files), exec, DIR, new Set(), seed % 3 === 1 ? NOW : NOW - 2 * DAY);
    if (seed % 3 === 2) await storeWith(files, [output(`named ${seed}`, 20)], 3 * DAY);
    let state = seed;
    const pick = (count: number) => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state % count;
    };
    const waiting: (() => void)[] = [];
    const turn = () => new Promise<void>((resolve) => waiting.push(resolve));
    const gatedList: List = async (path) => {
      await turn();
      return files.list(path);
    };
    const gatedExec: Exec = async (argv, timeoutMs) => {
      await turn();
      return exec(argv, timeoutMs);
    };
    let running = 3;
    const done = [new Set<string>(), new Set([named]), new Set<string>()].map((live) =>
      collect(gatedList, gatedExec, DIR, live, NOW).finally(() => (running -= 1)),
    );
    while (running > 0) {
      await new Promise((resolve) => setImmediate(resolve));
      if (waiting.length > 0) waiting.splice(pick(waiting.length), 1)[0]?.();
    }
    await Promise.all(done);
    assert.ok(await recalledAfterAll(files, exec, named), `seed ${seed}: lost what one clean-up names`);
    // What none names is not a week in the trash: it is somewhere still.
    assert.ok([...files.files.keys()].some((path) => path.endsWith(`/${other}.txt`)), `seed ${seed}: removed what was not due`);
  }
});

test('what a clean-up is about to remove from the trash stays where a compaction stores it again, or puts it back whole, before the removal', async () => {
  // Not covered: a removal between the two moves of a putting back, which leaves the text without its entry. Only
  // what no transcript named when the clean-up searched is removed, which docs/invariants.md does not promise to keep
  // ("Transcripts the clean-up does not know of").
  for (const meanwhile of ['stored again', 'put back'] as const) {
    const files = new MemoryFiles();
    const text = output(`removed ${meanwhile}`, 40);
    const [id] = (await storeWith(files, [text], 30 * DAY)) as [string];
    const { exec } = commands(files);
    // In the trash past its grace, named by none when the clean-up searched.
    await collect(list(files), exec, DIR, new Set(), NOW - GRACE_MS - 2 * DAY);
    const cleanUp = holding(exec, isRm);
    const done = collect(list(files), cleanUp.exec, DIR, new Set(), NOW);
    await cleanUp.reached;
    // A compaction names it again: it stores the same text, or puts it back from the trash first.
    if (meanwhile === 'stored again') await store(files, DIR, 'Read', text);
    else await restore(list(files), exec, DIR, new Set([id]));
    cleanUp.go();
    await done;
    assert.ok(!('error' in (await recall(files, [DIR], id))), `${meanwhile}: removed`);
  }
});

test('a text stored again has its time renewed, so a clean-up within a day of the new use does not move it; where no command starts it is not', async () => {
  const text = output('stored again', 40);
  const id = await idOf(text);
  const hour = 60 * 60 * 1000;
  for (const moves of [true, false]) {
    const files = new DiskFiles(moves);
    files.now = () => NOW;
    assert.ok(!('reason' in (await store(files, DIR, 'Read', text))));
    // Stored three days ago, and named by no transcript since.
    files.mtimes.set(blobPath(DIR, id), NOW - 3 * DAY);
    assert.ok(!('reason' in (await store(files, DIR, 'Read', text))));
    const blobs = await files.list(`${DIR}/blobs`);
    const toTrash = planGc(blobs, [], new Set(), NOW + hour).toTrash;
    if (moves) {
      assert.deepEqual(files.renewed, [blobPath(DIR, id)]);
      assert.deepEqual(toTrash, [], 'a text stored again an hour ago went to the trash');
    } else {
      // Windows: no `touch` can be started, and the day is counted from the first time it was stored (docs/invariants.md).
      assert.deepEqual(toTrash, [id]);
    }
  }
});

test('an entry whose move back failed stays in the trash, though its blob went back', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('entry', 40)], 3 * DAY);
  const day = dayOf(NOW);
  const base = commands(files);
  await collect(list(files), base.exec, DIR, new Set(), NOW);
  // Putting back: the blob moves, the entry's mv fails and exits 1, as BSD mv does on any failure.
  const failingEntry: Exec = async (argv, timeoutMs) =>
    argv[0]?.endsWith('/mv') && argv.some((arg) => arg.endsWith('.json')) ? { exitCode: 1, stdout: '', truncated: false } : base.exec(argv, timeoutMs);
  await collect(list(files), failingEntry, DIR, new Set([id as string]), NOW + DAY);
  assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`), 'the blob is back');
  assert.ok(files.files.has(`${DIR}/trash/${day}/${id}.json`), 'the entry is not lost');
  // The next time it can be put back.
  assert.equal(await restore(list(files), base.exec, DIR, new Set([id as string])), 1);
  assert.ok(files.files.has(`${DIR}/index/${id}.json`));
});

test('what a collection reports is what moved: a mv that exits 1 having moved nothing reports nothing', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('stuck', 40)], 3 * DAY);
  assert.deepEqual(await collect(list(files), commands(files, { mvExit: 1 }).exec, DIR, new Set(), NOW), { trashed: 0, restored: 0, removed: 0 });
  assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`));
});

test('a collection cut off before its end is tried again a day later, not a week', async () => {
  const files = new MemoryFiles();
  files.dirs.add(`${DIR}/roots`);
  await noteRoot(files, DIR, ROOT, NOW - FIRST_WAIT_MS);
  const before = await stateIn(files, list(files), [DIR]);
  await noteTried(files, DIR, before, NOW);
  const tried = await stateIn(files, list(files), [DIR]);
  assert.match(whyNotNow(tried, NOW + RETRY_MS - 1)?.text ?? '', /tried less than a day ago/);
  assert.equal(whyNotNow(tried, NOW + RETRY_MS), null);
});

test('recall puts back from the trash what it is asked for, even a result whose move stopped halfway', async () => {
  const files = new MemoryFiles();
  const [whole, half] = await storeWith(files, [output('whole', 40), output('half', 40)], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  // As if the second move had not happened: the entry went to the trash, the blob stayed.
  const day = dayOf(NOW);
  files.files.set(`${DIR}/blobs/${half}.txt`, files.files.get(`${DIR}/trash/${day}/${half}.txt`) as string);
  files.files.delete(`${DIR}/trash/${day}/${half}.txt`);
  assert.deepEqual(
    (await trashIn(list(files), DIR))?.map((item) => item.id).sort(),
    [whole, half].sort(),
    'an entry alone counts as in the trash',
  );

  assert.equal(await restore(list(files), exec, DIR, new Set([whole as string, half as string])), 2);
  for (const id of [whole, half]) {
    assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`), `blob ${id}`);
    assert.ok(files.files.has(`${DIR}/index/${id}.json`), `entry ${id}`);
  }
});

test('a collection that cannot move, empty or make the trash stops and says so, and leaves results where they are', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('stays', 40)], 3 * DAY);
  const refused = await collect(list(files), commands(files, { refuse: ['mv', 'mkdir'] }).exec, DIR, new Set(), NOW);
  assert.ok('stop' in refused);
  assert.equal(refused.kind, 'trash');
  const unmoved = await collect(list(files), commands(files, { refuse: ['mv'] }).exec, DIR, new Set(), NOW);
  assert.ok('stop' in unmoved);
  assert.equal(unmoved.kind, 'move');
  assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`));
});

test('the commands are run by absolute path, with -- before every path', async () => {
  const files = new MemoryFiles();
  await storeWith(files, [output('x', 40)], 3 * DAY);
  const { exec, ran } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  for (const argv of ran) {
    assert.match(argv[0] ?? '', /^\/(usr\/)?bin\//);
    assert.ok(argv.includes('--'), argv.join(' '));
  }
});

test('nothing is collected until a place is known, for a week after the first was found, or within a week of the last run', async () => {
  const files = new MemoryFiles();
  files.dirs.add(DIR);
  assert.match(whyNotNow(await stateIn(files, list(files), [DIR]), NOW)?.text ?? '', /no place/);
  assert.equal(whyNotNow(await stateIn(files, list(files), [DIR]), NOW)?.kind, 'no-place');

  await noteRoot(files, DIR, ROOT, NOW);
  await noteRoot(files, DIR, ROOT, NOW + DAY); // Written once: the first time stands.
  files.dirs.add(`${DIR}/roots`);
  const state = await stateIn(files, list(files), [DIR]);
  assert.deepEqual(state, { roots: [ROOT], firstSeen: NOW, lastRun: 0, tried: 0, tries: 0, stopped: null });
  assert.match(whyNotNow(state, NOW + FIRST_WAIT_MS - 1)?.text ?? '', /first week/);
  // /lossless-store tells this one apart to say the day it ends: by its kind, so the words can change.
  assert.equal(whyNotNow(state, NOW + FIRST_WAIT_MS - 1)?.kind, 'first-week');
  assert.equal(whyNotNow(state, NOW + FIRST_WAIT_MS), null);

  await noteRun(files, DIR, NOW + FIRST_WAIT_MS);
  const ran = await stateIn(files, list(files), [DIR]);
  assert.match(whyNotNow(ran, NOW + FIRST_WAIT_MS + GC_EVERY_MS - 1)?.text ?? '', /less than a week/);
  assert.equal(whyNotNow(ran, NOW + FIRST_WAIT_MS + GC_EVERY_MS - 1)?.kind, 'ran');
  assert.equal(whyNotNow(ran, NOW + FIRST_WAIT_MS + GC_EVERY_MS), null);
});

test('places recorded by every configuration that shares the store are read, from each directory read', async () => {
  const files = new MemoryFiles();
  const OLD = '/home/u/.claude/jev-lossless-compaction';
  for (const dir of [DIR, OLD]) files.dirs.add(`${dir}/roots`);
  await noteRoot(files, DIR, ROOT, NOW);
  await noteRoot(files, OLD, '/other/config/projects', NOW - DAY);
  const state = await stateIn(files, list(files), [DIR, OLD]);
  assert.deepEqual(state.roots.sort(), ['/home/u/.claude/projects', '/other/config/projects']);
  assert.equal(state.firstSeen, NOW - DAY);
});

test("the place of this session's transcript is recorded only when a project directory holds it", async () => {
  const files = new MemoryFiles();
  await files.write(`${ROOT}/-repo/abc-123.jsonl`, '{}');
  files.dirs.add(ROOT);
  assert.equal(await rootFor(files, list(files), '/home/u/.claude', 'abc-123'), ROOT);
  // A projects directory that is a link is looked into where it leads, and recorded as named, so that a clean-up
  // follows it wherever it is turned (ADR 0039). Claude Code 2.1.292 lists through a link; the transcript is looked
  // for where it lands all the same, so that it does not rest on that.
  class Unlisted extends MemoryFiles {
    override async list(path: string) {
      if (path === '/home/u/.claude/projects') throw new Error('listed through the link, not where it lands');
      return super.list(path);
    }
  }
  const linked = new Unlisted();
  await linked.write('/disk/projects/-proj/abc-123.jsonl', '{}');
  linked.links.set('/home/u/.claude/projects', '/disk/projects');
  assert.equal(await rootFor(linked, list(linked), '/home/u/.claude', 'abc-123'), '/home/u/.claude/projects');
  assert.equal(await rootFor(files, list(files), '/home/u/.claude', 'other'), null);
  assert.equal(await rootFor(files, list(files), '/home/u/.claude', '../x'), null);
  assert.equal(await rootFor(new MemoryFiles(), list(new MemoryFiles()), '/home/u/.claude', 'abc-123'), null);
});

test('the ids of tickets in a conversation, in either place a ticket stands', async () => {
  const id = await idOf('x');
  const line = ticketText({ tool: 'Read', bytes: 1, id });
  const ids = ticketIds([
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't', tool: 'Read', input: {}, text: line }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't', text: line, isError: false }] },
    { role: 'user', text: `not a ticket ${hex('f')}`, toolUses: [] },
  ]);
  assert.deepEqual([...ids], [id]);
});

test('the ids of kept parts, named in the text of the message put after a summary', async () => {
  const id = await idOf('a part');
  const line = partTicketText({ part: 1, parts: 1, first: 1, last: 4, bytes: 6, id });
  const ids = ticketIds([{ role: 'user', text: `The conversation before this point is kept.\n${line}`, toolUses: [] }]);
  assert.deepEqual([...ids], [id]);
});

/** A kept part holding `text`, stored as a compaction stores one. */
async function storePart(files: MemoryFiles, text: string, age: number): Promise<string> {
  const [id] = await storeWith(files, [text], age);
  await files.write(`${DIR}/index/${id}.json`, JSON.stringify({ bytes: text.length, tool: PART }));
  return id as string;
}

test('a kept part the conversation names comes back from the trash, and with it what only that part names, through earlier parts (#73)', async () => {
  const files = new MemoryFiles();
  const [result] = await storeWith(files, [output('read once', 40)], 3 * DAY);
  const older = await storePart(files, `[call Read t1] {"file_path":"/p/a"}\n[result t1]\n${ticketText({ tool: 'Read', bytes: 40, id: result as string })}`, 3 * DAY);
  const newer = await storePart(files, `kept before\n${partTicketText({ part: 1, parts: 1, first: 1, last: 4, bytes: 9, id: older })}`, 3 * DAY);
  const { exec } = commands(files);
  // A collection that did not see the transcript naming them: all three go.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set(), NOW), { trashed: 3, restored: 0, removed: 0 });

  const conversation = [{ role: 'user' as const, text: partTicketText({ part: 1, parts: 1, first: 1, last: 8, bytes: 9, id: newer }), toolUses: [] }];
  assert.equal(await restoreThroughParts(files, list(files), exec, [DIR], ticketIds(conversation), partIds(conversation)), 3);
  for (const id of [newer, older, result]) assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`) && files.files.has(`${DIR}/index/${id}.json`), `${id} is back`);
  assert.deepEqual(await trashIn(list(files), DIR), []);
});

test('a part named again while it is in the trash keeps what only it names: both go back before a collection counts what is named', async () => {
  const files = new MemoryFiles();
  const [result] = await storeWith(files, [output('read once', 40)], 3 * DAY);
  const part = await storePart(files, `[call Read t1] {"file_path":"/p/a"}\n[result t1]\n${ticketText({ tool: 'Read', bytes: 40, id: result as string })}`, 3 * DAY);
  const { exec } = commands(files);
  // A collection that did not see the transcript naming the part, its disk not mounted say: both go to the trash.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set(), NOW), { trashed: 2, restored: 0, removed: 0 });
  const live = new Set([part]);
  // The hole: with its entry in the trash the part is not known for one, and what it names is not counted as named.
  assert.deepEqual(await namedThroughParts(files, [DIR], live), live);
  // Put back first, the part is read, what it names is named, and a collection past the week removes nothing.
  const inTrash = await putBackNamed(files, list(files), exec, [DIR], live);
  assert.deepEqual(inTrash, new Set());
  const named = await namedThroughParts(files, [DIR], live, inTrash as Set<string>);
  assert.ok(!('stop' in named) && named.has(result as string));
  assert.deepEqual(await collect(list(files), exec, DIR, named as Set<string>, NOW + GRACE_MS + 2 * DAY), { trashed: 0, restored: 0, removed: 0 });
  assert.ok(files.files.has(`${DIR}/blobs/${result}.txt`) && files.files.has(`${DIR}/blobs/${part}.txt`));
});

test('where what is named cannot be put back from the trash, the collection is stopped before it counts what is named', async () => {
  const files = new MemoryFiles();
  const [result] = await storeWith(files, [output('read once', 40)], 3 * DAY);
  const inner = await storePart(files, ticketText({ tool: 'Read', bytes: 40, id: result as string }), 3 * DAY);
  const outer = await storePart(files, `kept before\n${partTicketText({ part: 1, parts: 1, first: 1, last: 4, bytes: 9, id: inner })}`, 3 * DAY);
  await collect(list(files), commands(files).exec, DIR, new Set(), NOW);
  // A mv that moves nothing: the part named stays in the trash, and nothing may be collected against what it would have named.
  const stuck = await putBackNamed(files, list(files), commands(files, { mvExit: 1 }).exec, [DIR], new Set([outer]));
  assert.deepEqual(stuck, new Set([result, inner, outer]));
  const trashSaid = (id: string) => ({ stop: `${id}: it is named and could not be put back from the trash; /lossless-store says how to go on`, kind: 'move', unread: [{ id, why: 'in-trash' }] });
  assert.deepEqual(await namedThroughParts(files, [DIR], new Set([outer]), stuck as Set<string>), trashSaid(outer));
  // The part named comes back and the part it names does not: stopped at the inner one, which only the outer names.
  const moved = commands(files).exec;
  const onlyOuter: Exec = async (argv, timeoutMs) => (argv.some((arg) => arg.includes(inner) || arg.includes(result as string)) ? { exitCode: 1, stdout: '', truncated: false } : moved(argv, timeoutMs));
  const half = await putBackNamed(files, list(files), onlyOuter, [DIR], new Set([outer]));
  assert.deepEqual(half, new Set([result, inner]));
  assert.ok(files.files.has(`${DIR}/index/${outer}.json`));
  assert.deepEqual(await namedThroughParts(files, [DIR], new Set([outer]), half as Set<string>), trashSaid(inner));
  // A trash that cannot be listed stops it too.
  const unlisted = async (path: string) => {
    if (path.includes('/trash/')) throw new Error('EACCES');
    return list(files)(path);
  };
  assert.deepEqual(await putBackNamed(files, unlisted, moved, [DIR], new Set([outer])), { stop: `the trash of ${DIR} could not be listed`, kind: 'trash' });
});

test('a result in place and in the trash at once does not stop a collection: it is in place, and the copy in the trash is removed', async () => {
  const files = new MemoryFiles();
  const text = output('read twice', 40);
  const [id] = await storeWith(files, [text], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  // The same text is stored again while its first copy is in the trash, and a transcript names it.
  await storeWith(files, [text], 0);
  const live = new Set([id as string]);
  const inTrash = await putBackNamed(files, list(files), exec, [DIR], live);
  assert.deepEqual(inTrash, live);
  assert.deepEqual(await namedThroughParts(files, [DIR], live, inTrash as Set<string>), live);
  // Two days after it went there, when no clean-up can still be moving into that day (ADR 0038).
  await collect(list(files), exec, DIR, live, NOW + 2 * DAY);
  assert.deepEqual(await trashIn(list(files), DIR), []);
  assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`));
  // An id that is named and nowhere, a commit's hash say, stops nothing.
  assert.deepEqual(await namedThroughParts(files, [DIR], new Set(['f'.repeat(64)]), new Set()), new Set(['f'.repeat(64)]));
});

test('a part in place still has what it names put back: a part put back by an earlier version came back alone', async () => {
  const files = new MemoryFiles();
  const [result] = await storeWith(files, [output('read once', 40)], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  const part = await storePart(files, ticketText({ tool: 'Read', bytes: 40, id: result as string }), 0);
  assert.equal(await restoreThroughParts(files, list(files), exec, [DIR], new Set([part])), 1);
  assert.ok(files.files.has(`${DIR}/blobs/${result}.txt`));
});

test('a result that is not a part is not read: only the parts the conversation names are followed', async () => {
  const files = new MemoryFiles();
  // A third, named by nothing, stays in the trash: the walk is not cut short by an empty trash.
  const [gone, kept] = await storeWith(files, [output('gone', 40), output('kept', 40), output('elsewhere', 40)], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set([kept as string]), NOW);
  const reads: string[] = [];
  const read = files.read.bind(files);
  files.read = async (path: string) => {
    reads.push(path);
    return read(path);
  };
  assert.equal(await restoreThroughParts(files, list(files), exec, [DIR], new Set([gone as string, kept as string]), new Set()), 1);
  assert.deepEqual(reads, []);
  assert.ok(files.files.has(`${DIR}/blobs/${gone}.txt`));
});

test('a part kept in place names an earlier part that alone went to the trash: both it and what it names come back', async () => {
  const files = new MemoryFiles();
  const [result] = await storeWith(files, [output('read once', 40)], 3 * DAY);
  const older = await storePart(files, ticketText({ tool: 'Read', bytes: 40, id: result as string }), 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  const newer = await storePart(files, partTicketText({ part: 1, parts: 1, first: 1, last: 4, bytes: 9, id: older }), 0);
  assert.equal(await restoreThroughParts(files, list(files), exec, [DIR], new Set([newer]), new Set([newer])), 2);
  for (const id of [older, result]) assert.ok(files.files.has(`${DIR}/blobs/${id}.txt`), `${id} is back`);
});

test('a part read from a second place puts back what it names in the first', async () => {
  const OTHER = '/home/u/.config/claude/lossless-compaction';
  const files = new MemoryFiles();
  const [result] = await storeWith(files, [output('read once', 40)], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  const text = ticketText({ tool: 'Read', bytes: 40, id: result as string });
  const part = await idOf(text);
  await files.write(`${OTHER}/blobs/${part}.txt`, text);
  await files.write(`${OTHER}/index/${part}.json`, JSON.stringify({ bytes: text.length, tool: PART }));
  files.dirs.add(`${OTHER}/blobs`);
  files.dirs.add(`${OTHER}/index`);
  assert.equal(await restoreThroughParts(files, list(files), exec, [OTHER, DIR], new Set([part]), new Set([part])), 1);
  assert.ok(files.files.has(`${DIR}/blobs/${result}.txt`));
});

test('nothing is read to put back while the trash is empty', async () => {
  const files = new MemoryFiles();
  const part = await storePart(files, 'a part', 0);
  let reads = 0;
  const read = files.read.bind(files);
  files.read = async (path: string) => {
    reads += 1;
    return read(path);
  };
  assert.equal(await restoreThroughParts(files, list(files), commands(files).exec, [DIR], new Set([part])), 0);
  assert.equal(reads, 0);
});

test('the ticket of an input is one of a conversation\'s, at the top of the input and inside a list of edits', async () => {
  const written = await idOf('the file as it was written');
  const edited = await idOf('the lines put in');
  const ids = ticketIds([
    {
      role: 'assistant',
      text: '',
      toolUses: [
        { tool_use_id: 'w', tool: 'Write', input: { file_path: '/work/out.ts', content: inputTicketText({ tool: 'Write', field: 'content', bytes: 26, id: written }) } },
        { tool_use_id: 'e', tool: 'MultiEdit', input: { file_path: '/work/out.ts', edits: [{ old_string: 'a', new_string: inputTicketText({ tool: 'MultiEdit', field: 'new_string', bytes: 16, id: edited }) }] } },
        // An id that is not on a ticket is the agent's own words, and names nothing kept.
        { tool_use_id: 'b', tool: 'Bash', input: { command: `echo ${hex('f')}` } },
      ],
    },
  ]);
  assert.deepEqual([...ids].sort(), [written, edited].sort());
});

test('what grep prints is read a line at a time, and only 64-hex lines count', () => {
  assert.deepEqual([...idsIn(`${hex('a')}\nnot\n${hex('b')}\n${hex('a')}\n`)].sort(), [hex('a'), hex('b')]);
});

test('the clean-up counts its tries since it last ended, keeps the kind of its last stop, never its words, and an end clears both (ADR 0016)', async () => {
  const files = new MemoryFiles();
  files.dirs.add(`${DIR}/roots`);
  await noteRoot(files, DIR, ROOT, NOW - FIRST_WAIT_MS);
  const read = () => stateIn(files, list(files), [DIR]);

  // A try is counted when it starts: one a short session cut off counts too.
  const first = await noteTried(files, DIR, await read(), NOW);
  assert.deepEqual({ tries: (await read()).tries, stopped: (await read()).stopped }, { tries: 1, stopped: null });
  await noteStopped(files, DIR, first, 'unread', NOW + 1000);
  assert.deepEqual((await read()).stopped, { at: NOW + 1000, kind: 'unread' });
  // The next try carries the count and the last stop on; cut off, it leaves them as they were.
  await noteTried(files, DIR, await read(), NOW + DAY);
  assert.deepEqual({ tries: (await read()).tries, stopped: (await read()).stopped }, { tries: 2, stopped: { at: NOW + 1000, kind: 'unread' } });
  const third = await noteTried(files, DIR, await read(), NOW + 2 * DAY);
  await noteStopped(files, DIR, third, 'move', NOW + 2 * DAY + 1000);
  assert.deepEqual({ tries: (await read()).tries, stopped: (await read()).stopped }, { tries: 3, stopped: { at: NOW + 2 * DAY + 1000, kind: 'move' } });
  // What is recorded holds a kind, never a path or a message.
  const written = files.files.get(`${DIR}/gc.json`) ?? '';
  assert.ok(!written.includes('/') && !/could not|grep/.test(written), written);

  await noteRun(files, DIR, NOW + 3 * DAY);
  assert.deepEqual({ tries: (await read()).tries, stopped: (await read()).stopped }, { tries: 0, stopped: null });
});

test('what the record of the clean-up holds is read as a count and a kind of the list, or not at all', async () => {
  const files = new MemoryFiles();
  const OLD = '/home/u/.claude/jev-lossless-compaction';
  const write = (dir: string, value: unknown) => files.write(`${dir}/gc.json`, JSON.stringify(value));
  // A kind not in the list, words in its place, a count that is not one: none is read.
  await write(DIR, { lastRun: 0, tried: NOW, tries: -2, stopped: { at: NOW, kind: '/home/u/work could not be listed' } });
  assert.deepEqual(await stateIn(files, list(files), [DIR]), { roots: [], firstSeen: 0, lastRun: 0, tried: NOW, tries: 0, stopped: null });
  await write(DIR, { lastRun: 0, tried: NOW, tries: 1.5, stopped: 'unread' });
  assert.deepEqual((await stateIn(files, list(files), [DIR])).tries, 0);
  // Two places: the tries of the latest end, which the five of a place that never ended are not, and the latest stop.
  // A stop before the last end is over.
  await write(DIR, { lastRun: NOW - DAY, tried: NOW, tries: 2, stopped: { at: NOW, kind: 'trash' } });
  await write(OLD, { lastRun: 0, tried: NOW - 2 * DAY, tries: 5, stopped: { at: NOW - 2 * DAY, kind: 'unread' } });
  const both = await stateIn(files, list(files), [DIR, OLD]);
  assert.deepEqual({ tries: both.tries, stopped: both.stopped }, { tries: 2, stopped: { at: NOW, kind: 'trash' } });
  await write(DIR, { lastRun: NOW + DAY, tried: NOW + DAY, tries: 0, stopped: null });
  assert.equal((await stateIn(files, list(files), [DIR, OLD])).stopped, null);
  // The tries are those of the latest end: one place that ended lately and tried none, one that ended long ago and tried five, is none.
  assert.equal((await stateIn(files, list(files), [DIR, OLD])).tries, 0);
  await write(OLD, { lastRun: NOW + DAY, tried: NOW + 2 * DAY, tries: 3, stopped: null });
  assert.equal((await stateIn(files, list(files), [DIR, OLD])).tries, 3, 'the same end in both: the more');
  assert.deepEqual([...STOP_KINDS].sort(), ['move', 'part', 'place', 'shared', 'too-many', 'trash', 'unexpected', 'unread']);
});

test("a stop is not recorded over what another session wrote since this try started: its end, or its own try, stands", async () => {
  const files = new MemoryFiles();
  files.dirs.add(`${DIR}/roots`);
  await noteRoot(files, DIR, ROOT, NOW - FIRST_WAIT_MS);
  const read = () => stateIn(files, list(files), [DIR]);
  // This try starts; another session's ends while it searches; then this one stops.
  const mine = await noteTried(files, DIR, await read(), NOW);
  await noteRun(files, DIR, NOW + 60_000);
  await noteStopped(files, DIR, mine, 'unread', NOW + 120_000);
  assert.deepEqual(await read(), { roots: [ROOT], firstSeen: NOW - FIRST_WAIT_MS, lastRun: NOW + 60_000, tried: NOW + 60_000, tries: 0, stopped: null });
  // Another session tried after this one started: its count stands too.
  const first = await noteTried(files, DIR, await read(), NOW + DAY);
  await noteTried(files, DIR, await read(), NOW + DAY + 1000);
  await noteStopped(files, DIR, first, 'move', NOW + DAY + 2000);
  assert.deepEqual({ tries: (await read()).tries, stopped: (await read()).stopped }, { tries: 2, stopped: null });
});

test('a kept part whose entry does not read, its text the one stored, is read as a part: what it names comes back from the trash and is counted as named (ADR 0033)', async () => {
  const files = new MemoryFiles();
  const [result] = await storeWith(files, [output('read once', 40)], 3 * DAY);
  const part = await storePart(files, `[call Read t1] {"file_path":"/p/a"}\n[result t1]\n${ticketText({ tool: 'Read', bytes: 40, id: result as string })}`, 3 * DAY);
  const { exec } = commands(files);
  // The result alone goes to the trash, the part named by a transcript staying; then its entry stops reading.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([part]), NOW), { trashed: 1, restored: 0, removed: 0 });
  files.files.set(`${DIR}/index/${part}.json`, '');
  assert.equal(await restoreThroughParts(files, list(files), exec, [DIR], new Set(), new Set([part])), 1);
  assert.ok(files.files.has(`${DIR}/blobs/${result}.txt`), 'what it names is back');
  const named = await namedThroughParts(files, [DIR], new Set([part]));
  assert.ok(!('stop' in named) && named.has(result as string), 'and counted as named');
  // An entry of another shape than every version writes reads no better: the text is read all the same.
  files.files.set(`${DIR}/index/${part}.json`, '{}');
  const shaped = await namedThroughParts(files, [DIR], new Set([part]));
  assert.ok(!('stop' in shaped) && shaped.has(result as string), 'an entry of another shape too');
  // Its text changed too: not read, and the collection stops on it.
  files.files.set(`${DIR}/blobs/${part}.txt`, 'not what was stored');
  const stopped = await namedThroughParts(files, [DIR], new Set([part]));
  assert.ok('stop' in stopped);
  assert.deepEqual(stopped.unread, [{ id: part, why: 'text-changed' }]);
});

test('a search that does not come back in its time is not run again with the other grep: the collection stops after one (#118)', async () => {
  const files = new MemoryFiles();
  await files.write(`${ROOT}/-proj/s.jsonl`, `"${'a'.repeat(64)}"`);
  await writeSentinel(files, DIR);
  const { exec: plain } = commands(files);
  const started: string[][] = [];
  // The small search a grep is chosen by comes back; the search of a project does not, as one out of its time.
  const outOfTime: Exec = async (argv, timeoutMs) => {
    started.push([...argv]);
    if (argv.includes('-aohE')) throw new Error('still running after 300000 ms');
    return plain(argv, timeoutMs);
  };
  const live = await liveIds(files, list(files), outOfTime, existsIn(files), [ROOT], SENTINEL);
  assert.ok('stop' in live && live.kind === 'unread' && /did not run to the end/.test(live.stop), JSON.stringify(live));
  assert.equal(started.filter((argv) => argv.includes('-aohE')).length, 1, 'searched exactly once');

  // Where /usr/bin/grep cannot start, /bin/grep is chosen, and reads the project.
  const binOnly: Exec = async (argv, timeoutMs) => {
    if (argv[0] === '/usr/bin/grep') throw new Error('cannot start /usr/bin/grep');
    return plain(argv, timeoutMs);
  };
  const read = await liveIds(files, list(files), binOnly, existsIn(files), [ROOT], SENTINEL);
  assert.ok(!('stop' in read) && read.grep === '/bin/grep' && read.ids.has('a'.repeat(64)), JSON.stringify(read));

  // Where no grep starts, the line says what the host said; and the grep is chosen only where there is something to
  // search, so places all gone stop it as they did, for what they are.
  const { exec: none } = commands(files, { refuse: ['grep'] });
  assert.match(JSON.stringify(await liveIds(files, list(files), none, existsIn(files), [ROOT], SENTINEL)), /no grep could be run \(\/usr\/bin\/grep: cannot start .*; \/bin\/grep: cannot start/);
  assert.equal((await liveIds(files, list(files), none, existsIn(files), ['/gone/projects'], SENTINEL) as { kind?: string }).kind, 'place');
});

/** Ids for the tests of sets: as many as asked, each a different 64-hex string. */
const idsFor = (count: number) => Array.from({ length: count }, (_, i) => (i + 1).toString(16).padStart(4, '0').repeat(16));

test('a project directory is read a set at a time however large it grows: no search is handed more than a set may hold, and none runs past its time (#118, ADR 0042)', async () => {
  const files = new MemoryFiles();
  const ids = idsFor(5);
  for (const [at, id] of ids.entries()) await files.write(`${ROOT}/-big/s${at}.jsonl`, `"${id}"`);
  await writeSentinel(files, DIR);
  // The host says each transcript is 100 MiB; a search handed more than 300 MiB of them does not end in its time.
  const sized: List = async (path) => (await files.list(path)).map((entry) => (entry.name.endsWith('.jsonl') ? { ...entry, size: 100 * 1024 * 1024 } : entry));
  const { exec: plain } = commands(files);
  const searches: string[][] = [];
  const timed: Exec = async (argv, timeoutMs) => {
    if (argv.includes('-aohE') || argv.includes('-rahoE')) {
      searches.push([...argv]);
      const operands = argv.slice(argv.indexOf('--') + 1);
      const read = [...files.files.keys()].filter((path) => path.endsWith('.jsonl') && path !== SENTINEL && operands.some((operand) => path === operand || path.startsWith(`${operand}/`)));
      if (read.length * 100 > 300) throw new Error('still running after 300000 ms');
    }
    return plain(argv, timeoutMs);
  };
  const live = await liveIds(files, sized, timed, existsIn(files), [ROOT], SENTINEL);
  assert.ok(!('stop' in live), JSON.stringify(live));
  assert.deepEqual([...live.ids].sort(), [...ids].sort());
  // 256 MiB a set: two of 100 MiB, two, then one.
  assert.equal(searches.length, 3);
});

test('a search whose output the host cut is read again in halves, and a transcript whose ids alone are cut stops it (#118, ADR 0042)', async () => {
  const files = new MemoryFiles();
  const ids = idsFor(4);
  for (const [at, id] of ids.entries()) await files.write(`${ROOT}/-proj/s${at}.jsonl`, `"${id}"`);
  await writeSentinel(files, DIR);
  const { exec: plain } = commands(files);
  // The host keeps two lines of what a command prints and says it cut the rest.
  const cutting: Exec = async (argv, timeoutMs) => {
    const ran = await plain(argv, timeoutMs);
    const lines = ran.stdout.split('\n').filter((line) => line !== '');
    return lines.length > 2 ? { ...ran, stdout: `${lines.slice(0, 2).join('\n')}\n`, truncated: true } : ran;
  };
  const live = await liveIds(files, list(files), cutting, existsIn(files), [ROOT], SENTINEL);
  assert.ok(!('stop' in live), JSON.stringify(live));
  assert.deepEqual([...live.ids].sort(), [...ids].sort());
  // One transcript holding three ids prints more than the host keeps with the sentinel's: it stops, naming the transcript.
  await files.write(`${ROOT}/-proj/s0.jsonl`, `"${ids[0]}" "${ids[1]}" "${ids[2]}"`);
  const cut = await liveIds(files, list(files), cutting, existsIn(files), [ROOT], SENTINEL);
  assert.ok('stop' in cut && cut.kind === 'too-many' && cut.stop.includes(`${ROOT}/-proj/s0.jsonl`), JSON.stringify(cut));
});

test('a transcript removed after it was listed is passed over, and one still there that cannot be read stops it (#118, ADR 0042)', async () => {
  const files = new MemoryFiles();
  const [a, b, c] = idsFor(3) as [string, string, string];
  await files.write(`${ROOT}/-proj/a.jsonl`, `"${a}"`);
  await files.write(`${ROOT}/-proj/b.jsonl`, `"${b}"`);
  await files.write(`${ROOT}/-proj/c.jsonl`, `"${c}"`);
  await writeSentinel(files, DIR);
  const { exec: plain } = commands(files);
  // b goes as the search runs, as Claude Code removes an old transcript: grep reads the others and exits 2.
  let removed = false;
  const removing: Exec = async (argv, timeoutMs) => {
    if (!removed && argv.includes('-aohE')) {
      removed = true;
      files.files.delete(`${ROOT}/-proj/b.jsonl`);
      return { ...(await plain(argv, timeoutMs)), exitCode: 2 };
    }
    return plain(argv, timeoutMs);
  };
  const live = await liveIds(files, list(files), removing, existsIn(files), [ROOT], SENTINEL);
  assert.ok(!('stop' in live), JSON.stringify(live));
  assert.deepEqual([...live.ids].sort(), [a, c].sort());
  // Every one still listed, and grep cannot read one of them: it stops, as before.
  const unreadable: Exec = async (argv, timeoutMs) => (argv.includes('-aohE') ? { ...(await plain(argv, timeoutMs)), exitCode: 2 } : plain(argv, timeoutMs));
  const stopped = await liveIds(files, list(files), unreadable, existsIn(files), [ROOT], SENTINEL);
  assert.ok('stop' in stopped && stopped.kind === 'unread', JSON.stringify(stopped));
});

test('the transcripts read are those grep -r read: in directories below and hidden ones, not through a link nor in other names; a directory below that cannot be listed stops it (#118, ADR 0042)', async () => {
  const files = new MemoryFiles();
  const [top, below, hidden, other, linked] = idsFor(5) as [string, string, string, string, string];
  await files.write(`${ROOT}/-proj/s.jsonl`, `"${top}"`);
  await files.write(`${ROOT}/-proj/s/subagents/agent-1.jsonl`, `"${below}"`);
  await files.write(`${ROOT}/-proj/.hidden/h.jsonl`, `"${hidden}"`);
  await files.write(`${ROOT}/-proj/notes.txt`, `"${other}"`);
  await files.write('/elsewhere/x.jsonl', `"${linked}"`);
  files.links.set(`${ROOT}/-proj/linked`, '/elsewhere');
  await writeSentinel(files, DIR);
  const { exec } = commands(files);
  const live = await liveIds(files, list(files), exec, existsIn(files), [ROOT], SENTINEL);
  assert.ok(!('stop' in live), JSON.stringify(live));
  assert.deepEqual([...live.ids].sort(), [top, below, hidden].sort());
  const refusing: List = async (path) => (path === `${ROOT}/-proj/s` ? Promise.reject(new Error('EACCES')) : files.list(path));
  const stopped = await liveIds(files, refusing, exec, existsIn(files), [ROOT], SENTINEL);
  assert.ok('stop' in stopped && stopped.kind === 'unread' && stopped.stop.includes(`${ROOT}/-proj/s could not be listed`), JSON.stringify(stopped));
});

test('a session directory removed while a clean-up reads is passed over (#118, ADR 0042)', async () => {
  const files = new MemoryFiles();
  const [kept, main, sub] = idsFor(3) as [string, string, string];
  await files.write(`${ROOT}/-proj/a.jsonl`, `"${kept}"`);
  await files.write(`${ROOT}/-proj/s.jsonl`, `"${main}"`);
  await files.write(`${ROOT}/-proj/s/subagents/agent-1.jsonl`, `"${sub}"`);
  await writeSentinel(files, DIR);
  const { exec: plain } = commands(files);
  // Session s goes, its directory with it, after it was listed: grep reads what is left and exits 2.
  let removed = false;
  const removing: Exec = async (argv, timeoutMs) => {
    if (!removed && argv.includes('-aohE')) {
      removed = true;
      for (const path of [...files.files.keys()]) if (path.startsWith(`${ROOT}/-proj/s`)) files.files.delete(path);
      for (const path of [...files.dirs]) if (path.startsWith(`${ROOT}/-proj/s/`) || path === `${ROOT}/-proj/s`) files.dirs.delete(path);
      return { ...(await plain(argv, timeoutMs)), exitCode: 2 };
    }
    return plain(argv, timeoutMs);
  };
  const live = await liveIds(files, list(files), removing, existsIn(files), [ROOT], SENTINEL);
  assert.ok(!('stop' in live), JSON.stringify(live));
  assert.deepEqual([...live.ids], [kept]);
});

test('a directory still listed that cannot be listed again after grep could not read in it stops the clean-up (#118, ADR 0042)', async () => {
  const files = new MemoryFiles();
  await files.write(`${ROOT}/-proj/s/subagents/agent-1.jsonl`, `"${idsFor(1)[0]}"`);
  await writeSentinel(files, DIR);
  const { exec: plain } = commands(files);
  const failing: Exec = async (argv, timeoutMs) => (argv.includes('-aohE') ? { ...(await plain(argv, timeoutMs)), exitCode: 2 } : plain(argv, timeoutMs));
  // Listed once, as it is found; refused when listed again.
  let seen = 0;
  const once: List = async (path) => {
    if (path === `${ROOT}/-proj/s/subagents` && (seen += 1) > 1) throw new Error('EACCES');
    return files.list(path);
  };
  const stopped = await liveIds(files, once, failing, existsIn(files), [ROOT], SENTINEL);
  assert.ok('stop' in stopped && stopped.kind === 'unread', JSON.stringify(stopped));
});

test('a project of many small transcripts is read in sets of at most SET_FILES, so that no command line is too long to start (#118, ADR 0042)', async () => {
  const files = new MemoryFiles();
  const ids = idsFor(SET_FILES + 1);
  for (const [at, id] of ids.entries()) await files.write(`${ROOT}/-runs/r${at}.jsonl`, `"${id}"`);
  await writeSentinel(files, DIR);
  const { exec: plain } = commands(files);
  let searches = 0;
  // Handed more files than a set holds, the command cannot start, as one past the system's limit on arguments.
  const bounded: Exec = async (argv, timeoutMs) => {
    if (argv.includes('-aohE')) {
      searches += 1;
      if (argv.length - argv.indexOf('--') - 2 > SET_FILES) throw new Error('spawn E2BIG');
    }
    return plain(argv, timeoutMs);
  };
  const live = await liveIds(files, list(files), bounded, existsIn(files), [ROOT], SENTINEL);
  assert.ok(!('stop' in live), JSON.stringify(live).slice(0, 200));
  assert.equal(live.ids.size, SET_FILES + 1);
  assert.equal(searches, 2);
});
