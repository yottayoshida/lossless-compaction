// Turns the units measured into tables. Each trace and model has its own; the
// runs of a unit are shown as they are when there are three or fewer, as a median
// and range otherwise. Nothing is added up across traces into one score.

import { needed, OUTCOMES, outcomeOf, spread, type Arm, type Outcome, type ToolCall } from './lib.ts';
import { keyOf, type Grades, type Verdict } from './grade.ts';
import { pickTable, type Pick } from './pick.ts';
import { type Asked, type Unit } from './run.ts';
import { BUILT, type Kind } from './traces.ts';

const ARMS: readonly Arm[] = ['plugin', 'builtin'];
const KINDS: readonly Kind[] = ['exact-gone', 'exact-unchanged', 'exact-then', 'exact-now', 'continuity', 'constraint'];
const KIND_NAMES: Record<Kind, string> = {
  'exact-gone': 'Exact, source gone',
  'exact-unchanged': 'Exact, file unchanged',
  'exact-then': 'Exact, file changed: what it said then',
  'exact-now': 'Exact, file changed: what it says now',
  continuity: 'Where the work stands',
  constraint: 'A rule stated early',
};

/**
 * The verdict on one answer. An exact answer is right only when the program found
 * the text in it; for the rest the grader's first pass decides, and of an exact
 * answer it can only say which way it is not right. No verdict means not graded.
 */
export function verdictOf(unit: Unit, asked: Asked, grades: Grades | null): Verdict | undefined {
  if (asked.verdict !== undefined) return asked.verdict;
  const graded = grades?.verdicts[keyOf(unit, asked.id, asked.answer)]?.[0] ?? undefined;
  if (graded === undefined || graded === null) return undefined;
  return graded === 'correct' && asked.kind.startsWith('exact') ? 'incorrect' : graded;
}

/** True for an exact answer the program found not to hold the text and the grader called right all the same: the sign of a right answer the program's matching missed. */
export function overruled(unit: Unit, asked: Asked, grades: Grades | null): boolean {
  return asked.verdict === undefined && asked.kind.startsWith('exact') && grades?.verdicts[keyOf(unit, asked.id, asked.answer)]?.[0] === 'correct';
}

const callsOf = (asked: Asked): ToolCall[] => asked.calls.map((name) => ({ name, input: {} }));

export function outcomesOf(units: readonly Unit[], grades: Grades | null): Record<Outcome, number> & { ungraded: number } {
  const counts = Object.fromEntries([...OUTCOMES.map((outcome) => [outcome, 0]), ['ungraded', 0]]) as Record<Outcome, number> & { ungraded: number };
  for (const unit of units) {
    for (const asked of unit.questions) {
      const verdict = verdictOf(unit, asked, grades);
      if (verdict === undefined) counts.ungraded += 1;
      else counts[outcomeOf(verdict, callsOf(asked), asked.outside)] += 1;
    }
  }
  return counts;
}

const table = (head: readonly string[], rows: readonly (readonly string[])[]) =>
  [`| ${head.join(' | ')} |`, `| ${head.map((_, at) => (at === 0 ? '---' : '---:')).join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/** How the grader itself did, on the answers whose grade was known and between its two passes. */
export function graderOf(grades: Grades | null): string {
  if (grades === null) return 'Nothing has been graded by a model yet: the answers a program cannot grade are counted as ungraded.';
  const { controls } = grades;
  return [
    `Graded by ${grades.model || 'a model that was not recorded'}, in two passes; the tables use the first.`,
    `Of ${controls.count} answers mixed in whose grade was known, it graded ${controls.graded}, ${controls.asExpected} as expected.`,
    `Of ${controls.toldPairs} pairs of the same answer with and without words that tell an arm, it graded both of ${controls.toldPairsGraded}, ${controls.toldPairsSame} alike.`,
    `The two passes graded ${grades.disagreements} answer(s) differently; ${grades.ungraded.length} answer(s) or control(s) were left ungraded by a pass.`,
  ].join(' ');
}

/** The tables for the units that asked a trace's questions, one section per trace and model. `older` is how many units were left out for measuring an older version of their trace. */
/**
 * The variant whose units are tabled: the plugin as it is set by default, where units of it are among them;
 * else, where every unit that asked questions is of one other variant (a checkout measured on its own), that one.
 */
function tabled(units: readonly Unit[]): string {
  const variants = new Set(units.filter((unit) => unit.mode === 'ask').map((unit) => unit.variant));
  return variants.has('default') || variants.size !== 1 ? 'default' : ([...variants][0] as string);
}

export function report(units: readonly Unit[], grades: Grades | null, older = 0): string {
  const variant = tabled(units);
  const asked = units.filter((unit) => unit.mode === 'ask' && unit.variant === variant);
  const groups = new Map<string, Unit[]>();
  for (const unit of asked) {
    const key = `${unit.trace}|${unit.model}`;
    groups.set(key, [...(groups.get(key) ?? []), unit]);
  }
  const sections: string[] = [graderOf(grades), ''];
  if (older > 0) sections.push(`${older} unit(s) measured an older version of their trace and are left out.`, '');
  for (const [key, group] of groups) {
    const [trace, model] = key.split('|');
    const by = (arm: Arm) => group.filter((unit) => unit.arm === arm).sort((a, b) => a.run - b.run);
    const cell = (arm: Arm, pick: (unit: Unit) => number, digits = 0) => spread(by(arm).map(pick), digits);
    // A commit that touches no code of the plugin leaves the code the same: units are told apart by the code, and the commits are named beside it.
    const codes = [...new Set(by('plugin').map((unit) => unit.plugin ?? 'not recorded'))];
    const plugins = codes.map((code) => `${code} (commit ${[...new Set(by('plugin').filter((unit) => (unit.plugin ?? 'not recorded') === code).map((unit) => unit.pluginCommit ?? 'not recorded'))].join(', ')})`);
    const builds = new Set(group.map((unit) => unit.base));
    const lines = [
      `### ${trace}, ${model}`,
      '',
      `Runs: ${ARMS.map((arm) => `${arm} ${by(arm).length}, first in ${by(arm).filter((unit) => unit.first).length}`).join('; ')}. The plugin's code: ${plugins.join(', ') || '—'}.${variant === 'default' ? '' : ` Variant: ${variant}.`}`,
      '',
    ];
    // What `run` would have stopped at can still sit side by side in the box: said here, where the figures are read.
    if (builds.size > 1) lines.push(`**These units were measured on ${builds.size} different buildings of the trace: they are not one comparison.**`, '');
    if (plugins.length > 1) lines.push(`**These units were measured on ${plugins.length} different states of the plugin's code.**`, '');
    lines.push(
      table(
        ['', ...ARMS],
        [
          ['Compaction, ms', ...ARMS.map((arm) => cell(arm, (unit) => unit.compaction.durationMs))],
          ['Tokens before', ...ARMS.map((arm) => cell(arm, (unit) => unit.compaction.preTokens))],
          ['Tokens sent on the next request', ...ARMS.map((arm) => cell(arm, (unit) => unit.questions[0]?.requests[0] ?? NaN))],
          ['Built-in summary ran', ...ARMS.map((arm) => `${by(arm).filter((unit) => unit.compaction.summarized).length} of ${by(arm).length}`)],
          // Only where there is one: a table made of units measured before a `/compact` could be left undone is the table it was.
          ...(group.some((unit) => unit.compaction.undone === true)
            ? [['Left as it was, nothing compacted', ...ARMS.map((arm) => `${by(arm).filter((unit) => unit.compaction.undone === true).length} of ${by(arm).length}`)]]
            : []),
          // What a compaction costs turns on whether the trace is still in the cache, which lasts an hour: the tokens say which it was.
          ['Compaction: tokens read from cache', ...ARMS.map((arm) => cell(arm, (unit) => unit.compaction.own.cacheReadInputTokens))],
          ['Compaction: tokens written to cache or sent fresh', ...ARMS.map((arm) => cell(arm, (unit) => unit.compaction.own.cacheCreationInputTokens + unit.compaction.own.inputTokens))],
          ['Compaction: tokens written out', ...ARMS.map((arm) => cell(arm, (unit) => unit.compaction.own.outputTokens))],
          ['Compaction: cost, USD', ...ARMS.map((arm) => cell(arm, (unit) => unit.compaction.own.costUSD, 4))],
          ['All questions: seconds', ...ARMS.map((arm) => cell(arm, (unit) => sum(unit.questions.map((one) => one.durationMs)) / 1000, 1))],
          ['All questions: input tokens', ...ARMS.map((arm) => cell(arm, (unit) => sum(unit.questions.flatMap((one) => one.requests))))],
          ['All questions: cost, USD', ...ARMS.map((arm) => cell(arm, (unit) => sum(unit.questions.map((one) => one.own.costUSD)), 4))],
          ['`recall` calls', ...ARMS.map((arm) => cell(arm, (unit) => sum(unit.questions.map((one) => one.retrieval.recalls))))],
          ['Files read again', ...ARMS.map((arm) => cell(arm, (unit) => sum(unit.questions.map((one) => one.retrieval.reads))))],
          ['Calls refused at a question', ...ARMS.map((arm) => cell(arm, (unit) => sum(unit.questions.map((one) => one.refused))))],
          ['Answers after reading outside the working directory', ...ARMS.map((arm) => cell(arm, (unit) => unit.questions.filter((one) => one.outside).length))],
          ['Exact answers the program found wrong and the grader called right', ...ARMS.map((arm) => cell(arm, (unit) => unit.questions.filter((one) => overruled(unit, one, grades)).length))],
          ['Words that tell the arm, in all answers', ...ARMS.map((arm) => cell(arm, (unit) => sum(unit.questions.map((one) => one.tells))))],
          // Only where it happened: an answer after the model asked for refused is another model's.
          ...(group.some((unit) => unit.questions.some((one) => one.fellBackTo !== undefined))
            ? [['Answered by another model after a refusal', ...ARMS.map((arm) => cell(arm, (unit) => unit.questions.filter((one) => one.fellBackTo !== undefined).length))]]
            : []),
        ],
      ),
      '',
    );
    const right = (arm: Arm, kind: Kind) =>
      by(arm)
        .map((unit) => {
          const of = unit.questions.filter((one) => one.kind === kind);
          const graded = of.map((one) => verdictOf(unit, one, grades));
          return graded.some((verdict) => verdict === undefined) ? `?/${of.length}` : `${graded.filter((verdict) => verdict === 'correct').length}/${of.length}`;
        })
        .join(', ');
    lines.push('Right answers of those asked, per run:', '', table(['', ...ARMS], KINDS.map((kind) => [KIND_NAMES[kind], ...ARMS.map((arm) => right(arm, kind))])), '');
    const outcomes = ARMS.map((arm) => outcomesOf(by(arm), grades));
    lines.push('How the questions went, all runs together:', '', table(['', ...ARMS], [...OUTCOMES, 'ungraded' as const].map((outcome) => [outcome, ...outcomes.map((counts) => String(counts[outcome]))])), '');
    sections.push(lines.join('\n'));
  }
  return sections.join('\n');
}

/** Everything `report` prints: the tables per trace and model, the plugin's estimates, and, where they were measured, the questions `find` is for. */
export function whole(units: readonly Unit[], grades: Grades | null, older = 0, picks: readonly Pick[] | null = null): string {
  // Probes ask nothing of a conversation: where they are all there is, there is nothing to table or grade above the estimates.
  const asked = units.some((unit) => unit.mode !== 'probe');
  const parts = [
    ...(asked ? [report(units, grades, older), ''] : older > 0 ? [`${older} unit(s) measured an older version of their trace and are left out.`, ''] : []),
    '### What the plugin estimated against what was in use',
    '',
    estimates(units.filter((unit) => unit.mode === 'probe' || (unit.mode === 'ask' && unit.variant === tabled(units)))),
  ];
  if (units.some((unit) => unit.mode === 'chain')) parts.push('', '### The questions asked one after another: how much the context grew', '', chains(units, grades));
  if (units.some((unit) => unit.mode === 'find')) parts.push('', '### The questions `find` is for, asked of an agent', '', finds(units));
  if (units.some((unit) => unit.mode === 'find' && unit.questions.some((one) => one.fetched?.opened !== undefined))) {
    parts.push('', '### The questions `find` is for, by how they were asked', '', findsByKind(units));
  }
  if (picks !== null) parts.push('', '### What `find` picks, against a word match', '', pickTable(picks));
  if (units.some((unit) => unit.arm === 'plugin' && (unit.mode === 'ask' || unit.mode === 'find') && unit.questions.some((one) => one.fetched !== undefined))) {
    parts.push('', '### Where the answer went, and how far the agent got in fetching it', '', fetches(units));
  }
  return `${parts.join('\n')}\n`;
}

/**
 * Of the questions whose answer no file holds any more, asked of the plugin's arm one at a time: whether the
 * compaction left the answer in the conversation, and of those it had moved out, how far the agent got in
 * fetching it, all runs of a setting together. Each step counts the questions that reached it: the agent called
 * `recall` or `find`; it chose a piece that holds the answer (an id it gave `recall`, or the one `find` gave as its
 * answer); what `recall` gave back, or the text `find` gave, held it; and the answer was right, as the program decides. An answer can be right
 * without the steps before it, and wrong after all of them: the last column counts those, which went wrong after
 * fetching rather than in it.
 */
export function fetches(units: readonly Unit[]): string {
  const groups = new Map<string, Unit[]>();
  for (const unit of units) {
    if (unit.arm !== 'plugin' || (unit.mode !== 'ask' && unit.mode !== 'find') || !unit.questions.some((one) => one.fetched !== undefined)) continue;
    const key = [unit.trace, unit.model, unit.mode === 'find' ? `${unit.variant}, find's questions` : unit.variant].join('\t');
    groups.set(key, [...(groups.get(key) ?? []), unit]);
  }
  // Shown only where it was recorded (#148), so that a table of earlier units reads as it did: of the questions whose
  // answer had to be fetched, the bytes `recall` handed back, and of them those handed to calls that named no holder.
  const handed = [...groups.values()].flat().some((unit) => unit.questions.some((one) => one.fetched?.wasted !== undefined));
  const rows = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => {
      const asked = group.flatMap((unit) => unit.questions.filter((one) => one.fetched !== undefined));
      const had = asked.filter((one) => needed(one.fetched as NonNullable<Asked['fetched']>));
      const reached = (step: (one: Asked) => boolean) => String(had.filter(step).length);
      return [
        ...key.split('\t'),
        String(new Set(group.map((unit) => unit.run)).size),
        String(asked.length),
        String(asked.filter((one) => one.fetched?.inContext === true).length),
        String(had.length),
        reached((one) => one.fetched?.tried === true),
        reached((one) => one.fetched?.chose === true),
        reached((one) => one.fetched?.restored === true),
        reached((one) => one.verdict === 'correct'),
        reached((one) => one.fetched?.restored === true && one.verdict !== 'correct'),
        ...(handed ? [String(sum(had.map((one) => one.handed?.recall ?? 0))), String(sum(had.map((one) => one.fetched?.wasted ?? 0)))] : []),
      ];
    });
  return table(
    [
      'Trace',
      'Model',
      'Setting',
      'Runs',
      'Questions',
      'Answer left in the conversation',
      'Had to be fetched',
      '`recall` or `find` called',
      'A piece holding it chosen',
      'It came back',
      'Right',
      'Came back, answered wrong',
      ...(handed ? ['Bytes `recall` handed back', 'Of them, to calls naming no piece that holds it'] : []),
    ],
    rows,
  );
}

/**
 * The units that asked a trace's questions one after another, each going on from the one before: what was in use
 * before the compaction, right after it (the first request of the first question) and once every question had
 * been asked; how much it grew in between, the questions and answers with what they read, and how much of the room
 * the compaction made that growth took. A summary makes more room than moving out does; what is read back afterwards
 * is the other side of that, for both arms: `recall` in the plugin's, a file read again or Claude Code's own record
 * read in the built-in's.
 */
export function chains(units: readonly Unit[], grades: Grades | null): string {
  const rows = units
    .filter((unit) => unit.mode === 'chain' && unit.afterQuestions !== undefined)
    .sort((a, b) => `${a.trace}${a.model}${a.run}${a.arm}`.localeCompare(`${b.trace}${b.model}${b.run}${b.arm}`))
    .map((unit) => {
      const before = unit.compaction.preTokens;
      const right = unit.questions[0]?.requests[0] ?? NaN;
      const after = unit.afterQuestions as number;
      const back = after - right;
      const made = before - right;
      const verdicts = unit.questions.map((asked) => verdictOf(unit, asked, grades));
      return [
        unit.trace,
        unit.model,
        String(unit.run),
        unit.arm,
        String(before),
        String(right),
        String(after),
        String(back),
        made > 0 ? `${((back / made) * 100).toFixed(0)} %` : '—',
        String(sum(unit.questions.map((one) => one.retrieval.recalls))),
        String(sum(unit.questions.map((one) => one.retrieval.reads))),
        String(unit.questions.filter((one) => one.outside).length),
        `${verdicts.filter((verdict) => verdict === 'correct').length} of ${verdicts.filter((verdict) => verdict !== undefined).length} graded`,
      ];
    });
  return table(
    ['Trace', 'Model', 'Run', 'Arm', 'In use before', 'Right after', 'After the questions', 'Grew by', 'Of the room made, taken again', '`recall` calls', 'Files read again', 'Questions that read outside the work', 'Right'],
    rows,
  );
}

/**
 * The units that asked the questions `find` is for, an agent in between: the
 * plugin's arm with no key (`default`), which had `recall` alone before #110
 * and has `find` looking on the machine since, and with a key (`find`), or the
 * checkouts named. Right is decided by the program: the line asked for is in
 * the answer.
 */
export function finds(units: readonly Unit[]): string {
  const asked = units.filter((unit) => unit.mode === 'find');
  // Shown only where it happened: an answer after the model refused is another model's, and is counted in Right all the same.
  const fellBack = asked.some((unit) => unit.questions.some((one) => one.fellBackTo !== undefined));
  // Shown only where it was recorded (#148 #149), so that a table of earlier units reads as it did.
  const handed = asked.some((unit) => unit.questions.some((one) => one.handed !== undefined));
  const rows = asked
    .sort((a, b) => `${a.trace}${a.model}${a.run}${a.variant}`.localeCompare(`${b.trace}${b.model}${b.run}${b.variant}`))
    .map((unit) => [
      unit.trace,
      unit.model,
      String(unit.run),
      // Since #110 `find` is there with no key as well: what tells the variants apart is the key, else the checkout named.
      unit.variant === 'default' ? 'no key' : unit.variant === 'find' ? 'with a key' : unit.variant,
      unit.compaction.line?.outcome ?? '—',
      `${unit.questions.filter((one) => one.verdict === 'correct').length}/${unit.questions.length}`,
      ...(fellBack ? [String(unit.questions.filter((one) => one.fellBackTo !== undefined).length)] : []),
      String(sum(unit.questions.map((one) => one.retrieval.finds))),
      String(sum(unit.questions.map((one) => one.retrieval.recalls))),
      String(sum(unit.questions.map((one) => one.retrieval.reads))),
      ...(handed ? [String(sum(unit.questions.map((one) => one.handed?.recall ?? 0))), String(sum(unit.questions.map((one) => one.handed?.find ?? 0)))] : []),
      (sum(unit.questions.map((one) => one.durationMs)) / 1000).toFixed(1),
      String(sum(unit.questions.flatMap((one) => one.requests))),
      sum(unit.questions.map((one) => one.own.costUSD)).toFixed(4),
    ]);
  return table(
    [
      'Trace',
      'Model',
      'Run',
      'Key',
      'Compaction',
      'Right',
      ...(fellBack ? ['Answered by another model after a refusal'] : []),
      '`find` calls',
      '`recall` calls',
      'Files read again',
      ...(handed ? ['Bytes `recall` handed back', 'Bytes `find` handed back'] : []),
      'Seconds',
      'Input tokens',
      'Cost, USD',
    ],
    rows,
  );
}

/** How a question `find` is for was asked (`FindQuestion.by`), from the trace that holds it; empty where none does. */
function askedBy(trace: string, id: string): string {
  return BUILT.find((one) => one.name === trace)?.finds.find((find) => find.id === id)?.by ?? '';
}

/**
 * The questions `find` is for, by how each was asked, of the units that recorded where its answer went (#149): how
 * many were right, the calls to `find` and `recall`, the ids handed to `recall` that do not hold the answer, and the
 * bytes `recall` handed back. Asked by a subject, the result is named by what it was about and the line asked for is
 * far below its first line: a ticket that quotes its first line tells which to open, and does not answer.
 */
export function findsByKind(units: readonly Unit[]): string {
  const rows = units
    .filter((unit) => unit.mode === 'find' && unit.questions.some((one) => one.fetched?.opened !== undefined))
    .sort((a, b) => a.trace.localeCompare(b.trace) || a.model.localeCompare(b.model) || a.variant.localeCompare(b.variant) || a.run - b.run)
    .flatMap((unit) => {
      const kinds = [...new Set(unit.questions.map((one) => askedBy(unit.trace, one.id)))];
      return kinds.map((by) => {
        const of = unit.questions.filter((one) => askedBy(unit.trace, one.id) === by);
        return [
          unit.trace,
          unit.model,
          unit.variant === 'default' ? 'no key' : unit.variant === 'find' ? 'with a key' : unit.variant,
          String(unit.run),
          by,
          `${of.filter((one) => one.verdict === 'correct').length}/${of.length}`,
          String(of.filter((one) => one.fellBackTo !== undefined).length),
          String(sum(of.map((one) => one.retrieval.finds))),
          String(sum(of.map((one) => one.retrieval.recalls))),
          String(sum(of.map((one) => one.fetched?.opened ?? 0))),
          String(sum(of.map((one) => one.handed?.recall ?? 0))),
        ];
      });
    });
  return table(['Trace', 'Model', 'Key', 'Run', 'Asked by', 'Right', 'Answered by another model', '`find` calls', '`recall` calls', 'Ids handed to `recall` not holding it', 'Bytes `recall` handed back'], rows);
}

/**
 * What the plugin estimated to be in use after it had moved what it would,
 * against what was, per checkout or setting of the plugin. Where it compacted,
 * by moving results out or by keeping the oldest messages in place of a summary,
 * that is what the next request was sent. Where it moved nothing and handed
 * over, nothing had changed, and the estimate is of what was in use before the
 * compaction, as Claude Code counted it, less the thinking, which no rebuilt
 * message carries; a unit measured before the thinking was recorded is set
 * against all that was in use. Where it moved some and still handed over, what
 * it left was never sent, and there is nothing to set the estimate against.
 */
export function estimates(units: readonly Unit[]): string {
  // A compaction left undone estimated nothing: there is no afterwards to set against.
  const probes = units.filter((unit) => unit.arm === 'plugin' && unit.compaction.line !== null && unit.compaction.undone !== true);
  const rows = probes
    .sort((a, b) => `${a.trace}${a.model}${a.variant}${a.run}`.localeCompare(`${b.trace}${b.model}${b.variant}${b.run}`))
    .map((unit) => {
      const line = unit.compaction.line;
      const actual = unit.questions[0]?.requests[0] ?? NaN;
      const estimate = line?.estimate;
      const thinking = unit.compaction.thinkingBefore;
      const before = unit.compaction.preTokens - (thinking ?? 0);
      // Handed back by the plugin, whichever way: what it estimated is what the next request was sent.
      const sent = line?.outcome === 'moved' || line?.outcome === 'cut' || line?.outcome === 'rebuilt';
      const against = sent ? actual : line?.outcome === 'nothing' ? before : NaN;
      const measured =
        sent ? `${actual} sent next` : line?.outcome === 'nothing' ? `${before} in use before${thinking === undefined ? '' : `, without ${thinking} of thinking`}` : '—';
      const error = estimate === undefined || !(against > 0) ? '—' : `${(((estimate - against) / against) * 100).toFixed(1)} %`;
      return [unit.trace, unit.model, `${unit.variant} (${unit.plugin ?? 'not recorded'})`, String(unit.run), line?.outcome ?? '—', estimate === undefined ? 'none stated' : String(estimate), measured, error];
    });
  return table(['Trace', 'Model', 'Plugin', 'Run', 'Outcome', 'Estimated', 'Measured', 'Error'], rows);
}
