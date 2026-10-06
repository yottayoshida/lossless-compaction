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
import { namedThroughParts } from '../src/keep.ts';
import { PART, idOf, inputTicketText, partTicketText, ticketText } from '../src/store.ts';
import type { DirEntry, Exec } from '../src/types.ts';
import { MemoryFiles, output } from './helpers.ts';

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
  assert.match(await stopsWith({ refuse: ['grep'] }), /grep did not run to the end.*cannot start/);
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

test('a result written again while its old copy sat in the trash leaves no copy behind there', async () => {
  const files = new MemoryFiles();
  const [id] = await storeWith(files, [output('again', 40)], 3 * DAY);
  const { exec } = commands(files);
  await collect(list(files), exec, DIR, new Set(), NOW);
  // A compaction moved the same text out again: the blob is back in place, the old copy still in the trash.
  await storeWith(files, [output('again', 40)], 0);
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([id as string]), NOW + DAY), { trashed: 0, restored: 1, removed: 0 });
  assert.deepEqual([...files.files.keys()].filter((path) => path.includes('/trash/')), []);
  // And the next collection has nothing more to say about it.
  assert.deepEqual(await collect(list(files), exec, DIR, new Set([id as string]), NOW + 2 * DAY), { trashed: 0, restored: 0, removed: 0 });
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
  await collect(list(files), exec, DIR, live, NOW + DAY);
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
  assert.deepEqual([...STOP_KINDS].sort(), ['move', 'part', 'place', 'too-many', 'trash', 'unexpected', 'unread']);
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
