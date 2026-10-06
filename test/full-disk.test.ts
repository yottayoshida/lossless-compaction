// What a full disk does to what is kept (ADR 0008), on a disk that writes as
// the host's was measured to: cut short first, half written when refused.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compact } from '../src/compact.ts';
import { keepThenSummarize } from '../src/keep.ts';
import { noteRoot, stateIn } from '../src/lifetime.ts';
import { codeOf, isStored, moveOut, recall } from '../src/store.ts';
import { DiskFiles, MemoryFiles, conversation, output } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';
const TEXT = output('status', 200);


/** Two moves of the same text at once, the one that goes wrong reaching the disk only after the other has finished. */
async function raced(files: DiskFiles) {
  let release = () => {};
  files.later = new Promise<void>((resolve) => {
    release = resolve;
  });
  const both = [moveOut(files, DIR, 'Bash', TEXT), moveOut(files, DIR, 'Bash', TEXT)];
  await Promise.race(both);
  release();
  return Promise.all(both);
}

test('without a move into place, a refused write of the same text destroys what an earlier write had stored', async () => {
  // The host as it is without `mv` (Windows): written in place. This is what the move prevents.
  const files = new DiskFiles(false);
  let blobWrites = 0;
  files.full = (path) => path.includes('/blobs/') && ++blobWrites === 2;
  const results = await raced(files);
  const first = results.find((result) => !('reason' in result));
  const second = results.find((result) => 'reason' in result);
  if (!first || 'reason' in first) return assert.fail('one was stored');
  assert.ok(second && 'reason' in second && second.reason === 'write-failed');
  assert.deepEqual(await recall(files, [DIR], first.id), { error: 'The stored result has changed on disk and is not returned.' });
});

test('with a move into place, a refused write of the same text leaves what an earlier write had stored whole', async () => {
  const files = new DiskFiles(true);
  let blobWrites = 0;
  // The second write of the result's text, wherever it goes: to a part, or in place if nothing moves it.
  files.full = (path) => (path.includes('.txt.') || path.includes('/blobs/')) && ++blobWrites === 2;
  const results = await raced(files);
  const stored = results.filter((result): result is Extract<typeof result, { id: string }> => !('reason' in result));
  assert.ok(stored.length >= 1, 'one was stored');
  for (const result of stored) assert.deepEqual(await recall(files, [DIR], result.id), { text: TEXT });
  // Nothing half written is left where a result is looked for, and the part the disk refused is gone.
  for (const [path, text] of files.files) {
    if (path.includes('/blobs/')) assert.equal(text, TEXT, path);
  }
  assert.ok(![...files.files.keys()].some((path) => path.endsWith('.part')), 'no part left in tmp/');
});

test('a full disk leaves the result in the conversation, with no ticket, and the compaction names the reason', async () => {
  const files = new DiskFiles(true);
  files.full = () => true;
  const messages = conversation([
    { tool: 'Bash', input: { command: 'a' }, text: output('a', 300) },
    { tool: 'Bash', input: { command: 'b' }, text: output('b', 300) },
    { tool: 'Bash', input: { command: 'c' }, text: output('c', 300) },
  ]);
  const outcome = await compact(
    { messages, tokens: 100_000, window: 100_000, goal: '' },
    { store: { write: DIR, read: [DIR] }, keepTokens: 0, minChars: 100, targetPercent: 10, maxAfterPercent: 75 },
    { files, now: () => 0 },
  );
  assert.equal(outcome.report.moved, 0);
  assert.ok((outcome.report.notMoved['write-failed'] ?? 0) > 0);
  assert.deepEqual(outcome.report.writeErrors, ['ENOSPC']);
  const texts = outcome.messages.flatMap((message) => message.toolResults ?? []).map((result) => result.text);
  assert.deepEqual(texts, messages.flatMap((message) => message.toolResults ?? []).map((result) => result.text));
});

type Compacted = { messages?: unknown[]; skip?: string };
const skipped = (why: string): Compacted => ({ skip: why });

test('when a refused write leaves nothing kept, the summary does not run and the compaction says why', async () => {
  for (const [name, files, code] of [
    ['a full disk', Object.assign(new DiskFiles(true), { full: () => true }), 'ENOSPC'],
    ['a move that fails', new DiskFiles(true, false), 'the move into place failed'],
  ] as const) {
    let runs = 0;
    const said: string[] = [];
    const r = await keepThenSummarize(files, { dir: DIR, messages: conversation([{ tool: 'Bash', input: { command: 'x' }, text: output('x', 80) }]) }, (text) => said.push(text), async (): Promise<Compacted> => {
      runs += 1;
      return { messages: [] };
    }, skipped);
    assert.equal(runs, 0, name);
    assert.ok('skip' in r && typeof r.skip === 'string' && r.skip.includes(code), `${name}: ${JSON.stringify(r)}`);
    assert.match(said.join('\n'), /the summary did not run/, name);
    assert.ok(!said.some((line) => line.startsWith('lossless-compaction:')), 'the plugin is named once, by say');
    assert.ok(r.skip.startsWith('lossless-compaction: nothing could be kept'), name);
    // Making room is advised for a full disk alone.
    assert.equal(/free some space/.test(r.skip), code === 'ENOSPC', name);
  }
});

test('for a subagent\'s conversation a refused write is said and the summary runs all the same: no one can compact it again once room is made (ADR 0026)', async () => {
  for (const [name, files, code] of [
    ['a full disk', Object.assign(new DiskFiles(true), { full: () => true }), 'ENOSPC'],
    ['a move that fails', new DiskFiles(true, false), 'the move into place failed'],
  ] as const) {
    let runs = 0;
    const said: string[] = [];
    const summary = { messages: [{ role: 'user', text: 'the summary', toolUses: [] }] };
    const r = await keepThenSummarize(files, { dir: DIR, messages: conversation([{ tool: 'Bash', input: { command: 'x' }, text: output('x', 80) }]) }, (text) => said.push(text), async (): Promise<Compacted> => {
      runs += 1;
      return summary;
    }, skipped, 'summarize');
    assert.equal(runs, 1, name);
    assert.equal(r, summary, `${name}: handed back as the built-in compaction made it, with no tickets after it`);
    assert.deepEqual(said, [`nothing of the conversation is kept before the built-in summary: could not write: ${code}`], name);
  }
});

test('a summary still runs when nothing could be kept for a reason other than a refused write, or there was nothing to keep', async () => {
  for (const [name, keep] of [
    ['no place', { unkept: 'there is no place to keep it in' }],
    ['nothing in it', { dir: DIR, messages: [] }],
  ] as const) {
    let runs = 0;
    await keepThenSummarize(new DiskFiles(true), keep, () => {}, async (): Promise<Compacted> => {
      runs += 1;
      return { messages: [] };
    }, skipped);
    assert.equal(runs, 1, name);
  }
});

test('an entry a full disk left empty is written again, so the ticket counts as stored', async () => {
  const files = new MemoryFiles();
  const first = await moveOut(files, DIR, 'Bash', TEXT);
  assert.ok(!('reason' in first));
  files.files.set(`${DIR}/index/${first.id}.json`, '');
  assert.equal(await isStored(files, [DIR], first.text), false, 'the empty entry is not taken as stored');
  const again = await moveOut(files, DIR, 'Bash', TEXT);
  assert.ok(!('reason' in again));
  assert.equal(await isStored(files, [DIR], again.text), true);
});

test('a record of where transcripts are that a full disk left empty is written again', async () => {
  const files = new MemoryFiles();
  await noteRoot(files, DIR, '/home/u/.claude/projects', 1);
  const [path] = [...files.files.keys()].filter((p) => p.includes('/roots/'));
  assert.ok(path);
  files.files.set(path, '');
  await noteRoot(files, DIR, '/home/u/.claude/projects', 2);
  const state = await stateIn(files, (p) => files.list(p), [DIR]);
  assert.deepEqual(state.roots, ['/home/u/.claude/projects']);
});

test('the reason is the code at the end of what the host said, not a capital in a path', () => {
  assert.equal(codeOf(new Error('lossless-compaction: $.fs.write(/home/u/ENV/blobs/x.txt) failed: ENOSPC')), 'ENOSPC');
  assert.equal(codeOf(new Error('EACCES: permission denied')), 'EACCES');
  assert.equal(codeOf(new Error("cannot write '/home/u/.claude/x' now")), "cannot write '<path>' now");
});

test('a part a broken disk stored other text for is not moved over what an earlier write had stored', async () => {
  const files = new DiskFiles(true);
  let parts = 0;
  // The second part of the blob is stored wrong, without a word, and lands after the first was moved into place.
  files.garble = (path) => (path.includes('.txt.') || path.includes('/blobs/')) && ++parts === 2;
  const stored = (await raced(files)).filter((result): result is Extract<typeof result, { id: string }> => !('reason' in result));
  assert.ok(stored.length >= 1, 'one was stored');
  for (const result of stored) assert.deepEqual(await recall(files, [DIR], result.id), { text: TEXT });
});

test('a store with no directories yet takes its first results: the move makes the directory it moves into', async () => {
  const files = new DiskFiles(true);
  assert.equal(files.dirs.size, 0);
  const moved = await moveOut(files, DIR, 'Bash', TEXT);
  if ('reason' in moved) return assert.fail(`not stored: ${moved.reason} ${moved.code ?? ''}`);
  assert.deepEqual(await recall(files, [DIR], moved.id), { text: TEXT });
  assert.equal(await isStored(files, [DIR], moved.text), true);
  assert.ok(![...files.files.keys()].some((path) => path.endsWith('.part')), 'no part left in tmp/');
});

test('an entry that does not read back as it was written is not relied on, and the result stays where it is: no ticket for what recall cannot find (I1)', async () => {
  const files = new DiskFiles(true);
  // The entry's part, on its way to index/, is stored as other text by a broken disk.
  files.garble = (path) => path.includes('/tmp/') && path.includes('.json.');
  const moved = await moveOut(files, DIR, 'Bash', TEXT);
  assert.ok('reason' in moved, 'the result is not moved out');
  assert.equal(moved.reason, 'differs');
  assert.ok(![...files.files.keys()].some((path) => path.includes('/index/')), 'no entry was placed');
  // With no mv, the entry is written in place: one that reads as other than it was written is not taken for placed.
  const bare = new DiskFiles(false);
  bare.garble = (path) => path.includes('/index/');
  const inPlace = await moveOut(bare, DIR, 'Bash', TEXT);
  assert.ok('reason' in inPlace, 'the result is not moved out where its entry does not read');
  // Another tool that returned the same text, its entry there and read, is moved out as before.
  const twice = new DiskFiles(false);
  assert.ok(!('reason' in (await moveOut(twice, DIR, 'Bash', TEXT))));
  assert.ok(!('reason' in (await moveOut(twice, DIR, 'Read', TEXT))), 'the same text from another tool');
});
