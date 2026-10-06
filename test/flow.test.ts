import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { reportLine, tokensOf, undoneLine, type Count, type Report } from '../src/compact.ts';
import { cutLine, decide } from '../src/cut.ts';
import { NUMBER_SETTINGS, beforeTrying, configFrom, nextStep, settingNotes, settingOf, type Step, type Tried } from '../src/flow.ts';
import { PLUGIN } from '../src/store.ts';
import type { Message } from '../src/types.ts';

const COUNT: Count = { fixedTokens: 10_000, density: 1 / 3 };
const prose = (chars: number) => 'p'.repeat(chars);
// Nine turns of 10,000 tokens and a little, as in test/cut.test.ts: over the line of 75,000, cut after the first turn.
const WIDE: Message[] = Array.from({ length: 9 }, (_, at): Message[] => [
  { role: 'user', text: `turn ${at + 1} ${prose(30_000)}`, toolUses: [] },
  { role: 'assistant', text: 'noted', toolUses: [] },
]).flat();
const WIDE_TOKENS = Math.round(COUNT.fixedTokens + tokensOf(WIDE, COUNT));
const SMALL = WIDE.slice(0, 2);

/** One turn as in test/cut.test.ts: the person says `said` characters, a file is read, the model answers. */
function turn(n: number, said: number): Message[] {
  return [
    { role: 'user', text: `turn ${n} ${prose(said)}`, toolUses: [] },
    { role: 'assistant', text: `reading ${n}`, toolUses: [{ tool_use_id: `t${n}`, tool: 'Read', input: { file_path: `/p/f${n}.txt` } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `t${n}`, text: `r${n} ${prose(90)}`, isError: false }] },
    { role: 'assistant', text: `done ${n}`, toolUses: [] },
  ];
}
const talk = (turns: number, said: number): Message[] => Array.from({ length: turns }, (_, at) => turn(at + 1, said)).flat();

function report(over: Partial<Report> = {}): Report {
  return { results: 5, candidates: 5, moved: 0, inputs: 0, folded: 0, images: 0, charsBefore: 1000, charsAfter: 1000, tokensAfter: 20_000, counted: true, window: 100_000, notMoved: {}, writeErrors: [], ms: 12, ...over };
}

/** A compaction in a window of 100,000 with 75 % allowed to stay, of `messages`, as `over` changes it. */
function tried(messages: readonly Message[], over: { report?: Partial<Report>; enough?: boolean; target?: number } & Partial<Omit<Tried, 'outcome'>> = {}): Tried {
  const { report: changed, enough, target, ...rest } = over;
  return {
    trigger: 'auto',
    instructions: undefined,
    outcome: { messages: [...messages], enough: enough ?? false, target: target ?? 75_000, report: report(changed) },
    inUse: 90_000,
    given: true,
    maxAfterPercent: 75,
    count: COUNT,
    keepTokens: 2_000,
    ...rest,
  };
}

test("a compaction computed ahead is skipped and a subagent's goes to its own step, kept and summarized, before anything is tried (ADR 0026)", () => {
  assert.deepEqual(beforeTrying({ trigger: 'precompute', agentId: undefined }), { step: 'skip', why: `${PLUGIN} computes nothing ahead of a compaction` });
  assert.deepEqual(beforeTrying({ trigger: 'precompute', agentId: 'a1' }), { step: 'skip', why: `${PLUGIN} computes nothing ahead of a compaction` }, 'skipped first');
  assert.deepEqual(beforeTrying({ trigger: 'auto', agentId: 'a1' }), { step: 'subagent' });
  assert.deepEqual(beforeTrying({ trigger: 'manual', agentId: undefined }), { step: 'try' });
});

test('a /compact by hand with nothing to move out and room left is left undone, the figure named only when Claude Code gave it (ADR 0015)', () => {
  const asked = { trigger: 'manual', inUse: 30_000, report: { moved: 0, candidates: 0 } } as const;
  // Counted from what stays, it says what takes the room: what every request carries, the first message, the rest (ADR 0023).
  const first = Math.round(tokensOf([WIDE[0] as Message], COUNT));
  assert.deepEqual(nextStep(tried(WIDE, asked)), { step: 'skip', why: `${PLUGIN}: ${undoneLine(30_000, 100_000, { fixed: 10_000, first })}` });
  assert.ok(undoneLine(30_000, 100_000, { fixed: 10_000, first }).includes(`; of what is in use, 10000 are sent with every request (the system prompt, tools, memory and the like), ${first} the first message and ${30_000 - 10_000 - first} the rest.`));
  assert.deepEqual(nextStep(tried(WIDE, { ...asked, given: false })), { step: 'skip', why: `${PLUGIN}: ${undoneLine(null, 100_000)}` });
  assert.deepEqual(nextStep(tried(WIDE, { ...asked, count: undefined })), { step: 'skip', why: `${PLUGIN}: ${undoneLine(30_000, 100_000)}` });
  // Not with instructions, not on its own, not with something that could have left, not over what may stay, not once results left.
  for (const other of [{ instructions: 'keep the plan' }, { trigger: 'auto' }, { report: { moved: 0, candidates: 1 } }, { inUse: 75_001 }, { report: { moved: 2, candidates: 0 } }]) {
    assert.notEqual(nextStep(tried(WIDE, { ...asked, ...other })).step, 'skip', JSON.stringify(other));
  }
});

test('results moved out and enough: handed back as rebuilt, saying what was moved', () => {
  const step = nextStep(tried(WIDE, { report: { moved: 3 }, enough: true, trigger: 'manual', instructions: 'keep the plan' }));
  assert.deepEqual(step, { step: 'back', line: reportLine(report({ moved: 3 })) });
  // The common case: counted, and under the line once results left. src/cut.ts would hand it back too, said as a cut of nothing.
  assert.deepEqual(nextStep(tried(WIDE, { report: { moved: 3 }, enough: true })), { step: 'back', line: reportLine(report({ moved: 3 })) });
  // Nothing moved is never handed back as a compaction that moved results out: src/cut.ts decides it, as one too full would be.
  assert.deepEqual(nextStep(tried(WIDE, { enough: true })), { step: 'back', line: cutLine(report(), null) });
});

test('with instructions the built-in summary runs: of the conversation as handed in when nothing was moved out, of what is left when something was', () => {
  const instructions = 'keep the plan';
  const given = nextStep(tried(WIDE, { instructions }));
  assert.deepEqual(given, { step: 'summarize', line: `built-in compaction: nothing could be moved out (${reportLine(report())})`, of: 'given' });
  const rebuilt = nextStep(tried(WIDE, { instructions, report: { moved: 3 } }));
  assert.deepEqual(rebuilt, { step: 'summarize', line: `built-in compaction on what is left, too much is still in use: ${reportLine(report({ moved: 3 }))}`, of: 'rebuilt' });
});

test('without instructions the oldest messages are cut where src/cut.ts says, and a part that cannot be written falls back to the summary as it would have run (ADR 0019)', () => {
  const nothing = nextStep(tried(WIDE, { report: { tokensAfter: WIDE_TOKENS } }));
  assert.deepEqual(nothing, {
    step: 'cut',
    after: 1,
    at: 8,
    over: false,
    otherwise: { step: 'summarize', line: `built-in compaction: nothing could be moved out (${reportLine(report({ tokensAfter: WIDE_TOKENS }))})`, of: 'given' },
  });
  const some = nextStep(tried(WIDE, { report: { moved: 3, tokensAfter: WIDE_TOKENS } })) as Extract<Step, { step: 'cut' }>;
  assert.equal(some.step, 'cut');
  assert.equal(some.otherwise.of, 'rebuilt');
});

test('under the line once rebuilt, counted from what stays: handed back with nothing cut, said as a cut of nothing', () => {
  const step = nextStep(tried(SMALL, { report: { moved: 3, tokensAfter: 20_000 } }));
  assert.deepEqual(step, { step: 'back', line: cutLine(report({ moved: 3, tokensAfter: 20_000 }), null) });
});

// Without a count, src/cut.ts cuts down to the size it is given whatever is in use (test/cut.test.ts): the steps
// decided before it is asked are told from the steps it would give only there.

test('a compaction that moved results out and did enough is handed back without asking src/cut.ts, which would have cut it', () => {
  const enough = tried(WIDE, { report: { moved: 3, tokensAfter: WIDE_TOKENS }, enough: true, count: undefined });
  assert.equal(nextStep({ ...enough, outcome: { ...enough.outcome, enough: false } }).step, 'cut', 'not enough, the same conversation is cut');
  assert.deepEqual(nextStep(enough), { step: 'back', line: reportLine(report({ moved: 3, tokensAfter: WIDE_TOKENS })) });
});

test('a /compact left undone is decided before src/cut.ts is asked: where it would hand over, and where it would cut (ADR 0015)', () => {
  const asked: Parameters<typeof tried>[1] = { trigger: 'manual', inUse: 30_000, count: undefined, target: 15_000, report: { moved: 0, candidates: 0, tokensAfter: 30_000 } };
  const skip = { step: 'skip', why: `${PLUGIN}: ${undoneLine(30_000, 100_000)}` };
  // One long message: there is no place to cut, and src/cut.ts hands it over.
  assert.equal(nextStep(tried(SMALL, { ...asked, trigger: 'auto' })).step, 'summarize', 'on its own, the same conversation is summarized');
  assert.deepEqual(nextStep(tried(SMALL, asked)), skip);
  // Three turns, cut down to half of what was in use: src/cut.ts cuts it.
  const three = WIDE.slice(0, 6);
  assert.equal(nextStep(tried(three, { ...asked, trigger: 'auto' })).step, 'cut', 'on its own, the same conversation is cut');
  assert.deepEqual(nextStep(tried(three, asked)), skip);
});

test('a cut goes down to the size moving results out aimed at, not to the line of what may stay', () => {
  // `target` is what `targetPercent` makes of the window; set low, as it can be, a cut goes deeper than to the line.
  const at = (target: number) => {
    const step = nextStep(tried(WIDE, { report: { tokensAfter: WIDE_TOKENS }, target }));
    const decided = decide({ messages: WIDE, tokens: WIDE_TOKENS, count: COUNT, window: 100_000, maxAfterPercent: 75, cutTo: target, keepTokens: 2_000, instructions: undefined });
    assert.ok(step.step === 'cut' && decided.hand === 'back', `${target}`);
    assert.equal(step.at, decided.at, `${target}`);
    return step.at;
  };
  assert.ok(at(40_000) > at(75_000), `${at(40_000)} against ${at(75_000)}`);
});

test('a cut is made where src/cut.ts says, as it says: the first message with the rest, and past what may stay', () => {
  const heavy: Count = { fixedTokens: 80_000, density: 1 / 3 };
  const pasted: Message[] = [{ role: 'user', text: prose(240_000), toolUses: [] }, { role: 'assistant', text: 'noted', toolUses: [] }, ...talk(5, 9_000)];
  const cases: [string, Message[], Count, (cut: Extract<Step, { step: 'cut' }>) => boolean][] = [
    ['what was pasted first goes too', pasted, COUNT, (cut) => cut.after === 0],
    ['what is not the conversation is over the line by itself', talk(5, 9_000), heavy, (cut) => cut.over],
  ];
  for (const [name, messages, count, holds] of cases) {
    const tokens = Math.round(count.fixedTokens + tokensOf(messages, count));
    const step = nextStep(tried(messages, { count, report: { moved: 3, tokensAfter: tokens } }));
    const decided = decide({ messages, tokens, count, window: 100_000, maxAfterPercent: 75, cutTo: 75_000, keepTokens: 2_000, instructions: undefined });
    assert.ok(step.step === 'cut' && decided.hand === 'back', name);
    assert.deepEqual([step.after, step.at, step.over], [decided.after, decided.at, decided.over], name);
    assert.ok(holds(step), name);
  }
});

test("the settings' defaults and ranges are those plugin.json gives them, and a number out of range is taken at the nearest end, never the default", () => {
  const manifest = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')) as { userConfig: Record<string, { default?: unknown; description: string }> };
  const defaults = configFrom({});
  for (const [name, value] of Object.entries(defaults)) assert.equal(value, manifest.userConfig[name]?.default, name);
  // Each description names the range the code takes, so a reader of the settings knows it.
  for (const [name, { min, max }] of Object.entries(NUMBER_SETTINGS)) {
    assert.ok(manifest.userConfig[name]?.description.includes(`From ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}; a number outside is taken as the nearest end`), name);
  }
  // Outside the range: the nearest end (ADR 0025, decision 3). 100 was 1 before, the other end of what was asked for.
  assert.deepEqual(configFrom({ keepTokens: -1, minChars: 20_000_000, targetPercent: 100, maxAfterPercent: 0 }), { keepTokens: 0, minChars: 10_000_000, targetPercent: 99, maxAfterPercent: 1 });
  assert.deepEqual(configFrom({ targetPercent: 99.5, keepTokens: 2_000_000 }), { ...defaults, targetPercent: 99, keepTokens: 1_000_000 });
  // Claude Code hands a number, or an empty value where one was left empty: that is the default. Any other value keeps
  // it from loading the plugin (measured on 2.1.291); were one handed over all the same, it would be the default too.
  assert.deepEqual(configFrom({ minChars: '', keepTokens: '500', targetPercent: '40', maxAfterPercent: null }), defaults);
  // Infinity, as JSON.parse reads 1e999, is outside the range like any number: the nearest end.
  assert.deepEqual(configFrom({ targetPercent: Infinity, keepTokens: -Infinity }), { ...defaults, targetPercent: 99, keepTokens: 0 });
  // Inside the range, as given; the ends as they are; whole numbers where the setting counts in whole ones.
  assert.deepEqual(configFrom({ keepTokens: 1500.7, minChars: 0, targetPercent: 2, maxAfterPercent: 100 }), { keepTokens: 1500, minChars: 0, targetPercent: 2, maxAfterPercent: 100 });
  assert.deepEqual(configFrom({ targetPercent: 99, maxAfterPercent: 1 }), { ...defaults, targetPercent: 99, maxAfterPercent: 1 });
});

test('a number setting not used as it was set is said, in one line each; one used as set, or not set, is not', () => {
  assert.deepEqual(settingNotes({}), []);
  assert.deepEqual(settingNotes({ targetPercent: 40, keepTokens: 0, minChars: 2000 }), []);
  assert.deepEqual(settingNotes({ targetPercent: 100, keepTokens: -1, minChars: 'many', maxAfterPercent: '' }), [
    'keepTokens -1 is outside 0-1000000; 0 is used',
    'minChars "many" is not a number; 2000, the default, is used',
    'targetPercent 100 is outside 1-99; 99 is used',
    'maxAfterPercent is empty; 75, the default, is used',
  ]);
  // What is said holds no more of a long text than its start.
  const [line = ''] = settingNotes({ minChars: 'x'.repeat(500) });
  assert.ok(line.startsWith('minChars "xxx') && line.length < 120, line);
  assert.equal(settingOf('targetPercent', 100).as, 'nearest');
  assert.equal(settingOf('targetPercent', undefined).as, 'unset');
});

test('long inputs moved out are something moved out: handed back when enough, and never a /compact left undone (ADR 0020)', () => {
  // Only inputs left, and enough: handed back as rebuilt, saying so.
  assert.deepEqual(nextStep(tried(WIDE, { report: { moved: 0, inputs: 2 }, enough: true })), { step: 'back', line: reportLine(report({ inputs: 2 })) });
  // By hand, with room and no result that could leave: still not left undone, since inputs did leave.
  const asked = { trigger: 'manual', inUse: 30_000, report: { moved: 0, candidates: 0, inputs: 1 }, enough: true } as const;
  assert.equal(nextStep(tried(WIDE, asked)).step, 'back');
  // The control: nothing at all left, the same /compact is left undone.
  assert.equal(nextStep(tried(WIDE, { ...asked, report: { moved: 0, candidates: 0, inputs: 0 }, enough: false })).step, 'skip');
});

test('old calls folded are something moved out: handed back when enough, and never a /compact left undone (ADR 0022)', () => {
  assert.deepEqual(nextStep(tried(WIDE, { report: { folded: 4 }, enough: true })), { step: 'back', line: reportLine(report({ folded: 4 })) });
  const asked = { trigger: 'manual', inUse: 30_000, report: { moved: 0, candidates: 0, inputs: 0, folded: 2 }, enough: true } as const;
  assert.equal(nextStep(tried(WIDE, asked)).step, 'back');
  assert.equal(nextStep(tried(WIDE, { ...asked, report: { moved: 0, candidates: 0, inputs: 0, folded: 0 }, enough: false })).step, 'skip');
});

test('a /compact by hand with room, where what could have left could not be written, is not left undone: the line says it could not write', () => {
  const asked: Parameters<typeof tried>[1] = { trigger: 'manual', inUse: 30_000, report: { moved: 0, candidates: 0, notMoved: { 'write-failed': 2 }, writeErrors: ['ENOSPC'] } };
  const step = nextStep(tried(WIDE, asked));
  assert.notEqual(step.step, 'skip');
  assert.ok('line' in step && step.line.includes('could not write: ENOSPC'), JSON.stringify(step));
  // A result whose call holds another text is not one that could not be written: that one is still left undone.
  assert.equal(nextStep(tried(WIDE, { ...asked, report: { moved: 0, candidates: 0, notMoved: { 'call-differs': 1 } } })).step, 'skip');
});

test('middles of long messages moved out are something moved out: handed back when enough, and never a /compact left undone (ADR 0024)', () => {
  assert.deepEqual(nextStep(tried(WIDE, { report: { bodies: 1 }, enough: true })), { step: 'back', line: reportLine(report({ bodies: 1 })) });
  const asked = { trigger: 'manual', inUse: 30_000, report: { moved: 0, candidates: 0, bodies: 1 }, enough: true } as const;
  assert.equal(nextStep(tried(WIDE, asked)).step, 'back');
});
