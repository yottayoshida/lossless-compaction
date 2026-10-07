// What a compaction does next, step by step: the order in which the plugin
// tries to compact a conversation itself and what it falls back to. The hook
// carries out the step returned here and decides nothing of its own.
//
// In order: a compaction computed ahead is skipped, and a subagent's goes to
// the built-in summary, its conversation kept first (`beforeTrying`). Then results are moved
// out (`compact()`); where that could not be tried, the built-in summary runs
// on the conversation as it was, kept first. Once tried (`nextStep`): a `/compact`
// by hand with nothing to move out and room left is left undone (ADR 0015);
// a compaction that moved results out and did enough is handed back, unless a
// summary was asked for with instructions (ADR 0036); else a
// cut in place of a summary where src/cut.ts says so (ADR 0019), falling back,
// when a part cannot be written, to the built-in summary as below; else the
// built-in summary, of the conversation as it was handed in when nothing was
// moved out, or of what is left when something was.

import { leftUndone, noticeLine, noticeSize, reportLine, tokensOf, undoneLine, whatOf, type Config, type Count, type Outcome } from './compact.ts';
import { cutLine, cutNotice, decide, isLong } from './cut.ts';
import { PLUGIN } from './store.ts';

/** What the hook does before trying anything: skip the compaction, keep a subagent's and hand it to the summary, or try. */
export type Before = { step: 'skip'; why: string } | { step: 'subagent' } | { step: 'try' };

export function beforeTrying(e: { trigger: string | undefined; agentId: string | undefined }): Before {
  // A result computed ahead would be the built-in summary, paid for and then not used.
  if (e.trigger === 'precompute') return { step: 'skip', why: `${PLUGIN} computes nothing ahead of a compaction` };
  // Nothing of a subagent's conversation is moved out or rebuilt: a subagent may have no tool to read a result back
  // with (ADR 0003, decision 3). It is kept before the built-in summary, as the main one is (ADR 0026).
  if (e.agentId !== undefined) return { step: 'subagent' };
  return { step: 'try' };
}

/** Why the compaction hook failed, as Claude Code tells the hook's handler: it threw or answered what was refused, or ran out of time. */
export type Failure = { kind: string; message?: string | undefined };

/** The most of what Claude Code says of a failure that a line repeats: it can hold the answer that was refused. */
const FAILURE_CHARS = 200;

/**
 * The line said when the compaction hook failed and its handler hands the conversation to the built-in summary
 * (#102); `called`, when the hook had asked for the summary already, which then is not asked for again. It says
 * what failed and not whose doing it was: a summary that failed beneath the hook fails it too.
 */
export function failedLine(failure: Failure, called = false): string {
  const said = [...(failure.message ?? '').replace(/\s+/g, ' ').trim()];
  const message = said.length > FAILURE_CHARS ? `${said.slice(0, FAILURE_CHARS).join('')}…` : said.join('');
  const what = `the compaction stopped (${failure.kind}${message === '' ? '' : `: ${message}`})`;
  return called
    ? `${what} after the built-in summary was asked for; what it came to stands, the conversation kept beside it where it can be`
    : `${what}; the built-in summary runs in its place, the conversation kept first where it can be`;
}

/**
 * The built-in summary, the conversation kept first: of the conversation as it
 * was handed in (`given`), or of what moving results out left of it
 * (`rebuilt`), which is then also what is kept. `line` is said first, in the transcript, and `notice` over it (#141).
 */
export type Summarize = { step: 'summarize'; line: string; notice: string; of: 'given' | 'rebuilt' };

/**
 * What to do once results were moved out, or tried to be:
 * - `skip`: leave the conversation as it is, saying `why` as the reason;
 * - `back`: hand back what the compaction rebuilt, saying `line`, and `notice` over it;
 * - `cut`: keep the messages from `after` up to `at` in parts in place of a
 *   summary; when a part cannot be written, do `otherwise`;
 * - `summarize`: see `Summarize`.
 */
export type Step =
  | { step: 'skip'; why: string }
  | { step: 'back'; line: string; notice: string }
  | { step: 'cut'; after: 0 | 1; at: number; over: boolean; otherwise: Exclude<Step, { step: 'cut' }>; held?: number }
  | Summarize;

/** What a compaction came to and what it was measured with: what `nextStep` decides from. */
export type Tried = {
  trigger: string | undefined;
  instructions: string | undefined;
  outcome: Pick<Outcome, 'messages' | 'enough' | 'target' | 'report'>;
  /** What was in use before, and whether Claude Code gave that figure or it was made up from characters. */
  inUse: number;
  given: boolean;
  maxAfterPercent: number;
  count: Count | undefined;
  keepTokens: number;
  /** How many entries Claude Code handed over, see `Asked.entries` in src/cut.ts. */
  entries?: number | undefined;
};

/**
 * Whether Claude Code's summary was asked for (ADR 0036): instructions that are more than spaces, given to a `/compact`
 * typed by hand or to a compaction a plugin asked for. Not to an automatic one: a hook above this one can add
 * instructions to every compaction, and each would then be summarized. One handed instructions still goes to the
 * summary where too much is still in use, as before: src/cut.ts leaves any compaction with instructions to it.
 */
export function summaryAskedFor(tried: Pick<Tried, 'trigger' | 'instructions'>): boolean {
  return (tried.trigger === 'manual' || tried.trigger === 'plugin') && (tried.instructions ?? '').trim() !== '';
}

export function nextStep(tried: Tried): Step {
  const { outcome } = tried;
  const { report } = outcome;
  const nothing = report.moved === 0 && report.inputs === 0 && (report.bodies ?? 0) === 0 && report.folded === 0;
  // By hand, with room and nothing that could leave: no summary was asked for and none is needed (ADR 0015). Not where
  // something could have left and could not be written: that is said, as any write that could not be.
  const couldNotWrite = Object.entries(report.notMoved).some(([reason, count]) => reason !== 'call-differs' && count > 0);
  const undone = !couldNotWrite && leftUndone({
    trigger: tried.trigger,
    instructions: tried.instructions,
    inUse: tried.inUse,
    window: report.window,
    maxAfterPercent: tried.maxAfterPercent,
    candidates: report.candidates,
  });
  // Said once, as the reason Claude Code shows for not compacting: a line of the plugin's beside it says the same twice.
  // What takes the room is named where Claude Code gave the figure and the conversation was counted from what stays.
  const first = outcome.messages[0];
  const parts =
    tried.given && tried.count !== undefined && first !== undefined
      ? { fixed: Math.round(tried.count.fixedTokens), first: Math.round(tokensOf([first], tried.count)) }
      : undefined;
  // Long: a compaction without instructions is cut for its length whatever else it came to, where what was rebuilt still
  // holds more than CUT_TO messages (`isLong`, ADR 0034). Looked at first, since moving results out leaves the messages where they were;
  // where no cut can be made or written, the compaction goes as it would have gone.
  const long = (tried.instructions ?? '').trim() === '' && isLong(tried.entries, outcome.messages.length);
  // A summary asked for with instructions is given on what is left, whatever room was made (ADR 0036).
  const asked = summaryAskedFor(tried);
  const before: Exclude<Step, { step: 'cut' } | Summarize> | null =
    nothing && undone
      ? { step: 'skip', why: `${PLUGIN}: ${undoneLine(tried.given ? tried.inUse : null, report.window, parts, report.windowOf)}` }
      : !nothing && outcome.enough && !asked
        ? { step: 'back', line: reportLine(report), notice: noticeLine(report) }
        : null;
  if (before !== null && !long) return before;
  // Nothing could be moved out, too much is still in use, or a summary was asked for: handed over, unless src/cut.ts
  // keeps the oldest messages in place of a summary, down to the size moving results out aimed at (ADR 0019); src/cut.ts
  // leaves one with instructions to the summary.
  // Nothing moved out goes to the summary as it was handed in: what was in use is said, and no size it came to (#141).
  const summarize: Summarize = nothing
    ? {
        step: 'summarize',
        line: `built-in compaction: nothing could be moved out: ${reportLine(report, 'given')}`,
        notice: "nothing could be moved out: Claude Code's summary runs on the whole conversation",
        of: 'given',
      }
    : {
        step: 'summarize',
        line: `built-in compaction on what is left, ${outcome.enough ? 'as it was asked for with instructions' : 'too much is still in use'}: ${reportLine(report)}`,
        notice: outcome.enough
          ? `${whatOf(report)} · Claude Code's summary runs on what is left, as asked with instructions`
          : [whatOf(report), ...(noticeSize(report) === '' ? [] : [`still ${noticeSize(report)}`]), "Claude Code's summary runs on what is left"].join(' · '),
        of: 'rebuilt',
      };
  const decision = decide({
    messages: outcome.messages,
    tokens: report.tokensAfter,
    count: tried.count,
    window: report.window,
    maxAfterPercent: tried.maxAfterPercent,
    cutTo: outcome.target,
    keepTokens: tried.keepTokens,
    instructions: tried.instructions,
    entries: tried.entries,
    bySize: before === null,
  });
  if (decision.hand !== 'back') return before ?? summarize;
  if (decision.at === 0) return before ?? { step: 'back', line: cutLine(report, null), notice: cutNotice(report, null) };
  return { step: 'cut', after: decision.after, at: decision.at, over: decision.over, otherwise: before ?? summarize, ...(decision.length ? { held: tried.entries ?? 0 } : {}) };
}

/**
 * The number settings: the range each is taken in and its default. `.claude-plugin/plugin.json` gives the same
 * defaults and names the same ranges in its descriptions; a test holds the three together.
 */
export const NUMBER_SETTINGS = {
  keepTokens: { min: 0, max: 1_000_000, fallback: 20_000, whole: true },
  minChars: { min: 0, max: 10_000_000, fallback: 2000, whole: true },
  targetPercent: { min: 1, max: 99, fallback: 1, whole: false },
  maxAfterPercent: { min: 1, max: 100, fallback: 75, whole: false },
} as const;

export type NumberSetting = keyof typeof NUMBER_SETTINGS;

/**
 * How a number setting was read: as given; at the nearest end of its range, for a number outside it (ADR 0025,
 * decision 3: a value someone set stays as they set it, never their default); at its default, where it is not set
 * or left empty.
 */
export type SettingRead = { value: number; as: 'given' | 'nearest' | 'unset' | 'empty' | 'not a number' };

/**
 * A number, or null. Claude Code hands a number setting a number, or an empty value where it was left empty: any
 * other value keeps it from loading the plugin at all (measured on Claude Code 2.1.291).
 */
function numberOf(value: unknown): number | null {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

export function settingOf(name: NumberSetting, value: unknown): SettingRead {
  const { min, max, fallback, whole } = NUMBER_SETTINGS[name];
  if (value === undefined) return { value: fallback, as: 'unset' };
  const read = numberOf(value);
  // Left empty is what Claude Code hands on; anything else that is no number keeps it from loading the plugin at all.
  if (read === null) return { value: fallback, as: value === '' ? 'empty' : 'not a number' };
  const kept = Math.min(max, Math.max(min, read));
  return { value: whole ? Math.floor(kept) : kept, as: kept === read ? 'given' : 'nearest' };
}

/** The defaults are those `.claude-plugin/plugin.json` gives the settings; a test holds the two together. */
export function configFrom(options: Record<string, unknown>): Omit<Config, 'store'> {
  return {
    keepTokens: settingOf('keepTokens', options['keepTokens']).value,
    minChars: settingOf('minChars', options['minChars']).value,
    targetPercent: settingOf('targetPercent', options['targetPercent']).value,
    maxAfterPercent: settingOf('maxAfterPercent', options['maxAfterPercent']).value,
  };
}

/** What a setting was set to, for a line: a text quoted and cut short, a number as it is. */
function shownSetting(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  return typeof value === 'number' ? String(value) : `of type ${value === null ? 'null' : typeof value}`;
}

/** One line for each number setting not used as it was set: taken at the nearest end of its range, or at its default. */
export function settingNotes(options: Record<string, unknown>): string[] {
  const notes: string[] = [];
  for (const name of Object.keys(NUMBER_SETTINGS) as NumberSetting[]) {
    const read = settingOf(name, options[name]);
    const { min, max } = NUMBER_SETTINGS[name];
    if (read.as === 'nearest') notes.push(`${name} ${shownSetting(options[name])} is outside ${min}-${max}; ${read.value} is used`);
    if (read.as === 'empty') notes.push(`${name} is empty; ${read.value}, the default, is used`);
    if (read.as === 'not a number') notes.push(`${name} ${shownSetting(options[name])} is not a number; ${read.value}, the default, is used`);
  }
  return notes;
}
