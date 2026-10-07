import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DAMAGE, NAMED_AT_MOST, STOP_WITH_MS, checkAsked, checkPlaces, checkReport, idStart, type Checked, type From, type Judged } from '../src/check.ts';
import { idOf } from '../src/store.ts';
import { MemoryFiles } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const DIR = '/home/u/.claude/lossless-compaction';
const MARK = 'a-line-of-a-result-that-must-not-be-shown';
const list = (files: MemoryFiles) => (path: string) => files.list(path);
const plenty = () => Number.POSITIVE_INFINITY;
const here = (dir = DIR, putsBack = true) => ({ dir, there: true, putsBack });
const judgedOf = (checked: readonly Checked[], at = 0): Judged => {
  const one = checked[at];
  assert.ok(one !== undefined && !('state' in one), JSON.stringify(one));
  return one;
};

/** Keeps `text` as the plugin does, at `where` (blobs and index, a day of the trash, or none), a day ago; returns its id. */
async function keep(files: MemoryFiles, text: string, where: { text?: string; entry?: string; entryText?: string; dir?: string } = {}): Promise<string> {
  const dir = where.dir ?? DIR;
  const id = await idOf(text);
  if (where.text !== 'none') await files.write(`${dir}/${where.text ?? 'blobs'}/${id}.txt`, text);
  if (where.entry !== 'none') await files.write(`${dir}/${where.entry ?? 'index'}/${id}.json`, where.entryText ?? JSON.stringify({ bytes: Buffer.byteLength(text), tool: 'Read' }));
  for (const path of files.files.keys()) if (!files.mtimes.has(path)) files.mtimes.set(path, NOW - DAY);
  return id;
}

test('/lossless-store check names, once each, every id whose files are not whole, in place and in the trash, with what that does, and nothing whole (#117)', async () => {
  const files = new MemoryFiles();
  for (let i = 0; i < 20; i += 1) await keep(files, `${MARK} whole ${i}`);
  // Apart, the entry in place and the text in the trash, as a clean-up stopped between its two moves leaves them.
  await keep(files, `${MARK} apart`, { text: 'trash/2026-10-19' });
  const named: Record<string, [string, string]> = {};
  const as = async (label: string, kind: string, id: string) => (named[label] = [id, kind]);
  // Changed on disk, to a text of the same length and of another: the hash tells both, the size only the second.
  let id = await keep(files, `${MARK} changed in place`);
  await files.write(`${DIR}/blobs/${id}.txt`, `${MARK} changed in plaCe`);
  await as('same length', 'text-changed', id);
  id = await keep(files, `${MARK} changed, longer`);
  await files.write(`${DIR}/blobs/${id}.txt`, `${MARK} changed, longer and longer`);
  await as('other length', 'text-changed', id);
  // Changed in place, whole in the trash: recall reads the one in place, and putting back moves nothing over it.
  id = await keep(files, `${MARK} changed in place, whole in the trash`);
  await files.write(`${DIR}/trash/2026-10-12/${id}.txt`, `${MARK} changed in place, whole in the trash`);
  await files.write(`${DIR}/blobs/${id}.txt`, `${MARK} changed in placE, whole in the trash`);
  await as('changed, a whole copy in the trash', 'text-changed', id);
  await as('empty entry', 'entry-unreadable', await keep(files, `${MARK} empty entry`, { entryText: '{}' }));
  await as('not json', 'entry-unreadable', await keep(files, `${MARK} not json`, { entryText: '{"bytes":' }));
  await as('other size', 'size-differs', await keep(files, `${MARK} other size`, { entryText: JSON.stringify({ bytes: 3, tool: 'Read' }) }));
  await as('text alone', 'entry-missing', await keep(files, `${MARK} text alone`, { entry: 'none' }));
  await as('entry alone', 'text-missing', await keep(files, `${MARK} entry alone`, { text: 'none' }));
  // No text and an entry that does not read: what recall cannot give back is the text.
  await as('no text, entry unread', 'text-missing', await keep(files, `${MARK} no text, entry unread`, { text: 'none', entryText: '{' }));
  id = await keep(files, `${MARK} changed in the trash`, { text: 'trash/2026-10-12', entry: 'trash/2026-10-12' });
  await files.write(`${DIR}/trash/2026-10-12/${id}.txt`, `${MARK} changed in the trasH`);
  await as('in the trash', 'text-changed', id);
  // A link where a text is kept: recall does not follow it.
  id = await idOf(`${MARK} a link`);
  await files.write(`${DIR}/index/${id}.json`, JSON.stringify({ bytes: 10, tool: 'Read' }));
  await files.write('/elsewhere/text.txt', `${MARK} a link`);
  files.links.set(`${DIR}/blobs/${id}.txt`, '/elsewhere/text.txt');
  await as('link', 'link', id);
  for (const path of [...files.files.keys(), ...files.links.keys()]) if (!files.mtimes.has(path)) files.mtimes.set(path, NOW - DAY);

  const { checked, next } = await checkPlaces(files, list(files), [here()], NOW, plenty, null);
  assert.equal(next, null);
  const one = judgedOf(checked);
  const expected = Object.fromEntries(DAMAGE.map((kind) => [kind, Object.values(named).filter(([, of]) => of === kind).map(([at]) => at).sort()]));
  assert.deepEqual(Object.fromEntries(DAMAGE.map((kind) => [kind, [...one.damaged[kind]].sort()])), expected);
  assert.deepEqual([one.judged, one.inTrash, one.apart, one.young, one.unreached], [32, 1, 1, 0, 0]);
  const report = checkReport(checked, next, 1234);
  for (const [at] of Object.values(named)) assert.equal(report.split(idStart(at)).length - 1, 1, `${at} is not named once`);
  // Nothing of a text, and no id whole: a 64-hex string in the transcript would be taken for one named and kept.
  assert.ok(!report.includes(MARK));
  assert.ok(!/[0-9a-f]{64}/.test(report));
  assert.match(report, /^11 not whole, in 1\.2 s\./m);
  assert.match(report, /an entry that does not read, or names no tool \(recall gives the text back; \/lossless-export leaves it out\): 2:/);
  assert.match(report, /whole, a text and its entry apart in place and in the trash: 1; put back when asked for/);
});

test('/lossless-store check of a place with nothing damaged says so, and a file under a minute old is not judged', async () => {
  const files = new MemoryFiles();
  for (let i = 0; i < 3; i += 1) await keep(files, `${MARK} whole ${i}`);
  // A write between its text and its entry: the text alone, a moment ago.
  const writing = await keep(files, `${MARK} being written`, { entry: 'none' });
  files.mtimes.set(`${DIR}/blobs/${writing}.txt`, NOW - 1000);
  const { checked, next } = await checkPlaces(files, list(files), [here()], NOW, plenty, null);
  const one = judgedOf(checked);
  assert.deepEqual([one.judged, one.young, DAMAGE.flatMap((kind) => one.damaged[kind]).length], [3, 1, 0]);
  const report = checkReport(checked, next, 50);
  assert.match(report, /being written, under a minute old: 1, not checked/);
  assert.match(report, /^None damaged, in 0\.1 s\.$/m);
});

test('/lossless-store check stops with time to answer, says where to go on from, and a run from there checks the rest', async () => {
  const files = new MemoryFiles();
  const ids = [];
  for (let i = 0; i < NAMED_AT_MOST + 5; i += 1) ids.push(await keep(files, `${MARK} text alone ${i}`, { entry: 'none' }));
  const other = '/home/u/elsewhere';
  for (let i = 0; i < 3; i += 1) ids.push(await keep(files, `${MARK} elsewhere ${i}`, { entry: 'none', dir: other }));
  const places = [here(), here(other, false)];
  // Each id judged takes a second of the command's own time.
  let left = 30 * 1000;
  const timeLeft = () => (left -= 1000);
  const first = await checkPlaces(files, list(files), places, NOW, timeLeft, null);
  assert.ok(first.next !== null && first.next.place === 1, JSON.stringify(first.next));
  assert.deepEqual(first.checked[1], { dir: other, state: 'after' });
  const report = checkReport(first.checked, first.next, 9000);
  assert.match(report, /Not all was checked in the time a command has: \/lossless-store check from 1:[0-9a-f]{16} goes on from there\./);
  const asked = checkAsked(/check from \d+:[0-9a-f]{16}/.exec(report)?.[0] ?? '');
  assert.ok(asked !== null && asked.from !== null);
  const named = new Set(judgedOf(first.checked).damaged['entry-missing']);
  let from: From | null = asked.from;
  for (let run = 0; from !== null && run < 10; run += 1) {
    left = 30 * 1000;
    const again = await checkPlaces(files, list(files), places, NOW, timeLeft, from);
    if (from.place > 1) assert.deepEqual(again.checked[0], { dir: DIR, state: 'before' });
    for (const one of again.checked) if (!('state' in one)) for (const id of one.damaged['entry-missing']) named.add(id);
    from = again.next;
  }
  assert.equal(from, null);
  assert.deepEqual([...named].sort(), [...ids].sort(), 'runs from where each stopped check every id once');
  // At most fifty of a kind are named; the rest are counted.
  const whole = await checkPlaces(files, list(files), [here()], NOW, plenty, null);
  const all = checkReport(whole.checked, whole.next, 10);
  assert.match(all, new RegExp(`a text with no entry \\(recall finds nothing here\\): ${NAMED_AT_MOST + 5}: .*, and 5 more`));
  assert.equal(all.match(/[0-9a-f]{16}/g)?.length, NAMED_AT_MOST);
  assert.ok(STOP_WITH_MS > 1000);
});

test('/lossless-store check says of an earlier place that what stands apart is not put back, and checks no place it cannot list', async () => {
  const files = new MemoryFiles();
  const earlier = '/home/u/earlier';
  await keep(files, `${MARK} apart in an earlier place`, { dir: earlier, text: 'trash/2026-10-19' });
  const unlisted = '/home/u/unlisted';
  await keep(files, `${MARK} kept where index/ cannot be listed`, { dir: unlisted });
  const refusing = async (path: string) => {
    if (path === `${unlisted}/index`) throw new Error('EACCES');
    return files.list(path);
  };
  const { checked, next } = await checkPlaces(files, refusing, [here(earlier, false), here(unlisted), { dir: '/home/u/gone', there: false, putsBack: true }], NOW, plenty, null);
  assert.equal(judgedOf(checked, 0).apart, 1);
  assert.deepEqual(checked.slice(1), [
    { dir: unlisted, state: 'unlisted' },
    { dir: '/home/u/gone', state: 'missing' },
  ]);
  const report = checkReport(checked, next, 10);
  assert.match(report, /apart in place and in the trash: 1; recall puts back from the trash of the place results are kept in alone, so not these/);
  assert.match(report, /\/home\/u\/unlisted\n {2}there, and could not be listed: not checked/);
  assert.match(report, /\/home\/u\/gone\n {2}not there, or not a plain directory/);
});

test('what /lossless-store takes after check: nothing, or from a place and the start of an id, as a run that stopped says', () => {
  assert.deepEqual(checkAsked('check'), { from: null });
  assert.deepEqual(checkAsked('  check  '), { from: null });
  assert.deepEqual(checkAsked('check from 2:0123456789abcdef'), { from: { place: 2, id: '0123456789abcdef' } });
  for (const not of ['', 'checks', 'check now', 'check from 0:0123456789abcdef', 'check from 2:0123', 'check from 2:0123456789ABCDEF']) assert.equal(checkAsked(not), null, not);
});

test('/lossless-store check tells a copy in the trash that is not whole, beside a whole one in place, from one in place; reads an entry as an export and a compaction do; and goes on with no time left', async () => {
  const files = new MemoryFiles();
  // Whole in place; in the trash, a copy whose text changed, and one whose entry does not read: recall reads the one in place.
  const textCopy = await keep(files, `${MARK} whole in place, changed in the trash`);
  await files.write(`${DIR}/trash/2026-10-12/${textCopy}.txt`, `${MARK} whole in place, changed in the trasH`);
  await files.write(`${DIR}/trash/2026-10-12/${textCopy}.json`, JSON.stringify({ bytes: Buffer.byteLength(`${MARK} whole in place, changed in the trash`), tool: 'Read' }));
  const entryCopy = await keep(files, `${MARK} whole in place, entry unread in the trash`);
  await files.write(`${DIR}/trash/2026-10-12/${entryCopy}.json`, '{}');
  // An entry with a tool and no size, which an export reads and a compaction does not; and one with a size and no tool.
  const noSize = await keep(files, `${MARK} no size`, { entryText: JSON.stringify({ tool: 'Read' }) });
  const noTool = await keep(files, `${MARK} no tool`, { entryText: JSON.stringify({ bytes: Buffer.byteLength(`${MARK} no tool`) }) });
  for (const path of files.files.keys()) if (!files.mtimes.has(path)) files.mtimes.set(path, NOW - DAY);
  const one = judgedOf((await checkPlaces(files, list(files), [here()], NOW, plenty, null)).checked);
  assert.deepEqual([...one.damaged['trash-copy']].sort(), [textCopy, entryCopy].sort());
  assert.deepEqual([one.damaged['text-changed'], one.damaged['entry-unreadable'], one.damaged['size-differs']], [[], [noTool], [noSize]]);
  // With no time left at all, each run checks one, and says where the next goes on.
  let from: From | null = null;
  let runs = 0;
  do {
    const run = await checkPlaces(files, list(files), [here()], NOW, () => 0, from);
    const judged = judgedOf(run.checked);
    assert.equal(judged.judged, 1, `run ${runs + 1} checked ${judged.judged}`);
    from = run.next;
    runs += 1;
  } while (from !== null && runs < 10);
  assert.deepEqual([from, runs], [null, 4]);
  // An earlier place says that recall puts back nothing from its trash.
  assert.match(checkReport((await checkPlaces(files, list(files), [here(DIR, false)], NOW, plenty, null)).checked, null, 1), /an earlier place: recall reads what is in place here, and puts back nothing from its trash/);
});
