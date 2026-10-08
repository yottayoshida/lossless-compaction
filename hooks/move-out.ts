// The wiring: Claude Code's events on one side, `src/` on the other.
// Everything that decides something lives in `src/`.
//
// Claude Code reads which host calls a plugin makes from this file, so `$` is
// only ever handed to a function declared at the top of it, and every host call
// is spelled out as `$.noun.verb(...)`.

import type { PluginOptions, Register, SessionCompactInput, SessionCompactResult } from 'claude-code';

import { providerFrom, type Provider } from '../src/ask.ts';
import { CHARS_PER_TOKEN, charsOf, compact, countFrom, windowFrom, type Config, type Context, type Count, type Host, type Outcome } from '../src/compact.ts';
import { shownAgainNote } from '../src/changed.ts';
import { cutLine, cutNotice, keepOldest } from '../src/cut.ts';
import { findAnswer, mayStandFor } from '../src/find.ts';
import { beforeTrying, configFrom, failedLine, nextStep, settingNotes, type Step } from '../src/flow.ts';
import { PLACES, moverOf } from '../src/commands.ts';
import { readBody, rewound } from '../src/body.ts';
import { guarded, longestIn, middleDropped, middleRefusal, placedTicketIds, refused } from '../src/guard.ts';
import { attachedOf } from '../src/attached.ts';
import { keepAttached, keepThenSummarize, messagesFromApi, namedThroughParts, type ToKeep } from '../src/keep.ts';
import { IMAGE_TOKENS, blocksOf, mediaIn } from '../src/media.ts';
import { ownProcessId } from '../src/mark.ts';
import { WINDOWS, closeStore, ensurePrivate, type Run } from '../src/private.ts';
import { EXPORT_MARK, exportedLine, importedLine, insideRepository, namedThrough, plainPath, readIn, writeOut } from '../src/carry.ts';
import { WHY, builtInLine, type Why } from '../src/reasons.ts';
import { goalOf, whyNotRebuilt } from '../src/select.ts';
import {
  FIND,
  NOT_AN_ID,
  NOT_STORED,
  PLACES_KEY,
  PLUGIN,
  RECALL,
  STATUS_COMMAND,
  EXPORT_COMMAND,
  IMPORT_COMMAND,
  STORE_COMMAND,
  configDirFrom,
  defaultPlacesOf,
  holds,
  notePlace,
  ownedOf,
  placesOf,
  recall,
  recallMeant,
  storedAs,
  whyNotStored,
  withEarlier,
  type Recalled,
  type StoreDirs,
} from '../src/store.ts';
import { NOT_TAKEN, findFrom, statusReport, type Find } from '../src/status.ts';
import { recallDescription } from '../src/tools.ts';
import { describeTaints, placeTaints, sendTaints, taintsFrom, variableTaints, type RepoSettings, type Seen, type Taint } from '../src/trust.ts';
import type { DirEntry, Exec, FileStat, Files, HttpResponse, Message } from '../src/types.ts';
import {
  collect,
  liveIds,
  noteRoot,
  noteRun,
  noteStopped,
  noteTried,
  partIds,
  putBackNamed,
  restoreThroughParts,
  rootFor,
  sentinelOf,
  stateIn,
  ticketIds,
  whyNotNow,
  writeSentinel,
  type GcRecord,
  type List,
  type StopKind,
  type Unread,
} from '../src/lifetime.ts';
import { checkWitnesses, newestOf, noteWitness, witnessCandidates } from '../src/witness.ts';
import { idIn, machineFileFrom, machineIdOf, markName, marksIn, noteMachine, readMarks, readableSessions, sharedWith, takeOffMarks, unreadMarks } from '../src/machine.ts';
import { countStore, lateLine, lateSince, oldestResult, skipped, storeReport } from '../src/health.ts';
import { checkAsked, checkPlaces, checkReport } from '../src/check.ts';

const FALLBACK_WINDOW = 200_000;

type WithUi = { ui: { log: (text: string) => void; toast: (text: string) => void } };
type WithEnv = { env: { get: (name: string) => Promise<string | undefined> } };
type WithEnvSet = { env: { set: (name: string, value: string) => Promise<unknown> } };
type WithFiles = {
  fs: {
    read: (path: string) => Promise<string>;
    write: (path: string, text: string) => Promise<void>;
    stat: (path: string, options?: { resolve: boolean }) => Promise<FileStat & { realPath?: string | undefined }>;
    list: (path: string) => Promise<DirEntry[]>;
    exists: (path: string) => Promise<boolean>;
  };
};
type WithHttp = {
  http: {
    fetch: (
      url: string,
      init: { method: string; headers: Record<string, string>; body: string },
    ) => Promise<HttpResponse>;
  };
  clock: { sleep: (ms: number, options: { signal: AbortSignal }) => Promise<void> };
};
type WithProcess = {
  process: {
    run: (
      argv: readonly string[],
      init: { timeoutMs: number },
    ) => Promise<{ exitCode: number; stdout: string; isStdoutTruncated?: boolean | undefined }>;
  };
};
type WithSettings = { settings: { read: (args: { source: 'project' | 'local' | 'user' }) => Promise<unknown> } };
type WithStore = { store: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<void> } };
type WithSession = {
  session: {
    id: () => Promise<string>;
    messages: (args?: { as?: 'api'; agentId?: string }) => Promise<unknown>;
    usage: (args: { breakdown: 'summary' }) => Promise<{ context?: (Context & { tokens?: unknown }) | undefined }>;
  };
};
type Compacting = { messages: readonly unknown[]; instructions?: string | undefined; trigger?: string | undefined };

/**
 * A line in the transcript and a notice over it: the same line, unless `toast` is false and there is none, or a shorter
 * one of its own, which a notice shown for a few seconds can be read in (#141). The notice is drawn under the plugin's
 * name, which it does not repeat: on one line cut at the width of the screen, the name twice took the end of it.
 */
function say($: WithUi, text: string, toast: boolean | string = true): void {
  try {
    $.ui.log(`${PLUGIN}: ${text}`);
    if (toast !== false) $.ui.toast(toast === true ? text : toast);
  } catch {
    // A surface that cannot show it must not change what the plugin does.
  }
}

function filesOf($: WithFiles): Files {
  return {
    read: (path) => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    stat: (path) => $.fs.stat(path),
    // Where a path lands, as the host resolves it; a place transcripts are kept in is read there (ADR 0039).
    realPath: async (path) => {
      try {
        return (await $.fs.stat(path, { resolve: true })).realPath ?? null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * The files a stored result is written through: as `filesOf`, and moved into
 * place with `mv` where the host can start it, so that a write the disk
 * refuses never cuts short what is already there (ADR 0008, src/commands.ts).
 */
function storingFilesOf($: WithFiles & WithProcess): Files {
  return { ...filesOf($), move: moverOf(runOf($), (path) => $.fs.stat(path)) };
}

function runOf($: WithProcess): Run {
  return async (argv) => ({ exitCode: (await $.process.run(argv, { timeoutMs: 10_000 })).exitCode });
}

function listOf($: WithFiles): List {
  return (path) => $.fs.list(path);
}

function execOf($: WithProcess): Exec {
  return async (argv, timeoutMs) => {
    const { exitCode, stdout, isStdoutTruncated } = await $.process.run(argv, { timeoutMs });
    return { exitCode, stdout, truncated: isStdoutTruncated === true };
  };
}

/** Tells the classic hooks of this process that the plugin runs in it (ADR 0010). */
async function markRunning($: WithEnvSet & WithProcess): Promise<void> {
  try {
    await $.env.set('LOSSLESS_COMPACTION_RUNNING', await ownProcessId(execOf($), PLACES));
  } catch {
    // Without the mark a /compact is held the first time; what the plugin does is as before.
  }
}

/** The directory written to, made or closed to its owner alone, else why not; the others of the settings in use, closed where they can be. */
async function privateOf($: WithUi & WithFiles & WithProcess, store: StoreDirs, sayIt: (text: string) => void = (text) => say($, text)): Promise<Why | null> {
  const { refused, warnings } = await closeStore(filesOf($), runOf($), store);
  for (const warning of warnings) sayIt(`a directory results are read from could not be made private: ${warning}`);
  return refused === null ? null : WHY.notPrivate(refused);
}

function hostOf($: WithFiles & WithProcess): Host {
  return { files: storingFilesOf($), now: () => Date.now() };
}

// Each name spelled out: Claude Code reads which variables a module reads off its source.
async function envOf($: WithEnv): Promise<Seen['env']> {
  return {
    HOME: await $.env.get('HOME'),
    USERPROFILE: await $.env.get('USERPROFILE'),
    CLAUDE_CONFIG_DIR: await $.env.get('CLAUDE_CONFIG_DIR'),
    TYPESAFE_API_KEY: await $.env.get('TYPESAFE_API_KEY'),
    CLOUDFLARE_API_TOKEN: await $.env.get('CLOUDFLARE_API_TOKEN'),
    CLOUDFLARE_ACCOUNT_ID: await $.env.get('CLOUDFLARE_ACCOUNT_ID'),
    HTTPS_PROXY: await $.env.get('HTTPS_PROXY'),
    https_proxy: await $.env.get('https_proxy'),
    HTTP_PROXY: await $.env.get('HTTP_PROXY'),
    http_proxy: await $.env.get('http_proxy'),
    ALL_PROXY: await $.env.get('ALL_PROXY'),
    all_proxy: await $.env.get('all_proxy'),
    NODE_TLS_REJECT_UNAUTHORIZED: await $.env.get('NODE_TLS_REJECT_UNAUTHORIZED'),
    NODE_EXTRA_CA_CERTS: await $.env.get('NODE_EXTRA_CA_CERTS'),
    SSL_CERT_FILE: await $.env.get('SSL_CERT_FILE'),
    SSL_CERT_DIR: await $.env.get('SSL_CERT_DIR'),
  };
}

/** The values this plugin sees that the repository's settings files hold; null when those files could not be read. */
async function taintsOf($: WithSettings, env: Seen['env'], options: PluginOptions): Promise<Taint[] | null> {
  let repo: RepoSettings;
  try {
    repo = { project: await $.settings.read({ source: 'project' }), local: await $.settings.read({ source: 'local' }) };
  } catch {
    repo = null;
  }
  // Only to tell your home directory's project file from a repository's: unread, the project file simply counts.
  if (repo !== null) {
    try {
      repo.user = await $.settings.read({ source: 'user' });
    } catch {
      // Left out.
    }
  }
  return taintsFrom(repo, { env, options });
}

/** /lossless-export and /lossless-import do not run on Windows, where no mode keeps a directory to you alone (#116). */
const onWindows = (path: string): boolean => WINDOWS.test(path);
const NOT_ON_WINDOWS = 'this does not run on Windows';

/** Typed by you, at the prompt or through Remote Control: what /lossless-export and /lossless-import run on (#116). */
const byPerson = (origin: { kind: string } | undefined): boolean => origin?.kind === 'composer' || origin?.kind === 'bridge';

/**
 * What /lossless-export and /lossless-import leave of the hook's own time before they stop and say what is left: the time
 * stands still while the host reads and writes, so what spends it is checking each result's SHA-256.
 */
const BUDGET_LEFT_MS = 2_000;

/** Whether `path` is inside a repository (src/carry.ts), its nearest directory that is there resolved through links. */
function insideRepositoryOf($: WithFiles & WithProcess, path: string): Promise<boolean> {
  return insideRepository(
    path,
    (one) => $.fs.exists(one),
    async (dir) => {
      try {
        const { exitCode, stdout } = await execOf($)(['/bin/sh', '-c', 'cd -- "$1" && pwd -P', 'sh', dir], 5_000);
        return exitCode === 0 && stdout.trim() !== '' ? stdout.trim() : null;
      } catch {
        return null;
      }
    },
  );
}

/** Whether `storeDir` is set: then that place alone is written to. */
const storeDirSet = (options: PluginOptions): boolean => typeof options['storeDir'] === 'string' && options['storeDir'].trim() !== '';

/** Where results are kept, or why no place can be trusted: the repository's settings never decide it (ADR 0005). */
async function storeOf($: WithEnv & WithFiles & WithSettings & WithStore, options: PluginOptions): Promise<StoreDirs | Why> {
  const env = await envOf($);
  const taints = await taintsOf($, env, options);
  const deciding = taints === null ? null : placeTaints(taints, options);
  if (deciding === null || deciding.length > 0) {
    return deciding === null ? WHY.settingsUnread() : WHY.decidedByRepository(describeTaints(deciding));
  }
  const places = { CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR, HOME: env.HOME, USERPROFILE: env.USERPROFILE };
  const store = await placesOf(filesOf($), options['storeDir'], places);
  if (store === null) return WHY.notAbsolute();
  // Read as well, never cleaned up: the places written to under these settings before, and, beside a storeDir of your
  // own, the defaults, where the repository's settings did not set what they are built from (#116).
  const defaults = storeDirSet(options) && taints !== null && variableTaints(taints).length === 0 ? defaultPlacesOf(places) : [];
  return withEarlier(store, [...(await earlierOf($, store.write)), ...defaults]);
}

/** Notes `write` as the place in use, in the plugin's own store, and returns the places written to before it (#116). */
function earlierOf($: WithStore, write: string): Promise<string[]> {
  return notePlace(
    () => $.store.get(PLACES_KEY),
    (places) => $.store.set(PLACES_KEY, places),
    write,
  );
}

/** The provider `find` asks, none without a key, or why not: the repository's settings never decide where it sends (ADR 0005). */
async function providerOf($: WithEnv & WithSettings, options: PluginOptions): Promise<Provider | null | { error: string }> {
  const env = await envOf($);
  const provider = providerFrom(options, env);
  if (provider === null || 'error' in provider) return provider;
  const taints = await taintsOf($, env, options);
  const deciding = taints === null ? null : sendTaints(taints, options);
  if (deciding === null || deciding.length > 0) {
    return {
      error:
        deciding === null
          ? describeTaints(null)
          : `where it sends would be decided by the repository (${describeTaints(deciding)}); set the key in your user settings`,
    };
  }
  return provider;
}

/** Sessions whose transcript's place is recorded, so that each is looked for once a process. */
const noted = new Set<string>();

/** That this process said the clean-up is late, or is looking now: said once, a /clear or a resume included (ADR 0016). */
let toldLate = false;

/** What this process said of the number settings it does not use as they were set: each line once, a changed setting anew. */
const toldSettings = new Set<string>();

/** What this process told each session of why find cannot ask Jev: each line once a session, anew once the settings change (#143). */
const toldUnasked = new Set<string>();

/**
 * Tells the person `line` once a session: a key refused stays refused at every call, and the line would pile up. Another
 * line, requests limited after a key refused say, is told too. Where the session cannot be told apart, nothing is said,
 * as a surface that cannot show a line changes nothing the plugin does.
 */
export async function tellOnce($: WithUi & { session: { id: () => Promise<string> } }, line: string): Promise<void> {
  let id: string;
  try {
    id = await $.session.id();
  } catch {
    return;
  }
  const told = `${id}\n${line}`;
  if (toldUnasked.has(told)) return;
  toldUnasked.add(told);
  say($, line);
}

/**
 * Records where this session's transcript is kept, so that a collection counts
 * the conversations there. Only from a place no repository decided: the
 * variables it is built from are checked as for the store, `storeDir` or not.
 */
async function noteRootOf($: WithEnv & WithFiles & WithSettings & WithSession, store: StoreDirs, options: PluginOptions): Promise<void> {
  try {
    const sessionId = await $.session.id();
    if (noted.has(sessionId)) return;
    const env = await envOf($);
    const taints = await taintsOf($, env, options);
    if (taints === null || placeTaints(taints, {}).length > 0) return;
    // Read as the store's default place is: transcripts are looked for under the directory results are kept beside.
    const config = configDirFrom(env);
    if (config === null) return;
    const root = await rootFor(filesOf($), listOf($), config, sessionId);
    if (root === null) return;
    await noteRoot(filesOf($), store.write, root, Date.now());
    noted.add(sessionId);
  } catch {
    // Not recorded this time; a later compaction tries again. Nothing is collected from a place not recorded.
  }
}

/** This machine's id once read or made in this process; not kept while it cannot be, so that a later session tries again. */
let machine: string | undefined;

/**
 * This machine's id (ADR 0032), from a home directory no repository decided: the variables it is read from are
 * checked as for the store. Null where it cannot be read or made.
 */
async function machineOf($: WithEnv & WithFiles & WithSettings & WithProcess, options: PluginOptions, make = true): Promise<string | null> {
  if (machine !== undefined) return machine;
  try {
    const env = await envOf($);
    const taints = await taintsOf($, env, options);
    if (taints === null || placeTaints(taints, {}).length > 0) return null;
    const path = machineFileFrom(env.HOME || env.USERPROFILE);
    // What reports the store reads the id, and makes none.
    const id = path === null ? null : make ? await machineIdOf(filesOf($), runOf($), path) : await idIn(filesOf($), path);
    if (id !== null) machine = id;
    return id;
  } catch {
    return null;
  }
}

/**
 * Marks the store as used by this session, on this machine: at each compaction, and at each session's start
 * (ADR 0032). With no machine id, the mark is named by the session, so that a machine that cannot keep an id is
 * still seen by the others.
 */
async function noteMachineOf($: WithEnv & WithFiles & WithSettings & WithProcess & WithSession, store: StoreDirs, options: PluginOptions): Promise<void> {
  try {
    const session = await $.session.id();
    const name = markName(await machineOf($, options), session);
    if (name !== null) await noteMachine(filesOf($), store.write, name, session, Date.now());
  } catch {
    // Not marked this time; the next session or compaction marks it.
  }
}

/**
 * Notes the witness of this session's main conversation: the newest ticket it shows that the store holds (ADR 0027).
 * A clean-up looks for it in the conversation's transcript before it moves anything. Nothing is noted where there is
 * no ticket, or where results are kept is not this user's to tell, or cannot be made private.
 */
async function noteWitnessOf(
  $: WithUi & WithEnv & WithFiles & WithSettings & WithSession & WithProcess & WithStore,
  candidates: readonly string[],
  options: PluginOptions,
  keepStanding = false,
): Promise<void> {
  try {
    if (candidates.length === 0) return;
    const store = await storeOf($, options);
    if (typeof store === 'string' || (await privateOf($, store)) !== null) return;
    await noteWitness(storingFilesOf($), store.write, await $.session.id(), candidates, (id) => holds(filesOf($), store.read, id), Date.now(), { keepStanding });
  } catch {
    // None noted this time: the one noted before, if any, stands, and a later compaction tries again.
  }
}

/** At the start of a session, the witness of a conversation resumed with tickets in it: looked for before the store is touched. */
async function noteWitnessAtStart($: WithUi & WithEnv & WithFiles & WithSettings & WithSession & WithProcess & WithStore, options: PluginOptions): Promise<void> {
  try {
    const messages = (await $.session.messages()) as readonly Message[];
    if (Array.isArray(messages)) await noteWitnessOf($, witnessCandidates(messages), options, true);
  } catch {
    // As at a compaction: nothing noted this time.
  }
}

/** Puts back from the trash what the conversation's tickets name, in the places of the settings in use: an earlier one is read alone (#116). */
async function restoreFor($: WithFiles & WithProcess, store: StoreDirs, ids: ReadonlySet<string>, parts: ReadonlySet<string> = ids): Promise<number> {
  try {
    return await restoreThroughParts(filesOf($), listOf($), execOf($), ownedOf(store), ids, parts);
  } catch {
    // What cannot be put back is answered as not stored.
    return 0;
  }
}

/** What is stored under `id`, put back from the trash first when a collection moved it there. */
async function recalled($: WithFiles & WithProcess, store: StoreDirs, id: unknown): Promise<Recalled> {
  const found = await recall(filesOf($), store.read, id);
  if (!('error' in found) || typeof id !== 'string' || (await restoreFor($, store, new Set([id]))) === 0) return found;
  return recall(filesOf($), store.read, id);
}

/**
 * At most once a week, results no transcript names go to the trash, and
 * those the trash has held a week, still named by none, are removed (ADR
 * 0006). Run after the session has started, without being waited for.
 */
/** Those of `places` that are there as plain directories, not links: what the clean-up and /lossless-store read. */
async function plainDirsOf($: WithFiles, places: readonly string[]): Promise<string[]> {
  const dirs: string[] = [];
  for (const dir of places) {
    const found = await filesOf($).stat(dir).catch(() => null);
    if (found && found.kind === 'dir' && found.isLink !== true) dirs.push(dir);
  }
  return dirs;
}

async function collectOnce($: WithUi & WithEnv & WithFiles & WithSettings & WithProcess & WithSession & WithStore, options: PluginOptions): Promise<void> {
  // Known once the try is noted: where, and over what, an unexpected stop is recorded.
  let tried: { dir: string; record: GcRecord } | null = null;
  // Claimed before anything is awaited, so that a second session.start right after (a /clear) does not say it
  // again; given back unless it was said, so that a later one in the same process can.
  const tell = !toldLate;
  toldLate = true;
  let said = false;
  try {
    const store = await storeOf($, options);
    if (typeof store === 'string') return;
    const files = filesOf($);
    const list = listOf($);
    const dirs = await plainDirsOf($, ownedOf(store));
    if (dirs.length === 0) return;
    const now = Date.now();
    const state = await stateIn(files, list, dirs);
    // Whether this session tries or not: "not since" is true when it is said, whatever this try then does.
    if (tell) {
      const oldest = state.lastRun === 0 && state.roots.length === 0 ? await oldestResult(list, dirs) : null;
      const since = lateSince(state, oldest, now);
      if (since !== null) {
        say($, lateLine(since, now, state.roots.length === 0));
        said = true;
      }
    }
    // Each session marks the store as used from this machine, whether it collects or not (ADR 0032). What cannot be
    // made private is said in the transcript: a session's start says it once, not with a notice.
    const unsafe = await privateOf($, store, (text) => say($, text, false));
    if (unsafe === null) await noteMachineOf($, store, options);
    if (whyNotNow(state, now) !== null) return;
    if (unsafe !== null) return;
    const record = await noteTried(files, store.write, state, now);
    tried = { dir: store.write, record };
    // A store used from another machine holds results only that machine's transcripts name: nothing moves (ADR 0032).
    // Before the sentinel and the witnesses, which are of this machine's transcripts alone.
    const marks = await marksIn(files, list, dirs);
    const readable = marks === null ? null : await readableSessions(files, list, state.roots, marks);
    const session = await $.session.id();
    const self = markName(await machineOf($, options), session);
    // The marks of other names whose transcripts are read here are taken off while those transcripts last.
    if (marks !== null && readable !== null) {
      const remove = (path: string) => moverOf(runOf($), (one) => $.fs.stat(one)).remove(path);
      await takeOffMarks(remove, dirs, readMarks(marks, self, session, readable).map((mark) => mark.name));
    }
    const shared = sharedWith(marks, self, session, readable);
    if (shared !== null) {
      say($, `moved-out results are kept, not cleaned up: ${shared}`);
      await stoppedAs(files, store.write, record, 'shared');
      return;
    }
    await writeSentinel(files, store.write);
    const live = await liveIds(files, list, execOf($), (path) => $.fs.exists(path), state.roots, sentinelOf(store.write));
    if ('stop' in live) {
      say($, `moved-out results are kept, not cleaned up: ${live.stop}`);
      await stoppedAs(files, store.write, record, live.kind);
      return;
    }
    // A conversation compacted with tickets that is still there, and whose noted ticket the search did not find, is
    // read by the search no longer as it was written: nothing it names would be counted (ADR 0027).
    const unseen = await checkWitnesses(files, list, execOf($), (path) => moverOf(runOf($), (one) => $.fs.stat(one)).remove(path), store.write, live.roots, live.grep);
    if (unseen !== null) {
      say($, `moved-out results are kept, not cleaned up: ${unseen.stop}`);
      await stoppedAs(files, store.write, record, unseen.kind);
      return;
    }
    // What is named and in the trash goes back first: a part there is not known for a part, and what only it names would not be counted.
    const inTrash = await putBackNamed(files, list, execOf($), dirs, live.ids);
    if ('stop' in inTrash) {
      say($, `moved-out results are kept, not cleaned up: ${inTrash.stop}`);
      await stoppedAs(files, store.write, record, inTrash.kind);
      return;
    }
    // A result kept with a summarized conversation is named in its part, not in a transcript (ADR 0007).
    const named = await namedThroughParts(files, dirs, live.ids, inTrash);
    if ('stop' in named) {
      say($, `moved-out results are kept, not cleaned up: ${named.stop}`);
      await stoppedAs(files, store.write, record, named.kind, named.unread, named.more);
      return;
    }
    // One try, one stop: the first, should more than one place stop.
    let stopped: StopKind | null = null;
    for (const dir of dirs) {
      // The time of the moves, not of the start: the day a clean-up moves into is the day it is in when it moves,
      // which another clean-up takes its own day before (ADR 0038).
      const done = await collect(list, execOf($), dir, named, Date.now());
      if ('stop' in done) {
        stopped ??= done.kind;
        say($, `moved-out results in ${dir} are kept, not cleaned up: ${done.stop}`);
      } else if (done.trashed + done.removed + done.restored > 0) {
        say($, `cleaned up ${dir}: ${done.trashed} to the trash, ${done.removed} removed from it, ${done.restored} put back`);
      }
    }
    if (stopped === null) await noteRun(files, store.write, now);
    else await stoppedAs(files, store.write, record, stopped);
  } catch (error) {
    say($, `moved-out results are kept, not cleaned up: ${error instanceof Error ? error.message : String(error)}`);
    if (tried !== null) await stoppedAs(filesOf($), tried.dir, tried.record, 'unexpected');
  } finally {
    if (tell && !said) toldLate = false;
  }
}

/** Records the kind of a stop; failing to changes nothing else (ADR 0016). */
async function stoppedAs(files: Files, dir: string, record: GcRecord, kind: StopKind, unread: readonly Unread[] = [], more = 0): Promise<void> {
  try {
    await noteStopped(files, dir, record, kind, Date.now(), unread, more);
  } catch {
    // The stop was said; it is not recorded this time.
  }
}

/**
 * Why the built-in compaction runs on the conversation as it is, and what of
 * it can be kept first, or why nothing of it can be.
 */
type HandedOver = { why: Why; keep: { store: StoreDirs; messages: readonly Message[] } | { unkept: string } };

/**
 * What a compaction came to, and what it was measured with: what was in use
 * before, whether Claude Code gave that figure or it was made up from
 * characters, the share of the window that may stay in use, and what a cut
 * in place of a summary is decided from (src/cut.ts).
 */
type Tried = {
  outcome: Outcome;
  store: StoreDirs;
  inUse: number;
  given: boolean;
  maxAfterPercent: number;
  count: Count | undefined;
  keepTokens: number;
  /** The conversation as Claude Code sent it, with its blocks and as it is kept when it is not rebuilt. */
  api: unknown;
  asSent: readonly Message[];
  /** The message naming what Claude Code attached as it sent the messages, at the end of what is handed back (#105). */
  attached?: Message;
  /** How many entries Claude Code handed over: the larger of the messages the hook was given and the conversation as sent (ADR 0034). */
  entries: number;
};

/**
 * The place a compaction keeps what it moves out in, made private, with this
 * session's transcript recorded and what the conversation names put back from
 * the trash; or why nothing can be kept, and the shorter reason said where
 * nothing of the conversation is kept. What `attempt` and the compaction
 * hook's handler of a failure both start from.
 */
async function placeOf(
  $: WithUi & WithEnv & WithFiles & WithSession & WithSettings & WithProcess & WithStore,
  messages: readonly Message[],
  options: PluginOptions,
): Promise<{ store: StoreDirs } | { why: Why; unkept: string }> {
  const place = await storeOf($, options);
  if (typeof place === 'string') return { why: place, unkept: 'there is no place to keep it in' };
  // Before anything is written: what cannot be made private is not written to, the conversation included.
  const unsafe = await privateOf($, place);
  if (unsafe !== null) return { why: unsafe, unkept: 'the place to keep it in could not be made private' };
  // Before a summary can run: a kept conversation is named by this session's transcript, which a collection must read.
  await noteRootOf($, place, options);
  await noteMachineOf($, place, options);
  // A ticket whose result a collection moved to the trash meanwhile is put back, so that it stays a ticket of this store.
  // What cannot be told or put back is answered as not stored: the place is ready all the same.
  try {
    await restoreFor($, place, ticketIds(messages), partIds(messages));
  } catch {
    // As restoreFor's own failures.
  }
  return { store: place };
}

/**
 * One compaction, up to what would be handed back, or why the built-in
 * compaction runs instead. Nothing is thrown, so the caller calls `next` once
 * whatever happened here.
 */
async function attempt(
  $: WithUi & WithEnv & WithFiles & WithSession & WithSettings & WithProcess & WithStore,
  e: Compacting,
  options: PluginOptions,
): Promise<Tried | HandedOver> {
  // Outside the try: once the place is known to be private, a failure further on still keeps the conversation.
  let store: StoreDirs | null = null;
  const messages = e.messages as readonly Message[];
  // What is kept when the conversation goes to the built-in summary untouched: read with
  // its blocks once that can be done, so that an image is named where it stood.
  let asSent: readonly Message[] = messages;
  try {
    // First, so that it is said whatever else this compaction comes to.
    if (options['keepNewest'] !== undefined) {
      say($, 'the keepNewest setting is gone: the newest results are kept by size now, set keepTokens instead');
    }
    const placed = await placeOf($, messages, options);
    if (!('store' in placed)) return { why: placed.why, keep: { unkept: placed.unkept } };
    store = placed.store;
    const api = await $.session.messages({ as: 'api' });
    asSent = messagesFromApi(api) ?? messages;
    const media = mediaIn(api);
    const why = whyNotRebuilt(messages, api) ?? (media.why === null ? null : WHY.cannotCarry(media.why));
    if (why !== null) {
      // Not rebuilt is not lost: the text of what it holds is kept all the same, from its
      // blocks where they can be read, else from the messages the hook was handed.
      return { why, keep: { store, messages: asSent } };
    }

    // A summary is estimated by Claude Code itself: nothing is sent for it.
    const { context } = await $.session.usage({ breakdown: 'summary' });
    const tokens = context?.tokens;
    const config: Config = { store, ...configFrom(options) };
    const given = typeof tokens === 'number' && tokens > 0;
    // Made up from characters when Claude Code gives none: images, which are no characters, at their rough figure.
    const inUse = given ? tokens : Math.ceil(charsOf(messages) / CHARS_PER_TOKEN) + media.images * IMAGE_TOKENS;
    const count = countFrom(context?.breakdown, tokens, api, messages);
    // The size measured against, and where it came from, which the line names (#141).
    const window = windowFrom(context, FALLBACK_WINDOW);
    const outcome = await compact(
      {
        messages,
        tokens: inUse,
        count,
        window: window.size,
        windowOf: window.of,
        goal: goalOf(messages, e.instructions),
        // Typed by hand with nothing asked of it: the newest calls may be reached into (ADR 0023).
        byHand: e.trigger === 'manual' && (e.instructions ?? '').trim() === '',
        media: media.results,
      },
      config,
      hostOf($),
    );
    // A result that holds an image could not be moved out: nothing was rebuilt.
    if (outcome.abandoned !== undefined) return { why: outcome.abandoned, keep: { store, messages: asSent } };
    return {
      outcome,
      store,
      inUse,
      given,
      maxAfterPercent: config.maxAfterPercent,
      count,
      keepTokens: config.keepTokens,
      api,
      asSent,
      entries: Math.max(messages.length, Array.isArray(api) ? api.length : 0),
    };
  } catch (error) {
    const why = WHY.failed(error instanceof Error ? error.message : String(error));
    return { why, keep: store === null ? { unkept: 'the place to keep it in could not be read' } : { store, messages: asSent } };
  }
}

/**
 * What Claude Code attached to the messages as it sent them, which a rebuilt conversation would not carry, kept, and
 * a message naming it put at the end of what is handed back (#105): after the conversation, so that what an earlier
 * compaction left stays as it was (ADR 0001, decision 10). Where it cannot be written the conversation is not rebuilt:
 * it is kept as it was sent, attachments and all, before the built-in summary, as one that cannot be rebuilt is.
 */
async function withAttached($: WithFiles & WithProcess, e: SessionCompactInput, tried: Tried): Promise<Tried | HandedOver> {
  const unkept = (detail: string): HandedOver => ({ why: WHY.attachedNotKept(detail), keep: { store: tried.store, messages: tried.asSent } });
  try {
    const attached = attachedOf(e.messages as readonly Message[], tried.api);
    if (attached.length === 0) return tried;
    const kept = await keepAttached(storingFilesOf($), tried.store.write, attached);
    if ('failed' in kept) return unkept(whyNotStored({ reason: kept.failed, code: kept.code }));
    if ('nothing' in kept) return tried;
    const message: Message = { role: 'user', text: kept.text, toolUses: [] };
    return { ...tried, outcome: { ...tried.outcome, messages: [...tried.outcome.messages, message] }, attached: message };
  } catch (error) {
    return unkept(error instanceof Error ? error.message : String(error));
  }
}

/** Hands `handed` to the built-in compaction, having kept what `keep` names first (src/keep.ts decides). */
async function summarizeKeeping(
  $: WithUi & WithFiles & WithProcess,
  handed: SessionCompactInput,
  next: (e: SessionCompactInput) => Promise<SessionCompactResult>,
  keep: HandedOver['keep'],
): Promise<SessionCompactResult> {
  const where = 'unkept' in keep ? keep : { dir: keep.store.write, read: keep.store.read, messages: keep.messages };
  return keepThenSummarize(storingFilesOf($), where, (text) => say($, text), () => next(handed), (why) => ({ skip: why }));
}

/**
 * A subagent's compaction: nothing of its conversation is moved out or rebuilt
 * (ADR 0003, decision 3), but what the summary replaces is kept first and its
 * tickets put after the summary, as for the main conversation where it cannot
 * be rebuilt (ADR 0026). A write the disk refuses does not hold the summary
 * back: no one can type `/compact` in a subagent once room is made. Said in
 * the transcript alone, as subagents run side by side.
 */
async function summarizeSubagent(
  $: WithUi & WithEnv & WithFiles & WithSession & WithSettings & WithProcess & WithStore,
  e: SessionCompactInput,
  next: (e: SessionCompactInput) => Promise<SessionCompactResult>,
  options: PluginOptions,
): Promise<SessionCompactResult> {
  // Which subagent, by its id: subagents run side by side, and their lines stand in one transcript. Whole, as named
  // subagents of a team share the start of theirs.
  const sayIt = (text: string) => say($, `subagent ${String(e.agentId)}: ${text}`, false);
  let keep: ToKeep;
  try {
    const store = await storeOf($, options);
    // The reason said in full, as the main conversation says it.
    const unsafe = typeof store === 'string' ? null : await privateOf($, store, sayIt);
    if (typeof store === 'string') keep = { unkept: store };
    else if (unsafe !== null) keep = { unkept: unsafe };
    else {
      // As before the main conversation's summary: the place its transcript is in is recorded, so that a clean-up
      // reads what names the parts kept here, and what it names that a clean-up moved to the trash comes back first.
      await noteRootOf($, store, options);
      await noteMachineOf($, store, options);
      const messages = e.messages as readonly Message[];
      await restoreFor($, store, ticketIds(messages), partIds(messages));
      // Read with its blocks, so that an image is named where it stood; else as the hook was handed it.
      const api = await $.session.messages({ as: 'api', agentId: e.agentId });
      keep = { dir: store.write, read: store.read, messages: messagesFromApi(api) ?? messages };
    }
  } catch (error) {
    keep = { unkept: error instanceof Error ? error.message : String(error) };
  }
  return keepThenSummarize(storingFilesOf($), keep, sayIt, () => next(e), (why) => ({ skip: why }), 'summarize');
}

/**
 * Keeps the messages from `after` up to `at` of what a compaction rebuilt, in
 * place of a summary, and says so (src/cut.ts keeps them). Null when a part
 * could not be written: nothing is cut then, and the caller hands over as
 * before.
 */
async function cutKeeping(
  $: WithUi & WithFiles & WithProcess,
  tried: Tried,
  after: number,
  at: number,
  over: boolean,
  held?: number,
): Promise<SessionCompactResult | null> {
  const { outcome } = tried;
  const started = Date.now();
  try {
    const cut = await keepOldest(storingFilesOf($), tried.store, { messages: outcome.messages, tokens: outcome.report.tokensAfter, count: tried.count }, after, at);
    if ('failed' in cut) return null;
    const report = { ...outcome.report, charsAfter: charsOf(cut.messages), tokensAfter: cut.tokensAfter, ms: outcome.report.ms + (Date.now() - started) };
    const made = { first: after + 1, last: at, of: outcome.messages.length, parts: cut.parts, over, ...(held === undefined ? {} : { held }) };
    say($, cutLine(report, made), cutNotice(report, made));
    return { messages: cut.messages };
  } catch {
    return null;
  }
}

/** Does what `step` says (src/flow.ts decides it): nothing here chooses between steps. */
async function carryOut(
  $: WithUi & WithFiles & WithProcess,
  e: SessionCompactInput,
  next: (e: SessionCompactInput) => Promise<SessionCompactResult>,
  tried: Tried,
  step: Step,
): Promise<SessionCompactResult> {
  const { outcome, store } = tried;
  switch (step.step) {
    case 'skip':
      return { skip: step.why };
    case 'back':
      say($, step.line, step.notice);
      return { messages: outcome.messages };
    case 'cut': {
      const cut = await cutKeeping($, tried, step.after, step.at, step.over, step.held);
      // A part could not be written: handed over as `otherwise` says, where what could not be kept is said, or skipped (ADR 0008).
      return cut ?? carryOut($, e, next, tried, step.otherwise);
    }
    case 'summarize':
      say($, step.line, step.notice);
      // Handed over as it was, the conversation is kept as it was handed in, with the message naming what Claude Code
      // attached (#105); else what is left, which holds that message, and that is what is kept.
      return step.of === 'given'
        ? summarizeKeeping($, e, next, { store, messages: [...(e.messages as readonly Message[]), ...(tried.attached === undefined ? [] : [tried.attached])] })
        : summarizeKeeping($, { ...e, messages: outcome.messages }, next, { store, messages: outcome.messages });
  }
}

type WithTools = { tool: { register: (tool: { name: string; description: string; inputSchema: Record<string, unknown> }) => Promise<unknown> } };

/** What the start of this session registered of `find`, for /lossless-status; undefined until a session.start of this process. */
let findAtStart: Find | undefined;

/**
 * Registers `find`, with Jev where there is a key it may use and looking on this machine where there is none or looking
 * for one failed (#110), then `recall`, whose description names `find` only if `find` was registered. `provider` is
 * undefined when looking for the key failed: that was said where it failed. Returns what became of `find`.
 */
export async function registerTools($: WithTools & WithUi, provider: Provider | null | { error: string } | undefined): Promise<Find> {
  let found = findFrom(provider);
  let withFind = false;
  // With a key Jev chooses; with none, or where looking for it failed, what can be is looked for here and nothing is
  // sent (#110). Settings that name a key that cannot be used register nothing: that is said, to be set right.
  const withKey = provider !== undefined && provider !== null && !('error' in provider);
  if (provider !== undefined && provider !== null && 'error' in provider) {
    say($, `the find tool is not registered: ${provider.error}`);
  } else {
    try {
      await $.tool.register({
        name: FIND,
        description: withKey
          ? `Finds, among the tool results that ${PLUGIN} moved out of this conversation and the parts of it that were ` +
            'kept, the one a question is about, and returns it unchanged. Ask in words what the result contains or is about; a phrase of twelve characters ' +
            'or more in double quotes is looked for as written. A number, a checksum or a code the question names, one of them with three digits or more, is looked for as written, letter case too, in the whole of each result, a line at a time, and Jev is told when one result alone holds it. ' +
            'When Jev is not sure which result it is, the likeliest few ' +
            'are listed with the ids to recall them by; when none of them seems to be about it, it says so.'
          : `Looks, on this machine, through the tool results that ${PLUGIN} moved out of this conversation and the parts of it ` +
            'that were kept, and sends nothing. A phrase of twelve characters or more in double quotes is looked for as written, and the one result ' +
            'that holds it is returned unchanged. A number, a checksum or a code the question names, one of them with three digits or more, is looked ' +
            'for a line at a time, and the results with such a line are listed with it. A question in words lists every result by its call and first ' +
            'line, those written in the conversation newest first, for you to choose from and recall by its id: nothing is ranked.',
        inputSchema: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'What the result is about, in words; an exact phrase, twelve characters or more, in double quotes.' },
          },
          required: ['question'],
        },
      });
      withFind = true;
    } catch (error) {
      say($, `the find tool could not be registered: ${error instanceof Error ? error.message : String(error)}`);
      // What the host said was said at the start; it is not repeated where it would stay in the conversation.
      found = { registered: false, why: NOT_TAKEN };
    }
  }
  try {
    await $.tool.register({
      name: RECALL,
      description: recallDescription(withFind),
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: "The 64 hexadecimal characters at the end of the line that stands in the result's place." },
        },
        required: ['id'],
      },
    });
  } catch (error) {
    say($, `the recall tool could not be registered: ${error instanceof Error ? error.message : String(error)}`);
  }
  return found;
}

export const register: Register = (on, options) => {
  // Run again when the settings change: what an earlier start registered is not known to hold for these settings until
  // a session.start registers anew, and till then /lossless-status says what they give now.
  findAtStart = undefined;
  // A key set right, or set wrong again, is told of anew: the settings that loaded this are not those told of before.
  toldUnasked.clear();
  on('session.start', async ($, e, next) => {
    await markRunning($);
    // A number setting not used as it was set is said once a process, and again once set otherwise: the session
    // that set it sees why.
    for (const line of settingNotes(options)) {
      if (toldSettings.has(line)) continue;
      toldSettings.add(line);
      say($, line);
    }
    let provider: Awaited<ReturnType<typeof providerOf>> | undefined;
    try {
      provider = await providerOf($, options);
    } catch (error) {
      // find is registered all the same, with no key (#110): what failed is said as that.
      say($, `looking for the find tool's key failed, so it looks on this machine and sends nothing: ${error instanceof Error ? error.message : String(error)}`);
    }
    findAtStart = await registerTools($, provider);
    // A command, not a tool: what it says is shown to you, and the agent is not offered it (ADR 0016).
    try {
      await $.command.register({
        name: STORE_COMMAND,
        description: `Says how much ${PLUGIN} keeps, what is in its trash and how its clean-up went, without reading a result; with check, reads each to name those whose files are not whole`,
        argumentHint: '[check]',
        immediate: true,
      });
    } catch (error) {
      say($, `the /${STORE_COMMAND} command could not be registered: ${error instanceof Error ? error.message : String(error)}`);
    }
    // The same kind of command (#108): that it runs, its version, its settings in use and whether find is there.
    try {
      await $.command.register({
        name: STATUS_COMMAND,
        description: `Says that ${PLUGIN} runs, its version and Claude Code's, its settings in use and whether find is there, without reading a result`,
        immediate: true,
      });
    } catch (error) {
      say($, `the /${STATUS_COMMAND} command could not be registered: ${error instanceof Error ? error.message : String(error)}`);
    }
    // The two that take one conversation's results to another machine (#116): not mid-turn, since they write.
    for (const [name, description] of [
      [EXPORT_COMMAND, `Writes the results this conversation names into a new directory, to take to another machine`],
      [IMPORT_COMMAND, `Reads results written out by /${EXPORT_COMMAND}, or an earlier place, into where ${PLUGIN} keeps them`],
    ] as const) {
      try {
        await $.command.register({ name, description });
      } catch (error) {
        say($, `the /${name} command could not be registered: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // Not waited for: reading every transcript can take a minute, and the session should not.
    void collectOnce($, options);
    // Not waited for either: a resumed conversation's witness, read from its transcript.
    void noteWitnessAtStart($, options);
    return next(e);
  });

  // Spelled out, not imported: a test holds it to STORE_COMMAND.
  on('command.run', { command: 'lossless-store' }, async ($, e, next) => {
    try {
      const store = await storeOf($, options);
      if (typeof store === 'string') return { text: `no place results are kept in can be read: ${store}` };
      const asked = e.args.trim();
      const check = checkAsked(asked);
      if (check !== null) {
        // Every place read, as recall reads them, and whether recall puts back from its trash; each text read and
        // hashed in src/check.ts, none shown, with the time the hook has left (#117).
        const began = Date.now();
        const read = await plainDirsOf($, store.read);
        const owned = ownedOf(store);
        const places = store.read.map((dir) => ({ dir, there: read.includes(dir), putsBack: owned.includes(dir) }));
        const done = await checkPlaces(filesOf($), listOf($), places, Date.now(), () => next.budget.remainingMs, check.from);
        return { text: checkReport(done.checked, done.next, Date.now() - began) };
      }
      if (asked !== '') return { text: `/${STORE_COMMAND} takes check, which reads every result kept and names what is not whole, or nothing after it` };
      const now = Date.now();
      const files = filesOf($);
      const list = listOf($);
      // The places the clean-up reads, and its record from the same places.
      const owned = ownedOf(store);
      const there = await plainDirsOf($, owned);
      const counted = [];
      for (const dir of owned) counted.push(there.includes(dir) ? await countStore(files, list, dir, now) : skipped(dir));
      // Read as well, never cleaned up: the places results were kept in before (#116), counted the same way.
      const before = store.read.filter((dir) => !owned.includes(dir));
      const plain = await plainDirsOf($, before);
      const earlier = [];
      for (const dir of before) earlier.push(plain.includes(dir) ? await countStore(files, list, dir, now) : skipped(dir));
      const gc = await stateIn(files, list, there);
      const set = storeDirSet(options);
      const marks = await marksIn(files, list, there);
      const session = await $.session.id();
      const readable = marks === null ? null : await readableSessions(files, list, gc.roots, marks);
      const self = markName(await machineOf($, options, false), session);
      const machines = { marks, self, unread: marks === null || readable === null ? null : unreadMarks(marks, self, session, readable).map((mark) => mark.name) };
      return { text: storeReport(counted, gc, now, set, machines, earlier) };
    } catch {
      // What an error says may name a path: it is not shown.
      return { text: 'the store could not be counted' };
    }
  });

  // Every call, whatever the tool, in a subagent too: one whose input holds a ticket this store or this conversation
  // knows is refused (ADR 0020, src/guard.ts decides). Registered before the plugin's own tools, so that it stands
  // outside them; they, and the tools known only to read, go straight on.
  on('tool.call', async ($, e, next) => {
    const tool = String((e as { tool?: unknown }).tool);
    if (!guarded(tool)) return next(e);
    const { tool: _tool, tool_use_id: _id, agentId: _agent, ...input } = e as Record<string, unknown>;
    // Nearly every call holds no ticket: `refused` asks about an id only once one is found, so nothing is read for it.
    const known = async (id: string): Promise<boolean> => {
      const store = await storeOf($, options);
      if (typeof store !== 'string' && (await holds(filesOf($), store.read, id))) return true;
      // Moved to the trash by a clean-up, or named by the conversation alone: still the ticket of something kept.
      const messages = (await $.session.messages()) as readonly Message[];
      return placedTicketIds(messages, String((e as { tool_use_id?: unknown }).tool_use_id)).has(id);
    };
    const why = await refused(input, known);
    if (why !== null) return { deny: why };
    // A message without its middle, the line dropped, handed on to any tool that is not known only to read: read the
    // conversation only where a value is long enough to hold one (ADR 0024).
    if (longestIn(input) >= 200) {
      const id = middleDropped(input, (await $.session.messages()) as readonly Message[]);
      if (id !== null) return { deny: middleRefusal(id) };
    }
    return next(e);
  });

  // Spelled out, not imported: Claude Code reads the matcher from this file. A test holds it to RECALL_TOOL.
  // Spelled out, not imported: a test holds them to EXPORT_COMMAND and IMPORT_COMMAND. Each writes only when you type it,
  // at the prompt or through Remote Control: a channel, another agent or a scheduled run cannot have results written
  // anywhere (#116).
  on('command.run', { command: 'lossless-export' }, async ($, e, next) => {
    try {
      if (!byPerson(e.origin)) return { text: `/${EXPORT_COMMAND} writes only when you type it` };
      const to = e.args.trim();
      if (!plainPath(to)) return { text: `give the directory to write to, one not there yet, from / with no . or .. in it: /${EXPORT_COMMAND} /path/to/new/directory` };
      // A directory this command made is gone on with, typed again; any other that is there is refused.
      const again = await $.fs.exists(to);
      if (again && !(await $.fs.exists(`${to}/${EXPORT_MARK}`))) return { text: 'that is there already: give a directory not there yet' };
      if (await insideRepositoryOf($, to)) return { text: 'that is inside a repository, where a commit could take what is written: give one outside any' };
      const store = await storeOf($, options);
      if (typeof store === 'string') return { text: `nothing can be read: ${store}` };
      if (onWindows(store.write)) return { text: NOT_ON_WINDOWS };
      const messages = (await $.session.messages()) as readonly Message[];
      if (!Array.isArray(messages)) return { text: 'the conversation could not be read' };
      // Put back from the trash first, as a recall would: what the conversation names is written out whole.
      await restoreFor($, store, ticketIds(messages), partIds(messages));
      const ids = await namedThrough(filesOf($), store.read, messages);
      if ((await ensurePrivate(filesOf($), runOf($), to)) !== null) return { text: 'that directory could not be made readable by you alone, and nothing was written' };
      if (!again) await filesOf($).write(`${to}/${EXPORT_MARK}`, `written by /${EXPORT_COMMAND}\n`);
      const out = await writeOut(storingFilesOf($), store.read, ids, to, () => next.budget.remainingMs > BUDGET_LEFT_MS);
      if ('reason' in out) return { text: `stopped: a result could not be written${out.code === undefined ? '' : ` (${out.code})`}` };
      return { text: exportedLine(out, to, await $.session.id()) };
    } catch {
      // What an error says may name a path: it is not shown.
      return { text: 'nothing could be written out' };
    }
  });

  on('command.run', { command: 'lossless-import' }, async ($, e, next) => {
    try {
      if (!byPerson(e.origin)) return { text: `/${IMPORT_COMMAND} reads in only when you type it` };
      const from = e.args.trim();
      if (!plainPath(from)) return { text: `give the directory to read in, from / with no . or .. in it: /${IMPORT_COMMAND} /path/to/directory` };
      const store = await storeOf($, options);
      if (typeof store === 'string') return { text: `nothing can be written: ${store}` };
      if (onWindows(store.write)) return { text: NOT_ON_WINDOWS };
      if ((await privateOf($, store)) !== null) return { text: 'the place results are kept in cannot be made private, and nothing was read in' };
      const done = await readIn(storingFilesOf($), listOf($), from, store.write, () => next.budget.remainingMs > BUDGET_LEFT_MS);
      if ('reason' in done) return { text: `stopped: a result could not be written${done.code === undefined ? '' : ` (${done.code})`}` };
      // Named by this conversation, what was read in is counted by the clean-up as any result its record names: the place
      // of the record and a witness of it are noted, as at a compaction (ADR 0006, 0027).
      await noteRootOf($, store, options);
      const messages = (await $.session.messages()) as readonly Message[];
      if (Array.isArray(messages)) await noteWitnessOf($, witnessCandidates(messages), options, true);
      return { text: importedLine(done) };
    } catch {
      return { text: 'nothing could be read in' };
    }
  });

  on('tool.call', { tool: 'mcp__lossless-compaction__recall' }, async ($, e) => {
    const store = await storeOf($, options);
    if (typeof store === 'string') return { result: `[${PLUGIN}] Nothing is read: ${store}.` };
    const id = (e as { id?: unknown }).id;
    const agentId = (e as { agentId?: string | undefined }).agentId;
    // An id copied wrong is taken for the one id written in the conversation that begins most as it does
    // (src/store.ts decides): the main conversation's, or the subagent's own, whose kept parts are named
    // after its summary (ADR 0026). One the session cannot read is answered as holding none. It is read once.
    let conversation: Promise<readonly Message[]> | undefined;
    const messages = () =>
      (conversation ??= (async () => {
        const read = agentId === undefined ? await $.session.messages() : await $.session.messages({ agentId });
        return Array.isArray(read) ? (read as readonly Message[]) : [];
      })());
    const found = await recallMeant((one) => recalled($, store, one), id, messages);
    if ('error' in found) {
      // Refused as copied wrong: the tickets it may stand for are named, read from the same conversation (#107).
      const copied = found.error === NOT_AN_ID || found.error === NOT_STORED;
      let named = '';
      try {
        if (copied) named = mayStandFor(id, await messages());
      } catch {
        // The conversation could not be read: refused as before, naming nothing.
      }
      return { result: `[${PLUGIN}] ${found.error}${named}` };
    }
    // An image goes back as an image: as text its bytes would fill the conversation.
    return { result: found.parts === undefined ? found.text : blocksOf(found.parts) };
  });

  // Listed with the tools in front of the agent, not behind ToolSearch: an agent that has
  // not loaded recall reads neither its description nor find's, and answers that a moved-out
  // result is not there (#54). Spelled out, not imported: tests hold them to the tools' names.
  on('tool.describe', { tool: 'mcp__lossless-compaction__recall' }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }));
  on('tool.describe', { tool: 'mcp__lossless-compaction__find' }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }));

  // A file Claude Code shows again after a summary, which the plugin's line there names as changed
  // since it was read: a line with the id of that reading stands in its place, unless the person
  // handed the file over (#54, src/changed.ts decides). A subagent's conversation is left as shown: its line after a
  // summary (ADR 0026) says that the file shown again is the file as it is now, with the id of what was read.
  on('prompt.attachment', { type: 'file' }, async ($, e, next) => {
    const shown = await next(e);
    if (e.agentId !== undefined || shown.text === null) return shown;
    try {
      const note = shownAgainNote((await $.session.messages()) as readonly Message[], shown.text);
      return note === null ? shown : { text: note };
    } catch {
      // The conversation could not be read: the file is shown as Claude Code shows it.
      return shown;
    }
  });

  // Spelled out, not imported: a test holds it to FIND_TOOL.
  on('tool.call', { tool: 'mcp__lossless-compaction__find' }, async ($, e) => {
    try {
      const store = await storeOf($, options);
      if (typeof store === 'string') return { result: `[${PLUGIN}] Nothing is read: ${store}.` };
      // Where looking for the key fails, it is looked for here with none: nothing is sent (#110).
      let provider: Awaited<ReturnType<typeof providerOf>>;
      try {
        provider = await providerOf($, options);
      } catch {
        provider = null;
      }
      // Registered at the start as sending nothing, it sends nothing, whatever key turns up, until the plugin's settings
      // change: that loads the hook again with no record of the start, and a key set there is used, as it was set to be.
      if (findAtStart?.registered === true && 'local' in findAtStart) provider = null;
      if (provider !== null && 'error' in provider) {
        return { result: `[${PLUGIN}] find cannot ask Jev: ${provider.error}. recall reads a result by its id.` };
      }
      const agentId = (e as { agentId?: string | undefined }).agentId;
      const messages = agentId === undefined ? ((await $.session.messages()) as readonly Message[]) : [];
      await restoreFor($, store, ticketIds(messages), partIds(messages));
      const answer = await findAnswer({
        files: filesOf($),
        dirs: store.read,
        messages,
        provider,
        http: (url, init) => $.http.fetch(url, init),
        wait: (ms, signal) => $.clock.sleep(ms, { signal }),
        question: (e as { question?: unknown }).question,
        agentId,
      });
      // A key refused is the person's to put right, and only the agent reads find's answer (#143).
      if (answer.tell !== undefined) await tellOnce($, answer.tell);
      return { result: answer.text };
    } catch (error) {
      // What the host threw names no key: keys are only ever read, not thrown.
      return { result: `[${PLUGIN}] find could not run: ${error instanceof Error ? error.message : String(error)}` };
    }
  });

  // Spelled out, not imported: a test holds it to STATUS_COMMAND. Told what the hook knows, it opens no place results
  // are kept in and reads no stored result; of the key variables it is told only which hold something (#108).
  on('command.run', { command: 'lossless-status' }, async ($) => {
    try {
      const env = await envOf($);
      let now: Awaited<ReturnType<typeof providerOf>> | undefined;
      try {
        now = await providerOf($, options);
      } catch {
        // Told as a lookup that failed.
      }
      let claudeCode: string | null = null;
      try {
        claudeCode = (await $.session.version()).version;
      } catch {
        // Said as not known.
      }
      let messages: readonly Message[] = [];
      try {
        messages = (await $.session.messages()) as readonly Message[];
      } catch {
        // Counted as none.
      }
      return {
        text: statusReport({
          claudeCode,
          options,
          atStart: findAtStart,
          now: findFrom(now),
          keysIn: { TYPESAFE_API_KEY: (env.TYPESAFE_API_KEY ?? '').trim() !== '', CLOUDFLARE_API_TOKEN: (env.CLOUDFLARE_API_TOKEN ?? '').trim() !== '' },
          messages,
        }),
      };
    } catch {
      // What an error says may name a path: it is not shown.
      return { text: 'the status could not be read' };
    }
  });

  // A message sent again from a rewind, its middle still the line of this plugin's, goes in as the whole message it
  // was: Claude Code puts the message in the box as it stands in the conversation (ADR 0024). Only what the person
  // sends, and only a message this plugin kept: a peer's message or a notification goes in as it is.
  on('prompt.submit', async ($, e, next) => {
    const text = (e as { text?: unknown }).text;
    if (typeof text !== 'string' || readBody(text) === null) return next(e);
    const store = await storeOf($, options);
    if (typeof store === 'string') return next(e);
    const files = filesOf($);
    const whole = await rewound(e, {
      kindOf: (id) => storedAs(files, store.read, id),
      textOf: async (id) => {
        const got = await recall(files, store.read, id);
        return 'error' in got ? null : got.text;
      },
    });
    return whole === null ? next(e) : next({ ...e, text: whole });
  });

  // What is done, and in what order, is src/flow.ts's: each step is carried out here as it is returned.
  //
  // Its `.catch` is run by Claude Code when the hook throws, answers what it refuses, or outruns its time; without
  // it the hook would be taken for absent and the built-in summary would run with nothing kept (#102). The
  // conversation is kept first, as where the compaction could not be tried. Where the hook had called `next`
  // already, calling it again hands back what that call came to, and nothing beneath runs again: the tickets
  // follow that. Called on `on(...)` itself: Claude Code refuses a hook file that keeps what `on` returns
  // (2.1.287 to 2.1.291).
  on('session.compact', async ($, e, next) => {
    const before = beforeTrying({ trigger: e.trigger, agentId: e.agentId });
    if (before.step === 'skip') return { skip: before.why };
    if (before.step === 'subagent') return summarizeSubagent($, e, next, options);

    const tried = await attempt($, e, options);
    // Claude Code went on without this hook meanwhile (out of its time, or interrupted), and what it answers now is
    // not read: nothing more is said, written or handed on, after what its handler said.
    if (next.signal.aborted) return { skip: `${PLUGIN} went on without this compaction` };
    let result: SessionCompactResult;
    if ('why' in tried) {
      say($, builtInLine(tried.why));
      result = await summarizeKeeping($, e, next, tried.keep);
    } else {
      const step = nextStep({
        trigger: e.trigger,
        instructions: e.instructions,
        outcome: tried.outcome,
        inUse: tried.inUse,
        given: tried.given,
        maxAfterPercent: tried.maxAfterPercent,
        count: tried.count,
        keepTokens: tried.keepTokens,
        entries: tried.entries,
      });
      // What Claude Code attached as it sent the messages is kept wherever the conversation is rebuilt or summarized
      // (#105); a compaction left undone leaves the conversation, and what came with it, as it was.
      const ready = step.step === 'skip' ? tried : await withAttached($, e, tried);
      // As after the attempt: keeping what was attached is written, and Claude Code may have gone on meanwhile.
      if (next.signal.aborted) return { skip: `${PLUGIN} went on without this compaction` };
      // A `/compact` by hand that would have been left undone, cut for its length (ADR 0034), is left undone where what
      // was attached cannot be kept: no summary was asked for.
      if ('why' in ready && step.step === 'cut' && step.otherwise.step === 'skip') {
        say($, `not cut for its length: ${ready.why}`);
        result = { skip: step.otherwise.why };
      } else if ('why' in ready) {
        say($, builtInLine(ready.why));
        result = await summarizeKeeping($, e, next, ready.keep);
      } else {
        result = await carryOut($, e, next, ready, step);
      }
    }
    // The newest ticket of the conversation handed back, this compaction's among them, else of the one handed in:
    // what a clean-up looks for in its transcript before it moves anything (ADR 0027).
    const standing = 'messages' in result && Array.isArray(result.messages) ? result.messages : e.messages;
    await noteWitnessOf($, newestOf(standing as readonly Message[], e.messages as readonly Message[]), options);
    return result;
  }).catch(async ($, e, next) => {
    // A compaction computed ahead, or a subagent's, is what the hook above makes of it: the hook is absent.
    if (beforeTrying({ trigger: e.trigger, agentId: e.agentId }).step !== 'try') return undefined;
    say($, failedLine(next.error, next.called));
    try {
      // What the hook's own call came to first, before anything is written: a summary that failed fails here again.
      const settled = next.called ? await next(e) : undefined;
      const summarize = settled === undefined ? next : async () => settled;
      const messages = e.messages as readonly Message[];
      const placed = await placeOf($, messages, options);
      const keep = 'store' in placed ? { store: placed.store, messages: messagesFromApi(await $.session.messages({ as: 'api' })) ?? messages } : { unkept: placed.why };
      const result = await summarizeKeeping($, e, summarize, keep);
      // As after the hook's own compaction: the newest ticket the conversation now holds, for a clean-up (ADR 0027).
      const standing = 'messages' in result && Array.isArray(result.messages) ? result.messages : messages;
      await noteWitnessOf($, newestOf(standing as readonly Message[], messages), options);
      return result;
    } catch (error) {
      // Absent: Claude Code runs the built-in summary, or what the hook's call to it came to stands.
      say($, `handing the conversation to the built-in summary failed as well: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  });
};
