// What `/lossless-store check` says of the places results are kept in (#117): every text and entry each holds, in
// place and in each day of the trash, read and held against the name it is kept under; each id whose files are not
// whole named by the start of the id, with what that does to recall, an export and a compaction. It reads each stored
// text to hash it, shows none of it, and writes nothing.

import { bytesOf, idOf } from './blobs.ts';
import { DATE, DAY, blobIdOf, blobsDir, entryIdOf, indexDir, tmpDir, trashDayDir, trashDir, trashedIdOf } from './layout.ts';
import { listed, type List } from './lifetime.ts';
import type { DirEntry, Files } from './types.ts';

/** What can be wrong with what one place keeps under an id, in the order it is told in: an id is named under the first that fits. */
export const DAMAGE = ['link', 'text-changed', 'text-missing', 'entry-unreadable', 'size-differs', 'entry-missing', 'trash-copy'] as const;
export type Damage = (typeof DAMAGE)[number];

/** How each kind is said, and what it does: no path, nothing of a text. */
export const DAMAGE_SAID: Record<Damage, string> = {
  link: 'a link where a text or an entry is kept (recall refuses it)',
  'text-changed': 'a text that no longer has the hash it is named by, or does not read (recall refuses it)',
  'text-missing': 'an entry with no text (recall finds nothing here)',
  'entry-unreadable': 'an entry that does not read, or names no tool (recall gives the text back; /lossless-export leaves it out)',
  'size-differs': 'an entry that gives another size than its text, or none (recall gives the text back; a compaction does not take its ticket for one it wrote)',
  'entry-missing': 'a text with no entry (recall finds nothing here)',
  'trash-copy': 'a copy in the trash that is not whole, beside a whole text and entry in place (recall gives the one in place back; were the one in place to go to the trash too, either could come back)',
};

/** A file younger than this is not judged: a write may be between its text and its entry. */
export const WRITING_MS = 60 * 1000;
/** How much of a hook's time is left when the check stops and answers with what it has. */
export const STOP_WITH_MS = 2_000;
/** How many ids of one kind are named at most; the rest are counted. */
export const NAMED_AT_MOST = 50;

/** The start of an id it is named by: enough to find its files, and no id a search of the transcripts takes for one. */
export const idStart = (id: string) => id.slice(0, 16);

/** A place to check: whether it is there as a plain directory, and whether recall puts back from its trash. */
export type Place = { dir: string; there: boolean; putsBack: boolean };
/** Where a check goes on from: the place, counted from 1 in the order they are read, and the start of an id there. */
export type From = { place: number; id: string };

export type Judged = {
  dir: string;
  putsBack: boolean;
  /** Ids judged, and of them, those kept in the trash alone. */
  judged: number;
  inTrash: number;
  damaged: Record<Damage, string[]>;
  /** Ids whose text and entry are whole and stand apart, one in place and one in the trash, or in two days of it. */
  apart: number;
  /** Ids with a file under a minute old, not judged. */
  young: number;
  /** Ids this run did not reach, from the first of them. */
  unreached: number;
  tmp: { count: number; stale: number };
};

/** What one place came to in this run. */
export type Checked =
  | Judged
  | { dir: string; state: 'missing' | 'unlisted' | 'before' | 'after' };

type Copy = { path: string; mtimeMs: number; at: string; link: boolean };

/** Whether a listed entry is a file the place keeps under `name`, or a link put in its place. */
const kept = (entry: DirEntry) => entry.kind === 'file' || entry.isLink;

/**
 * Checks every place, in the order they are read, from `from` on, until the time a command has runs short; says
 * where a later run goes on from, or null when nothing is left.
 */
export async function checkPlaces(
  files: Files,
  list: List,
  places: readonly Place[],
  now: number,
  timeLeft: () => number,
  from: From | null,
): Promise<{ checked: Checked[]; next: From | null }> {
  const checked: Checked[] = [];
  let next: From | null = null;
  for (const [at, place] of places.entries()) {
    const number = at + 1;
    if (from !== null && number < from.place) {
      checked.push({ dir: place.dir, state: 'before' });
      continue;
    }
    if (next !== null) {
      checked.push({ dir: place.dir, state: 'after' });
      continue;
    }
    if (!place.there) {
      checked.push({ dir: place.dir, state: 'missing' });
      continue;
    }
    const start = from !== null && number === from.place ? from.id : '';
    const one = await checkStore(files, list, place, now, timeLeft, start);
    checked.push('state' in one ? one : one.judged);
    if (!('state' in one) && one.next !== null) next = { place: number, id: one.next };
  }
  return { checked, next };
}

/**
 * Checks one place, the ids from `start` on in their order. Texts are read and hashed; entries are read; nothing is
 * written. Below `STOP_WITH_MS` of the command's time it stops, and says the first id it did not reach.
 */
export async function checkStore(
  files: Files,
  list: List,
  place: Place,
  now: number,
  timeLeft: () => number,
  start = '',
): Promise<{ judged: Judged; next: string | null } | { dir: string; state: 'missing' | 'unlisted' }> {
  const { dir } = place;
  const top = await listed(list, dir);
  if (top === null) return { dir, state: 'missing' };
  // A directory that is there and cannot be listed is not an empty one: what is in it cannot be told.
  const lists = async (path: string, name: string) => {
    const got = await listed(list, path);
    return got === null && top.some((entry) => entry.name === name) ? null : (got ?? []);
  };
  const blobs = await lists(blobsDir(dir), 'blobs');
  const index = await lists(indexDir(dir), 'index');
  const days = await lists(trashDir(dir), 'trash');
  if (blobs === null || index === null || days === null) return { dir, state: 'unlisted' };
  const texts = new Map<string, Copy[]>();
  const entries = new Map<string, Copy[]>();
  const add = (into: Map<string, Copy[]>, id: string, copy: Copy) => into.set(id, [...(into.get(id) ?? []), copy]);
  for (const entry of blobs) {
    const id = kept(entry) ? blobIdOf(entry.name) : undefined;
    if (id !== undefined) add(texts, id, { path: `${blobsDir(dir)}/${entry.name}`, mtimeMs: entry.mtimeMs, at: 'in place', link: entry.isLink });
  }
  for (const entry of index) {
    const id = kept(entry) ? entryIdOf(entry.name) : undefined;
    if (id !== undefined) add(entries, id, { path: `${indexDir(dir)}/${entry.name}`, mtimeMs: entry.mtimeMs, at: 'in place', link: entry.isLink });
  }
  for (const day of days) {
    if (day.kind !== 'dir' || day.isLink || !DATE.test(day.name)) continue;
    const held = await listed(list, trashDayDir(dir, day.name));
    if (held === null) return { dir, state: 'unlisted' };
    for (const entry of held) {
      const id = kept(entry) ? trashedIdOf(entry.name) : undefined;
      if (id === undefined) continue;
      const copy = { path: `${trashDayDir(dir, day.name)}/${entry.name}`, mtimeMs: entry.mtimeMs, at: day.name, link: entry.isLink };
      add(entry.name.endsWith('.txt') ? texts : entries, id, copy);
    }
  }
  const judged: Judged = {
    dir,
    putsBack: place.putsBack,
    judged: 0,
    inTrash: 0,
    damaged: Object.fromEntries(DAMAGE.map((kind) => [kind, [] as string[]])) as Record<Damage, string[]>,
    apart: 0,
    young: 0,
    unreached: 0,
    tmp: { count: 0, stale: 0 },
  };
  const ids = [...new Set([...texts.keys(), ...entries.keys()])].filter((id) => id >= start).sort();
  let next: string | null = null;
  for (const [at, id] of ids.entries()) {
    // One at least, so that a run from where the last one stopped goes on however little time it has.
    if (at > 0 && timeLeft() < STOP_WITH_MS) {
      next = id;
      judged.unreached = ids.length - at;
      break;
    }
    const text = texts.get(id) ?? [];
    const entry = entries.get(id) ?? [];
    if ([...text, ...entry].some((copy) => now - copy.mtimeMs < WRITING_MS)) {
      judged.young += 1;
      continue;
    }
    judged.judged += 1;
    if ([...text, ...entry].every((copy) => copy.at !== 'in place')) judged.inTrash += 1;
    const found = await judge(files, id, text, entry);
    if (found === 'apart') judged.apart += 1;
    else if (found !== null) judged.damaged[found].push(id);
  }
  const left = ((await listed(list, tmpDir(dir))) ?? []).filter((entry) => entry.kind === 'file' && !entry.isLink);
  judged.tmp = { count: left.length, stale: left.filter((entry) => now - entry.mtimeMs >= DAY).length };
  return { judged, next };
}

/**
 * What is wrong with what a place keeps under `id`, the first that fits, every copy of it counted: one copy not
 * whole is named, though another is, since recall reads the one in place first and puts back no copy over it.
 * 'apart' where the text and its entry are whole and stand in two places of it; null where they are whole together.
 */
async function judge(files: Files, id: string, texts: readonly Copy[], entries: readonly Copy[]): Promise<Damage | 'apart' | null> {
  // recall, an export and a compaction read the text and the entry in place: where those are whole, what is wrong
  // with a copy in the trash does nothing to them now, and is told as that.
  const textInPlace = texts.filter((copy) => copy.at === 'in place');
  const entryInPlace = entries.filter((copy) => copy.at === 'in place');
  if (textInPlace.length === 1 && entryInPlace.length === 1 && (await judgeCopies(files, id, textInPlace, entryInPlace)) === null) {
    const all = await judgeCopies(files, id, texts, entries);
    return all === null || all === 'apart' ? null : 'trash-copy';
  }
  return judgeCopies(files, id, texts, entries);
}

/** What is wrong with `texts` and `entries` together, the first that fits, every copy counted. */
async function judgeCopies(files: Files, id: string, texts: readonly Copy[], entries: readonly Copy[]): Promise<Damage | 'apart' | null> {
  if ([...texts, ...entries].some((copy) => copy.link)) return 'link';
  let bytes: number | null = null;
  for (const copy of texts) {
    let text: string;
    try {
      text = await files.read(copy.path);
    } catch {
      return 'text-changed';
    }
    if ((await idOf(text)) !== id) return 'text-changed';
    bytes = bytesOf(text);
  }
  if (texts.length === 0) return 'text-missing';
  // As an export reads an entry, for its tool; as a compaction reads it, for its size.
  const sizes: unknown[] = [];
  for (const copy of entries) {
    try {
      const value = JSON.parse(await files.read(copy.path)) as { bytes?: unknown; tool?: unknown } | null;
      if (typeof value?.tool !== 'string') return 'entry-unreadable';
      sizes.push(value.bytes);
    } catch {
      return 'entry-unreadable';
    }
  }
  if (sizes.some((size) => size !== bytes)) return 'size-differs';
  if (entries.length === 0) return 'entry-missing';
  // Whole, and together where some part of the place holds a text and an entry of it.
  return texts.some((text) => entries.some((entry) => entry.at === text.at)) ? null : 'apart';
}

/** What `/lossless-store check` answers. */
export function checkReport(checked: readonly Checked[], next: From | null, tookMs: number): string {
  const lines: string[] = [];
  let damaged = 0;
  for (const one of checked) {
    lines.push(one.dir);
    if ('state' in one) {
      lines.push(`  ${PLACE_SAID[one.state]}`, '');
      continue;
    }
    lines.push(`  checked: ${one.judged}${one.inTrash > 0 ? `, ${one.inTrash} of them in the trash alone` : ''}`);
    if (!one.putsBack) lines.push('  an earlier place: recall reads what is in place here, and puts back nothing from its trash');
    for (const kind of DAMAGE) {
      const ids = one.damaged[kind];
      if (ids.length === 0) continue;
      damaged += ids.length;
      const named = ids.slice(0, NAMED_AT_MOST).map(idStart).join(', ');
      lines.push(`  ${DAMAGE_SAID[kind]}: ${ids.length}: ${named}${ids.length > NAMED_AT_MOST ? `, and ${ids.length - NAMED_AT_MOST} more` : ''}`);
    }
    if (one.apart > 0) {
      lines.push(
        one.putsBack
          ? `  whole, a text and its entry apart in place and in the trash: ${one.apart}; put back when asked for`
          : `  whole, a text and its entry apart in place and in the trash: ${one.apart}; recall puts back from the trash of the place results are kept in alone, so not these`,
      );
    }
    if (one.young > 0) lines.push(`  being written, under a minute old: ${one.young}, not checked`);
    if (one.unreached > 0) lines.push(`  not reached in the time a command has: ${one.unreached}`);
    if (one.tmp.count > 0) lines.push(`  tmp/: ${one.tmp.count} files, ${one.tmp.stale} a day old or more`);
    lines.push('');
  }
  const seconds = (tookMs / 1000).toFixed(1);
  lines.push(
    damaged === 0
      ? `None damaged${next === null ? '' : ' of what was checked'}, in ${seconds} s.`
      : `${damaged} not whole, in ${seconds} s. Each id is named by its first 16 characters: ls blobs/<them>* index/<them>* trash/*/<them>* finds its files.`,
  );
  if (next !== null) lines.push(`Not all was checked in the time a command has: /lossless-store check from ${next.place}:${idStart(next.id)} goes on from there.`);
  return lines.join('\n');
}

const PLACE_SAID: Record<'missing' | 'unlisted' | 'before' | 'after', string> = {
  missing: 'not there, or not a plain directory',
  unlisted: 'there, and could not be listed: not checked',
  before: 'checked by an earlier run, before where this one went on from',
  after: 'not reached in the time a command has',
};

/** `check`, or `check from <place>:<start of an id>` as a run that did not reach the end says it; null for anything else. */
export function checkAsked(args: string): { from: From | null } | null {
  const asked = /^check(?:\s+from\s+([1-9]\d{0,3}):([0-9a-f]{16}))?$/.exec(args.trim());
  if (asked === null) return null;
  return { from: asked[1] === undefined || asked[2] === undefined ? null : { place: Number(asked[1]), id: asked[2] } };
}
