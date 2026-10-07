// How many entries a conversation held at each compaction, counted from Claude Code's records of sessions: what tells
// how near the conversations of real use come to the 4096 entries Claude Code hands a plugin (#115, ADR 0034). Only
// counts are printed, nothing of what was said.
//
//   node bench/messages.ts <directory of records> [--since 2026-10-01]
//
// A record is a session's `.jsonl` under the directory, up to one level down (Claude Code's `projects/` holds one
// directory a working directory). Sessions run with `claude -p` (`entrypoint` "sdk-cli": the benchmark's among them) are
// left out, and a compaction is counted once by its boundary's uuid, since a fork carries its parent's. For each:
// whether Claude Code's summary followed the boundary or the plugin's rebuilt conversation did, how it was started, the
// window (that of 1,000,000 where any request of the session sent more than 200,000 tokens, as bench/replay.ts takes
// it), and before it, the entries (each row of a user or assistant message, which is what Claude Code hands a plugin)
// and the messages (a turn's rows as one, as the API is sent).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type Compaction = { uuid: string; kind: 'summary' | 'rebuilt'; trigger: string; entries: number; messages: number };
export type Session = { name: string; interactive: boolean; window: 1_000_000 | 200_000; compactions: Compaction[] };

type Row = {
  uuid?: string;
  type?: string;
  subtype?: string;
  entrypoint?: string;
  isSidechain?: boolean;
  isCompactSummary?: boolean;
  compactMetadata?: { trigger?: string };
  message?: { role?: string; usage?: Record<string, number> };
};

/** The compactions of one record, with what the conversation held before each. */
export function sessionOf(name: string, text: string): Session {
  const rows = text.split('\n').flatMap((line): Row[] => {
    try {
      return [JSON.parse(line) as Row];
    } catch {
      return [];
    }
  });
  const interactive = rows.find((row) => typeof row.entrypoint === 'string')?.entrypoint !== 'sdk-cli';
  const sent = (row: Row) => {
    const u = row.message?.usage;
    return u === undefined ? 0 : (u['input_tokens'] ?? 0) + (u['cache_read_input_tokens'] ?? 0) + (u['cache_creation_input_tokens'] ?? 0);
  };
  const window = rows.some((row) => sent(row) > 200_000) ? 1_000_000 : 200_000;
  const compactions: Compaction[] = [];
  let entries = 0;
  let messages = 0;
  let role: string | undefined;
  for (const [at, row] of rows.entries()) {
    if (row.subtype === 'compact_boundary') {
      const after = rows.slice(at + 1, at + 4).find((next) => next.type === 'user' || next.type === 'assistant');
      compactions.push({ uuid: row.uuid ?? `${name}:${at}`, kind: after?.isCompactSummary === true ? 'summary' : 'rebuilt', trigger: row.compactMetadata?.trigger ?? 'unknown', entries, messages });
      entries = 0;
      messages = 0;
      role = undefined;
      continue;
    }
    if ((row.type !== 'user' && row.type !== 'assistant') || row.isSidechain === true || row.message === undefined) continue;
    entries += 1;
    const said = row.message.role ?? row.type;
    if (said !== role) {
      messages += 1;
      role = said;
    }
  }
  return { name, interactive, window, compactions };
}

/** Every record under `dir` changed since `since` that holds a compaction. */
export function sessionsUnder(dir: string, since = 0): Session[] {
  const sessions: Session[] = [];
  const records = readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? readdirSync(path).map((name) => join(path, name)) : [path];
  });
  for (const path of records) {
    if (!path.endsWith('.jsonl') || statSync(path).mtimeMs < since) continue;
    const text = readFileSync(path, 'utf8');
    if (!text.includes('"compact_boundary"')) continue;
    sessions.push(sessionOf(path.slice(path.lastIndexOf('/') + 1, -'.jsonl'.length), text));
  }
  return sessions;
}

/** The same sessions with each compaction once, in the first that holds it: a fork carries its parent's boundaries. */
export function eachOnce(sessions: readonly Session[]): Session[] {
  const seen = new Set<string>();
  return sessions
    .map((session) => ({ ...session, compactions: session.compactions.filter((one) => !seen.has(one.uuid) && seen.add(one.uuid)) }))
    .filter((session) => session.compactions.length > 0);
}

/**
 * What a conversation gathered from an empty start, a session's first compaction or the first after one of Claude Code's
 * summaries, to that compaction: what one window held. And how the count changed from a compaction the plugin rebuilt to
 * the next one. Each compaction once, by its uuid, with the one before it in the session that holds both: a fork carries
 * its parent's, so its first own compaction follows them and is no empty start.
 */
export function gathered(sessions: readonly Session[]): { fromEmpty: { entries: number; window: number; trigger: string }[]; afterRebuilt: number[] } {
  const fromEmpty: { entries: number; window: number; trigger: string }[] = [];
  const afterRebuilt: number[] = [];
  const seen = new Set<string>();
  for (const session of sessions) {
    session.compactions.forEach((one, at) => {
      if (seen.has(one.uuid)) return;
      seen.add(one.uuid);
      const before = session.compactions[at - 1];
      if (before === undefined || before.kind === 'summary') fromEmpty.push({ entries: one.entries, window: session.window, trigger: one.trigger });
      else afterRebuilt.push(one.entries - before.entries);
    });
  }
  return { fromEmpty, afterRebuilt };
}

if (import.meta.main) {
  const [dir, ...rest] = process.argv.slice(2);
  if (dir === undefined) throw new Error('give the directory of records, as `node bench/messages.ts ~/.claude/projects`');
  const at = rest.indexOf('--since');
  const since = at < 0 ? 0 : Date.parse(`${rest[at + 1]}T00:00:00Z`);
  // Interactive sessions first, then each compaction once: a fork run with `claude -p` would otherwise take its parent's.
  const interactive = sessionsUnder(dir, since).filter((session) => session.interactive);
  const sessions = eachOnce(interactive);
  const all = sessions.flatMap((session) => session.compactions);
  const most = (pick: (one: Compaction) => number) => Math.max(0, ...all.map(pick));
  console.log(`interactive sessions: ${sessions.length}; compactions: ${all.length}, ${all.filter((one) => one.kind === 'summary').length} summaries and ${all.filter((one) => one.kind === 'rebuilt').length} rebuilt by the plugin`);
  console.log(`the most a conversation held before a compaction: ${most((one) => one.entries)} entries, ${most((one) => one.messages)} messages`);
  const { fromEmpty, afterRebuilt } = gathered(interactive);
  const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
  const auto = sorted(fromEmpty.filter((one) => one.window === 1_000_000 && one.trigger !== 'manual').map((one) => one.entries));
  console.log(
    `gathered from an empty start: ${fromEmpty.length} compactions, the most ${Math.max(0, ...fromEmpty.map((one) => one.entries))} entries; ` +
      `of them ${auto.length} started by Claude Code in a window of 1,000,000, median ${auto[Math.floor(auto.length / 2)] ?? 0}, most ${auto.at(-1) ?? 0}`,
  );
  console.log(`change from a compaction the plugin rebuilt to the next: ${sorted(afterRebuilt).join(', ')}`);
  for (const session of sessions.filter((one) => one.compactions.length > 1)) {
    const chain = session.compactions.map((one) => `${one.entries}/${one.messages} ${one.kind}${one.trigger === 'manual' ? ' by hand' : ''}`).join(' -> ');
    console.log(`${session.name.slice(0, 8)}, window ${session.window}: ${chain}`);
  }
}
