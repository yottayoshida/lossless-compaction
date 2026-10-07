// How long a moved-out result is kept: while a conversation Claude Code can
// still resume holds its id, and a grace period after (ADR 0006).
//
// The conversations Claude Code can resume are its transcripts, one JSONL file
// each under `<config>/projects/`; a fork, a rewound branch and a conversation
// compacted before this version all keep the ids in them. So the plugin keeps
// no list of what is in use, only one ticket per compacted conversation to tell
// a transcript it no longer reads (ADR 0027): once a week it reads every 64-hex string out of the
// transcripts, and a result whose id is in none of them, and that is over a
// day old, moves to `trash/<day>/`. Seven days later, still in none of them,
// it is removed; found again, it is put back. `recall` and a compaction put
// back what they need from the trash first, so a result moved there while a
// session still used it is not lost.

import { readFoldedReadLine } from './changed.ts';
import { ticketIdsIn } from './guard.ts';
import { DATE, DAY, blobIdOf, blobName, blobPath, blobsDir, dayOf, entryName, entryPath, gcFile, indexDir, isRootName, isTmpPartName, rootPath, rootsDir, tmpDir, trashDayDir, trashDir, trashedIdOf, trashedPaths } from './layout.ts';
import { exitOf } from './commands.ts';
import { idOf, isPart, readBodyTicket, readPartTicket, readTicket, recall, storedText } from './store.ts';
import type { DirEntry, Exec, Files, Message } from './types.ts';

export { dayOf };
/** How often the transcripts are read. Measured: 81 s for 2.9 GB of them. */
export const GC_EVERY_MS = 7 * DAY;
/** How long a result stays in the trash, unreferenced, before it is removed. */
export const GRACE_MS = 7 * DAY;
/** A result younger than this is never moved: its ticket may not be in a transcript yet. */
export const YOUNG_MS = DAY;
/** No collection until this long after the first place transcripts were found in was recorded. */
export const FIRST_WAIT_MS = 7 * DAY;
/** One search of one project's transcripts may take this long. */
export const SEARCH_WITHIN_MS = 5 * 60 * 1000;

const ID = /^[0-9a-f]{64}$/;

export type List = (path: string) => Promise<DirEntry[]>;

/**
 * What stopped a collection, from a closed list: what is recorded of a stop
 * (ADR 0016). The words a stop is said in name directories of other
 * repositories, and are only shown.
 */
export const STOP_KINDS = ['unread', 'too-many', 'place', 'part', 'trash', 'move', 'shared', 'unexpected'] as const;
export type StopKind = (typeof STOP_KINDS)[number];
/** Why one stored thing a clean-up follows stopped it (#114): kept with its id, so that it can be named and gone past. */
export const UNREAD_WHYS = ['text-missing', 'text-changed', 'text-unreadable', 'in-trash'] as const;
export type Unread = { id: string; why: (typeof UNREAD_WHYS)[number] };
/** How many of them a stop keeps: enough to show, not the store's contents. */
export const UNREAD_MAX = 20;
export type Stop = { stop: string; kind: StopKind; unread?: readonly Unread[]; more?: number };

/** The last stop recorded: when, and its kind. */
export type Stopped = { at: number; kind: StopKind; unread?: readonly Unread[]; more?: number };

/**
 * What is kept between sessions, in the store's own directory, so that every
 * Claude Code configuration that shares a `storeDir` sees the places all of
 * them keep transcripts in: one file per place under `roots/`, written once
 * and never rewritten, and of the collections, when the last one ended and
 * the last one was tried, how many were tried since the last that ended, and
 * the last stop recorded since then.
 */
export type GcState = { roots: string[]; firstSeen: number; lastRun: number; tried: number; tries: number; stopped: Stopped | null };

/** What `gc.json` holds. */
export type GcRecord = Pick<GcState, 'lastRun' | 'tried' | 'tries' | 'stopped'>;

const rootFile = async (dir: string, root: string) => rootPath(dir, await idOf(root));
const lastRunFile = gcFile;

async function readJson(files: Files, path: string): Promise<unknown> {
  try {
    return JSON.parse(await files.read(path)) as unknown;
  } catch {
    return undefined;
  }
}

/** The places recorded in any of `dirs`, the earliest time one was, and the last collection. */
export async function stateIn(files: Files, list: List, dirs: readonly string[]): Promise<GcState> {
  const roots = new Set<string>();
  let firstSeen = 0;
  let lastRun = 0;
  let tried = 0;
  let tries = 0;
  let stopped: Stopped | null = null;
  for (const dir of dirs) {
    for (const entry of (await listed(list, rootsDir(dir))) ?? []) {
      if (entry.kind !== 'file' || entry.isLink || !isRootName(entry.name)) continue;
      const value = (await readJson(files, `${rootsDir(dir)}/${entry.name}`)) as { root?: unknown; at?: unknown } | undefined;
      if (typeof value?.root !== 'string' || typeof value.at !== 'number') continue;
      roots.add(value.root);
      firstSeen = firstSeen === 0 ? value.at : Math.min(firstSeen, value.at);
    }
    const last = (await readJson(files, lastRunFile(dir))) as { lastRun?: unknown; tried?: unknown; tries?: unknown; stopped?: unknown } | undefined;
    const ended = typeof last?.lastRun === 'number' ? last.lastRun : 0;
    const count = typeof last?.tries === 'number' && Number.isInteger(last.tries) && last.tries >= 0 ? last.tries : 0;
    // The tries counted since an end are those of the record of the latest end.
    if (ended > lastRun) tries = count;
    else if (ended === lastRun) tries = Math.max(tries, count);
    lastRun = Math.max(lastRun, ended);
    if (typeof last?.tried === 'number') tried = Math.max(tried, last.tried);
    const one = stoppedIn(last?.stopped);
    if (one !== null && (stopped === null || one.at > stopped.at)) stopped = one;
  }
  // A stop before the last collection that ended is over.
  if (stopped !== null && stopped.at <= lastRun) stopped = null;
  return { roots: [...roots], firstSeen, lastRun, tried, tries, stopped };
}

/** A recorded stop, if it is one: only a kind of the list is read, whatever else the file holds. */
function stoppedIn(value: unknown): Stopped | null {
  const one = value as { at?: unknown; kind?: unknown; unread?: unknown; more?: unknown } | null | undefined;
  if (typeof one?.at !== 'number' || !(STOP_KINDS as readonly unknown[]).includes(one.kind)) return null;
  // The ids and causes of what stopped it, of the list only: nothing else the file holds is read.
  const unread = (Array.isArray(one.unread) ? one.unread : [])
    .filter((item): item is Unread => {
      const { id, why } = (item ?? {}) as { id?: unknown; why?: unknown };
      return typeof id === 'string' && /^[0-9a-f]{64}$/.test(id) && (UNREAD_WHYS as readonly unknown[]).includes(why);
    })
    .slice(0, UNREAD_MAX)
    .map(({ id, why }) => ({ id, why }));
  if (unread.length === 0) return { at: one.at, kind: one.kind as StopKind };
  const more = typeof one.more === 'number' && Number.isInteger(one.more) && one.more > 0 ? one.more : 0;
  return more > 0 ? { at: one.at, kind: one.kind as StopKind, unread, more } : { at: one.at, kind: one.kind as StopKind, unread };
}

/** Records `root` in `dir` unless it is there; the first record starts the wait before any collection. */
export async function noteRoot(files: Files, dir: string, root: string, now: number): Promise<void> {
  const path = await rootFile(dir, root);
  // Recorded only once it reads back: a write the disk refused leaves an empty file (ADR 0008).
  const there = (await readJson(files, path)) as { root?: unknown } | undefined;
  if (there?.root === root) return;
  await files.write(path, JSON.stringify({ root, at: now }));
}

/**
 * A collection is noted as tried when it starts, and as run when it ends. One
 * that a short session cut off is tried again a day later, not a week: only
 * a collection that went to the end waits the week out. A try is counted when
 * it starts, so one cut off counts too; the last stop is carried on, and
 * `noteStopped` writes over it.
 */
export async function noteTried(files: Files, dir: string, state: GcState, now: number): Promise<GcRecord> {
  const record: GcRecord = { lastRun: state.lastRun, tried: now, tries: state.tries + 1, stopped: state.stopped };
  await files.write(lastRunFile(dir), JSON.stringify(record));
  return record;
}

/**
 * Records the kind of a stop, never its words, over the record this try
 * wrote when it started. Another session may have written since — tried
 * again, or ended — and what it wrote stands: the stop is then not recorded.
 */
export async function noteStopped(files: Files, dir: string, record: GcRecord, kind: StopKind, now: number, unread: readonly Unread[] = [], more = 0): Promise<void> {
  const there = (await readJson(files, lastRunFile(dir))) as { lastRun?: unknown; tried?: unknown } | undefined;
  if (there?.tried !== record.tried || there.lastRun !== record.lastRun) return;
  // The ids of what stopped it, and why: no path, no words a command printed.
  const named = unread.slice(0, UNREAD_MAX).map(({ id, why }) => ({ id, why }));
  const rest = more + Math.max(0, unread.length - UNREAD_MAX);
  const stopped = named.length === 0 ? { at: now, kind } : rest > 0 ? { at: now, kind, unread: named, more: rest } : { at: now, kind, unread: named };
  await files.write(lastRunFile(dir), JSON.stringify({ ...record, stopped }));
}

export async function noteRun(files: Files, dir: string, now: number): Promise<void> {
  await files.write(lastRunFile(dir), JSON.stringify({ lastRun: now, tried: now, tries: 0, stopped: null }));
}

/** How long after a collection was tried, without ending, it is tried again. */
export const RETRY_MS = DAY;

/** Why no collection runs now: which reason, and the words it is said in. A caller tells reasons apart by `kind`. */
export type NotNow = { kind: 'no-place' | 'first-week' | 'ran' | 'tried'; text: string };

/** Why no collection runs now, or null when one does. */
export function whyNotNow(state: GcState, now: number): NotNow | null {
  if (state.roots.length === 0) return { kind: 'no-place', text: 'no place transcripts are kept in is known yet' };
  if (now - state.firstSeen < FIRST_WAIT_MS) return { kind: 'first-week', text: 'the first week after transcripts were found is waited out' };
  if (now - state.lastRun < GC_EVERY_MS) return { kind: 'ran', text: 'it ran less than a week ago' };
  if (now - state.tried < RETRY_MS) return { kind: 'tried', text: 'one was tried less than a day ago' };
  return null;
}

/** The ids of every ticket in a conversation, in any wording written so far. */
export function ticketIds(messages: readonly Message[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const result of message.toolResults ?? []) {
      const ticket = readTicket(result.text);
      if (ticket) ids.add(ticket.id);
    }
    for (const use of message.toolUses) {
      const ticket = use.text === undefined ? null : readTicket(use.text);
      if (ticket) ids.add(ticket.id);
      // A long value of an input that left stands as a ticket in the input, however deep. Read as widely as
      // the guard reads it: an id too many keeps a result a while longer, one too few leaves it in the trash.
      ticketIdsIn(use.input, ids);
    }
    // The tickets of kept parts stand in the text of the message put after a summary, a line each; and a list of
    // folded calls names what a whole-file Read returned on that Read's line (ADR 0022).
    for (const line of message.text.split('\n')) {
      const part = readPartTicket(line) ?? readFoldedReadLine(line);
      if (part) ids.add(part.id);
      // The middle of a long message, a person's or Claude's (ADR 0024).
      const body = readBodyTicket(line);
      if (body) ids.add(body.id);
    }
  }
  return ids;
}

/** What `path` lists, or null when it cannot be listed. */
export async function listed(list: List, path: string): Promise<DirEntry[] | null> {
  try {
    return await list(path);
  } catch {
    return null;
  }
}

/**
 * The place this session's transcript is kept in: `<config>/projects`, when
 * one directory under it holds `<session>.jsonl`, looked for where it lands
 * when it is a link. Null when none does, so a layout other than the one
 * measured records nothing and nothing is collected. It is recorded as named,
 * a link included: a clean-up reads it where it leads then, so a link turned
 * to another place is followed (ADR 0039).
 */
export async function rootFor(files: Files, list: List, configDir: string, sessionId: string): Promise<string | null> {
  const given = `${configDir}/projects`;
  const lands = (await files.realPath?.(given)) ?? given;
  return (await transcriptOf(files, list, lands, sessionId)) === null ? null : given;
}

/** This session's transcript, `<root>/<project>/<session>.jsonl`, where one directory holds it; else null. */
async function transcriptOf(files: Files, list: List, root: string, sessionId: string): Promise<string | null> {
  if (!/^[0-9A-Za-z_-]{1,128}$/.test(sessionId)) return null;
  for (const entry of (await listed(list, root)) ?? []) {
    if (entry.kind !== 'dir' || entry.isLink) continue;
    const path = `${root}/${entry.name}/${sessionId}.jsonl`;
    try {
      const stat = await files.stat(path);
      if (stat.kind === 'file') return path;
    } catch {
      // Not this one.
    }
  }
  return null;
}

/** The 64-hex strings in what grep printed, one per line. */
export function idsIn(stdout: string, into: Set<string> = new Set()): Set<string> {
  for (const line of stdout.split('\n')) if (ID.test(line)) into.add(line);
  return into;
}

export const GREP = ['/usr/bin/grep', '/bin/grep'] as const;
/** How long the small search a grep is chosen by may take. */
export const CHOOSE_WITHIN_MS = 30_000;

/**
 * The grep a collection uses: the first of GREP that starts, seen by a search of the sentinel alone. The host refuses
 * both a command it cannot start and one still running at its time in the same way, so which of the two can start is
 * told here, where little can run long; a search that does not come back afterwards did not end in its time, and is
 * not run again with the other (#118). Where none starts, why the last did not.
 */
export async function grepOf(exec: Exec, sentinel: string): Promise<{ grep: string } | { why: string }> {
  const whys: string[] = [];
  for (const grep of GREP) {
    try {
      await exec([grep, '-F', '-q', '--', SENTINEL_ID, sentinel], CHOOSE_WITHIN_MS);
      return { grep };
    } catch (error) {
      // Not there, no commands on this host, or not answering this little in its time: the next, then none. Each is
      // said: macOS has no /bin/grep, and its refusal would hide why /usr/bin/grep did not answer.
      whys.push(`${grep}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { why: `no grep could be run (${whys.join('; ')})` };
}

/**
 * Every id in the transcripts under `roots`, one search per project directory,
 * and the roots that are still there, with the grep that read them (null where
 * there was nothing to search). A root that is gone is dropped: no conversation
 * can be resumed from it. Anything else that keeps a project from being read in
 * full stops it all, and nothing is collected.
 */
export async function liveIds(
  files: Files,
  list: List,
  exec: Exec,
  exists: (path: string) => Promise<boolean>,
  roots: readonly string[],
  sentinel: string,
): Promise<{ ids: Set<string>; roots: string[]; grep: string | null } | Stop> {
  // Chosen before the first search, after the places are looked at: what stops a collection there stops it as before.
  let grep: string | null = null;
  const ids = new Set<string>();
  const kept: string[] = [];
  for (const recorded of roots) {
    // Only a place that is not there is skipped; one that cannot be looked at stops it all.
    if (!(await exists(recorded))) continue;
    let there;
    try {
      there = await files.stat(recorded);
    } catch {
      return { stop: `${recorded} could not be looked at`, kind: 'place' };
    }
    // What the place leads to: a link to a directory is one.
    if (there.kind !== 'dir') return { stop: `${recorded} is not a directory`, kind: 'place' };
    // A place that is a link is read where it leads, and a place recorded twice, under a link and where it leads,
    // once (ADR 0039): each search is handed a project under it, which it reads whatever the place is.
    const root = files.realPath === undefined ? recorded : await files.realPath(recorded).catch(() => null);
    if (root === null) return { stop: `${recorded} could not be resolved`, kind: 'place' };
    if (kept.includes(root)) continue;
    const projects = await listed(list, root);
    if (projects === null) return { stop: `${root} could not be listed`, kind: 'place' };
    kept.push(root);
    for (const project of projects) {
      // grep -r does not follow it: what is in it would not be counted. The host lists a link as `other`.
      if (project.isLink) return { stop: `${root}/${project.name} is a link, which a search does not follow`, kind: 'place' };
      if (project.kind !== 'dir') continue;
      if (grep === null) {
        const chosen = await grepOf(exec, sentinel);
        if ('why' in chosen) return { stop: chosen.why, kind: 'unread' };
        grep = chosen.grep;
      }
      const found = await search(exec, grep, `${root}/${project.name}`, sentinel);
      if ('stop' in found) return found;
      idsIn(found.stdout, ids);
    }
  }
  if (kept.length === 0) return { stop: 'none of the places transcripts were found in is there', kind: 'place' };
  ids.delete(SENTINEL_ID);
  return { ids, roots: kept, grep };
}

/**
 * An id no result has, in a file of its own that every search reads too: a
 * search that ends without printing it did not read to the end, whatever its
 * exit code says (a grep ended by a signal reads as 1, "nothing matched").
 */
export const SENTINEL_ID = '0'.repeat(64);
export const sentinelOf = (dir: string) => `${dir}/sentinel.jsonl`;

export async function writeSentinel(files: Files, dir: string): Promise<void> {
  await files.write(sentinelOf(dir), `"${SENTINEL_ID}"\n`);
}

async function search(exec: Exec, grep: string, dir: string, sentinel: string): Promise<{ stdout: string } | Stop> {
  let result;
  try {
    result = await exec([grep, '-rahoE', '[0-9a-f]{64}', '--include=*.jsonl', '--', dir, sentinel], SEARCH_WITHIN_MS);
  } catch (error) {
    // The grep was seen to start: one that does not come back did not end in its time (or was stopped), and is not
    // run again with the other grep, which would take as long (#118).
    return { stop: `grep did not run to the end on ${dir}: ${error instanceof Error ? error.message : String(error)}`, kind: 'unread' };
  }
  // With the sentinel, something always matches: 0 is the only answer; 1 or 2 is a search that did not finish.
  if (result.exitCode !== 0) return { stop: `grep did not read all of ${dir}`, kind: 'unread' };
  if (result.truncated) return { stop: `the ids in ${dir} are more than one search can return`, kind: 'too-many' };
  if (!result.stdout.split('\n').includes(SENTINEL_ID)) return { stop: `grep did not read all of ${dir}`, kind: 'unread' };
  return { stdout: result.stdout };
}

/** One result in the trash: the day it was moved there and its id. */
export type Trashed = { day: string; id: string };

/** What a collection does, decided from what is on disk and what is in use. */
export type GcPlan = { toTrash: string[]; toRestore: Trashed[]; toRemove: Trashed[] };

/**
 * Results over a day old that no transcript names go to the trash; in the
 * trash, those named again go back, and those the trash has held for the
 * grace period, by the day of the directory they are in, are removed. The
 * day comes from the directory, not from the file: a move keeps a file's time.
 */
export function planGc(blobs: readonly DirEntry[], trashed: readonly Trashed[], live: ReadonlySet<string>, now: number): GcPlan {
  const toTrash = blobs
    .filter((entry) => entry.kind === 'file' && !entry.isLink && now - entry.mtimeMs >= YOUNG_MS)
    .map((entry) => blobIdOf(entry.name))
    .filter((id): id is string => id !== undefined && !live.has(id));
  const toRestore = trashed.filter((item) => live.has(item.id));
  const before = dayOf(now - GRACE_MS);
  const toRemove = trashed.filter((item) => !live.has(item.id) && item.day < before);
  return { toTrash, toRestore, toRemove };
}

/** What is in `<dir>/trash`, by day: none where there is no trash yet, null where there is one and it cannot be read. */
export async function trashIn(list: List, dir: string): Promise<Trashed[] | null> {
  const days = await listed(list, trashDir(dir));
  if (days === null) {
    // A trash that is there and cannot be listed is not an empty one: what is named in it would go unseen (#119).
    const top = await listed(list, dir);
    return top !== null && !top.some((entry) => entry.name === 'trash') ? [] : null;
  }
  const items: Trashed[] = [];
  for (const day of days) {
    if (day.kind !== 'dir' || day.isLink || !DATE.test(day.name)) continue;
    const entries = await listed(list, trashDayDir(dir, day.name));
    if (entries === null) return null;
    // A blob or its entry alone counts: a move may have stopped between the two.
    const ids = new Set<string>();
    for (const entry of entries) {
      const id = entry.kind === 'file' && !entry.isLink ? trashedIdOf(entry.name) : undefined;
      if (id !== undefined) ids.add(id);
    }
    for (const id of ids) items.push({ day: day.name, id });
  }
  return items;
}

/** How many paths go to one command: far under the argument limit of macOS (about 1 MB) at about 150 bytes a path. */
const PER_COMMAND = 2000;

async function runIn(exec: Exec, program: string, flags: readonly string[], paths: readonly string[], last: readonly string[] = []): Promise<boolean> {
  for (let at = 0; at < paths.length; at += PER_COMMAND) {
    const code = await exitOf((argv) => exec(argv, 60_000), program, [...flags, '--', ...paths.slice(at, at + PER_COMMAND), ...last]);
    // 1 is a path another session, or a recall, moved first: nothing to do for it. Null is a program that did not start.
    if (code !== 0 && code !== 1) return false;
  }
  return true;
}

const trashedAt = (dir: string, item: Trashed) => trashedPaths(dir, item.day, item.id);

/** Puts back from the trash each of `ids` that is there. Resolves with how many were. */
export async function restore(list: List, exec: Exec, dir: string, ids: ReadonlySet<string>): Promise<number> {
  const trashed = await trashIn(list, dir);
  if (!trashed) return 0;
  const wanted = trashed.filter((item) => ids.has(item.id));
  if (wanted.length === 0) return 0;
  await putBack(exec, dir, wanted);
  return wanted.length;
}

const IN_TEXT = /[0-9a-f]{64}/g;

/** The ids of the kept parts a conversation names: where `restoreThroughParts` starts reading. */
export function partIds(messages: readonly Message[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const line of message.text.split('\n')) {
      const part = readPartTicket(line);
      if (part) ids.add(part.id);
    }
  }
  return ids;
}

/**
 * Puts back from the trash each of `ids` that is there in any of `dirs`, and
 * every id written in the kept parts among `parts`, through the parts of
 * earlier summaries: a part's results are named in the part alone (ADR 0007),
 * so they go to the trash with it and come back with it. `parts` are the ids
 * that may be parts; the others are not read. The trash is listed again only
 * to put back what it holds, and nothing is read while it is empty. What cannot be put back, or a part that
 * cannot be read, is passed over: it is answered as not stored. Never throws.
 * Resolves with how many were put back.
 */
export async function restoreThroughParts(
  files: Files,
  list: List,
  exec: Exec,
  dirs: readonly string[],
  ids: ReadonlySet<string>,
  parts: ReadonlySet<string> = ids,
): Promise<number> {
  const trashed = new Set<string>();
  for (const dir of dirs) for (const item of (await trashIn(list, dir).catch(() => null)) ?? []) trashed.add(item.id);
  if (trashed.size === 0) return 0;
  let restored = 0;
  const putBackNow = async (wanted: Iterable<string>) => {
    const these = new Set([...wanted].filter((id) => trashed.has(id)));
    if (these.size === 0) return;
    for (const dir of dirs) {
      try {
        restored += await restore(list, exec, dir, these);
      } catch {
        // Passed over: answered as not stored.
      }
    }
    for (const id of these) trashed.delete(id);
  };
  await putBackNow(ids);
  const named = new Set([...ids, ...parts]);
  let reading = [...parts];
  while (reading.length > 0 && trashed.size > 0) {
    const next: string[] = [];
    for (const id of reading) {
      try {
        // As the collection reads it: a part, or a text whose entry does not read (ADR 0033).
        if ((await isPart(files, dirs, id)) === false) continue;
        const got = await storedText(files, dirs, id);
        if (!got.ok) continue;
        for (const inner of got.text.match(IN_TEXT) ?? []) {
          if (named.has(inner)) continue;
          named.add(inner);
          next.push(inner);
        }
      } catch {
        // A part that cannot be read is passed over.
      }
    }
    // A part is put back before it is read.
    await putBackNow(next);
    reading = next;
  }
  return restored;
}

/**
 * Before a collection reads what the kept parts name: puts back from the trash
 * what the transcripts name, with what the parts among it name, as far as it
 * can, and resolves with the ids the trash still holds. A part whose entry is
 * in the trash is not known for a part, so what only it names would not be
 * counted as named: `namedThroughParts` stops at an id that is named, in the
 * trash and not in place. An id in both places is in place, and its copy in
 * the trash is the collection's to remove.
 */
export async function putBackNamed(files: Files, list: List, exec: Exec, dirs: readonly string[], live: ReadonlySet<string>): Promise<Set<string> | Stop> {
  await restoreThroughParts(files, list, exec, dirs, live);
  const left = new Set<string>();
  for (const dir of dirs) {
    const trashed = await trashIn(list, dir);
    if (trashed === null) return { stop: `the trash of ${dir} could not be listed`, kind: 'trash' };
    for (const item of trashed) left.add(item.id);
  }
  return left;
}

async function putBack(exec: Exec, dir: string, items: readonly Trashed[]): Promise<boolean> {
  const blobs = items.map((item) => trashedAt(dir, item)[0]);
  const entries = items.map((item) => trashedAt(dir, item)[1]);
  return (await runIn(exec, 'mv', ['-n'], blobs, [`${blobsDir(dir)}/`])) && (await runIn(exec, 'mv', ['-n'], entries, [`${indexDir(dir)}/`]));
}

export type Collected = { trashed: number; restored: number; removed: number } | Stop;

const blobNames = async (list: List, dir: string) => new Set(((await listed(list, blobsDir(dir))) ?? []).map((entry) => entry.name));
const entryNames = async (list: List, dir: string) => new Set(((await listed(list, indexDir(dir))) ?? []).map((entry) => entry.name));

/**
 * Removes what a write left in `tmp/` when it stopped partway: one of its own, by its name, a day old or more, which
 * no write still going takes so long to move (#119). Not through a link in the place of `tmp/`, where a write puts
 * nothing. One that cannot be removed stays, and stops nothing.
 */
async function sweepTmp(list: List, exec: Exec, dir: string, now: number): Promise<void> {
  if (!sweepsTmp((await listed(list, dir)) ?? [])) return;
  const leftovers = ((await listed(list, tmpDir(dir))) ?? []).filter((entry) => isLeftover(entry, now)).map((entry) => `${tmpDir(dir)}/${entry.name}`);
  if (leftovers.length > 0) await runIn(exec, 'rm', ['-f'], leftovers);
}

/** Whether the store's directory, as listed, holds a `tmp/` a clean-up sweeps: a plain directory, not a link. */
export const sweepsTmp = (top: readonly DirEntry[]) => top.some((entry) => entry.name === 'tmp' && entry.kind === 'dir' && !entry.isLink);

/** Whether an entry of `tmp/` is what a write left that a clean-up removes: a plain file of the name a write gives, a day old or more. */
export const isLeftover = (entry: DirEntry, now: number) => entry.kind === 'file' && !entry.isLink && isTmpPartName(entry.name) && now - entry.mtimeMs >= DAY;

/**
 * One collection of `dir` against the ids in use. What it reports is counted
 * on disk afterwards, not taken from what was asked: a command's exit code of
 * 1 says neither that it worked nor that it did not. A collection stopped
 * partway leaves what it moved in the trash, which `recall` and the next
 * collection put back when it is named.
 */
export async function collect(list: List, exec: Exec, dir: string, live: ReadonlySet<string>, now: number): Promise<Collected> {
  const blobs = await listed(list, blobsDir(dir));
  if (blobs === null) {
    // Nothing kept yet, or the first write stopped before it made blobs/: what it left in tmp/ goes all the same.
    await sweepTmp(list, exec, dir, now);
    return { trashed: 0, restored: 0, removed: 0 };
  }
  const trashed = await trashIn(list, dir);
  if (trashed === null) return { stop: `the trash of ${dir} could not be listed`, kind: 'trash' };
  const plan = planGc(blobs, trashed, live, now);
  if (plan.toRestore.length > 0) {
    if (!(await putBack(exec, dir, plan.toRestore))) return { stop: 'what is in use could not be put back', kind: 'move' };
    // What is left of them in the trash had a copy back in place already (`mv -n` kept it): the same text, by its name.
    const back = await blobNames(list, dir);
    const entries = await entryNames(list, dir);
    // Each copy only once the one in place is there: an entry whose move failed stays in the trash, to be put back.
    // And only from a day no clean-up is still moving into (ADR 0038): another, that names it no more, may be moving
    // the one in place into today's directory right now, and what it moves there is all that is left of it. A copy
    // in a newer day stays until a later clean-up, or goes a week after it is named by none.
    const settled = dayOf(now - DAY);
    const doubled = plan.toRestore.filter((item) => item.day < settled).flatMap((item) => {
      const [blob, entry] = trashedAt(dir, item);
      return [...(back.has(blobName(item.id)) ? [blob] : []), ...(entries.has(entryName(item.id)) ? [entry] : [])];
    });
    if (!(await runIn(exec, 'rm', ['-f'], doubled))) return { stop: 'the trash could not be emptied', kind: 'trash' };
  }
  if (plan.toTrash.length > 0) {
    const day = trashDayDir(dir, dayOf(now));
    if (!(await runIn(exec, 'mkdir', ['-p'], [day])) || (await listed(list, day)) === null) return { stop: 'the trash could not be made', kind: 'trash' };
    const indexed = await entryNames(list, dir);
    const entries = plan.toTrash.filter((id) => indexed.has(entryName(id))).map((id) => entryPath(dir, id));
    // The entry first: a blob without one is not offered, a blob gone with its entry still there is.
    if (!(await runIn(exec, 'mv', ['-n'], entries, [`${day}/`]))) return { stop: 'results could not be moved to the trash', kind: 'move' };
    if (!(await runIn(exec, 'mv', ['-n'], plan.toTrash.map((id) => blobPath(dir, id)), [`${day}/`]))) {
      return { stop: 'results could not be moved to the trash', kind: 'move' };
    }
  }
  if (plan.toRemove.length > 0 && !(await runIn(exec, 'rm', ['-f'], plan.toRemove.flatMap((item) => trashedAt(dir, item))))) {
    return { stop: 'the trash could not be emptied', kind: 'trash' };
  }
  await sweepTmp(list, exec, dir, now);
  const after = await blobNames(list, dir);
  const left = new Set(((await trashIn(list, dir)) ?? []).map((item) => `${item.day}/${item.id}`));
  return {
    trashed: plan.toTrash.filter((id) => !after.has(blobName(id))).length,
    restored: plan.toRestore.filter((item) => after.has(blobName(item.id))).length,
    removed: plan.toRemove.filter((item) => !left.has(`${item.day}/${item.id}`)).length,
  };
}
