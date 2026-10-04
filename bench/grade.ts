// Grades the answers a program cannot: where the work stands, the rules stated
// early, and, of an exact answer that does not hold the text asked for, whether it
// gave something else or said it could not tell. A model does it, twice, and is
// told nothing of where an answer came from: it gets a number, the question, the
// facts, the rubric and the answer. Answers whose grade is known are mixed in, with
// and without the words that tell an arm, so that the grader itself is measured.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Places } from './build.ts';
import { claude } from './cc.ts';
import { shuffled } from './lib.ts';
import { type Unit } from './run.ts';
import { ASKED, BUILT, type Question } from './traces.ts';

export type Verdict = 'correct' | 'incorrect' | 'abstained';

export type Item = {
  /** What the answer is: never shown to the grader. */
  key: string;
  ask: string;
  reference: string;
  rubric: string;
  answer: string;
  /** For an answer mixed in to measure the grader: what it should be graded. */
  expected?: Verdict;
};

/** Every unit measured under the box, in a fixed order. */
export function unitsUnder(box: string): Unit[] {
  const out: Unit[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.json')) out.push(JSON.parse(readFileSync(path, 'utf8')) as Unit);
    }
  };
  walk(join(box, 'units'));
  return out;
}

/** The version each trace is at now. */
export const VERSIONS: ReadonlyMap<string, number> = new Map(BUILT.map((trace) => [trace.name, trace.version]));

/**
 * The units that measured the traces at `versions`, and how many measured another version of one and are left out. By
 * default the traces as they are now; results published before a trace changed are read at the versions of then.
 */
export function currentOf(units: readonly Unit[], versions: ReadonlyMap<string, number> = VERSIONS): { units: Unit[]; older: number } {
  const current = units.filter((unit) => typeof unit.version === 'number' && versions.get(unit.trace) === unit.version);
  return { units: current, older: units.length - current.length };
}

/** The newest version of each trace that units measured: what results as they were published were of. */
export function versionsIn(units: readonly Unit[]): Map<string, number> {
  const versions = new Map<string, number>();
  for (const unit of units) if (typeof unit.version === 'number') versions.set(unit.trace, Math.max(versions.get(unit.trace) ?? 0, unit.version));
  return versions;
}

/**
 * What a verdict is filed under: the unit, the question, and the answer itself.
 * A unit measured again gives other answers, and a verdict on the old one is
 * then on nothing: it is not found, and the answer shows as ungraded.
 */
export const keyOf = (unit: Pick<Unit, 'trace' | 'model' | 'run' | 'arm' | 'variant'>, question: string, answer: string) =>
  [unit.trace, unit.model, unit.run, unit.arm, unit.variant, question, createHash('sha256').update(answer).digest('hex').slice(0, 12)].join('|');

/**
 * A value as it is published: wherever a string in it names the box or the
 * home directory above it, `<box>` and `<home>` stand there. Claude Code files
 * its records of a session under the working directory's path with every
 * character that is no letter or digit made `-`, and an answer that read one
 * names it so: that form is replaced as well. Only whole paths are replaced.
 * The name of the home directory by itself is left, since replacing a bare
 * word could change a word of an answer, or a field's name; whoever publishes
 * searches what was written for it.
 */
export function scrubbed<T>(value: T, places: { box: string; home: string }): T {
  const inJson = (text: string) => JSON.stringify(text).slice(1, -1);
  const dashed = (path: string) => path.replace(/[^A-Za-z0-9]/g, '-');
  const swaps: [string, string][] = [
    [inJson(places.box), '<box>'],
    [dashed(places.box), '<box>'],
    [inJson(places.home), '<home>'],
    [dashed(places.home), '<home>'],
  ];
  let text = JSON.stringify(value);
  for (const [from, to] of swaps) text = text.split(from).join(to);
  return JSON.parse(text) as T;
}

/**
 * The units and their grades as they are published: no answer names a path of
 * the machine it ran on (`scrubbed`). A verdict is filed under the answer it
 * is on, so each is filed again under the answer as published.
 */
export function published(units: readonly Unit[], grades: Grades | null, places: { box: string; home: string }): { units: Unit[]; grades: Grades | null } {
  const out = units.map((unit) => scrubbed(unit, places));
  if (grades === null) return { units: out, grades: null };
  const verdicts = { ...grades.verdicts };
  const moved = new Map<string, string>();
  units.forEach((unit, at) => {
    unit.questions.forEach((one, q) => {
      const was = keyOf(unit, one.id, one.answer);
      const is = keyOf(out[at] as Unit, one.id, (out[at] as Unit).questions[q]?.answer ?? '');
      if (was === is || !(was in verdicts)) return;
      verdicts[is] = verdicts[was] as (Verdict | null)[];
      delete verdicts[was];
      moved.set(was, is);
    });
  });
  return { units: out, grades: { ...grades, verdicts, ungraded: grades.ungraded.map((key) => moved.get(key) ?? key) } };
}

const TOLD = ['After calling the recall tool on the moved-out result, I can say: ', 'According to the summary of our earlier conversation: '] as const;

/** The rubric for an exact answer the program found not to hold the text: the grader cannot make it right, only say which way it is not. */
export const MISSED =
  'The answer does not hold the exact text in Facts, so it is not correct. ' +
  'Grade it incorrect if it gives some text or value in its place, however it hedges; abstained if it gives none and only says it cannot tell.';

/**
 * The answers to grade, and the ones mixed in. For each question a model grades,
 * a right and a wrong answer, each also with words that tell an arm in front. For
 * each trace's first exact question, another line given as the answer and a
 * plain "cannot tell", each with those words too, and the other line behind a hedge.
 */
export function itemsOf(units: readonly Unit[]): Item[] {
  const items: Item[] = [];
  const asked = new Map<string, Question>();
  for (const trace of ASKED) for (const question of trace.questions) asked.set(`${trace.name}|${question.id}`, question);
  for (const unit of units) {
    if (unit.mode !== 'ask') continue;
    for (const one of unit.questions) {
      const question = asked.get(`${unit.trace}|${one.id}`);
      if (question === undefined || one.verdict !== undefined) continue;
      items.push({ key: keyOf(unit, one.id, one.answer), ask: question.ask, reference: question.reference, rubric: question.rubric ?? MISSED, answer: one.answer });
    }
  }
  for (const [name, question] of asked) {
    if (question.rubric === undefined) continue;
    const base = { ask: question.ask, reference: question.reference, rubric: question.rubric };
    for (const [label, answer, expected] of [['right', question.right, 'correct'], ['wrong', question.wrong, 'incorrect']] as const) {
      if (answer === undefined) continue;
      items.push({ ...base, key: `control|${name}|${label}`, answer, expected });
      TOLD.forEach((words, at) => items.push({ ...base, key: `control|${name}|${label}|told-${at + 1}`, answer: words + answer, expected }));
    }
  }
  for (const trace of ASKED) {
    const [exact, other] = trace.questions.filter((question) => question.needles !== undefined);
    if (exact === undefined || other === undefined) continue;
    const base = { ask: exact.ask, reference: exact.reference, rubric: MISSED };
    const name = `control|${trace.name}|${exact.id}`;
    items.push({ ...base, key: `${name}|other-hedged`, answer: `I cannot run it again, so I am unable to check, but it was: ${other.reference}`, expected: 'incorrect' });
    // Whether an answer gave something or nothing is where one that says "the summary does not have it" or "recall brought nothing back" lands: those too are graded with and without the telling words.
    for (const [label, answer, expected] of [['other', other.reference, 'incorrect'], ['none', 'That is no longer available to me, so I cannot say what it was.', 'abstained']] as const) {
      items.push({ ...base, key: `${name}|${label}`, answer, expected });
      TOLD.forEach((words, at) => items.push({ ...base, key: `${name}|${label}|told-${at + 1}`, answer: words + answer, expected }));
    }
  }
  return items;
}

/** What the grader is sent for one batch. Nothing in it says which arm, model or run an answer is from. */
export function promptOf(batch: readonly Item[]): string {
  const head =
    'You are grading answers. Each numbered item gives a question, the facts a right answer holds, a rubric, and an answer.\n' +
    'Judge only whether the answer meets the rubric against the facts. How the answer was arrived at is no part of the judgment: ' +
    'a mention of tools, summaries, memory or earlier messages neither helps nor hurts it.\n' +
    'Reply with exactly one line per item and nothing else: the number, a space, and one word: correct, incorrect, or abstained. ' +
    'Use abstained only when the answer says it does not know and offers nothing that could be right or wrong.\n';
  const body = batch.map((item, at) => `\n=== Item ${at + 1} ===\nQuestion: ${item.ask}\nFacts: ${item.reference}\nRubric: ${item.rubric}\nAnswer:\n${item.answer}\n`);
  return head + body.join('');
}

/** The verdicts in a grader's reply, by position; a position it left out or garbled is missing from the result. */
export function verdictsIn(reply: string, count: number): Map<number, Verdict> {
  const out = new Map<number, Verdict>();
  for (const match of reply.matchAll(/^\s*(\d+)[.:)]?\s+(correct|incorrect|abstained)\b/gim)) {
    const at = Number(match[1]);
    if (at >= 1 && at <= count && !out.has(at)) out.set(at, (match[2] as string).toLowerCase() as Verdict);
  }
  return out;
}

export type Grades = {
  /** The model that graded. */
  model: string;
  /** For each answer, what each pass graded it, in the order of the passes; null where a pass gave it no grade. */
  verdicts: Record<string, (Verdict | null)[]>;
  /**
   * How the grader did on the answers mixed in, by its first pass. A pair is an
   * answer with words that tell an arm in front and the same answer without; only
   * a pair the grader graded both of says anything.
   */
  controls: { count: number; graded: number; asExpected: number; toldPairs: number; toldPairsGraded: number; toldPairsSame: number };
  /** Answers the two passes graded differently. */
  disagreements: number;
  /** Answers and controls a pass left without a grade. */
  ungraded: string[];
};

export function summed(items: readonly Item[], passes: readonly Map<string, Verdict>[], model = ''): Grades {
  const verdicts: Record<string, (Verdict | null)[]> = {};
  const ungraded: string[] = [];
  for (const item of items) {
    const got = passes.map((pass) => pass.get(item.key) ?? null);
    if (got.some((verdict) => verdict === null)) ungraded.push(item.key);
    verdicts[item.key] = got;
  }
  const controls = items.filter((item) => item.expected !== undefined);
  const first = passes[0] ?? new Map<string, Verdict>();
  const pairs = controls.filter((item) => item.key.includes('|told-')).map((item) => [first.get(item.key), first.get(item.key.replace(/\|told-\d+$/, ''))] as const);
  const graded = pairs.filter(([told, plain]) => told !== undefined && plain !== undefined);
  return {
    model,
    verdicts,
    controls: {
      count: controls.length,
      graded: controls.filter((item) => first.has(item.key)).length,
      asExpected: controls.filter((item) => first.get(item.key) === item.expected).length,
      toldPairs: pairs.length,
      toldPairsGraded: graded.length,
      toldPairsSame: graded.filter(([told, plain]) => told === plain).length,
    },
    disagreements: items.filter((item) => {
      const got = (verdicts[item.key] ?? []).filter((verdict) => verdict !== null);
      return item.expected === undefined && new Set(got).size > 1;
    }).length,
    ungraded,
  };
}

const BATCH = 20;
const SEEDS = [28, 2828] as const;

/** What a batch's files are named by: the grader and every word it is sent. Another batch, or another grader, is another name. */
export const batchName = (pass: number, model: string, prompt: string) => `pass-${pass}-${createHash('sha256').update(`${model}\n${prompt}`).digest('hex').slice(0, 16)}`;

/**
 * Grades every answer that needs it, twice in different orders, and writes what
 * the grader was sent beside what it said. A reply is used again only for the
 * very prompt it answered, and only when it graded every item of it.
 */
export async function grade(places: Places, model: string, log: (text: string) => void): Promise<Grades> {
  const { units, older } = currentOf(unitsUnder(places.box));
  if (older > 0) log(`${older} unit(s) measured an older version of their trace and are left out`);
  const items = itemsOf(units);
  const dir = join(places.box, 'judge');
  mkdirSync(dir, { recursive: true });
  const passes: Map<string, Verdict>[] = [];
  for (const [pass, seed] of SEEDS.entries()) {
    const order = shuffled(items, seed);
    const got = new Map<string, Verdict>();
    for (let from = 0; from < order.length; from += BATCH) {
      const batch = order.slice(from, from + BATCH);
      const prompt = promptOf(batch);
      const name = batchName(pass + 1, model, prompt);
      const replyPath = join(dir, `${name}.reply.txt`);
      let verdicts = existsSync(replyPath) ? verdictsIn(readFileSync(replyPath, 'utf8'), batch.length) : new Map<number, Verdict>();
      const kept = verdicts.size === batch.length;
      if (!kept) {
        writeFileSync(join(dir, `${name}.prompt.txt`), prompt);
        const ran = await claude({ out: join(dir, `${name}.jsonl`), cwd: dir, model, arm: 'builtin', storeDir: join(places.box, 'store', 'judge'), allowedTools: [], prompt, kept: false });
        writeFileSync(replyPath, ran.session.answer);
        verdicts = verdictsIn(ran.session.answer, batch.length);
      }
      batch.forEach((item, at) => {
        const verdict = verdicts.get(at + 1);
        if (verdict !== undefined) got.set(item.key, verdict);
      });
      log(`pass ${pass + 1}, batch ${from / BATCH + 1} (${name}): ${verdicts.size} of ${batch.length} graded${kept ? ', from the reply already there' : ''}`);
    }
    passes.push(got);
  }
  const grades = summed(items, passes, model);
  writeFileSync(join(places.box, 'grades.json'), `${JSON.stringify(grades, null, 1)}\n`);
  return grades;
}
