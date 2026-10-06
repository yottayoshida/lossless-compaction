// One session long enough to compact several times, driven a turn at a time, under each way of compacting it:
// Claude Code's own summary, the plugin aiming at 40, 20 and 1 % of the window (`targetPercent`), and the plugin
// moving what it can out before Claude Code summarizes what is left (#53, #90). Every other measure of the
// benchmark compacts once and asks right after; what a setting costs over several compactions is in none of them.
//
// The session reads station logs one at a time. Between turns the driver removes some of the logs it read and
// writes one again, so that what they said can be had only from the conversation; a long message early on states
// a rule in its middle paragraph; and questions asked along the way, which a program grades, ask for what was read.
// Each turn is one `claude -p` going on in the same session (`--resume` without a fork), started as every session of
// the benchmark is (`cc.ts`).

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { claude } from './cc.ts';
import { logFile, logLine, paragraph } from './fixtures.ts';
import { holdsAll, isRefusal, lookedOutside, ownUsage, readLine, summarizedBy, type Arm, type Line, type Session, type ToolCall, type Usage } from './lib.ts';
import { checkoutOf } from './run.ts';
import { QUESTION_TOOLS } from './traces.ts';

/** Raised when the script or how a session is measured changes: a run of another version is not set beside this one. */
export const SESSION_VERSION = 2;

/** The logs the session reads, and the lines of each: about 35,000 characters a log. */
export const LOGS = 36;
export const LINES = 600;

/** The size at which Claude Code compacts on its own, of the window every session of the benchmark is given (`cc.ts`). */
export const AUTO_LINE = 167_000;

/**
 * The rule the second message states, in its middle paragraph. It asks for nothing that changes a line quoted from a log:
 * an agent that follows it and one that no longer sees it quote the same line, and are graded alike on the others.
 */
export const RULE = 'Whenever an answer of yours quotes a line of a log, end the answer with the single word OVER on a line of its own.';

/**
 * What the setting that hands the rest to a summary types after `/compact`: it has to type something for the plugin to
 * hand over, and asks for nothing the built-in summary of the other setting is not asked for.
 */
export const INSTRUCTIONS = 'Summarize the conversation so far.';

/**
 * A way of compacting the session. `manual` is the point, in tokens in use, at which the driver types a `/compact`
 * with `INSTRUCTIONS` before the next log is read, so that Claude Code does not compact on its own first: the only
 * way to the plugin's summary of what is left is a `/compact` given instructions.
 */
export type Setting = { name: string; arm: Arm; options?: Record<string, unknown>; manual?: number };

export const SETTINGS: Readonly<Record<string, Setting>> = {
  builtin: { name: 'builtin', arm: 'builtin' },
  'target-40': { name: 'target-40', arm: 'plugin', options: { targetPercent: 40 } },
  'target-20': { name: 'target-20', arm: 'plugin', options: { targetPercent: 20 } },
  'target-1': { name: 'target-1', arm: 'plugin', options: { targetPercent: 1 } },
  // Moved out down to 1 %, and still over 10 % with the newest 20,000 tokens left where they are: what is left goes to the
  // summary, what that replaces is kept first. Under 10 % after moving out, or with 10 % under what is not the conversation,
  // the plugin would hand back what it rebuilt and no summary would run (src/compact.ts, `enough`); the driver stops then.
  hybrid: { name: 'hybrid', arm: 'plugin', options: { targetPercent: 1, maxAfterPercent: 10 }, manual: AUTO_LINE },
};

export type Step =
  | { kind: 'say'; text: string }
  | { kind: 'read'; log: number }
  /** Done by the driver between turns: the log is gone, and what it said can be had only from the conversation. */
  | { kind: 'remove'; log: number }
  /** Done by the driver between turns: the log is written again, each line other than it was read. */
  | { kind: 'rewrite'; log: number }
  | { kind: 'ask'; id: string; ask: string; needles: string[] };

export const logPath = (log: number) => `logs/log-${String(log).padStart(2, '0')}.txt`;
const recordId = (log: number, step: number) => `${log}-${String(step).padStart(4, '0')}`;

/** The questions, after which log each is asked, and what a right answer holds. */
export const ASKS: readonly { after: number; id: string; ask: string; needles: string[] }[] = [
  { after: 18, id: 'gone-4', ask: `What did record ${recordId(4, 420)} of ${logPath(4)} say when you read that file? Quote the line in full.`, needles: [logLine(4, 420)] },
  { after: 27, id: 'then-8', ask: `${logPath(8)} has been written again since you read it. What did its record ${recordId(8, 222)} say when you read it? Quote the line in full.`, needles: [logLine(8, 222, 1)] },
  { after: 27, id: 'kept-2', ask: `What does record ${recordId(2, 301)} of ${logPath(2)} say? Quote the line in full.`, needles: [logLine(2, 301)] },
  { after: 36, id: 'gone-12', ask: `What did record ${recordId(12, 77)} of ${logPath(12)} say when you read that file? Quote the line in full.`, needles: [logLine(12, 77)] },
  { after: 36, id: 'gone-20', ask: `What did record ${recordId(20, 555)} of ${logPath(20)} say when you read that file? Quote the line in full.`, needles: [logLine(20, 555)] },
  { after: 36, id: 'rule', ask: 'In my second message I asked you to end some of your answers in a certain way. Quote what I asked, word for word.', needles: [RULE] },
];

/** The logs the driver removes right after they are read, and the one it writes again. */
export const REMOVED: readonly number[] = [4, 12, 20];
export const REWRITTEN = 8;

/** The second message: six paragraphs, the rule in the third, long enough for its middle to leave (ADR 0024). */
export function longMessage(): string {
  const filler = (n: number) => paragraph(90, n);
  return [
    'Some notes on the station logs before you start.',
    filler(1),
    filler(2),
    RULE,
    filler(3),
    filler(4),
    'Reply only: noted.',
  ].join('\n\n');
}

/** The script, in order. `tag` names the setting and the run in the first message, so that no other session's prompt cache is read. */
export function scriptOf(tag: string): Step[] {
  const steps: Step[] = [
    { kind: 'say', text: `This session reads station logs in logs/, one at a time, and answers questions about them. (Session ${tag}.) Reply only: ready.` },
    { kind: 'say', text: longMessage() },
  ];
  for (let log = 1; log <= LOGS; log += 1) {
    steps.push({ kind: 'read', log });
    if (REMOVED.includes(log)) steps.push({ kind: 'remove', log });
    if (log === REWRITTEN) steps.push({ kind: 'rewrite', log });
    for (const one of ASKS.filter((ask) => ask.after === log)) steps.push({ kind: 'ask', id: one.id, ask: one.ask, needles: one.needles });
  }
  return steps;
}

export const readPrompt = (log: number) => `Read ${logPath(log)} with one Read call, then reply only: read.`;

/** One turn: what was sent and what came back of it. */
export type Turn = {
  /** Its place among the steps of the script; a `/compact` the driver typed has the place of the step it came before. */
  step: number;
  kind: 'say' | 'read' | 'ask' | 'compact';
  id?: string;
  /** Each request of the turn, its input taken apart. */
  requests: Session['cached'];
  /**
   * `inUse` is what the last request before it sent: what Claude Code writes as the tokens before a compaction is, where
   * the plugin moved results out and handed the rest over, what was left to summarize, not what was in use.
   */
  compaction?: { trigger: string; inUse: number; preTokens: number; postTokens: number; durationMs: number; at: number; line: Line | null };
  own: Usage;
  wallMs: number;
  answer?: string;
  right?: boolean;
  /** The model's safeguards stopped the answer: the question went unanswered, or another model answered it, which is not counted right. */
  refused?: true;
  /** A question's turn read outside the working directory: Claude Code's own record of the session, which a summary names. */
  outside?: true;
  calls: string[];
  /** Each call to `recall` of the turn, with what it was handed as the id and whether the plugin refused it (#107). Absent from runs before it was recorded. */
  recalled?: Recalled[];
};

/** One call to `recall`: the id handed, kept only as hexadecimal characters and white space, and whether it was refused. */
export type Recalled = { given: string; refused: boolean };

export type SessionRun = {
  version: number;
  setting: string;
  arm: Arm;
  options: Record<string, unknown> | null;
  model: string;
  run: number;
  plugin: string | null;
  pluginCommit: string | null;
  claudeCode: string;
  at: string;
  turns: Turn[];
};

export type Places = { box: string; pluginDir: string };

const sessionPath = (places: Places, model: string, run: number, setting: string) => join(places.box, 'sessions', model, `run-${run}`, `${setting}.json`);

/** Whether a session that ended in an error was stopped by the model's safeguards, by what it printed. */
const flagged = (out: string): boolean => existsSync(out) && /safeguards flagged this message/.test(readFileSync(out, 'utf8'));

/**
 * Drives the session under one setting to its end, or returns the run already measured. A compaction other than the
 * setting's stops it: Claude Code compacting on its own where the driver was to type the `/compact`, the plugin
 * handing over to a summary where it was to move out, or not where it was to.
 */
export async function drive(setting: Setting, model: string, run: number, places: Places, log: (text: string) => void = () => {}): Promise<SessionRun> {
  const path = sessionPath(places, model, run, setting.name);
  const checkout = setting.arm === 'plugin' ? checkoutOf(places.pluginDir) : null;
  if (existsSync(path)) {
    const measured = JSON.parse(readFileSync(path, 'utf8')) as SessionRun;
    if (measured.version !== SESSION_VERSION || measured.plugin !== (checkout?.code ?? null)) throw new Error(`${path}: measured another script or code of the plugin; move it aside to measure again`);
    return measured;
  }
  const stamp = Date.now().toString(36);
  const cwd = join(places.box, 'sessions-work', `${setting.name}-${model}-run-${run}-${stamp}`);
  mkdirSync(join(cwd, 'logs'), { recursive: true });
  for (let n = 1; n <= LOGS; n += 1) writeFileSync(join(cwd, logPath(n)), logFile(n, LINES));
  const records = join(places.box, 'sessions-records', model, `run-${run}`, `${setting.name}-${stamp}`);
  const common = {
    cwd,
    model,
    arm: setting.arm,
    storeDir: join(places.box, 'sessions-store', model, `run-${run}`, `${setting.name}-${stamp}`),
    allowedTools: QUESTION_TOOLS,
    ...(setting.arm === 'plugin' ? { pluginDir: places.pluginDir } : {}),
    ...(setting.options !== undefined ? { pluginOptions: setting.options } : {}),
  };
  const turns: Turn[] = [];
  let sessionId: string | undefined;
  let version: string | undefined;
  let parent: Pick<Session, 'modelUsage'> = { modelUsage: {} };
  // What the last request sent, and the most a read has added: when the next read could take the session past where
  // Claude Code compacts on its own, the setting that types its `/compact` types it first.
  let inUse = 0;
  let growth = 0;

  const turn = async (step: number, kind: Turn['kind'], prompt: string, asked?: { id: string; needles: readonly string[] }): Promise<void> => {
    const out = join(records, `${String(turns.length + 1).padStart(3, '0')}-${kind}${asked ? `-${asked.id}` : ''}.jsonl`);
    const start = { ...common, out, prompt, ...(sessionId !== undefined ? { resume: sessionId, fork: false } : {}), ...(version !== undefined ? { version } : {}), ...(kind === 'ask' ? { refusalsCounted: true } : {}) };
    let session: Session;
    let wallMs: number;
    let text: string;
    try {
      ({ session, wallMs, text } = await claude(start));
    } catch (error) {
      // A question the model's safeguards would not answer goes unanswered, and the session goes on; anything else stops it.
      if (kind === 'ask' && asked !== undefined && flagged(out)) {
        turns.push({ step, kind, id: asked.id, requests: [], own: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0, thinkingTokens: 0 }, wallMs: 0, refused: true, right: false, calls: [] });
        log(`  ${asked.id}: refused by the model's safeguards`);
        return;
      }
      throw error;
    }
    sessionId ??= session.sessionId;
    if (session.sessionId !== sessionId) throw new Error(`${out}: went on in session ${session.sessionId}, not ${sessionId}`);
    version ??= session.version;
    const line = session.uiLog.map(readLine).find((read) => read !== null) ?? null;
    const boundary = session.compaction;
    // One compaction a turn is all that is read of it: two would be counted as one, with the figures of the second.
    const boundaries = (text.match(/"subtype":\s*"compact_boundary"/g) ?? []).length;
    if (boundaries > 1) throw new Error(`${out}: ${boundaries} compactions in one turn`);
    // Another model went on after a refusal: at a question that is no answer of this model's; anywhere else the session is another's.
    if (session.fellBackTo !== null && kind !== 'ask') throw new Error(`${out}: ${model} refused, and ${session.fellBackTo} went on in its place`);
    if (boundary !== null) {
      // The plugin's arms compact on their own and move out; the setting that types its `/compact` hands what is left to the summary.
      if (setting.manual !== undefined) {
        if (kind !== 'compact') throw new Error(`${out}: Claude Code compacted on its own (${boundary.trigger}) before the driver's /compact`);
        if (line === null || line.outcome !== 'too-much') throw new Error(`${out}: the /compact did not hand what was left to the summary (${line?.outcome ?? 'no line'})`);
      } else if (setting.arm === 'plugin' && (line === null || summarizedBy(line))) {
        throw new Error(`${out}: the plugin handed over to the summary (${line?.outcome ?? 'no line'})`);
      }
    } else if (kind === 'compact') {
      throw new Error(`${out}: nothing was compacted`);
    }
    const own = ownUsage(session, parent);
    // A session going on prints what it used with what the turns before it used: were it not so, taking one from the other gives nonsense.
    // After a compaction Claude Code prints the conversation again, each response with no usage: those were not sent.
    const sent = session.cached.filter((one) => one.fresh + one.read + one.written > 0);
    const sizes = sent.map((one) => one.fresh + one.read + one.written);
    if (boundary !== null && session.cached.slice(0, boundary.at).some((one) => one.fresh + one.read + one.written === 0)) throw new Error(`${out}: a request with no usage before the compaction`);
    // A turn that sent a request cost something, and so did a `/compact` handed to the summary, whose requests are not printed.
    if ((sent.length > 0 || (kind === 'compact' && boundary !== null)) && !(own.costUSD > 0)) throw new Error(`${out}: the turn's own cost came out as ${own.costUSD}`);
    parent = session;
    // What was in use when it compacted: the turn's last request before it, else the last of the turn before.
    const inUseBefore = boundary !== null && boundary.at > 0 ? (sizes[boundary.at - 1] as number) : inUse;
    const last = sizes.at(-1);
    if (last !== undefined) {
      if (kind === 'read' && boundary === null) growth = Math.max(growth, last - inUse);
      inUse = last;
    }
    const answer = kind === 'ask' ? session.answer : undefined;
    turns.push({
      step,
      kind,
      ...(asked !== undefined ? { id: asked.id } : {}),
      requests: sent,
      ...(boundary !== null ? { compaction: { trigger: boundary.trigger, inUse: inUseBefore, preTokens: boundary.preTokens, postTokens: boundary.postTokens, durationMs: boundary.durationMs, at: boundary.at, line } } : {}),
      own,
      wallMs,
      ...(answer !== undefined && asked !== undefined ? { answer, right: session.fellBackTo === null && holdsAll(answer, asked.needles) } : {}),
      ...(session.fellBackTo !== null ? { refused: true as const } : {}),
      ...(kind === 'ask' && lookedOutside(sentCalls(text), session.cwd || cwd) ? { outside: true as const } : {}),
      calls: callsIn(text),
      recalled: recalledIn(text),
    });
    if (boundary !== null) log(`  ${kind} ${step}: compacted (${boundary.trigger}) at ${inUseBefore}, ${boundary.preTokens} -> ${boundary.postTokens}${line ? `, ${line.outcome}` : ''}`);
    if (asked !== undefined) log(`  ${asked.id}: ${turns.at(-1)?.right ? 'right' : 'wrong'}`);
  };

  log(`${setting.name} ${model} run ${run}`);
  for (const [at, step] of scriptOf(`${setting.name}, run ${run}, ${stamp}`).entries()) {
    if (step.kind === 'remove') unlinkSync(join(cwd, logPath(step.log)));
    else if (step.kind === 'rewrite') writeFileSync(join(cwd, logPath(step.log)), logFile(step.log, LINES, 2));
    else if (step.kind === 'say') await turn(at, 'say', step.text);
    else {
      // Typed before the turn that could take the session past the line, a read or a question that fetches a log back:
      // where Claude Code would compact on its own in that turn or at the one after.
      if (setting.manual !== undefined && growth > 0 && inUse + growth > setting.manual) await turn(at, 'compact', `/compact ${INSTRUCTIONS}`);
      if (step.kind === 'ask') await turn(at, 'ask', step.ask, step);
      else await turn(at, 'read', readPrompt(step.log));
    }
  }
  const measured: SessionRun = {
    version: SESSION_VERSION,
    setting: setting.name,
    arm: setting.arm,
    options: setting.options ?? null,
    model,
    run,
    plugin: checkout?.code ?? null,
    pluginCommit: checkout?.commit ?? null,
    claudeCode: version ?? '',
    at: new Date().toISOString(),
    turns,
  };
  mkdirSync(join(places.box, 'sessions', model, `run-${run}`), { recursive: true });
  writeFileSync(path, `${JSON.stringify(measured, null, 1)}\n`);
  return measured;
}

/**
 * The tools a turn called, by name: those of the responses it was sent. After a compaction Claude Code prints the
 * conversation again, the calls of earlier turns with it, each in a response with no usage: those are not this turn's.
 */
export const callsIn = (text: string): string[] => sentCalls(text).map((call) => call.name);

/**
 * Each call to `recall` of the responses a turn was sent, with the id it was handed and whether it was refused. An id is
 * kept as it was handed where it is hexadecimal characters and white space alone, 200 at most, and is otherwise said to
 * be no id by its length: what an agent hands as an id can be a path of the machine.
 */
export function recalledIn(text: string): Recalled[] {
  const handed = new Map<string, string>();
  for (const call of sentCalls(text)) if (call.name.endsWith('__recall') && call.id !== undefined) handed.set(call.id, String(call.input['id'] ?? ''));
  const answers = new Map<string, string>();
  for (const line of text.split('\n')) {
    let event: Record<string, any>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.['type'] !== 'user') continue;
    for (const block of event['message']?.['content'] ?? []) {
      if (block?.type !== 'tool_result' || !handed.has(String(block.tool_use_id))) continue;
      const content = block.content;
      answers.set(String(block.tool_use_id), typeof content === 'string' ? content : Array.isArray(content) ? content.map((one: { text?: unknown }) => String(one?.text ?? '')).join('') : '');
    }
  }
  return [...handed].map(([use, given]) => ({
    given: /^[0-9a-f\s]{0,200}$/.test(given) ? given : `(no id: ${given.length} characters)`,
    refused: isRefusal(answers.get(use) ?? ''),
  }));
}

/** The same calls, with what each was handed and its id. */
export function sentCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    let event: Record<string, any>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.['type'] !== 'assistant') continue;
    const usage = event['message']?.['usage'] ?? {};
    if (!((usage['input_tokens'] ?? 0) + (usage['cache_read_input_tokens'] ?? 0) + (usage['cache_creation_input_tokens'] ?? 0) > 0)) continue;
    for (const block of event['message']?.['content'] ?? []) {
      if (block?.type !== 'tool_use' || seen.has(String(block.id))) continue;
      seen.add(String(block.id));
      calls.push({ name: String(block.name ?? ''), input: block.input ?? {}, id: String(block.id) });
    }
  }
  return calls;
}

/** What one run came to: each compaction with the request right after it, and the session as a whole. */
export type Figures = {
  /** `before` and `after` are what the last request before it and the first after it sent; `after` is null where the session sent none after. */
  compactions: { trigger: string; before: number; after: number | null; read: number | null; written: number | null; ms: number; outcome: string }[];
  costUSD: number;
  seconds: number;
  requests: number;
  /** Input of every request, fresh, read and written together. */
  sent: number;
  asked: number;
  right: number;
  refused: number;
  /** Questions answered right in a turn that read outside the working directory. */
  rightOutside: number;
  recalls: number;
  /** What the session had cost once each of `MARKS` logs was read: the settings end at different places between two compactions, and the last turns alone can decide the total. */
  costAt: number[];
};

/** The logs at which what a session has cost so far is given. */
export const MARKS: readonly number[] = [24, 30, 36];

export function figuresOf(run: SessionRun): Figures {
  const flat = run.turns.flatMap((turn, at) => turn.requests.map((request, i) => ({ at, i, request })));
  const compactions = run.turns.flatMap((turn, at) => {
    const compaction = turn.compaction;
    if (compaction === undefined) return [];
    // The first request after it: in its turn where the turn sent one after, else the next turn's first.
    const next = flat.find((one) => (one.at === at && one.i >= compaction.at) || one.at > at)?.request;
    // What was in use: as Claude Code counted it, but at a `/compact` the plugin moved results out of first, where that count is of what was left.
    const before = compaction.trigger === 'manual' ? compaction.inUse : compaction.preTokens;
    return [{ trigger: compaction.trigger, before, after: next === undefined ? null : next.fresh + next.read + next.written, read: next?.read ?? null, written: next?.written ?? null, ms: compaction.durationMs, outcome: compaction.line?.outcome ?? 'summary' }];
  });
  const asked = run.turns.filter((turn) => turn.kind === 'ask');
  const script = scriptOf('');
  const costAt = MARKS.map((log) => {
    const step = script.findIndex((one) => one.kind === 'read' && one.log === log);
    const upTo = run.turns.findIndex((turn) => turn.kind === 'read' && turn.step === step);
    return upTo < 0 ? NaN : run.turns.slice(0, upTo + 1).reduce((total, turn) => total + turn.own.costUSD, 0);
  });
  return {
    compactions,
    costUSD: run.turns.reduce((total, turn) => total + turn.own.costUSD, 0),
    seconds: run.turns.reduce((total, turn) => total + turn.wallMs, 0) / 1000,
    requests: flat.length,
    sent: flat.reduce((total, one) => total + one.request.fresh + one.request.read + one.request.written, 0),
    asked: asked.length,
    right: asked.filter((turn) => turn.right === true).length,
    refused: asked.filter((turn) => turn.refused === true).length,
    rightOutside: asked.filter((turn) => turn.right === true && turn.outside === true).length,
    costAt,
    recalls: run.turns.reduce((total, turn) => total + turn.calls.filter((name) => name.endsWith('__recall')).length, 0),
  };
}

const mean = (values: readonly number[]) => (values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length);
const whole = (value: number) => (Number.isNaN(value) ? '—' : String(Math.round(value)));

/** The order the settings are tabled in. */
const ORDER = ['builtin', 'target-40', 'target-20', 'target-1', 'hybrid'];

/**
 * One row a setting, each run's figure in turn where a figure is the run's: how many compactions, what was in use at
 * each and right after, what the first request after each read from the prompt cache and wrote to it, what a request
 * sent on average over the session, the questions answered right, `recall` calls, and what the session cost and took.
 */
export function sessionTable(runs: readonly SessionRun[]): string {
  const settings = [...new Set(runs.map((run) => run.setting))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const rows = settings.map((setting) => {
    const of = runs.filter((run) => run.setting === setting).sort((a, b) => a.run - b.run);
    const figures = of.map(figuresOf);
    const each = (pick: (one: Figures) => string) => figures.map(pick).join(', ');
    const over = (pick: (one: Figures['compactions'][number]) => number | null) => each((one) => whole(mean(one.compactions.flatMap((c) => (pick(c) === null ? [] : [pick(c) as number])))));
    return [
      setting,
      String(of.length),
      each((one) => String(one.compactions.length)),
      over((c) => c.before),
      over((c) => c.after),
      over((c) => c.read),
      over((c) => c.written),
      each((one) => whole(one.sent / one.requests)),
      each((one) => `${one.right}/${one.asked}${one.refused > 0 ? ` (${one.refused} refused)` : ''}`),
      each((one) => String(one.rightOutside)),
      each((one) => String(one.recalls)),
      ...MARKS.slice(0, -1).map((_, at) => each((one) => (Number.isNaN(one.costAt[at] as number) ? '—' : (one.costAt[at] as number).toFixed(2)))),
      each((one) => one.costUSD.toFixed(2)),
      each((one) => one.seconds.toFixed(0)),
    ];
  });
  const head = ['Setting', 'Runs', 'Compactions', 'In use before each', 'Right after each', 'Read from the cache right after', 'Written to it right after', 'Sent per request', 'Right', 'Right after reading outside the work', '`recall` calls', ...MARKS.slice(0, -1).map((log) => `Cost by log ${log}, USD`), 'Cost, USD', 'Time, s'];
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

/**
 * For the runs that recorded each call to `recall` (#107), a row a setting, each run in turn: the calls, those the plugin
 * refused, and of those refused, the ones handed what is not 64 hexadecimal characters. Runs from before it was
 * recorded are left out.
 */
export function recallsTable(runs: readonly SessionRun[]): string {
  const recorded = runs.filter((run) => run.turns.some((turn) => turn.recalled !== undefined));
  const settings = [...new Set(recorded.map((run) => run.setting))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const rows = settings.map((setting) => {
    const of = recorded.filter((run) => run.setting === setting).sort((a, b) => a.run - b.run);
    const calls = of.map((run) => run.turns.flatMap((turn) => turn.recalled ?? []));
    const each = (pick: (one: Recalled[]) => number) => calls.map((one) => String(pick(one))).join(', ');
    const refused = (one: Recalled[]) => one.filter((call) => call.refused);
    return [setting, String(of.length), each((one) => one.length), each((one) => refused(one).length), each((one) => refused(one).filter((call) => !/^[0-9a-f]{64}$/.test(call.given)).length)];
  });
  const head = ['Setting', 'Runs', '`recall` calls', 'Refused', 'Refused, not 64 hexadecimal characters'];
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

/** What `session-report` prints: the table, and where the runs recorded each call to `recall`, its table after. */
export function sessionReport(runs: readonly SessionRun[]): string {
  const recorded = runs.some((run) => run.turns.some((turn) => turn.recalled !== undefined));
  return `${sessionTable(runs)}\n${recorded ? `\n${recallsTable(runs)}\n` : ''}`;
}

/** Every run under a directory of sessions: the box's, or results as they were published. */
export function sessionsUnder(dir: string): SessionRun[] {
  const root = join(dir, 'sessions');
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(root, name), 'utf8')) as SessionRun);
}

/** What the rule below says of the sessions it was given: the default they call for, and how each of its conditions came out. */
export type Ruling = { targetPercent: 1 | 40; cheaperInBoth: boolean; byFivePercent: boolean; asManyRight: boolean; cheaperOnTheWay: boolean };

/**
 * The default of `targetPercent` that the sessions measured call for, by the rule of ADR 0025: its first three
 * conditions fixed before the sessions were driven, the fourth written in after, which can only keep 40. It is 1 where, against 40: each run at 1 cost less than every run at 40; the runs at 1 cost on average
 * no more than 95 % of those at 40; they answered on average no more than one question fewer; and by each log at
 * which the cost so far is given, short of the last, each run at 1 had cost less than every run at 40. Otherwise it
 * stays 40. Two runs of each at least: fewer decide nothing.
 */
export function defaultFrom(runs: readonly SessionRun[]): Ruling {
  const of = (setting: string) => runs.filter((run) => run.setting === setting).map(figuresOf);
  const [low, high] = [of('target-1'), of('target-40')];
  const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const enough = low.length >= 2 && high.length >= 2;
  const cheaperInBoth = enough && Math.max(...low.map((one) => one.costUSD)) < Math.min(...high.map((one) => one.costUSD));
  const byFivePercent = enough && mean(low.map((one) => one.costUSD)) <= 0.95 * mean(high.map((one) => one.costUSD));
  const asManyRight = enough && mean(low.map((one) => one.right)) >= mean(high.map((one) => one.right)) - 1;
  const cheaperOnTheWay =
    enough && MARKS.slice(0, -1).every((_, at) => Math.max(...low.map((one) => one.costAt[at] as number)) < Math.min(...high.map((one) => one.costAt[at] as number)));
  return { targetPercent: cheaperInBoth && byFivePercent && asManyRight && cheaperOnTheWay ? 1 : 40, cheaperInBoth, byFivePercent, asManyRight, cheaperOnTheWay };
}
