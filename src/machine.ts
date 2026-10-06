// The machines a store is used from (#113, ADR 0032).
//
// A clean-up keeps what this machine's transcripts name. A store used from another machine as well — a synced
// folder, a network drive, `storeDir` set alike on both — holds results that only the other machine's transcripts
// name, which this one cannot read: it would take them for unused and remove them. So each session marks the store
// with the machine it runs on and its own session id, the last few kept; and a clean-up that finds a mark none of
// whose sessions it can read the transcript of, and that is not of this session, moves nothing. A container made
// again over the same transcripts reads its earlier self's sessions, and goes on.

import { exitOf, type Start } from './commands.ts';
import { machinePath, machinesDir } from './layout.ts';
import { listed, type List } from './lifetime.ts';
import type { Files } from './types.ts';

const ID = /^[0-9a-f]{32}$/;
/** How Claude Code names a session, as the transcripts' file names do. */
const SESSION = /^[0-9A-Za-z_-]{1,128}$/;
/** A mark's name: a machine's id, or, where none could be made, one session's. */
const NAME = /^(?:[0-9a-f]{32}|session-[0-9A-Za-z_-]{1,128})$/;
const ABSOLUTE = /^(\/|[A-Za-z]:[\\/])/;
/** How many of a machine's sessions its mark keeps, newest first. */
const SESSIONS = 3;

/**
 * Where this machine's id is kept: `~/.local/state/lossless-compaction/machine.json`. Not under `XDG_STATE_HOME`,
 * which a terminal and an app started otherwise may see differently; not under `~/.claude`, which is synced in some
 * setups with its transcripts left out. Null where the home directory is not an absolute path.
 */
export function machineFileFrom(home: string | undefined): string | null {
  const dir = (home ?? '').trim().replace(/[\\/]+$/, '');
  return ABSOLUTE.test(dir) ? `${dir}/.local/state/lossless-compaction/machine.json` : null;
}

/** The id a machine file holds, or null: read only, nothing made. */
export async function idIn(files: Files, path: string): Promise<string | null> {
  try {
    const id = (JSON.parse(await files.read(path)) as { id?: unknown }).id;
    return typeof id === 'string' && ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * This machine's id, made the first time: written beside the file and linked into place, which fails where a file is
 * there already, then read back, so that two sessions starting together keep one id, whichever linked first. Where no
 * command runs (no `ln`), written in place. Null where it can be neither read nor made: the session's marks are then
 * named by its session.
 */
export async function machineIdOf(files: Files, run: Start<{ exitCode: number }>, path: string): Promise<string | null> {
  const there = await idIn(files, path);
  if (there !== null) return there;
  const made = crypto.randomUUID().replaceAll('-', '');
  try {
    // `ln` with nothing to link only says how it is used: whether it can be started at all.
    if ((await exitOf(run, 'ln', [])) === null) {
      await files.write(path, JSON.stringify({ id: made }));
      return idIn(files, path);
    }
    const part = `${path}.${made}.part`;
    await files.write(part, JSON.stringify({ id: made }));
    // A link is made, or fails because a file is there: never written over. What is there is read either way.
    await exitOf(run, 'ln', ['--', part, path]);
    await exitOf(run, 'rm', ['-f', '--', part]);
  } catch {
    return null;
  }
  return idIn(files, path);
}

/** A mark in a store: whose (a machine's id, or one session's), its latest sessions, and when it was first and last made. */
export type Mark = { name: string; sessions: readonly string[]; first: number; last: number };

/** The name a session marks a store under: its machine's, or, with none, its own. */
export const markName = (machine: string | null, session: string): string | null =>
  machine !== null ? machine : SESSION.test(session) ? `session-${session}` : null;

/** Marks the store `dir` as used by `session`, on the machine `name` names, now; its latest sessions kept. */
export async function noteMachine(files: Files, dir: string, name: string, session: string, now: number): Promise<void> {
  if (!NAME.test(name) || !SESSION.test(session)) return;
  const path = machinePath(dir, name);
  let first = now;
  let before: string[] = [];
  try {
    const held = JSON.parse(await files.read(path)) as { first?: unknown; sessions?: unknown };
    if (typeof held.first === 'number' && held.first > 0 && held.first <= now) first = held.first;
    if (Array.isArray(held.sessions)) before = held.sessions.filter((one): one is string => typeof one === 'string' && SESSION.test(one));
  } catch {
    // None yet, or none that reads: first marked now.
  }
  const sessions = [session, ...before.filter((one) => one !== session)].slice(0, SESSIONS);
  await files.write(path, JSON.stringify({ first, last: now, sessions }));
}

/** The earlier of two times, a time not known (0) giving way to one that is. */
const earliest = (a: number, b: number): number => (a > 0 && b > 0 ? Math.min(a, b) : a || b);

/**
 * The marks in each of `dirs`, one for each name, their sessions and times put together. Null where a `machines/`
 * directory is there but cannot be listed: whose marks it holds cannot be told.
 */
export async function marksIn(files: Files, list: List, dirs: readonly string[]): Promise<Mark[] | null> {
  const marks = new Map<string, Mark>();
  for (const dir of dirs) {
    const entries = await listed(list, machinesDir(dir));
    if (entries === null) {
      const found = await files.stat(machinesDir(dir)).catch(() => null);
      if (found === null) continue;
      return null;
    }
    for (const entry of entries) {
      const name = entry.name.endsWith('.json') ? entry.name.slice(0, -'.json'.length) : '';
      if (!NAME.test(name) || entry.kind !== 'file' || entry.isLink) continue;
      let held: { first?: unknown; last?: unknown; sessions?: unknown } = {};
      try {
        held = JSON.parse(await files.read(machinePath(dir, name))) as typeof held;
      } catch {
        // What it holds is not known; it is a mark all the same, of no session this machine can read.
      }
      const first = typeof held.first === 'number' ? held.first : 0;
      const last = typeof held.last === 'number' ? held.last : 0;
      const sessions = Array.isArray(held.sessions) ? held.sessions.filter((one): one is string => typeof one === 'string' && SESSION.test(one)) : [];
      const seen = marks.get(name);
      marks.set(
        name,
        seen === undefined
          ? { name, sessions, first, last }
          : { name, sessions: [...new Set([...seen.sessions, ...sessions])], first: earliest(seen.first, first), last: Math.max(seen.last, last) },
      );
    }
  }
  return [...marks.values()];
}

/**
 * The sessions of `marks` whose transcript this machine can read: a `<session>.jsonl` in a project directory of one
 * of the places transcripts are recorded in. Null where one of those places cannot be listed.
 */
export async function readableSessions(files: Files, list: List, roots: readonly string[], marks: readonly Mark[]): Promise<Set<string> | null> {
  const wanted = new Set(marks.flatMap((mark) => mark.sessions));
  const found = new Set<string>();
  if (wanted.size === 0) return found;
  for (const root of roots) {
    const projects = await listed(list, root);
    if (projects === null) {
      if ((await files.stat(root).catch(() => null)) === null) continue;
      return null;
    }
    for (const project of projects) {
      if (project.kind !== 'dir' || project.isLink) continue;
      for (const session of wanted) {
        if (found.has(session)) continue;
        const there = await files.stat(`${root}/${project.name}/${session}.jsonl`).catch(() => null);
        if (there !== null && there.kind === 'file') found.add(session);
      }
    }
  }
  return found;
}

/**
 * The marks of machines whose transcripts this one cannot read: not this machine's own (`self`, its id or, with none,
 * this session's), and none of whose sessions is this session or has a transcript here. A container made again over
 * the same transcripts reads its sessions, and is not among them.
 */
export function unreadMarks(marks: readonly Mark[], self: string | null, session: string, readable: ReadonlySet<string>): Mark[] {
  return marks.filter((mark) => mark.name !== self && !mark.sessions.includes(session) && !mark.sessions.some((one) => readable.has(one)));
}

/**
 * The marks of other names whose transcripts this machine reads: a container made again over the same transcripts,
 * a session's own mark where no id could be kept, a machine whose transcripts are synced here too. A clean-up takes
 * them off while those transcripts last, so that none is taken for another machine once Claude Code removes them;
 * one still in use marks the store again at its next session.
 */
export function readMarks(marks: readonly Mark[], self: string | null, session: string, readable: ReadonlySet<string>): Mark[] {
  const unread = new Set(unreadMarks(marks, self, session, readable).map((mark) => mark.name));
  return marks.filter((mark) => mark.name !== self && !unread.has(mark.name));
}

/** Takes off the marks `names` names in each of `dirs`; one that cannot be removed stays, and is read again next time. */
export async function takeOffMarks(remove: (path: string) => Promise<void>, dirs: readonly string[], names: readonly string[]): Promise<void> {
  for (const name of names) {
    if (!NAME.test(name)) continue;
    for (const dir of dirs) await remove(machinePath(dir, name)).catch(() => undefined);
  }
}

/** Why a clean-up does not run here, or null. */
export function sharedWith(marks: readonly Mark[] | null, self: string | null, session: string, readable: ReadonlySet<string> | null): string | null {
  if (marks === null) return 'the machines that use the store could not be listed';
  if (readable === null) return 'a place transcripts are kept in could not be listed, to tell the machines that use the store apart';
  const others = unreadMarks(marks, self, session, readable);
  if (others.length === 0) return null;
  return `the store is used from ${others.length === 1 ? 'another machine' : `${others.length} other machines`} as well, whose transcripts this one cannot read; /lossless-store says which, and how to go on`;
}
