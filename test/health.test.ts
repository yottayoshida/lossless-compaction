import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LATE_MS, STOP_SAID, countStore, lateLine, lateSince, oldestResult, sizeText, storeReport } from '../src/health.ts';
import { FIRST_WAIT_MS, STOP_KINDS, noteRoot, noteStopped, noteTried, stateIn } from '../src/lifetime.ts';
import { PART } from '../src/store.ts';
import { MemoryFiles } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const DIR = '/home/u/.claude/lossless-compaction';
const OLD = '/home/u/.claude/jev-lossless-compaction';
const ROOT = '/home/u/.claude/projects';
// What a result might hold, and what an old record might hold: neither may reach the answer.
const MARK = 'sk-the-secret-in-a-result';
const PATH_MARK = '/Users/someone/work/acme-internal';

const hex = (seed: string) => seed.repeat(64).slice(0, 64);

/** Files a count may not open: a result, anything in the trash or in tmp/. */
class Guarded extends MemoryFiles {
  override async read(path: string): Promise<string> {
    if (/\/(blobs|trash|tmp)\//.test(path)) throw new Error(`a result was read: ${path}`);
    return super.read(path);
  }
}

async function put(files: MemoryFiles, path: string, text: string, at: number): Promise<void> {
  await files.write(path, text);
  files.mtimes.set(path, at);
}

/** A store of three results — a tool's, a kept part, the plugin's own — one with no entry, a trash of two days and a stale write in tmp/. */
async function storeIn(files: MemoryFiles, dir: string): Promise<void> {
  const results: [string, string, string | null][] = [
    [hex('a'), `${MARK} in a tool's output`, 'Bash'],
    [hex('b'), 'a kept part of a conversation', PART],
    [hex('c'), 'what recall returned', 'mcp__jev-lossless-compaction__recall'],
    // Another MCP server's result is a tool result, whatever its name starts with.
    [hex('7'), 'what another server returned', 'mcp__n8n__get_workflow'],
    [hex('d'), 'a result whose entry was never written', null],
  ];
  for (const [i, [id, text, tool]] of results.entries()) {
    await put(files, `${dir}/blobs/${id}.txt`, text, NOW - (i + 1) * DAY);
    if (tool !== null) await files.write(`${dir}/index/${id}.json`, JSON.stringify({ bytes: text.length, tool }));
  }
  await put(files, `${dir}/trash/2026-10-10/${hex('e')}.txt`, `${MARK} trashed`, NOW - 10 * DAY);
  await put(files, `${dir}/trash/2026-10-10/${hex('e')}.json`, '{"bytes":1,"tool":"Read"}', NOW - 10 * DAY);
  await put(files, `${dir}/trash/2026-10-12/${hex('f')}.txt`, 'xx', NOW - 8 * DAY);
  await put(files, `${dir}/tmp/${hex('9')}.txt.1.part`, `${MARK} half`, NOW - 2 * DAY);
  await put(files, `${dir}/tmp/${hex('7')}.json.3.part`, '{"by', NOW - 3 * DAY);
  await put(files, `${dir}/tmp/${hex('8')}.txt.2.part`, 'fresh', NOW - 1000);
  for (const sub of ['', '/blobs', '/index', '/trash', '/trash/2026-10-10', '/trash/2026-10-12', '/tmp', '/roots']) files.dirs.add(`${dir}${sub}`);
}

const list = (files: MemoryFiles) => (path: string) => files.list(path);
const bytes = (text: string) => Buffer.byteLength(text);

test('a place is counted from the listing and the entries: by what each result was kept from, the trash by day, and tmp/, without opening a result', async () => {
  const files = new Guarded();
  await storeIn(files, DIR);
  const counted = await countStore(files, list(files), DIR, NOW);
  assert.ok(!('missing' in counted));
  assert.deepEqual(counted.results, {
    count: 5,
    bytes: [`${MARK} in a tool's output`, 'a kept part of a conversation', 'what recall returned', 'what another server returned', 'a result whose entry was never written']
      .map(bytes)
      .reduce((a, b) => a + b),
    oldest: NOW - 5 * DAY,
    newest: NOW - DAY,
  });
  assert.deepEqual(counted.from, {
    results: { count: 2, bytes: bytes(`${MARK} in a tool's output`) + bytes('what another server returned') },
    parts: { count: 1, bytes: bytes('a kept part of a conversation') },
    own: { count: 1, bytes: bytes('what recall returned') },
    unknown: { count: 1, bytes: bytes('a result whose entry was never written') },
  });
  assert.equal(counted.entries.count, 4);
  assert.deepEqual(counted.trash, [
    { day: '2026-10-10', count: 2, bytes: bytes(`${MARK} trashed`) + bytes('{"bytes":1,"tool":"Read"}') },
    { day: '2026-10-12', count: 1, bytes: 2 },
  ]);
  // Three in tmp/, two over a day old.
  assert.deepEqual(counted.tmp, { count: 3, bytes: bytes(`${MARK} half`) + bytes('{"by') + bytes('fresh'), stale: 2 });
  assert.deepEqual(await countStore(files, list(files), '/nowhere', NOW), { dir: '/nowhere', missing: true });
});

test('/lossless-store says each place and the clean-up, names no path but the places, and nothing a result or an old record held', async () => {
  const files = new Guarded();
  await storeIn(files, DIR);
  await storeIn(files, OLD);
  await noteRoot(files, DIR, ROOT, NOW - FIRST_WAIT_MS - 3 * DAY);
  // Two tries since the last end, the second stopped; and an old record's words, which are not read.
  const first = await noteTried(files, DIR, await stateIn(files, list(files), [DIR]), NOW - 2 * DAY);
  await noteStopped(files, DIR, first, 'unread', NOW - 2 * DAY + 60_000);
  const second = await noteTried(files, DIR, await stateIn(files, list(files), [DIR]), NOW - DAY / 2);
  await noteStopped(files, DIR, second, 'place', NOW - DAY / 2 + 60_000);
  await files.write(`${OLD}/gc.json`, JSON.stringify({ lastRun: 0, tried: 0, why: `${PATH_MARK} could not be listed`, stopped: { at: NOW, kind: PATH_MARK } }));

  const counted = [await countStore(files, list(files), DIR, NOW), await countStore(files, list(files), OLD, NOW)];
  const gc = await stateIn(files, list(files), [DIR, OLD]);
  const text = storeReport(counted, gc, NOW, false);

  assert.ok(!text.includes(MARK) && !text.includes(PATH_MARK), text);
  assert.ok(!text.includes(ROOT), 'the place transcripts are kept in is not named');
  // Every absolute path in it, where a word starts with a slash: the two places, nothing else.
  const paths = [...text.matchAll(/(?:^|\s)(\/[^\s,:;]+)/g)].map((one) => one[1]);
  assert.deepEqual([...new Set(paths)].sort(), [OLD, DIR].sort());
  assert.match(text, /^Results are kept in 2 places:/);
  // Claude Code puts the plugin's name in front of it: it is not said twice.
  assert.ok(!text.startsWith('lossless-compaction'));
  assert.match(text, /results: 5 \(\d+ B\), 2026-10-15 to 2026-10-19/);
  // A part is counted the same whether it was kept before a summary or in place of one (ADR 0019): the line speaks of neither.
  assert.match(text, /kept from: tool results 2 \(\d+ B\), kept conversations 1 \(\d+ B\), lossless-compaction's own tools 1 \(\d+ B\), no readable entry 1 \(\d+ B\)/);
  assert.ok(!text.includes('before a summary'));
  assert.match(text, /trash: 3 \(\d+ B\) files, by day moved there: 2026-10-10 2 \(\d+ B\), 2026-10-12 1 \(2 B\)/);
  assert.match(text, /tmp\/: 3 \(\d+ B\) files, 2 over a day old, left by a write that stopped; those can be removed by hand/);
  assert.match(text, /last ended: never; last tried: 2026-10-20 00:00 UTC/);
  assert.match(text, new RegExp(`tried since it last ended: 2; last stopped 2026-10-20 00:01 UTC: ${STOP_SAID.place}`));
  assert.match(text, /next: one was tried less than a day ago/);

  // One place set by storeDir, nothing there yet, no clean-up ever.
  const empty = new Guarded();
  empty.dirs.add(DIR);
  const bare = storeReport([await countStore(empty, list(empty), DIR, NOW)], await stateIn(empty, list(empty), [DIR]), NOW, true);
  assert.match(bare, /^Results are kept in one place, set by storeDir:/);
  assert.match(bare, /results: 0 \(0 B\);/);
  assert.match(bare, /trash: empty/);
  assert.match(bare, /tmp\/: empty/);
  assert.match(bare, /last ended: never; last tried: never/);
  assert.match(bare, /tried since it last ended: 0\n/);
  assert.match(bare, /next: no place transcripts are kept in is known yet/);
});

test('a file under blobs/, index/ or the trash that the clean-up would not take for a result is not counted as one either', async () => {
  const files = new Guarded();
  await storeIn(files, DIR);
  const before = await countStore(files, list(files), DIR, NOW);
  await put(files, `${DIR}/blobs/notes.txt`, 'left by hand', NOW - 2 * DAY);
  await files.write(`${DIR}/index/notes.json`, '{"bytes":12,"tool":"Bash"}');
  await put(files, `${DIR}/trash/2026-10-10/notes.txt`, 'left by hand', NOW - 10 * DAY);
  const after = await countStore(files, list(files), DIR, NOW);
  assert.ok(!('missing' in before) && !('missing' in after));
  assert.deepEqual([after.results, after.from, after.entries, after.trash], [before.results, before.from, before.entries, before.trash]);
});

test('the first week is said with the day it ends, and a place not there is said as such', async () => {
  const files = new Guarded();
  files.dirs.add(`${DIR}/roots`);
  await noteRoot(files, DIR, ROOT, NOW - DAY);
  const gc = await stateIn(files, list(files), [DIR]);
  const text = storeReport([{ dir: OLD, missing: true }], gc, NOW, false);
  assert.match(text, /next: not before 2026-10-26 12:00 UTC, the first week after transcripts were found/);
  assert.match(text, new RegExp(`${OLD}\\n  not there, or not a plain directory`));
});

test('when a clean-up may run, it is said to be tried once the place can be made private: not that it will', async () => {
  const files = new Guarded();
  files.dirs.add(`${DIR}/roots`);
  await noteRoot(files, DIR, ROOT, NOW - FIRST_WAIT_MS - DAY);
  const text = storeReport([{ dir: DIR, missing: true }], await stateIn(files, list(files), [DIR]), NOW, false);
  assert.match(text, /next: tried when a session starts, once the place results are kept in is made private/);
});

test('every kind of stop has words, none of which name a path', () => {
  assert.deepEqual(Object.keys(STOP_SAID).sort(), [...STOP_KINDS].sort());
  for (const said of Object.values(STOP_SAID)) assert.ok(!said.includes('/'), said);
  assert.equal(sizeText(512), '512 B');
  assert.equal(sizeText(2048), '2.0 KB');
  assert.equal(sizeText(5 * 1024 * 1024), '5.0 MB');
});

test('a clean-up is late 14 days after the last that ended, or the first place recorded, or the oldest result, and not a millisecond before (ADR 0016)', () => {
  assert.equal(LATE_MS, 14 * DAY);
  const gc = (lastRun: number, roots: string[], firstSeen: number) => ({ roots, firstSeen, lastRun, tried: 0, tries: 0, stopped: null });
  // The last that ended.
  assert.equal(lateSince(gc(NOW - 14 * DAY, [ROOT], NOW - 90 * DAY), null, NOW), NOW - 14 * DAY);
  assert.equal(lateSince(gc(NOW - 14 * DAY + 1, [ROOT], NOW - 90 * DAY), null, NOW), null);
  assert.equal(lateSince(gc(NOW - DAY, [ROOT], NOW - 90 * DAY), null, NOW), null, 'ended yesterday');
  // None ended: the first place recorded; in its first week, never late.
  assert.equal(lateSince(gc(0, [ROOT], NOW - 14 * DAY), null, NOW), NOW - 14 * DAY);
  assert.equal(lateSince(gc(0, [ROOT], NOW - 14 * DAY + 1), null, NOW), null);
  assert.equal(lateSince(gc(0, [ROOT], NOW - 3 * DAY), NOW - 90 * DAY, NOW), null, 'the oldest result does not count where a place is recorded');
  // No place ever: the oldest result; none, never late.
  assert.equal(lateSince(gc(0, [], 0), NOW - 14 * DAY, NOW), NOW - 14 * DAY);
  assert.equal(lateSince(gc(0, [], 0), NOW - 14 * DAY + 1, NOW), null);
  assert.equal(lateSince(gc(0, [], 0), null, NOW), null);
  // One that ended, and no place now: since it ended.
  assert.equal(lateSince(gc(NOW - 20 * DAY, [], 0), NOW - 90 * DAY, NOW), NOW - 20 * DAY);
  // A time ahead of now, from a clock that ran ahead: not late, as the clean-up waits for it too.
  assert.equal(lateSince(gc(NOW + DAY, [ROOT], NOW - 90 * DAY), null, NOW), null);
});

test('the late line says since when and how many days, and that no place is recorded only when none is; how to record one is not promised', () => {
  assert.equal(
    lateLine(NOW - 20 * DAY, NOW, false),
    'moved-out results have not been cleaned up since 2026-09-30 UTC (20 days); /lossless-store says how the clean-up went',
  );
  assert.equal(
    lateLine(NOW - 20 * DAY - 1000, NOW, true),
    'moved-out results have not been cleaned up since 2026-09-30 UTC (20 days), and no place transcripts are kept in is on record; /lossless-store says how the clean-up went',
  );
});

test('the oldest result is the oldest blob of every place, by its time; none, null', async () => {
  const files = new Guarded();
  await storeIn(files, DIR);
  await storeIn(files, OLD);
  files.mtimes.set(`${OLD}/blobs/${hex('b')}.txt`, NOW - 30 * DAY);
  assert.equal(await oldestResult(list(files), [DIR, OLD]), NOW - 30 * DAY);
  const empty = new Guarded();
  empty.dirs.add(`${DIR}/blobs`);
  assert.equal(await oldestResult(list(empty), [DIR, '/nowhere']), null);
});

test('a stop by what the clean-up follows is recorded with each id and why, read back as such, and /lossless-store says how to go on for each (#114)', async () => {
  const files = new MemoryFiles();
  await noteRoot(files, DIR, ROOT, NOW - 30 * DAY);
  const record = await noteTried(files, DIR, await stateIn(files, list(files), [DIR]), NOW);
  const unread = [
    { id: hex('1'), why: 'text-missing' as const },
    { id: hex('2'), why: 'text-changed' as const },
    { id: hex('3'), why: 'entry' as const },
    { id: hex('4'), why: 'in-trash' as const },
  ];
  await noteStopped(files, DIR, record, 'part', NOW, unread);
  const gc = await stateIn(files, list(files), [DIR]);
  assert.deepEqual(gc.stopped, { at: NOW, kind: 'part', unread });
  const text = storeReport([await countStore(files, list(files), DIR, NOW)], gc, NOW, false);
  assert.ok(text.includes(`    ${hex('1')}: its text, blobs/<id>.txt, is not there; where you removed it yourself, remove index/<id>.json too`));
  assert.ok(text.includes(`    ${hex('2')}: its text, blobs/<id>.txt, is not what was stored`));
  assert.ok(text.includes(`    ${hex('3')}: its entry, index/<id>.json, could not be read, while recall may still read its text; write the entry back`));
  assert.ok(!text.includes('more, named once'), 'none beyond the four');
  assert.ok(text.includes(`    ${hex('4')}: it is named and in the trash, and could not be put back; move its files from trash/<day>/`));
  // What the record holds is read as ids and causes of the list, at most twenty: nothing else it holds is kept.
  const many = Array.from({ length: 25 }, (_, at) => ({ id: hex(at.toString(16).padStart(2, '0')), why: 'text-missing' as const }));
  await files.write(`${DIR}/gc.json`, JSON.stringify({ ...record, stopped: { at: NOW, kind: 'part', unread: [{ id: PATH_MARK, why: 'entry' }, { id: hex('5'), why: MARK }, ...many] } }));
  const read = (await stateIn(files, list(files), [DIR])).stopped;
  assert.equal(read?.unread?.length, 20);
  // Recorded past twenty, the rest are counted, and said.
  const again = await noteTried(files, DIR, await stateIn(files, list(files), [DIR]), NOW + 1);
  await noteStopped(files, DIR, again, 'part', NOW + 1, many);
  const counted = await stateIn(files, list(files), [DIR]);
  assert.deepEqual([counted.stopped?.unread?.length, counted.stopped?.more], [20, 5]);
  assert.ok(storeReport([await countStore(files, list(files), DIR, NOW)], counted, NOW, false).includes('    and 5 more, named once these are gone past'));
  assert.ok(!JSON.stringify(read).includes(PATH_MARK) && !JSON.stringify(read).includes(MARK));
});
