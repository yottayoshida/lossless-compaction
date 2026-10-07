// Takes one conversation's results to another machine (#116): `/lossless-export` writes what the conversation names
// into a new directory of the store's own shape, `blobs/` and `index/`, and `/lossless-import` reads such a directory,
// or an earlier place, into the place results are written to now. Each result is checked against its name, the SHA-256
// of its text, on the way out and on the way in. Nothing is sent anywhere.

import { idOf, store, type NotMoved } from './blobs.ts';
import { blobIdOf, blobPath, blobsDir, entryPath } from './layout.ts';
import { ticketIds, listed, type List } from './lifetime.ts';
import { IMPORT_COMMAND, holds, namedInText, recall } from './store.ts';
import type { Files, Message } from './types.ts';

/**
 * The ids the conversation names, and those what they name names in turn: its tickets, and every mention in the shape of
 * a ticket, in it and in each text it names, a kept part's, a recalled part's or a line of a result's. Only what has the
 * shape of a ticket is followed: a hash a tool printed is no ticket.
 */
export async function namedThrough(files: Files, dirs: readonly string[], messages: readonly Message[]): Promise<Set<string>> {
  const ids = new Set([...ticketIds(messages), ...namedInText(JSON.stringify(messages))]);
  const queue = [...ids];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    const found = await recall(files, dirs, id);
    if ('error' in found) continue;
    for (const inner of namedInText(found.text)) {
      if (ids.has(inner)) continue;
      ids.add(inner);
      queue.push(inner);
    }
  }
  return ids;
}

/**
 * The text stored under `id` in the first of `dirs` that holds it whole, the SHA-256 of its text being its name, and
 * the tool its entry names; null where none does. An entry is needed: what it names tells a kept part from a result.
 */
export async function keptAs(files: Files, dirs: readonly string[], id: string): Promise<{ text: string; tool: string } | null> {
  for (const dir of dirs) {
    let text: string;
    let tool: unknown;
    try {
      text = await files.read(blobPath(dir, id));
      tool = (JSON.parse(await files.read(entryPath(dir, id))) as { tool?: unknown } | null)?.tool;
    } catch {
      continue;
    }
    if (typeof tool === 'string' && (await idOf(text)) === id) return { text, tool };
  }
  return null;
}

/**
 * What was written out: each result once, with its entry; of the ids named, those no place read from holds whole; and
 * those left for want of time.
 */
export type WrittenOut = { written: number; missing: number; left: number };

/**
 * The file `/lossless-export` writes first into the directory it makes: a directory that holds it was made by it, and
 * typing the same command again goes on writing into it.
 */
export const EXPORT_MARK = '.lossless-export';

/**
 * Writes what `ids` name, read from `dirs`, into `to`, as the store writes a result, while `more` says so. What `to`
 * holds already is passed over, which takes none of the hook's own time: typed again, it goes on. A write that fails
 * stops it.
 */
export async function writeOut(files: Files, dirs: readonly string[], ids: Iterable<string>, to: string, more: () => boolean = () => true): Promise<WrittenOut | NotMoved> {
  let written = 0;
  let missing = 0;
  let left = 0;
  for (const id of ids) {
    if (await holds(files, [to], id)) {
      written += 1;
      continue;
    }
    if (!more()) {
      left += 1;
      continue;
    }
    const kept = await keptAs(files, dirs, id);
    if (kept === null) {
      missing += 1;
      continue;
    }
    const stored = await store(files, to, kept.tool, kept.text);
    if ('reason' in stored) return stored;
    written += 1;
  }
  return { written, missing, left };
}

/**
 * What was read in: taken into the place written to, there already, refused (its text not named by its SHA-256, or no
 * entry that says what it is), and left for the next time, past the time given.
 */
export type ReadIn = { taken: number; there: number; refused: number; left: number };

/**
 * Reads the results of `from`, a directory written out or a place of the store's shape, into `to`, while `more` says
 * so. One the store refuses is counted as refused; a write that fails stops it.
 */
export async function readIn(files: Files, list: List, from: string, to: string, more: () => boolean): Promise<ReadIn | NotMoved> {
  const done: ReadIn = { taken: 0, there: 0, refused: 0, left: 0 };
  for (const entry of (await listed(list, blobsDir(from))) ?? []) {
    const id = entry.kind === 'file' && entry.isLink !== true ? blobIdOf(entry.name) : undefined;
    if (id === undefined) continue;
    if (!more()) {
      done.left += 1;
      continue;
    }
    if (await holds(files, [to], id)) {
      done.there += 1;
      continue;
    }
    const kept = await keptAs(files, [from], id);
    if (kept === null) {
      done.refused += 1;
      continue;
    }
    const stored = await store(files, to, kept.tool, kept.text);
    if ('reason' in stored && stored.reason === 'write-failed') return stored;
    if ('reason' in stored) done.refused += 1;
    else done.taken += 1;
  }
  return done;
}

/**
 * A path to write out to or read in from: from the root, `/` first, with no `.` or `..` in it, nor NUL. A drive
 * letter's form is refused: on a machine that has none the host would take it as under the working directory (#116).
 */
export function plainPath(path: string): boolean {
  return path.startsWith('/') && !path.includes('\0') && !path.split('/').some((part) => part === '.' || part === '..');
}

/** The directories `path` is in, itself first, up to the root. */
function upFrom(path: string): string[] {
  const dirs: string[] = [];
  for (let dir = path.replace(/[\\/]+$/, '') || '/'; ; ) {
    dirs.push(dir);
    const cut = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'));
    const up = cut <= 0 ? (dir === '/' || cut < 0 ? dir : '/') : dir.slice(0, cut);
    if (up === dir) return dirs;
    dir = up;
  }
}

/**
 * Whether `path` is inside a repository: a `.git`, a directory or a worktree's file, in it or in a directory it is in,
 * as the path is written and as the nearest of them that is there resolves through links. Results are not written into
 * one, where a commit could take them.
 */
export async function insideRepository(path: string, exists: (path: string) => Promise<boolean>, real: (dir: string) => Promise<string | null>): Promise<boolean> {
  const lexical = upFrom(path);
  let resolved: string[] = [];
  for (const dir of lexical) {
    if (!(await exists(dir))) continue;
    const at = await real(dir);
    if (at !== null) resolved = upFrom(at);
    break;
  }
  for (const dir of new Set([...lexical, ...resolved])) {
    if (await exists(`${dir === '/' ? '' : dir}/.git`)) return true;
  }
  return false;
}

/** What `/lossless-export` says once it has written: how many, where, what was kept nowhere here, and what to do next. */
export function exportedLine(out: WrittenOut, to: string, session: string): string {
  return (
    `wrote ${out.written} ${out.written === 1 ? 'result' : 'results'} this conversation names to ${to}` +
    (out.missing > 0 ? `; ${out.missing} it names ${out.missing === 1 ? 'is' : 'are'} kept nowhere here` : '') +
    (out.left > 0 ? `; ${out.left} left for want of time: type the same /lossless-export again to go on` : '') +
    `. To go on with it on another machine, copy that directory there, and this conversation's record, ${session}.jsonl, ` +
    `into the folder of Claude Code's projects/ there for the directory you resume it from; resume it, and type /${IMPORT_COMMAND} with the directory.`
  );
}

/** What `/lossless-import` says: how many were taken, there already, refused and left. */
export function importedLine(done: ReadIn): string {
  return (
    `read in ${done.taken} ${done.taken === 1 ? 'result' : 'results'}, ${done.there} there already` +
    (done.refused > 0 ? `, ${done.refused} refused: not named by the SHA-256 of ${done.refused === 1 ? 'its' : 'their'} text, with no entry that says what it is, or not to be kept here` : '') +
    (done.left > 0 ? `; ${done.left} left for want of time: type it again to go on` : '')
  );
}
