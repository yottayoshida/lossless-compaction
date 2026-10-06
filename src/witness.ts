// A witness: the newest ticket of a conversation the plugin compacted (ADR 0027).
//
// A clean-up keeps what the transcripts name and moves the rest to the trash. It reads the transcripts with one
// search; were Claude Code to write them otherwise — another file name, another spelling of an id, inside a
// directory, or only what it writes from now on — the search would find none of those tickets, and the clean-up
// would take their results for unused. A witness is how that is told from a conversation that is gone: before
// anything moves, each conversation's own transcript, `<session>.jsonl`, is looked at for its witness. Not found
// there, or the transcript under another name, stops the clean-up. Nothing of the conversation left lets it go.

import { GREP, listed, type Stop } from './lifetime.ts';
import { put } from './blobs.ts';
import { tmpDir, witnessDir, witnessPath } from './layout.ts';
import { idOf, readBodyTicket, readPartTicket, readTicket } from './store.ts';
import type { DirEntry, Exec, Files, Message } from './types.ts';

/** How Claude Code names a session, as `rootFor` reads it. */
export const SESSION = /^[0-9A-Za-z_-]{1,128}$/;
const ID = /^[0-9a-f]{64}$/;

/** The folders Claude Code keeps beside a transcript, under its session id: what is in them is not the conversation. */
export const BESIDE = new Set(['subagents', 'tool-results', 'workflows']);

/**
 * The tickets of a conversation, newest first, of every kind: the newest is the one most lately written, so that a
 * transcript written otherwise from some point on is told by it, whatever was written before.
 */
export function witnessCandidates(messages: readonly Message[]): string[] {
  const ids: string[] = [];
  for (let at = messages.length - 1; at >= 0; at -= 1) {
    const message = messages[at];
    if (message === undefined) continue;
    for (const line of message.text.split('\n').reverse()) {
      const ticket = readPartTicket(line) ?? readBodyTicket(line);
      if (ticket) ids.push(ticket.id);
    }
    for (const result of [...(message.toolResults ?? [])].reverse()) {
      const ticket = readTicket(result.text);
      if (ticket) ids.push(ticket.id);
    }
  }
  return [...new Set(ids)];
}

/**
 * The tickets of the conversation a compaction hands back, those it put in first: a cut puts its parts' tickets in
 * front of what stays, so that by place alone an older ticket behind them would be taken for the newest.
 */
export function newestOf(after: readonly Message[], before: readonly Message[]): string[] {
  const had = new Set(witnessCandidates(before));
  const all = witnessCandidates(after);
  return [...all.filter((id) => !had.has(id)), ...all.filter((id) => had.has(id))];
}

/**
 * Notes the witness of this session's conversation: the newest of `candidates` the store holds. It is not looked for
 * on disk here: a transcript Claude Code writes otherwise from the start has none to find it in, and that is what is
 * to be told. One shown but never written — a write Claude Code could not make — stops clean-ups until a later
 * compaction or a resume notes another.
 */
export async function noteWitness(
  files: Files,
  dir: string,
  sessionId: string,
  candidates: readonly string[],
  held: (id: string) => Promise<boolean>,
  now: number,
  options: { keepStanding?: boolean } = {},
): Promise<string | null> {
  if (!SESSION.test(sessionId)) return null;
  const path = witnessPath(dir, await idOf(sessionId));
  // At the start of a session: the witness noted at its last compaction stays while the conversation still shows it
  // (one never written is not shown by a conversation read back from its transcript, and is replaced).
  if (options.keepStanding === true) {
    try {
      const standing = (JSON.parse(await files.read(path)) as { id?: unknown }).id;
      if (typeof standing === 'string' && candidates.includes(standing)) return standing;
    } catch {
      // None, or none that reads: noted anew.
    }
  }
  for (const id of candidates) {
    if (!(await held(id))) continue;
    // Written whole, beside it under tmp/ and moved into place: a clean-up reading it meanwhile reads the one before.
    const failed = await put(files, path, JSON.stringify({ session: sessionId, id, at: now }), tmpDir(dir));
    return failed === null ? id : null;
  }
  return null;
}

/** Whether `id` is written in the file at `path`: null when no grep could be run on it. */
async function writtenIn(exec: Exec, id: string, path: string): Promise<boolean | null> {
  for (const grep of GREP) {
    try {
      const { exitCode } = await exec([grep, '-F', '-q', '--', id, path], 30_000);
      if (exitCode === 0) return true;
      if (exitCode === 1) return false;
    } catch {
      // Not there, or out of time: the next grep, if any.
    }
  }
  return null;
}

type Found = { transcript: string } | { left: string } | { gone: true } | null;

/**
 * What stands for a session in the places transcripts are kept in: its transcript; else another file named for it,
 * or something of the conversation in its directory; else nothing. Null when a place cannot be listed.
 */
async function foundOf(list: (path: string) => Promise<DirEntry[] | null>, projects: readonly string[], sessionId: string): Promise<Found> {
  let left: string | null = null;
  for (const project of projects) {
    const entries = await list(project);
    if (entries === null) return null;
    for (const entry of entries) {
      if (entry.name === `${sessionId}.jsonl` && entry.kind === 'file' && !entry.isLink) return { transcript: `${project}/${entry.name}` };
      if (entry.name.startsWith(`${sessionId}.`)) left ??= `a file ${entry.name}`;
      if (entry.name !== sessionId || entry.kind !== 'dir') continue;
      const inner = await list(`${project}/${entry.name}`);
      if (inner === null) return null;
      // Beside a transcript Claude Code keeps folders of its own, and a system may leave a hidden file: anything
      // else in there may be the conversation.
      const other = inner.find((one) => !BESIDE.has(one.name) && !one.name.startsWith('.'));
      if (other !== undefined) left ??= `${other.name} in its directory`;
    }
  }
  return left === null ? { gone: true } : { left };
}

/**
 * Looks each witness up in its conversation's own transcript. Written there, it passes. The transcript there and
 * the witness not in it, or no transcript but something else standing for the conversation, or a place that cannot
 * be listed, stops the clean-up: the search would no longer read what the conversation names. Nothing of the
 * conversation left, the witness is removed; so is one that does not read as a witness.
 */
export async function checkWitnesses(
  files: Files,
  list: (path: string) => Promise<DirEntry[]>,
  exec: Exec,
  remove: (path: string) => Promise<void>,
  dir: string,
  roots: readonly string[],
): Promise<Stop | null> {
  let projects: string[] | null = null;
  const seen = new Map<string, Promise<DirEntry[] | null>>();
  const look = (path: string) => {
    let one = seen.get(path);
    if (one === undefined) seen.set(path, (one = listed(list, path)));
    return one;
  };
  for (const entry of (await listed(list, witnessDir(dir))) ?? []) {
    if (entry.kind !== 'file' || entry.isLink || !entry.name.endsWith('.json')) continue;
    const path = `${witnessDir(dir)}/${entry.name}`;
    let witness: { session?: unknown; id?: unknown } | undefined;
    try {
      witness = JSON.parse(await files.read(path)) as { session?: unknown; id?: unknown };
    } catch {
      witness = undefined;
    }
    // A witness that does not read as one tells nothing: it goes, and stops nothing (noted again at the next compaction).
    if (typeof witness?.session !== 'string' || !SESSION.test(witness.session) || typeof witness.id !== 'string' || !ID.test(witness.id)) {
      await remove(path);
      continue;
    }
    projects ??= await projectsIn(list, roots);
    const found = projects === null ? null : await foundOf(look, projects, witness.session);
    if (found === null) return { stop: 'a place transcripts are kept in could not be listed to look for a conversation compacted with tickets', kind: 'place' };
    if ('gone' in found) {
      await remove(path);
      continue;
    }
    if ('left' in found) return { stop: `a conversation compacted with tickets is still there (${found.left}), where the search does not read it`, kind: 'unread' };
    const written = await writtenIn(exec, witness.id, found.transcript);
    if (written === null) return { stop: 'no grep could be run on the transcript of a conversation compacted with tickets', kind: 'unread' };
    if (!written) return { stop: 'the transcript of a conversation compacted with tickets does not hold its newest ticket as the search reads one', kind: 'unread' };
  }
  return null;
}

/** The project directories under `roots`, or null when one cannot be listed. A link is not one: the search does not follow it. */
async function projectsIn(list: (path: string) => Promise<DirEntry[]>, roots: readonly string[]): Promise<string[] | null> {
  const projects: string[] = [];
  for (const root of roots) {
    const entries = await listed(list, root);
    if (entries === null) return null;
    for (const entry of entries) if (entry.kind === 'dir' && !entry.isLink) projects.push(`${root}/${entry.name}`);
  }
  return projects;
}
