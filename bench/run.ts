// Runs units of the benchmark: one trace, one model, one run, one arm. A unit
// forks the built conversation, compacts the copy, and asks each question of a
// fresh copy of what the compaction left; a unit of a chain asks each question of
// what the one before left, so that what was brought back stays. What it measured
// is written per unit, so a run that is stopped goes on where it was.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { build, recordPath, workDir, type Base, type Places } from './build.ts';
import { claude } from './cc.ts';
import { gapsOf, holdsAll, lookedOutside, ownUsage, readLine, retrievalOf, summarizedBy, tellsIn, type Arm, type Line, type Retrieval, type Usage } from './lib.ts';
import { BUILT, FIND_TOOL, QUESTION_TOOLS, type Kind, type Trace } from './traces.ts';

export type Asked = {
  id: string;
  kind: Kind;
  answer: string;
  /**
   * Set here, by the program, when an exact answer holds the text asked for. Every
   * other answer is graded afterwards by a model that is not told the arm: whether
   * it is right, for the kinds a program cannot grade; and for an exact answer that
   * does not hold the text, only whether it gave something else or said it could not tell.
   */
  verdict?: 'correct';
  calls: string[];
  /** What the agent asked `find`, in the order it asked: absent where it did not call it. */
  findQuestions?: string[];
  /** The model that answered instead, where the unit's model refused and Claude Code went on with another: the answer is then not the unit's model's. */
  fellBackTo?: string;
  retrieval: Retrieval;
  outside: boolean;
  /** Calls the session made that were refused: something it tried that a question does not allow. */
  refused: number;
  tells: number;
  /** Input tokens of each request the question took. */
  requests: number[];
  durationMs: number;
  wallMs: number;
  own: Usage;
};

export type Unit = {
  trace: string;
  version: number;
  /** The session the trace was built in: a trace built again is another conversation. */
  base: string;
  /** The code of the plugin that ran, as a hash of its committed trees: what a unit is held to. Null in the built-in arm. */
  plugin: string | null;
  /** The commit it was checked out at: for finding it again, not for telling units apart, since a commit that touches no code of the plugin leaves it the same. */
  pluginCommit: string | null;
  model: string;
  run: number;
  arm: Arm;
  /** True when this arm was the one set to go before the other in its run. A run taken up again measures the second one later than that; `at` says when. */
  first: boolean;
  /** A setting of the plugin other than its defaults, or which checkout of it ran. */
  variant: string;
  mode: Mode;
  at: string;
  claudeCode: string;
  compaction: {
    sessionId: string;
    durationMs: number;
    wallMs: number;
    preTokens: number;
    postTokens: number;
    /**
     * The thinking in what was compacted, in tokens, as the session that built the
     * trace counted it: no rebuilt message carries it. Absent in a unit measured
     * before it was recorded.
     */
    thinkingBefore?: number;
    /** The plugin's line, read; null in the built-in arm. */
    line: Line | null;
    /**
     * True when the built-in summary ran: always in the built-in arm, and in the plugin's when it handed over.
     * Not where the plugin kept the oldest messages in place of a summary, or handed the conversation back as rebuilt (ADR 0019).
     */
    summarized: boolean;
    /**
     * True when nothing was compacted: the plugin left a `/compact` with nothing to move
     * out and room left as it was. The time is then the session's, and the tokens before
     * and after are both what was in use. Absent otherwise.
     */
    undone?: true;
    own: Usage;
  };
  questions: Asked[];
  /**
   * In a chain, what was in use once every question had been asked: the first request of one more that needs
   * no history. Against the first request of the first question, it is what was brought back.
   */
  afterQuestions?: number;
};

export type Variant = {
  name: string;
  pluginDir: string;
  options?: Record<string, unknown>;
  tools?: readonly string[];
  /** The keys for `find`, in the variant that has the tool. They go to the session's environment and into no file: a unit names its variant, not what the variant was given. */
  env?: Readonly<Record<string, string>>;
};

/**
 * What a unit asks: the trace's questions, one question that needs no history, the questions `find` is for, or
 * the trace's questions one after another (`chain`), each going on from the one before.
 */
export type Mode = 'ask' | 'probe' | 'find' | 'chain';

/** The name of a unit's file: its arm, then what sets it apart from the plain unit of that arm. */
export const leaf = (arm: Arm, variant: string, mode: Mode) => [arm, ...(variant === 'default' ? [] : [variant]), ...(mode === 'ask' ? [] : [mode])].join('-');

/** What of a checkout is the plugin's code. */
const CODE = ['src', 'hooks', '.claude-plugin', 'package.json'] as const;

/**
 * The code of the plugin in a checkout, as a hash of the trees it is committed
 * as, and the commit. A checkout whose code differs from its commit is not
 * measured: nothing would say afterwards what it was.
 */
export function checkoutOf(dir: string): { code: string; commit: string } {
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  const changed = git('status', '--porcelain', '--', ...CODE);
  if (changed !== '') throw new Error(`${dir}: the plugin's code differs from its commit (${changed.split('\n').length} path(s)); commit it before measuring`);
  const trees = git('rev-parse', ...CODE.map((path) => `HEAD:${path}`));
  return { code: createHash('sha256').update(trees).digest('hex').slice(0, 12), commit: git('rev-parse', '--short=12', 'HEAD') };
}

/** Why a unit already measured is not the one asked for now, or null: another version of the trace, another building of it, other code of the plugin. */
export function staleness(measured: Pick<Unit, 'version' | 'base' | 'plugin'>, trace: Pick<Trace, 'version'>, base: Pick<Base, 'sessionId'>, plugin: string | null): string | null {
  if (measured.version !== trace.version) return `it measured version ${measured.version} of the trace, which is now ${trace.version}`;
  if (measured.base !== base.sessionId) return 'the trace has been built again since';
  if (measured.plugin !== plugin) return `it measured the plugin's code ${measured.plugin}, which is now ${plugin}`;
  return null;
}
const unitPath = (places: Places, trace: string, model: string, run: number, arm: Arm, variant: string, mode: Mode) =>
  join(places.box, 'units', trace, model, `run-${run}`, `${leaf(arm, variant, mode)}.json`);

/**
 * One unit, or the one already measured. A unit measured against something else
 * than what is asked for now is never returned as if it were this one, and never
 * written over: the run stops and names it.
 */
export async function unit(
  trace: Trace,
  base: Base,
  model: string,
  run: number,
  arm: Arm,
  places: Places,
  variant: Variant,
  mode: Mode,
  questions: readonly { id: string; kind: Kind; ask: string; needles?: string[] }[],
  first: boolean,
  log: (text: string) => void = () => {},
): Promise<Unit> {
  const path = unitPath(places, trace.name, model, run, arm, variant.name, mode);
  const checkout = arm === 'plugin' ? checkoutOf(variant.pluginDir) : null;
  const plugin = checkout?.code ?? null;
  if (existsSync(path)) {
    const measured = JSON.parse(readFileSync(path, 'utf8')) as Unit;
    const why = staleness(measured, trace, base, plugin);
    if (why !== null) throw new Error(`${path}: ${why}; move it aside to measure again`);
    return measured;
  }
  const cwd = workDir(places, base);
  const records = join(places.box, 'records', trace.name, model, `run-${run}`, leaf(arm, variant.name, mode));
  const common = {
    cwd,
    model,
    arm,
    // A store of this attempt's own: nothing an earlier unit, or an attempt at this one that stopped half way, moved out is already there.
    storeDir: join(places.box, 'store', trace.name, model, `run-${run}`, `${leaf(arm, variant.name, mode)}-${Date.now().toString(36)}`),
    version: base.claudeCode,
    ...(arm === 'plugin' ? { pluginDir: variant.pluginDir } : {}),
    ...(variant.options !== undefined ? { pluginOptions: variant.options } : {}),
    ...(arm === 'plugin' && variant.env !== undefined ? { env: variant.env } : {}),
    ...(trace.window !== undefined ? { window: trace.window } : {}),
  };
  const tools = variant.tools ?? QUESTION_TOOLS;

  const compacted = await claude({ ...common, out: join(records, 'compact.jsonl'), allowedTools: tools, resume: base.sessionId, prompt: '/compact' });
  const boundary = compacted.session.compaction;
  // The plugin's line at a compaction; of a `/compact` it left undone (ADR 0015) its line is the reason Claude Code gives for not compacting.
  const line = compacted.session.uiLog.map(readLine).find((read) => read !== null) ?? (compacted.session.skipped === null ? null : readLine(compacted.session.skipped));
  // Left undone, no boundary is written.
  const undone = boundary === null && arm === 'plugin' && line?.outcome === 'undone' && compacted.session.skipped !== null;
  if (boundary === null && !undone) throw new Error(`${records}: nothing was compacted`);
  const missing = boundary === null ? [] : gapsOf(compacted.session, 'compaction');
  if (missing.length > 0) throw new Error(`${records}: ${missing.join('; ')}`);
  if (arm === 'plugin' && line === null) throw new Error(`${records}: the plugin said nothing at the compaction`);
  // A summary written by another model than the one asked for is no compaction of this unit's.
  if (compacted.session.fellBackTo !== null) throw new Error(`${records}: ${model} refused at the compaction, and ${compacted.session.fellBackTo} went on in its place`);
  // Left undone, nothing changed: the time is the session's, and what was in use is what the plugin's line named, or the trace as it was built.
  const inUse = line?.inUse ?? base.tokens;
  const sizes =
    boundary === null
      ? { durationMs: compacted.session.durationMs, preTokens: inUse, postTokens: inUse }
      : { durationMs: boundary.durationMs, preTokens: boundary.preTokens, postTokens: boundary.postTokens };
  // A fork prints the usage of the session it came from with its own. Were that missing, taking one from the other would give a compaction that cost nothing.
  const unseen = Object.keys(base.modelUsage).filter((name) => !(name in compacted.session.modelUsage));
  if (unseen.length > 0) throw new Error(`${records}: the compaction's session does not carry the usage of the trace it was forked from (${unseen.join(', ')})`);
  const own = ownUsage(compacted.session, base);
  log(`${trace.name} ${model} run ${run} ${arm} ${variant.name}: ${undone ? 'left undone' : 'compacted'} in ${sizes.durationMs} ms, ${sizes.preTokens} -> ${sizes.postTokens}${line ? `, ${line.outcome}` : ''}`);

  const asked: Asked[] = [];
  // In a chain, each question goes on from the one before, and its session is kept for the next to go on from.
  const chained = mode === 'chain';
  let parent = compacted.session;
  const kept: string[] = [];
  let afterQuestions: number | undefined;
  try {
    for (const question of questions) {
      const ran = await claude({ ...common, out: join(records, `q-${question.id}.jsonl`), allowedTools: tools, resume: parent.sessionId, prompt: question.ask, refusalsCounted: true, kept: chained });
      const { session } = ran;
      if (session.compaction !== null) throw new Error(`${records}: the conversation was compacted again at the question ${question.id}`);
      const gaps = gapsOf(session, 'question');
      if (gaps.length > 0) throw new Error(`${records}, ${question.id}: ${gaps.join('; ')}`);
      const putToFind = session.toolCalls.filter((call) => call.name === FIND_TOOL).map((call) => String(call.input['question'] ?? ''));
      const one: Asked = {
        id: question.id,
        kind: question.kind,
        answer: session.answer,
        calls: session.toolCalls.map((call) => call.name),
        ...(putToFind.length > 0 ? { findQuestions: putToFind } : {}),
        ...(session.fellBackTo !== null ? { fellBackTo: session.fellBackTo } : {}),
        retrieval: retrievalOf(session.toolCalls),
        // Against the directory the session says it ran in: the box may be reached through a link.
        outside: lookedOutside(session.toolCalls, session.cwd || cwd),
        refused: session.denials.length,
        tells: tellsIn(session.answer),
        requests: session.requests,
        durationMs: session.durationMs,
        wallMs: ran.wallMs,
        own: ownUsage(session, parent),
      };
      if (question.needles !== undefined && holdsAll(session.answer, question.needles)) one.verdict = 'correct';
      // A question calls the model: one that cost nothing is one whose usage was not taken from its parent's as meant.
      if (!(one.own.costUSD > 0)) throw new Error(`${records}, ${question.id}: the question's own cost came out as ${one.own.costUSD}`);
      asked.push(one);
      log(`  ${question.id}: ${one.verdict ?? 'to grade'}, calls ${one.calls.join(',') || 'none'}, ${one.requests[0]} tokens, ${one.durationMs} ms`);
      if (chained) {
        kept.push(session.sessionId);
        parent = session;
      }
    }
    // Measured before the chain's sessions are moved: it goes on from the last of them.
    if (chained) {
      const ran = await claude({ ...common, out: join(records, 'after.jsonl'), allowedTools: tools, resume: parent.sessionId, prompt: (PROBE[0] as { ask: string }).ask, refusalsCounted: true, kept: false });
      afterQuestions = ran.session.requests[0];
      if (afterQuestions === undefined) throw new Error(`${records}: the request after the questions was not measured`);
      log(`  after the questions: ${afterQuestions} tokens`);
    }
  } finally {
    // What a question answered is not left where a session of another unit can read it (see "What is there to
    // be read" in bench/README.md): a chain's sessions go to the unit's records, whether it ended or stopped.
    for (const sessionId of kept) {
      const from = recordPath(cwd, sessionId);
      if (existsSync(from)) renameSync(from, join(records, `${sessionId}.record.jsonl`));
    }
  }

  const measured: Unit = {
    trace: trace.name,
    version: trace.version,
    base: base.sessionId,
    plugin,
    pluginCommit: checkout?.commit ?? null,
    model,
    run,
    arm,
    first,
    variant: variant.name,
    mode,
    at: new Date().toISOString(),
    claudeCode: compacted.session.version,
    compaction: {
      sessionId: compacted.session.sessionId,
      durationMs: sizes.durationMs,
      wallMs: compacted.wallMs,
      preTokens: sizes.preTokens,
      postTokens: sizes.postTokens,
      thinkingBefore: base.thinkingTokens,
      line,
      summarized: arm === 'builtin' || (line !== null && summarizedBy(line)),
      ...(undone ? { undone: true as const } : {}),
      own,
    },
    questions: asked,
    ...(afterQuestions !== undefined ? { afterQuestions } : {}),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(measured, null, 1)}\n`);
  return measured;
}

/** Said after a question `find` is for, when an agent is asked it: which result it was is shown by a line of it, which a program can check. */
export const QUOTE = { value: 'Quote that line in full.', meaning: 'Quote its first line in full.' } as const;

/** A question that needs nothing of the conversation: what it was sent is the size of what the compaction left. */
export const PROBE = [{ id: 'probe', kind: 'continuity' as Kind, ask: 'Reply with the single word: ok' }];

export type Plan = { traces: string[]; models: string[]; runs: number; buildModel: string; mode: Mode; variants?: Variant[]; arms?: Arm[] };

/**
 * The variants of the plugin a command line names: checkouts by name
 * (`name=path,name=path`), a share of the window that may stay in use, the
 * share a compaction aims at (which is also how far a cut in place of a
 * summary goes, ADR 0019), or each checkout at those. Undefined when it names
 * none.
 */
export function variantsOf(dirs: string | undefined, maxAfter: string | undefined, pluginDir: string, target?: string): Variant[] | undefined {
  const options =
    maxAfter === undefined && target === undefined
      ? undefined
      : { ...(maxAfter === undefined ? {} : { maxAfterPercent: Number(maxAfter) }), ...(target === undefined ? {} : { targetPercent: Number(target) }) };
  const setting = [...(maxAfter === undefined ? [] : [`max-after-${maxAfter}`]), ...(target === undefined ? [] : [`target-${target}`])].join('-');
  if (dirs === undefined) return options === undefined ? undefined : [{ name: setting, pluginDir, options }];
  return dirs.split(',').map((pair) => {
    const [name, path] = pair.split('=');
    if (name === undefined || path === undefined) throw new Error('--plugin-dirs takes name=path,name=path');
    return options === undefined ? { name, pluginDir: resolve(path) } : { name: `${name}-${setting}`, pluginDir: resolve(path), options };
  });
}

/** Which arm goes first: within one trace and model the two take turns from run to run, so that neither is always the one measured on a cache the other warmed. */
export const armsOf = (run: number, traceAt: number, modelAt: number): Arm[] => ((run + traceAt + modelAt) % 2 === 1 ? ['plugin', 'builtin'] : ['builtin', 'plugin']);

/** Runs a matrix. */
export async function runAll(plan: Plan, places: Places, log: (text: string) => void): Promise<Unit[]> {
  const units: Unit[] = [];
  const standard: Variant = { name: 'default', pluginDir: places.pluginDir };
  for (let run = 1; run <= plan.runs; run += 1) {
    for (const name of plan.traces) {
      const traceAt = BUILT.findIndex((one) => one.name === name);
      const trace = BUILT[traceAt];
      if (trace === undefined) throw new Error(`no trace named ${name}`);
      const base = await build(trace, plan.buildModel, places, log);
      for (const [modelAt, model] of plan.models.entries()) {
        const arms: Arm[] = plan.arms ?? armsOf(run, traceAt, modelAt);
        for (const arm of arms) {
          for (const variant of arm === 'plugin' ? (plan.variants ?? [standard]) : [standard]) {
            const questions =
              plan.mode === 'probe' ? PROBE : plan.mode === 'find' ? trace.finds.map((find) => ({ id: find.id, kind: 'exact-gone' as Kind, ask: `${find.ask} ${QUOTE[find.by]}`, needles: [find.target] })) : trace.questions;
            // `find` is registered only when the plugin has a key; the tool is named only in the variant that is handed one.
            const tools = plan.mode === 'find' && variant.env !== undefined ? [...QUESTION_TOOLS, FIND_TOOL] : QUESTION_TOOLS;
            units.push(await unit(trace, base, model, run, arm, places, { ...variant, tools }, plan.mode, questions, arms[0] === arm, log));
          }
        }
      }
    }
  }
  return units;
}
