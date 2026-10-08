// Breaks, one at a time, the lines of the code listed here, each one that a promise of docs/invariants.md rests on, runs the tests, and says
// whether the test the document names for it fails. Run by `npm run mutate`, in a git checkout, and by CI on every pull
// request (the last step of .github/workflows/ci.yml, #125). It works on a
// copy of the tree, the files git keeps or would keep, so that stopped or killed it leaves yours as it was. The copy
// is removed when the run ends, or stops on an error of its own; stopped from outside, it is left in the system's
// temporary directory. For each mutation it runs the test file that holds the test named, alone: whether that test
// fails is all that is read, and `node --test` runs each file in a process of its own. Before anything is broken, each
// named test has to pass with every test run and with its file run alone, or nothing is broken.
// test/invariants.test.ts holds this list and the document together.
//
//   node test/mutate.ts            every mutation
//   node test/mutate.ts I4         those of one promise

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
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
    breaks: 'an entry that does not read, never placed or written in place other than it was, is taken for one placed',
    file: 'src/blobs.ts',
    find: "  if (entry && (entry.reason !== 'differs' || (await storedAs(files, [dir], id)) === null)) return entry;",
    replace: "  if (entry && entry.reason !== 'differs') return entry;",
    killedBy: 'an entry that does not read back as it was written is not relied on, and the result stays where it is: no ticket for what recall cannot find (I1)',
  },
  {
    promise: 'I1',
    breaks: 'a result just written is not compared with what was written',
    file: 'src/blobs.ts',
    find: "  if (found === 'missing' || !repair(back)) return { reason: 'differs' };",
    replace: "  if (found === 'missing') return null;\n  if (!repair(back)) return { reason: 'differs' };",
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
    find: '    if (part === false) continue;',
    replace: '    continue;',
    killedBy: 'a collection keeps what a kept part names: its results, and the parts of an earlier summary and theirs',
  },
  {
    promise: 'I4',
    breaks: "a copy in the trash is removed from a day another clean-up may still be moving the one in place into",
    file: 'src/lifetime.ts',
    find: '    const doubled = plan.toRestore.filter((item) => item.day < settled).flatMap((item) => {',
    replace: '    const doubled = plan.toRestore.flatMap((item) => {',
    killedBy:
      'clean-ups at once, one that names a result and others that do not, leave it to recall: a copy in the trash goes only from a day none still moves into (ADR 0038)',
  },
  {
    promise: 'I4',
    breaks: 'a text stored again keeps the time it was first stored at',
    file: 'src/blobs.ts',
    find: "    if (renew && found === 'file') await files.move?.renew?.(path).catch(() => undefined);",
    replace: '    // not renewed',
    killedBy: 'a text stored again has its time renewed, so a clean-up within a day of the new use does not move it; where no command starts it is not',
  },
  {
    promise: 'I5',
    breaks: 'a search that ended with an error is taken for one that read everything',
    file: 'src/lifetime.ts',
    find: "  if (result.exitCode !== 0) return { stop: `grep did not read all of ${dir}`, kind: 'unread' };\n",
    replace: '',
    killedBy: 'the ids in transcripts are read per project; a place that is gone is dropped, one that cannot be read stops it all',
  },
  {
    promise: 'I5',
    breaks: 'a search that did not print the known id is taken for one that read everything',
    file: 'src/lifetime.ts',
    find: "  if (!result.stdout.split('\\n').includes(SENTINEL_ID)) return { stop: `grep did not read all of ${dir}`, kind: 'unread' };\n",
    replace: '',
    killedBy: 'the ids in transcripts are read per project; a place that is gone is dropped, one that cannot be read stops it all',
  },
  {
    promise: 'I5',
    breaks: 'a search whose output was cut is taken for all of it',
    file: 'src/lifetime.ts',
    find: '  if (result.truncated) {\n',
    replace: '  if (false) {\n',
    killedBy: 'a search whose output the host cut is read again in halves, and a transcript whose ids alone are cut stops it (#118, ADR 0042)',
  },
  {
    promise: 'I5',
    breaks: 'a set whose output was cut is not read again, and what it held is not counted',
    file: 'src/lifetime.ts',
    find: '    return (await readSet(list, exec, grep, dir, set.slice(0, half), sentinel, ids)) ?? readSet(list, exec, grep, dir, set.slice(half), sentinel, ids);',
    replace: '    return null;',
    killedBy: 'a search whose output the host cut is read again in halves, and a transcript whose ids alone are cut stops it (#118, ADR 0042)',
  },
  {
    promise: 'I5',
    breaks: 'a set of transcripts may hold any number of bytes, and a search of a large project runs past its time',
    file: 'src/lifetime.ts',
    find: '    if (set.length > 0 && (set.length >= SET_FILES || bytes + one.size > SET_BYTES)) {',
    replace: '    if (set.length > 0 && set.length >= SET_FILES) {',
    killedBy: 'a project directory is read a set at a time however large it grows: no search is handed more than a set may hold, and none runs past its time (#118, ADR 0042)',
  },
  {
    promise: 'I5',
    breaks: 'a directory of transcripts below is not gone into',
    file: 'src/lifetime.ts',
    find: "    if (entry.kind === 'dir') {",
    replace: '    if (false) {',
    killedBy: 'the transcripts read are those grep -r read: in directories below and hidden ones, not through a link nor in other names; a directory below that cannot be listed stops it (#118, ADR 0042)',
  },
  {
    promise: 'I5',
    breaks: 'a set may hold any number of transcripts, and a command line of many is too long to start',
    file: 'src/lifetime.ts',
    find: '    if (set.length > 0 && (set.length >= SET_FILES || bytes + one.size > SET_BYTES)) {',
    replace: '    if (set.length > 0 && bytes + one.size > SET_BYTES) {',
    killedBy: 'a project of many small transcripts is read in sets of at most SET_FILES, so that no command line is too long to start (#118, ADR 0042)',
  },
  {
    promise: 'I5',
    breaks: 'a directory that cannot be listed again is taken for one removed, and what is in it goes unread',
    file: 'src/lifetime.ts',
    find: '  return (await goneBelow(list, dir, parent, listedIn)) === true ? true : null;',
    replace: '  return true;',
    killedBy: 'a directory still listed that cannot be listed again after grep could not read in it stops the clean-up (#118, ADR 0042)',
  },
  {
    promise: 'I5',
    breaks: 'a session directory removed while a clean-up reads stops it',
    file: 'src/lifetime.ts',
    find: '  return (await goneBelow(list, dir, parent, listedIn)) === true ? true : null;',
    replace: '  return null;',
    killedBy: 'a session directory removed while a clean-up reads is passed over (#118, ADR 0042)',
  },
  {
    promise: 'I5',
    breaks: 'a directory of transcripts that cannot be listed is passed over',
    file: 'src/lifetime.ts',
    find: "  if (entries === null) return { stop: `${dir} could not be listed`, kind: 'unread' };",
    replace: '  if (entries === null) return into;',
    killedBy: 'the transcripts read are those grep -r read: in directories below and hidden ones, not through a link nor in other names; a directory below that cannot be listed stops it (#118, ADR 0042)',
  },
  {
    promise: 'I5',
    breaks: 'a set grep could not read all of is taken for one whose transcripts were all removed',
    file: 'src/lifetime.ts',
    find: '    const left = await stillThere(list, dir, set);',
    replace: '    const left: Transcript[] | null = [];',
    killedBy: 'a transcript removed after it was listed is passed over, and one still there that cannot be read stops it (#118, ADR 0042)',
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
    find: "    if (!text.ok) {\n      unread.push({ id, why: text.why });\n      continue;\n    }",
    replace: "    if (!text.ok) continue;",
    killedBy: 'a collection stops when a kept part it is to follow cannot be read',
  },
  {
    promise: 'I5',
    breaks: 'a text whose hash is no longer its name is read as the one stored, a part it is not taken for',
    file: 'src/store.ts',
    find: "    return (await idOf(text)) === id ? { ok: true, text } : { ok: false, why: 'text-changed' };",
    replace: '    return { ok: true, text };',
    killedBy: 'a kept part whose entry does not read, its text the one stored, is read as a part: what it names comes back from the trash and is counted as named (ADR 0033)',
  },
  {
    promise: 'I5',
    breaks: 'a part whose entry does not read is passed over by a collection, and what only it names goes',
    file: 'src/keep.ts',
    find: '    if (part === false) continue;',
    replace: '    if (part !== true) continue;',
    killedBy: 'a kept part whose entry does not read, its text the one stored, is read as a part: what it names comes back from the trash and is counted as named (ADR 0033)',
  },
  {
    promise: 'I5',
    breaks: 'what a part whose entry does not read names is not put back from the trash',
    file: 'src/lifetime.ts',
    find: '        if ((await isPart(files, dirs, id)) === false) continue;',
    replace: '        if ((await isPart(files, dirs, id)) !== true) continue;',
    killedBy: 'a kept part whose entry does not read, its text the one stored, is read as a part: what it names comes back from the trash and is counted as named (ADR 0033)',
  },
  {
    promise: 'I5',
    breaks: 'an entry of another shape is read as saying the thing is not a part, and its text is never read',
    file: 'src/store.ts',
    find: "      return typeof tool === 'string' ? tool === PART : null;",
    replace: '      return tool === PART;',
    killedBy: 'a kept part whose entry does not read, its text the one stored, is read as a part: what it names comes back from the trash and is counted as named (ADR 0033)',
  },
  {
    promise: 'I5',
    breaks: 'a clean-up stops at the first thing it cannot follow, and the others are found a day at a time',
    file: 'src/keep.ts',
    find: "      unread.push({ id, why: text.why });\n      continue;",
    replace: "      return unreadStop([{ id, why: text.why }]);",
    killedBy: 'a clean-up stopped by what it follows names each of them and why, in one try: a text not there, one changed; an entry of another shape over a sound text is read (#114, ADR 0033)',
  },
  {
    promise: 'I5',
    breaks: 'what stopped a clean-up is not recorded, and /lossless-store cannot name it',
    file: 'src/lifetime.ts',
    find: '  await files.write(lastRunFile(dir), JSON.stringify({ ...record, stopped }));',
    replace: '  await files.write(lastRunFile(dir), JSON.stringify({ ...record, stopped: { at: now, kind } }));',
    killedBy: 'a stop by what the clean-up follows is recorded with each id and why, read back as such, and /lossless-store says how to go on for each (#114)',
  },
  {
    promise: 'I5',
    breaks: 'a conversation still there whose noted ticket the search does not find is let through',
    file: 'src/witness.ts',
    find: "    if (!written) return { stop: 'the transcript of a conversation compacted with tickets does not hold its newest ticket as the search reads one', kind: 'unread' };\n",
    replace: '',
    killedBy: 'a clean-up stops where a conversation compacted with tickets is still there and the search does not find the ticket noted for it: renamed, compressed, spelled otherwise, or moved inside its directory (ADR 0027)',
  },
  {
    promise: 'I5',
    breaks: 'a transcript under another name is taken for a conversation that is gone, and its results go',
    file: 'src/witness.ts',
    find: "      if (entry.name.startsWith(`${sessionId}.`)) left ??= `a file ${entry.name}`;\n",
    replace: '',
    killedBy: 'with a witness noted, a transcript renamed keeps every result; with the conversation gone, the clean-up goes on as before (ADR 0027)',
  },
  {
    promise: 'I5',
    breaks: 'the oldest ticket of a conversation is its witness, and what it wrote otherwise later goes unseen',
    file: 'src/witness.ts',
    find: '  return [...new Set(ids)];\n',
    replace: '  return [...new Set(ids)].reverse();\n',
    killedBy: 'a conversation written otherwise from its start, or from some point on, stops the clean-up too: its newest ticket is its witness, wherever it was written (ADR 0027)',
  },
  {
    promise: 'I5',
    breaks: 'behind a cut, an older ticket is taken for the newest, and the parts written otherwise go unseen',
    file: 'src/witness.ts',
    find: '  return [...all.filter((id) => !had.has(id)), ...all.filter((id) => had.has(id))];\n',
    replace: '  return all;\n',
    killedBy: 'the witness of a compaction is a ticket it put in, where it put any, before what stays behind a cut; at a start the one noted stays while the conversation shows it (ADR 0027)',
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
    find: "    if (inTrash.has(id) && !(await holds(files, dirs, id))) {\n      unread.push({ id, why: 'in-trash' });\n      continue;\n    }\n",
    replace: '',
    killedBy: 'where what is named cannot be put back from the trash, the collection is stopped before it counts what is named',
  },
  {
    promise: 'I5',
    breaks: "a mark of a machine whose transcripts are not read here does not stop a clean-up",
    file: 'src/machine.ts',
    find: '  return marks.filter((mark) => mark.name !== self && !mark.sessions.includes(session) && !mark.sessions.some((one) => readable.has(one)));',
    replace: '  return [];',
    killedBy: "a mark none of whose sessions has a transcript here keeps a clean-up from running; this session's, and a container's made again over the same transcripts, do not (ADR 0032)",
  },
  {
    promise: 'I5',
    breaks: "a machine's id is written over one already there, so that two sessions starting together hold two",
    file: 'src/machine.ts',
    find: "    await exitOf(run, 'ln', ['--', part, path]);",
    replace: "    await files.write(path, JSON.stringify({ id: made }));",
    killedBy: "a machine's id is made once and read after; two sessions making it together keep one, whichever linked first (ADR 0032)",
  },
  {
    promise: 'I5',
    breaks: "a session's own mark, written just before, is taken for another machine's",
    file: 'src/machine.ts',
    find: '!mark.sessions.includes(session) && ',
    replace: '',
    killedBy: "a mark none of whose sessions has a transcript here keeps a clean-up from running; this session's, and a container's made again over the same transcripts, do not (ADR 0032)",
  },
  {
    promise: 'I5',
    breaks: 'a trash that is there and cannot be listed is taken for an empty one',
    file: 'src/lifetime.ts',
    find: "    return top !== null && !top.some((entry) => entry.name === 'trash') ? [] : null;",
    replace: '    return [];',
    killedBy: 'a trash that is there and cannot be listed stops a collection before anything moves; one not made yet is an empty one',
  },
  {
    promise: 'I5',
    breaks: 'a recorded place whose end cannot be told is passed over, and what only it names is not counted',
    file: 'src/lifetime.ts',
    find: "    if (root === null) return { stop: `${recorded} could not be resolved`, kind: 'place' };",
    replace: '    if (root === null) continue;',
    killedBy: 'a recorded place that is there and leads nowhere the host can tell stops it all',
  },
  {
    promise: 'I5',
    breaks: 'a recorded place that is a link stops every clean-up again',
    file: 'src/lifetime.ts',
    find: "    if (there.kind !== 'dir') return { stop: `${recorded} is not a directory`, kind: 'place' };",
    replace: "    if (there.kind !== 'dir' || there.isLink === true) return { stop: `${recorded} is not a directory`, kind: 'place' };",
    killedBy:
      'a recorded place that is a link is read where it leads, once where it is recorded both ways, and a clean-up keeps what only its transcripts name (ADR 0039)',
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
    find: '    else if (!REBUILT.has(kind)) kinds.add(/^[a-z_]{1,40}$/.test(kind) ? kind : WHY.unusualKind());\n',
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

/**
 * How long one test may run before it is failed. A broken line that waits for ever fails its test this way, and the
 * file's run is made to end (`--test-force-exit`); one that loops without waiting is ended with its run, below.
 */
const TEST_TIMEOUT_MS = 20_000;
/**
 * How long a run of every test, and a run of one file, may take: past it the run is killed, and with it this one, the
 * mutation then applied named. A file is run in the process of its runner (`--test-isolation=none`), so that killing
 * the run leaves no process of it behind. A file's fifteen times a test's: a line broken so that several tests of its
 * file wait for ever still ends with each of them failed.
 */
const WHOLE_TIMEOUT_MS = 10 * 60_000;
const FILE_TIMEOUT_MS = 15 * TEST_TIMEOUT_MS;

/** A test's name as written, in a test file's quotes or in TAP, with what was escaped there put back. */
const unescaped = (written: string): string => written.replace(/\\(.)/g, '$1');

/** The test files of `root`, each with the names of the tests written in it as `test('<name>'`. */
export function testsIn(root: string): Map<string, string[]> {
  const files = new Map<string, string[]>();
  for (const file of readdirSync(join(root, 'test')).filter((name) => name.endsWith('.test.ts'))) {
    files.set(file, [...readFileSync(join(root, 'test', file), 'utf8').matchAll(/^test\('((?:[^'\\]|\\.)*)'/gm)].map((match) => unescaped(match[1] ?? '')));
  }
  return files;
}

/** The one test file that holds the test named `name`. */
export function fileOf(tests: Map<string, string[]>, name: string): string {
  const holding = [...tests].filter(([, names]) => names.includes(name)).map(([file]) => file);
  if (holding.length !== 1) throw new Error(`"${name}" is in ${holding.length} test files, not one`);
  return holding[0] ?? '';
}

/**
 * What of `git ls-files -z` output is copied: each file. A repository or worktree nested in the tree and not ignored
 * is listed as its directory, with a slash at the end, and is left out, as git leaves it out of the tree.
 */
export function filesToCopy(listed: string): string[] {
  return listed.split('\0').filter((path) => path !== '' && !path.endsWith('/'));
}

/** Whether `path` is `root` or under it, both as the system resolves them. */
export function inside(path: string, root: string): boolean {
  const from = relative(realpathSync(root), realpathSync(path));
  return from === '' || (from !== '..' && !from.startsWith(`..${sep}`) && !isAbsolute(from));
}

/**
 * Copies the files git keeps or would keep into `copy`: the mutations are written there, never here. A file deleted
 * in the working tree is left out, as it is from the tests run here.
 */
function fillCopy(copy: string): void {
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error(`git ls-files could not list the tree: ${listed.stderr || listed.error?.message}`);
  for (const path of filesToCopy(listed.stdout)) {
    if (!existsSync(join(ROOT, path))) continue;
    mkdirSync(dirname(join(copy, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(copy, path));
  }
}

type Ran = { passed: Set<string>; failed: Set<string> };

/** The tests that passed and those that failed, by name, running `files` in `copy`; it throws when the run did not end. */
function run(copy: string, files: string[], alone: boolean): Ran {
  const ran = spawnSync(
    'node',
    ['--test', '--test-reporter=tap', `--test-timeout=${TEST_TIMEOUT_MS}`, '--test-force-exit', ...(alone ? ['--test-isolation=none'] : []), ...files],
    { cwd: copy, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: alone ? FILE_TIMEOUT_MS : WHOLE_TIMEOUT_MS, killSignal: 'SIGKILL' },
  );
  if (ran.signal !== null || ran.error !== undefined) throw new Error(`the tests did not end (${ran.signal ?? ran.error?.message})`);
  const passed = new Set<string>();
  const failed = new Set<string>();
  for (const match of `${ran.stdout}`.matchAll(/^(not )?ok \d+ - (.+)$/gm)) (match[1] === undefined ? passed : failed).add(unescaped(match[2] ?? ''));
  return { passed, failed };
}

/**
 * Whether the test named failed, `killed`, or passed. A run that says neither, a runner stopped by a signal it handles
 * or a file that did not load, says nothing of the line that was broken: it throws.
 */
export function verdictOf(ran: Ran, name: string): 'killed' | 'survived' {
  if (ran.failed.has(name)) return 'killed';
  if (ran.passed.has(name)) return 'survived';
  throw new Error(`the run says nothing of "${name}": the tests were stopped, or its file did not load`);
}

/** Stops before anything is broken when a test named is not there passing: it would be counted as caught by every mutation, or by none. */
function passing(ran: Ran, names: Iterable<string>, how: string): void {
  const not = [...names].filter((name) => !ran.passed.has(name));
  if (not.length > 0) throw new Error(`before anything is broken, ${how}, these named tests do not pass: ${not.join('; ')}`);
}

// Started as the script, not imported by a test. Not `import.meta.main`, which an early Node 24 does not have: there
// the run would try nothing and pass.
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const only = process.argv[2];
  const chosen = MUTATIONS.filter((one) => only === undefined || one.promise === only);
  const tests = testsIn(ROOT);
  const fileFor = new Map(chosen.map((one) => [one.killedBy, fileOf(tests, one.killedBy)]));
  const byFile = new Map<string, string[]>();
  for (const [name, file] of fileFor) byFile.set(file, [...(byFile.get(file) ?? []), name]);
  // A temporary directory inside the tree would put the copy among your files, there after a stop.
  if (inside(tmpdir(), ROOT)) throw new Error(`the temporary directory ${tmpdir()} is inside the tree; set TMPDIR to one outside it`);
  const copy = mkdtempSync(join(tmpdir(), 'lossless-mutate-'));
  try {
    fillCopy(copy);
    passing(run(copy, ['test/**/*.test.ts'], false), chosen.map((one) => one.killedBy), 'with every test run');
    for (const [file, names] of byFile) passing(run(copy, [`test/${file}`], true), names, `with ${file} run alone`);
    let survived = 0;
    for (const mutation of chosen) {
      const path = join(copy, mutation.file);
      const original = readFileSync(path, 'utf8');
      if (original.split(mutation.find).length !== 2) throw new Error(`${mutation.file}: not found once: ${mutation.find}`);
      writeFileSync(path, original.replace(mutation.find, () => mutation.replace));
      let ran: Ran;
      try {
        ran = run(copy, [`test/${fileFor.get(mutation.killedBy)}`], true);
      } catch (error) {
        throw new Error(`with ${mutation.promise} ${mutation.breaks}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        writeFileSync(path, original);
      }
      const killed = verdictOf(ran, mutation.killedBy) === 'killed';
      if (!killed) survived += 1;
      console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} ${mutation.promise} ${mutation.breaks} (${ran.failed.size} failed in its file${killed ? '' : `: ${[...ran.failed].slice(0, 4).join('; ')}`})`);
    }
    // What was tried, so that a run that tried nothing is seen as that.
    console.log(`${chosen.length} mutations, ${survived} survived`);
    process.exitCode = survived > 0 || chosen.length === 0 ? 1 : 0;
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}
