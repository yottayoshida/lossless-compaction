// What `/lossless-store` says of the places results are kept in (ADR 0016):
// how much is kept, by what it was kept from, in the trash and left in
// `tmp/`, and how the clean-up has gone. It is counted from what the host
// lists of the directories, with sizes and times, from the index entries,
// which hold a size and a tool's name and nothing of a result, and from the
// clean-up's own record. No stored result is opened.

import { DATE, DAY, blobIdOf, blobsDir, entryIdOf, entryPath, indexDir, tmpDir, trashDayDir, trashDir, trashedIdOf } from './layout.ts';
import { listed, whyNotNow, FIRST_WAIT_MS, GC_EVERY_MS, type GcState, type List, type StopKind, type Unread } from './lifetime.ts';
import { PART, PLUGIN, isOwnTool } from './store.ts';
import type { DirEntry, Files } from './types.ts';

export type Tally = { count: number; bytes: number };

/** What one place results are read from holds. */
export type Counted =
  | {
      dir: string;
      results: Tally & { oldest: number | null; newest: number | null };
      /** By what each result was kept from, as its entry says. */
      from: { results: Tally; parts: Tally; own: Tally; unknown: Tally };
      entries: Tally;
      trash: (Tally & { day: string })[];
      /** What a write left in `tmp/`, and of it, what is over a day old. */
      tmp: Tally & { stale: number };
    }
  | { dir: string; missing: true };

/** A place the clean-up skips is not counted either: not there, a link, or not a directory. */
export function skipped(dir: string): Counted {
  return { dir, missing: true };
}

const filesIn = (entries: readonly DirEntry[] | null) => (entries ?? []).filter((entry) => entry.kind === 'file' && !entry.isLink);
const tally = (entries: readonly DirEntry[]): Tally => ({ count: entries.length, bytes: entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0) });

/** Counts one place. An entry that cannot be read is counted as from nothing known; a result is never read. */
export async function countStore(files: Files, list: List, dir: string, now: number): Promise<Counted> {
  const top = await listed(list, dir);
  if (top === null) return { dir, missing: true };
  // Named as the clean-up names them (src/layout.ts): what it would not collect is not counted as kept either.
  const blobs = filesIn(await listed(list, blobsDir(dir))).filter((entry) => blobIdOf(entry.name) !== undefined);
  const entries = filesIn(await listed(list, indexDir(dir))).filter((entry) => entryIdOf(entry.name) !== undefined);
  const from = { results: zero(), parts: zero(), own: zero(), unknown: zero() };
  const sizeOf = new Map(blobs.map((entry) => [blobIdOf(entry.name) as string, entry.size ?? 0]));
  for (const entry of entries) {
    const id = entryIdOf(entry.name) as string;
    const bytes = sizeOf.get(id);
    if (bytes === undefined) continue;
    let tool: unknown;
    try {
      tool = (JSON.parse(await files.read(entryPath(dir, id))) as { tool?: unknown }).tool;
    } catch {
      tool = undefined;
    }
    const into = typeof tool !== 'string' ? from.unknown : tool === PART ? from.parts : isOwnTool(tool) ? from.own : from.results;
    into.count += 1;
    into.bytes += bytes;
  }
  // A result without an entry is counted too: a write may have stopped between the two.
  const entered = new Set(entries.map((entry) => entryIdOf(entry.name) as string));
  for (const [id, bytes] of sizeOf) {
    if (entered.has(id)) continue;
    from.unknown.count += 1;
    from.unknown.bytes += bytes;
  }
  const times = blobs.map((entry) => entry.mtimeMs);
  const trash: (Tally & { day: string })[] = [];
  for (const day of await listed(list, trashDir(dir)) ?? []) {
    if (day.kind !== 'dir' || day.isLink || !DATE.test(day.name)) continue;
    const trashed = filesIn(await listed(list, trashDayDir(dir, day.name))).filter((entry) => trashedIdOf(entry.name) !== undefined);
    trash.push({ day: day.name, ...tally(trashed) });
  }
  const tmp = filesIn(await listed(list, tmpDir(dir)));
  return {
    dir,
    results: { ...tally(blobs), oldest: times.length > 0 ? Math.min(...times) : null, newest: times.length > 0 ? Math.max(...times) : null },
    from,
    entries: tally(entries),
    trash: trash.sort((a, b) => a.day.localeCompare(b.day)),
    tmp: { ...tally(tmp), stale: tmp.filter((entry) => now - entry.mtimeMs > DAY).length },
  };
}

function zero(): Tally {
  return { count: 0, bytes: 0 };
}

/**
 * What one stored thing that stopped a clean-up is, and how the clean-up goes on, in each place above that holds a file
 * under its id. Where taking it out loses what only it names, that is said.
 */
export const UNREAD_HOW: Record<Unread['why'], string> = {
  entry: 'its entry, index/<id>.json, could not be read, while recall may still read its text; write the entry back as {"bytes":<size of the text>,"tool":"conversation"}, or move both its files out of the store, after which what only it named is no longer kept',
  'text-missing': 'its text, blobs/<id>.txt, is not there; where you removed it yourself, remove index/<id>.json too in each place that has it, and the clean-up goes on. In a store a sync is still writing, wait for it',
  'text-changed': 'its text, blobs/<id>.txt, is not what was stored; put the stored text back, or move both its files out of the store, after which what only it named is no longer kept',
  'text-unreadable': 'its text, blobs/<id>.txt, could not be read; make it readable to you, or move both its files out of the store, after which what only it named is no longer kept',
  'in-trash': 'it is named and in the trash, and could not be put back; move its files from trash/<day>/ back into blobs/ and index/, and the clean-up goes on',
};

/** What each kind of stop is said as: no path, nothing a command printed. */
export const STOP_SAID: Record<StopKind, string> = {
  unread: 'the transcripts could not be read to the end',
  'too-many': 'one directory of transcripts held more ids than one search can return',
  place: 'a place transcripts are kept in is gone, or could not be looked at or listed',
  part: 'a stored thing it follows, a kept part of a conversation or what one names, could not be read',
  trash: 'the trash could not be listed, made or emptied',
  move: 'results could not be moved to or from the trash',
  unexpected: 'an error the clean-up does not name',
};

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const timeText = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const dayText = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const tallyText = (one: Tally) => `${one.count} (${sizeText(one.bytes)})`;

/**
 * What `/lossless-store` answers: each place results are read from, then the
 * clean-up. `setByStoreDir` says the place was chosen by the `storeDir`
 * setting, so no other place is read. Claude Code puts the plugin's name in
 * front of it, so it does not.
 */
export function storeReport(counted: readonly Counted[], gc: GcState, now: number, setByStoreDir: boolean): string {
  const lines: string[] = [`Results are kept in ${counted.length === 1 ? 'one place' : `${counted.length} places`}${setByStoreDir ? ', set by storeDir' : ''}:`];
  for (const one of counted) {
    lines.push('', one.dir);
    if ('missing' in one) {
      lines.push('  not there, or not a plain directory');
      continue;
    }
    const span = one.results.oldest === null || one.results.newest === null ? '' : `, ${dayText(one.results.oldest)} to ${dayText(one.results.newest)}`;
    lines.push(`  results: ${tallyText(one.results)}${span}; their entries: ${tallyText(one.entries)}`);
    lines.push(
      `  kept from: tool results ${tallyText(one.from.results)}, kept conversations ${tallyText(one.from.parts)}, ` +
        `${PLUGIN}'s own tools ${tallyText(one.from.own)}` +
        (one.from.unknown.count > 0 ? `, no readable entry ${tallyText(one.from.unknown)}` : ''),
    );
    const trashed = one.trash.reduce((sum, day) => ({ count: sum.count + day.count, bytes: sum.bytes + day.bytes }), zero());
    lines.push(
      `  trash: ${one.trash.length === 0 ? 'empty' : `${tallyText(trashed)} files, by day moved there: ${one.trash.map((day) => `${day.day} ${tallyText(day)}`).join(', ')}`}`,
    );
    lines.push(
      `  tmp/: ${one.tmp.count === 0 ? 'empty' : `${tallyText(one.tmp)} files` + (one.tmp.stale > 0 ? `, ${one.tmp.stale} over a day old, left by a write that stopped; those can be removed by hand` : '')}`,
    );
  }
  lines.push('', 'clean-up:');
  lines.push(`  last ended: ${gc.lastRun > 0 ? timeText(gc.lastRun) : 'never'}; last tried: ${gc.tried > 0 ? timeText(gc.tried) : 'never'}`);
  lines.push(`  tried since it last ended: ${gc.tries}${gc.stopped === null ? '' : `; last stopped ${timeText(gc.stopped.at)}: ${STOP_SAID[gc.stopped.kind]}`}`);
  // What stopped it, one stored thing each, and how to go on: in whichever place above holds it (#114).
  for (const one of gc.stopped?.unread ?? []) lines.push(`    ${one.id}: ${UNREAD_HOW[one.why]}`);
  if ((gc.stopped?.more ?? 0) > 0) lines.push(`    and ${gc.stopped?.more} more, named once these are gone past`);
  const why = whyNotNow(gc, now);
  if (why?.kind === 'first-week') {
    lines.push(`  next: not before ${timeText(gc.firstSeen + FIRST_WAIT_MS)}, the first week after transcripts were found`);
  } else {
    lines.push(`  next: ${why?.text ?? 'tried when a session starts, once the place results are kept in is made private'}`);
  }
  lines.push('', 'Results are plain text on this machine (docs/limits.md, "The files").');
  return lines.join('\n');
}

/** How long without a clean-up that ended before a session says so: two of its weeks, so that one missed is not said (ADR 0016). */
export const LATE_MS = 2 * GC_EVERY_MS;

/**
 * Since when no clean-up has ended, when that is `LATE_MS` or more: the last
 * that ended, or, if none ever has, the first place transcripts are kept in
 * that was recorded, or, if none is on record, the oldest result kept. Null
 * when it is less, and when that time is ahead of `now` (a clock that ran
 * ahead), which holds the clean-up back as well until it is reached.
 */
export function lateSince(gc: GcState, oldestResult: number | null, now: number): number | null {
  const since = gc.lastRun > 0 ? gc.lastRun : gc.roots.length > 0 ? gc.firstSeen : oldestResult;
  return since !== null && since > 0 && now - since >= LATE_MS ? since : null;
}

/** The line a session starts with when no clean-up has ended since `since`. How to record a place is not promised: it takes more than one thing. */
export function lateLine(since: number, now: number, noPlace: boolean): string {
  return (
    `moved-out results have not been cleaned up since ${dayText(since)} UTC (${Math.floor((now - since) / DAY)} days)` +
    (noPlace ? ', and no place transcripts are kept in is on record' : '') +
    '; /lossless-store says how the clean-up went'
  );
}

/** The time of the oldest result in `dirs`, or null when there is none: what a store with no place recorded is late since. */
export async function oldestResult(list: List, dirs: readonly string[]): Promise<number | null> {
  let oldest: number | null = null;
  for (const dir of dirs) {
    for (const entry of filesIn(await listed(list, blobsDir(dir)))) {
      if (blobIdOf(entry.name) !== undefined && (oldest === null || entry.mtimeMs < oldest)) oldest = entry.mtimeMs;
    }
  }
  return oldest;
}
