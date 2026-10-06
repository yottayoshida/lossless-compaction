// Breaks, one at a time, the lines of the code listed here, each one that a promise of docs/invariants.md rests on, runs the tests, and says
// whether the test the document names for it fails. Run by hand (`npm run mutate`, about two minutes): it changes files
// under src/ while it runs and puts each back. test/invariants.test.ts holds this list and the document together.
//
//   node test/mutate.ts            every mutation
//   node test/mutate.ts I4         those of one promise

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Mutation = {
  /** The promise of docs/invariants.md it breaks. */
  promise: string;
  /** What breaking it does, in a few words. */
  breaks: string;
  file: string;
  find: string;
  replace: string;
  /** A test that has to fail with it, by its name. */
  killedBy: string;
};

export const MUTATIONS: readonly Mutation[] = [
  {
    promise: 'I3',
    breaks: 'a part under tmp/ is moved into place without being read back',
    file: 'src/blobs.ts',
    find: '    if ((await files.read(part)) !== text) {',
    replace: '    if (false) {',
    killedBy: 'a part a broken disk stored other text for is not moved over what an earlier write had stored',
  },
  {
    promise: 'I1',
    breaks: 'a result just written is not compared with what was written',
    file: 'src/blobs.ts',
    find: "  if (back === text) return null;\n  if (found === 'missing' || !repair(back)) return { reason: 'differs' };",
    replace: "  if (back === text || found === 'missing') return null;\n  if (!repair(back)) return { reason: 'differs' };",
    killedBy: 'a result that does not read back as it was written stays in the conversation',
  },
  {
    promise: 'I1',
    breaks: 'a ticket is given though the result could not be written',
    file: 'src/blobs.ts',
    find: '  if (blob) return blob;\n',
    replace: '',
    killedBy: 'a result that cannot be stored stays in the conversation and is counted',
  },
  {
    promise: 'I2',
    breaks: 'recall returns text that no longer has the hash it is named by',
    file: 'src/blobs.ts',
    find: "    if ((await idOf(text)) !== id) return { error: 'The stored result has changed on disk and is not returned.' };\n",
    replace: '',
    killedBy: 'recall answers only to an id it stored, and only with text that still has that hash',
  },
  {
    promise: 'I3',
    breaks: 'a write of the same text is made in place, over what an earlier write stored',
    file: 'src/blobs.ts',
    find: '  const mover = files.move !== undefined && (await files.move.available()) ? files.move : null;',
    replace: "  const mover = null as unknown as NonNullable<Files['move']> | null;",
    killedBy: 'with a move into place, a refused write of the same text leaves what an earlier write had stored whole',
  },
  {
    promise: 'I3',
    breaks: 'a link where a result would go is written through',
    file: 'src/blobs.ts',
    find: "  if (found === 'symlink') return { reason: 'symlink' };\n  if (found === 'not-a-file')",
    replace: "  if (found === 'not-a-file')",
    killedBy: 'a link to nothing is refused too',
  },
  {
    promise: 'I4',
    breaks: 'a result a transcript names goes to the trash',
    file: 'src/lifetime.ts',
    find: '    .filter((id): id is string => id !== undefined && !live.has(id));',
    replace: '    .filter((id): id is string => id !== undefined);',
    killedBy: 'a result over a day old that no transcript names goes to the trash; a young one and a named one stay',
  },
  {
    promise: 'I4',
    breaks: 'a result written a moment ago goes to the trash',
    file: 'src/lifetime.ts',
    find: ' && now - entry.mtimeMs >= YOUNG_MS)',
    replace: ')',
    killedBy: 'a result over a day old that no transcript names goes to the trash; a young one and a named one stay',
  },
  {
    promise: 'I4',
    breaks: 'a result in the trash is removed before the week is out',
    file: 'src/lifetime.ts',
    find: '  const toRemove = trashed.filter((item) => !live.has(item.id) && item.day < before);',
    replace: '  const toRemove = trashed.filter((item) => !live.has(item.id));',
    killedBy: 'the trash is aged by the day of its directory, not by the file: a move keeps a file old',
  },
  {
    promise: 'I4',
    breaks: 'what a kept part names is not counted as named',
    file: 'src/keep.ts',
    find: "    if (!part) continue;\n    const got = await recall(files, dirs, id);",
    replace: "    if (part !== null) continue;\n    const got = await recall(files, dirs, id);",
    killedBy: 'a collection keeps what a kept part names: its results, and the parts of an earlier summary and theirs',
  },
  {
    promise: 'I5',
    breaks: 'a search that ended with an error is taken for one that read everything',
    file: 'src/lifetime.ts',
    find: "    if (result.exitCode !== 0) return { stop: `grep did not read all of ${dir}`, kind: 'unread' };\n",
    replace: '',
    killedBy: 'the ids in transcripts are read per project; a place that is gone is dropped, one that cannot be read stops it all',
  },
  {
    promise: 'I5',
    breaks: 'a search that did not print the known id is taken for one that read everything',
    file: 'src/lifetime.ts',
    find: "    if (!result.stdout.split('\\n').includes(SENTINEL_ID)) return { stop: `grep did not read all of ${dir}`, kind: 'unread' };\n",
    replace: '',
    killedBy: 'the ids in transcripts are read per project; a place that is gone is dropped, one that cannot be read stops it all',
  },
  {
    promise: 'I5',
    breaks: 'a search whose output was cut is taken for all of it',
    file: 'src/lifetime.ts',
    find: "    if (result.truncated) return { stop: `the ids in ${dir} are more than one search can return`, kind: 'too-many' };\n",
    replace: '',
    killedBy: 'the ids in transcripts are read per project; a place that is gone is dropped, one that cannot be read stops it all',
  },
  {
    promise: 'I5',
    breaks: 'a place that cannot be listed is passed over',
    file: 'src/lifetime.ts',
    find: "    if (projects === null) return { stop: `${root} could not be listed`, kind: 'place' };",
    replace: '    if (projects === null) continue;',
    killedBy: 'a place that is there but cannot be looked at or listed stops it all: its conversations may still be resumed',
  },
  {
    promise: 'I5',
    breaks: 'a project directory that is a link is passed over',
    file: 'src/lifetime.ts',
    find: "      if (project.isLink) return { stop: `${root}/${project.name} is a link, which a search does not follow`, kind: 'place' };\n",
    replace: '',
    killedBy: 'a project directory that is a link stops it all: a search does not follow it',
  },
  {
    promise: 'I5',
    breaks: 'with every recorded place gone, nothing is taken to be named',
    file: 'src/lifetime.ts',
    find: "  if (kept.length === 0) return { stop: 'none of the places transcripts were found in is there', kind: 'place' };\n",
    replace: '',
    killedBy: 'with every recorded place gone, nothing is collected: an empty set would name nothing in use',
  },
  {
    promise: 'I5',
    breaks: 'a kept part that cannot be read is passed over',
    file: 'src/keep.ts',
    find: "    if ('error' in got) return { stop: `a kept part, ${id}, could not be read: ${got.error}`, kind: 'part' };",
    replace: "    if ('error' in got) continue;",
    killedBy: 'a collection stops when a kept part it is to follow cannot be read',
  },
  {
    promise: 'I6',
    breaks: 'a conversation is said to be kept though one of its parts was not written',
    file: 'src/keep.ts',
    find: "    if ('reason' in moved) return { failed: moved.reason, ...(moved.code === undefined ? {} : { code: moved.code }) };",
    replace: "    if ('reason' in moved) continue;",
    killedBy: 'a part that cannot be written keeps nothing',
  },
  {
    promise: 'I6',
    breaks: 'the summary runs though a refused write left nothing kept',
    file: 'src/keep.ts',
    find: '        return skip(`${PLUGIN}: ${why}`);\n',
    replace: '',
    killedBy: 'when a refused write leaves nothing kept, the summary does not run and the compaction says why',
  },
  {
    promise: 'I6',
    breaks: "a subagent's summary is held back where the disk refuses the write, and the subagent runs over its window",
    file: 'src/keep.ts',
    find: "      if ('failed' in done && done.failed === 'write-failed' && refused === 'summarize') {",
    replace: '      if (false) {',
    killedBy: "for a subagent's conversation a refused write is said and the summary runs all the same: no one can compact it again once room is made (ADR 0026)",
  },
  {
    promise: 'I6',
    breaks: 'the oldest messages are cut though a part of them was not written',
    file: 'src/cut.ts',
    find: "  if ('failed' in done) return { failed: done.failed, ...(done.code === undefined ? {} : { code: done.code }) };\n",
    replace: '',
    killedBy: 'when a part cannot be written nothing is cut',
  },
  {
    promise: 'I7',
    breaks: 'a result in the trash is not put back when it is asked for',
    file: 'src/lifetime.ts',
    find: '  await putBack(exec, dir, wanted);\n  return wanted.length;',
    replace: '  return wanted.length;',
    killedBy: 'recall puts back from the trash what it is asked for, even a result whose move stopped halfway',
  },
  {
    promise: 'I1',
    breaks: 'a result that could not be written is replaced all the same',
    file: 'src/compact.ts',
    find: "        const result = written[at] as Moved | NotMoved;\n        if ('reason' in result) return missed(result);\n",
    replace: '        const result = written[at] as Moved;\n',
    killedBy: 'a result that cannot be stored stays in the conversation and is counted',
  },
  {
    promise: 'I1',
    breaks: 'a long input that could not be written is replaced all the same',
    file: 'src/compact.ts',
    find: "        const result = written[at] as MovedInput | NotMoved;\n        if ('reason' in result) return missed(result);\n",
    replace: '        const result = written[at] as MovedInput;\n',
    killedBy: 'a value that cannot be stored stays in its call, as it was, and is counted',
  },
  {
    promise: 'I1',
    breaks: 'the middle of a message that could not be written leaves all the same',
    file: 'src/compact.ts',
    find: "        const result = written[at] as (BodyTicket & { text: string }) | NotMoved;\n        if ('reason' in result) return missed(result);\n",
    replace: '        const result = written[at] as BodyTicket & { text: string };\n',
    killedBy: 'the second round of a /compact by hand tries no middle the first tried: one that could not be written is counted once',
  },
  {
    promise: 'I1',
    breaks: 'a run of old calls is folded though it could not be written',
    file: 'src/fold.ts',
    find: "  if ('reason' in kept) return kept;\n",
    replace: '',
    killedBy: 'a run that cannot be stored stays where it stood, and is counted',
  },
  {
    promise: 'I1',
    breaks: 'a run of old calls is folded though the reading of a file in it could not be written',
    file: 'src/fold.ts',
    find: "    if ('reason' in stored) return stored;\n",
    replace: '',
    killedBy: 'where a whole-file reading cannot be written, its run stays where it stood, as a result that cannot be written does, and is counted',
  },
  {
    promise: 'I4',
    breaks: 'what is named is not put back from the trash before the parts are followed',
    file: 'src/lifetime.ts',
    find: '  await restoreThroughParts(files, list, exec, dirs, live);\n',
    replace: '',
    killedBy: 'a part named again while it is in the trash keeps what only it names: both go back before a collection counts what is named',
  },
  {
    promise: 'I5',
    breaks: 'a collection goes on though what is named is still in the trash',
    file: 'src/keep.ts',
    find: "    if (inTrash.has(id) && !(await holds(files, dirs, id))) return { stop: 'what is named could not be put back from the trash', kind: 'move' };\n",
    replace: '',
    killedBy: 'where what is named cannot be put back from the trash, the collection is stopped before it counts what is named',
  },
  {
    promise: 'I7',
    breaks: 'what a conversation names is not put back before its parts are read',
    file: 'src/lifetime.ts',
    find: '  await putBackNow(ids);\n',
    replace: '',
    killedBy: 'a kept part the conversation names comes back from the trash, and with it what only that part names, through earlier parts (#73)',
  },
  {
    promise: 'I8',
    breaks: 'a conversation holding a block no rebuilt message carries is rebuilt without it',
    file: 'src/select.ts',
    find: "    else if (!REBUILT.has(kind)) kinds.add(/^[a-z_]{1,40}$/.test(kind) ? kind : 'a kind with an unusual name');\n",
    replace: '',
    killedBy: 'a conversation is rebuilt only when every block in it is of a kind a rebuilt message carries',
  },
  {
    promise: 'I8',
    breaks: 'a conversation of which the host may not have shown the oldest messages is rebuilt',
    file: 'src/select.ts',
    find: '  if (messages.length >= HOST_SHOWS || api.length >= HOST_SHOWS) {',
    replace: '  if (false) {',
    killedBy: 'a conversation of as many messages as the host shows at most is not rebuilt: older ones may be missing',
  },
];

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The names of the tests that fail with the code as it stands. */
function failing(): Set<string> {
  const ran = spawnSync('node', ['--test', '--test-reporter=tap', 'test/**/*.test.ts'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // Stopped from outside, the tests say nothing of the line that was broken: the run ends here, and the line is put back.
  if (ran.signal !== null || ran.error !== undefined) throw new Error(`the tests were stopped (${ran.signal ?? ran.error?.message})`);
  return new Set([...`${ran.stdout}`.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => (match[1] ?? '').replace(/\\(.)/g, '$1')));
}

if (import.meta.main) {
  const only = process.argv[2];
  const before = failing();
  if (before.size > 0) throw new Error(`tests fail before anything is broken: ${[...before].join('; ')}`);
  let survived = 0;
  for (const mutation of MUTATIONS.filter((one) => only === undefined || one.promise === only)) {
    const path = `${ROOT}${mutation.file}`;
    const original = readFileSync(path, 'utf8');
    if (original.split(mutation.find).length !== 2) throw new Error(`${mutation.file}: not found once: ${mutation.find}`);
    writeFileSync(path, original.replace(mutation.find, () => mutation.replace));
    let failed: Set<string>;
    try {
      failed = failing();
    } finally {
      // Put back whatever ended the run of the tests, a Ctrl-C too: `failing` throws when the tests were stopped.
      writeFileSync(path, original);
    }
    const killed = failed.has(mutation.killedBy);
    if (!killed) survived += 1;
    console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} ${mutation.promise} ${mutation.breaks} (${failed.size} failed${killed ? '' : `: ${[...failed].slice(0, 4).join('; ')}`})`);
  }
  process.exit(survived > 0 ? 1 : 0);
}
