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
import { cutLine, keepOldest } from '../src/cut.ts';
import { find } from '../src/find.ts';
import { beforeTrying, configFrom, nextStep, type Step } from '../src/flow.ts';
import { PLACES, moverOf } from '../src/commands.ts';
import { readBody, rewound } from '../src/body.ts';
import { guarded, longestIn, middleDropped, middleRefusal, placedTicketIds, refused } from '../src/guard.ts';
import { keepThenSummarize, messagesFromApi, namedThroughParts } from '../src/keep.ts';
import { IMAGE_TOKENS, blocksOf, mediaIn } from '../src/media.ts';
import { ownProcessId } from '../src/mark.ts';
import { closeStore, type Run } from '../src/private.ts';
import { goalOf, whyNotRebuilt } from '../src/select.ts';
import { FIND, PLUGIN, RECALL, STORE_COMMAND, configDirFrom, holds, placesOf, recall, recallMeant, storedAs, type Recalled, type StoreDirs } from '../src/store.ts';
import { recallDescription } from '../src/tools.ts';
import { describeTaints, placeTaints, sendTaints, taintsFrom, type RepoSettings, type Seen, type Taint } from '../src/trust.ts';
import type { DirEntry, Exec, FileStat, Files, HttpResponse, Message } from '../src/types.ts';
import {
  collect,
  liveIds,
  noteRoot,
  noteRun,
  noteStopped,
  noteTried,
  partIds,
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
} from '../src/lifetime.ts';
import { countStore, lateLine, lateSince, oldestResult, skipped, storeReport } from '../src/health.ts';

const FALLBACK_WINDOW = 200_000;

type WithUi = { ui: { log: (text: string) => void; toast: (text: string) => void } };
type WithEnv = { env: { get: (name: string) => Promise<string | undefined> } };
type WithEnvSet = { env: { set: (name: string, value: string) => Promise<unknown> } };
type WithFiles = {
  fs: {
    read: (path: string) => Promise<string>;
    write: (path: string, text: string) => Promise<void>;
    stat: (path: string) => Promise<FileStat>;
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
type WithSession = {
  session: {
    id: () => Promise<string>;
    messages: (args?: { as: 'api' }) => Promise<unknown>;
    usage: (args: { breakdown: 'summary' }) => Promise<{ context?: (Context & { tokens?: unknown }) | undefined }>;
  };
};
type Compacting = { messages: readonly unknown[]; instructions?: string | undefined; trigger?: string | undefined };

function say($: WithUi, text: string): void {
  try {
    $.ui.log(`${PLUGIN}: ${text}`);
    $.ui.toast(`${PLUGIN}: ${text}`);
  } catch {
    // A surface that cannot show it must not change what the plugin does.
  }
}

function filesOf($: WithFiles): Files {
  return {
    read: (path) => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    stat: (path) => $.fs.stat(path),
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

/** The directory written to, made or closed to its owner alone, else why not; the others read from, closed where they can be. */
async function privateOf($: WithUi & WithFiles & WithProcess, store: StoreDirs): Promise<string | null> {
  const { refused, warnings } = await closeStore(filesOf($), runOf($), store);
  for (const warning of warnings) say($, `a directory results are read from could not be made private: ${warning}`);
  return refused === null ? null : `the place results are kept in cannot be made private: ${refused}`;
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

/** Where results are kept, or why no place can be trusted: the repository's settings never decide it (ADR 0005). */
async function storeOf($: WithEnv & WithFiles & WithSettings, options: PluginOptions): Promise<StoreDirs | string> {
  const env = await envOf($);
  const taints = await taintsOf($, env, options);
  const deciding = taints === null ? null : placeTaints(taints, options);
  if (deciding === null || deciding.length > 0) {
    return deciding === null
      ? describeTaints(null)
      : `where results are kept would be decided by the repository (${describeTaints(deciding)}); set storeDir in your user settings`;
  }
  const store = await placesOf(filesOf($), options['storeDir'], {
    CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR,
    HOME: env.HOME,
    USERPROFILE: env.USERPROFILE,
  });
  return store ?? 'the place to keep results in is not an absolute path; set storeDir to one';
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

/** Puts back from the trash what the conversation's tickets name, in every place results are read from. */
async function restoreFor($: WithFiles & WithProcess, store: StoreDirs, ids: ReadonlySet<string>, parts: ReadonlySet<string> = ids): Promise<number> {
  try {
    return await restoreThroughParts(filesOf($), listOf($), execOf($), store.read, ids, parts);
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
/** The places results are read from that are there as plain directories, not links: what the clean-up and /lossless-store read. */
async function plainDirsOf($: WithFiles, store: StoreDirs): Promise<string[]> {
  const dirs: string[] = [];
  for (const dir of store.read) {
    const found = await filesOf($).stat(dir).catch(() => null);
    if (found && found.kind === 'dir' && found.isLink !== true) dirs.push(dir);
  }
  return dirs;
}

async function collectOnce($: WithUi & WithEnv & WithFiles & WithSettings & WithProcess, options: PluginOptions): Promise<void> {
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
    const dirs = await plainDirsOf($, store);
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
    if (whyNotNow(state, now) !== null) return;
    if ((await privateOf($, store)) !== null) return;
    const record = await noteTried(files, store.write, state, now);
    tried = { dir: store.write, record };
    await writeSentinel(files, store.write);
    const live = await liveIds(files, list, execOf($), (path) => $.fs.exists(path), state.roots, sentinelOf(store.write));
    if ('stop' in live) {
      say($, `moved-out results are kept, not cleaned up: ${live.stop}`);
      await stoppedAs(files, store.write, record, live.kind);
      return;
    }
    // A result kept with a summarized conversation is named in its part, not in a transcript (ADR 0007).
    const named = await namedThroughParts(files, dirs, live.ids);
    if ('stop' in named) {
      say($, `moved-out results are kept, not cleaned up: ${named.stop}`);
      await stoppedAs(files, store.write, record, named.kind);
      return;
    }
    // One try, one stop: the first, should more than one place stop.
    let stopped: StopKind | null = null;
    for (const dir of dirs) {
      const done = await collect(list, execOf($), dir, named, now);
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
async function stoppedAs(files: Files, dir: string, record: GcRecord, kind: StopKind): Promise<void> {
  try {
    await noteStopped(files, dir, record, kind, Date.now());
  } catch {
    // The stop was said; it is not recorded this time.
  }
}

/**
 * Why the built-in compaction runs on the conversation as it is, and what of
 * it can be kept first, or why nothing of it can be.
 */
type HandedOver = { why: string; keep: { store: StoreDirs; messages: readonly Message[] } | { unkept: string } };

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
};

/**
 * One compaction, up to what would be handed back, or why the built-in
 * compaction runs instead. Nothing is thrown, so the caller calls `next` once
 * whatever happened here.
 */
async function attempt(
  $: WithUi & WithEnv & WithFiles & WithSession & WithSettings & WithProcess,
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
    const place = await storeOf($, options);
    if (typeof place === 'string') return { why: place, keep: { unkept: 'there is no place to keep it in' } };
    // Before anything is written: what cannot be made private is not written to, the conversation included.
    const unsafe = await privateOf($, place);
    if (unsafe !== null) return { why: unsafe, keep: { unkept: 'the place to keep it in could not be made private' } };
    store = place;
    // Before a summary can run: a kept conversation is named by this session's transcript, which a collection must read.
    await noteRootOf($, store, options);
    // A ticket whose result a collection moved to the trash meanwhile is put back, so that it stays a ticket of this store.
    await restoreFor($, store, ticketIds(messages), partIds(messages));
    const api = await $.session.messages({ as: 'api' });
    asSent = messagesFromApi(api) ?? messages;
    const media = mediaIn(api);
    const why = whyNotRebuilt(messages, api) ?? (media.why === null ? null : `the conversation holds what a rebuilt message cannot carry: ${media.why}`);
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
    const outcome = await compact(
      {
        messages,
        tokens: inUse,
        count,
        window: windowFrom(context, FALLBACK_WINDOW),
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
    };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { why, keep: store === null ? { unkept: 'the place to keep it in could not be read' } : { store, messages: asSent } };
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
): Promise<SessionCompactResult | null> {
  const { outcome } = tried;
  const started = Date.now();
  try {
    const cut = await keepOldest(storingFilesOf($), tried.store, { messages: outcome.messages, tokens: outcome.report.tokensAfter, count: tried.count }, after, at);
    if ('failed' in cut) return null;
    const report = { ...outcome.report, charsAfter: charsOf(cut.messages), tokensAfter: cut.tokensAfter, ms: outcome.report.ms + (Date.now() - started) };
    say($, cutLine(report, { first: after + 1, last: at, of: outcome.messages.length, parts: cut.parts, over }));
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
      say($, step.line);
      return { messages: outcome.messages };
    case 'cut': {
      const cut = await cutKeeping($, tried, step.after, step.at, step.over);
      // A part could not be written: handed over as `otherwise` says, where what could not be kept is said, or skipped (ADR 0008).
      return cut ?? carryOut($, e, next, tried, step.otherwise);
    }
    case 'summarize':
      say($, step.line);
      // Handed over as it was, the conversation is kept as it was handed in; else what is left, and that is what is kept.
      return step.of === 'given'
        ? summarizeKeeping($, e, next, { store, messages: e.messages as readonly Message[] })
        : summarizeKeeping($, { ...e, messages: outcome.messages }, next, { store, messages: outcome.messages });
  }
}

type WithTools = { tool: { register: (tool: { name: string; description: string; inputSchema: Record<string, unknown> }) => Promise<unknown> } };

/**
 * Registers `find` when there is a key it may use, then `recall`, whose
 * description names `find` only if `find` was registered. `provider` is
 * undefined when looking for the key failed: that was said where it failed.
 */
export async function registerTools($: WithTools & WithUi, provider: Provider | null | { error: string } | undefined): Promise<void> {
  let withFind = false;
  // Only with a key: without one the tool would have nothing to answer with.
  if (provider !== undefined && provider !== null && 'error' in provider) {
    say($, `the find tool is not registered: ${provider.error}`);
  } else if (provider !== undefined && provider !== null) {
    try {
      await $.tool.register({
        name: FIND,
        description:
          `Finds, among the tool results that ${PLUGIN} moved out of this conversation and the parts of it that were ` +
          'kept, the one a question is about, and returns it unchanged. Ask in words what the result contains or is about; a phrase of twelve characters ' +
          'or more in double quotes is looked for as written. A number, a checksum or a code the question names, one of them with three digits or more, is looked for as written, letter case too, in the whole of each result, a line at a time, and Jev is told when one result alone holds it. ' +
          'When Jev is not sure which result it is, the likeliest few ' +
          'are listed with the ids to recall them by; when none of them seems to be about it, it says so.',
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
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await markRunning($);
    let provider: Awaited<ReturnType<typeof providerOf>> | undefined;
    try {
      provider = await providerOf($, options);
    } catch (error) {
      say($, `the find tool could not be registered: ${error instanceof Error ? error.message : String(error)}`);
    }
    await registerTools($, provider);
    // A command, not a tool: what it says is shown to you, and the agent is not offered it (ADR 0016).
    try {
      await $.command.register({
        name: STORE_COMMAND,
        description: `Says how much ${PLUGIN} keeps, what is in its trash and how its clean-up went, without reading a result`,
        immediate: true,
      });
    } catch (error) {
      say($, `the /${STORE_COMMAND} command could not be registered: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Not waited for: reading every transcript can take a minute, and the session should not.
    void collectOnce($, options);
    return next(e);
  });

  // Spelled out, not imported: a test holds it to STORE_COMMAND.
  on('command.run', { command: 'lossless-store' }, async ($) => {
    try {
      const store = await storeOf($, options);
      if (typeof store === 'string') return { text: `no place results are kept in can be read: ${store}` };
      const now = Date.now();
      const files = filesOf($);
      const list = listOf($);
      // The places the clean-up reads, and its record from the same places.
      const there = await plainDirsOf($, store);
      const counted = [];
      for (const dir of store.read) counted.push(there.includes(dir) ? await countStore(files, list, dir, now) : skipped(dir));
      const gc = await stateIn(files, list, there);
      const set = typeof options['storeDir'] === 'string' && options['storeDir'].trim() !== '';
      return { text: storeReport(counted, gc, now, set) };
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
  on('tool.call', { tool: 'mcp__lossless-compaction__recall' }, async ($, e) => {
    const store = await storeOf($, options);
    if (typeof store === 'string') return { result: `[${PLUGIN}] Nothing is read: ${store}.` };
    const id = (e as { id?: unknown }).id;
    const agentId = (e as { agentId?: string | undefined }).agentId;
    // An id copied wrong is taken for the one id written in the conversation that begins as it does
    // (src/store.ts decides). The tickets are in the main conversation: a subagent's has none to match.
    const found = await recallMeant(
      (one) => recalled($, store, one),
      id,
      async () => (agentId === undefined ? ((await $.session.messages()) as readonly Message[]) : []),
    );
    if ('error' in found) return { result: `[${PLUGIN}] ${found.error}` };
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
  // handed the file over (#54, src/changed.ts decides). A subagent's conversation has no such line.
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
      const provider = await providerOf($, options);
      if (provider !== null && 'error' in provider) {
        return { result: `[${PLUGIN}] find cannot ask Jev: ${provider.error}. recall reads a result by its id.` };
      }
      const agentId = (e as { agentId?: string | undefined }).agentId;
      const messages = agentId === undefined ? ((await $.session.messages()) as readonly Message[]) : [];
      await restoreFor($, store, ticketIds(messages), partIds(messages));
      const result = await find({
        files: filesOf($),
        dirs: store.read,
        messages,
        provider,
        http: (url, init) => $.http.fetch(url, init),
        wait: (ms, signal) => $.clock.sleep(ms, { signal }),
        question: (e as { question?: unknown }).question,
        agentId,
      });
      return { result };
    } catch (error) {
      // What the host threw names no key: keys are only ever read, not thrown.
      return { result: `[${PLUGIN}] find could not run: ${error instanceof Error ? error.message : String(error)}` };
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
  on('session.compact', async ($, e, next) => {
    const before = beforeTrying({ trigger: e.trigger, agentId: e.agentId });
    if (before.step === 'skip') return { skip: before.why };
    if (before.step === 'pass') return next(e);

    const tried = await attempt($, e, options);
    if ('why' in tried) {
      say($, `built-in compaction: ${tried.why}`);
      return summarizeKeeping($, e, next, tried.keep);
    }
    const step = nextStep({
      trigger: e.trigger,
      instructions: e.instructions,
      outcome: tried.outcome,
      inUse: tried.inUse,
      given: tried.given,
      maxAfterPercent: tried.maxAfterPercent,
      count: tried.count,
      keepTokens: tried.keepTokens,
    });
    return carryOut($, e, next, tried, step);
  });
};
