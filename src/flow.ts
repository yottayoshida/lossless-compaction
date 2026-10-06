// What a compaction does next, step by step: the order in which the plugin
// tries to compact a conversation itself and what it falls back to. The hook
// carries out the step returned here and decides nothing of its own.
//
// In order: a compaction computed ahead is skipped and a subagent's goes
// straight to the built-in summary (`beforeTrying`). Then results are moved
// out (`compact()`); where that could not be tried, the built-in summary runs
// on the conversation as it was, kept first. Once tried (`nextStep`): a `/compact`
// by hand with nothing to move out and room left is left undone (ADR 0015);
// a compaction that moved results out and did enough is handed back; else a
// cut in place of a summary where src/cut.ts says so (ADR 0019), falling back,
// when a part cannot be written, to the built-in summary as below; else the
// built-in summary, of the conversation as it was handed in when nothing was
// moved out, or of what is left when something was.

import { leftUndone, reportLine, tokensOf, undoneLine, type Config, type Count, type Outcome } from './compact.ts';
import { cutLine, decide } from './cut.ts';
import { PLUGIN } from './store.ts';

/** What the hook does before trying anything: skip the compaction, hand it straight on, or try. */
export type Before = { step: 'skip'; why: string } | { step: 'pass' } | { step: 'try' };

export function beforeTrying(e: { trigger: string | undefined; agentId: string | undefined }): Before {
  // A result computed ahead would be the built-in summary, paid for and then not used.
  if (e.trigger === 'precompute') return { step: 'skip', why: `${PLUGIN} computes nothing ahead of a compaction` };
  // A subagent may have no tool to read a result back with.
  if (e.agentId !== undefined) return { step: 'pass' };
  return { step: 'try' };
}

/**
 * The built-in summary, the conversation kept first: of the conversation as it
 * was handed in (`given`), or of what moving results out left of it
 * (`rebuilt`), which is then also what is kept. `line` is said first.
 */
export type Summarize = { step: 'summarize'; line: string; of: 'given' | 'rebuilt' };

/**
 * What to do once results were moved out, or tried to be:
 * - `skip`: leave the conversation as it is, saying `why` as the reason;
 * - `back`: hand back what the compaction rebuilt, saying `line`;
 * - `cut`: keep the messages from `after` up to `at` in parts in place of a
 *   summary; when a part cannot be written, do `otherwise`;
 * - `summarize`: see `Summarize`.
 */
export type Step =
  | { step: 'skip'; why: string }
  | { step: 'back'; line: string }
  | { step: 'cut'; after: 0 | 1; at: number; over: boolean; otherwise: Summarize }
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
};

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
  if (nothing && undone) return { step: 'skip', why: `${PLUGIN}: ${undoneLine(tried.given ? tried.inUse : null, report.window, parts)}` };
  if (!nothing && outcome.enough) return { step: 'back', line: reportLine(report) };
  // Nothing could be moved out, or too much is still in use: handed over, unless src/cut.ts keeps the oldest
  // messages in place of a summary, down to the size moving results out aimed at (ADR 0019).
  const summarize: Summarize = nothing
    ? { step: 'summarize', line: `built-in compaction: nothing could be moved out (${reportLine(report)})`, of: 'given' }
    : { step: 'summarize', line: `built-in compaction on what is left, too much is still in use: ${reportLine(report)}`, of: 'rebuilt' };
  const decision = decide({
    messages: outcome.messages,
    tokens: report.tokensAfter,
    count: tried.count,
    window: report.window,
    maxAfterPercent: tried.maxAfterPercent,
    cutTo: outcome.target,
    keepTokens: tried.keepTokens,
    instructions: tried.instructions,
  });
  if (decision.hand !== 'back') return summarize;
  if (decision.at === 0) return { step: 'back', line: cutLine(report, null) };
  return { step: 'cut', after: decision.after, at: decision.at, over: decision.over, otherwise: summarize };
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
