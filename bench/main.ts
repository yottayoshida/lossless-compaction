// The benchmark's commands. Sessions run outside the repository, under BENCH_BOX:
//
//   node bench/main.ts describe                      what is asked, and the answers
//   node bench/main.ts build   --traces a,b          build the conversations: the six that are asked questions, the two that are only probed, and the one asked only what `find` is for
//   node bench/main.ts run     --traces a,b --models m1,m2 --runs 3
//   node bench/main.ts probe   --traces a,b --models m1 [--plugin-dirs name=path,...] [--max-after 100] [--target 1]   (each checkout at those settings; `run` takes them too)
//   node bench/main.ts chain   --traces a,b --models m1 --runs 1   the questions one after another, each going on from the one before
//   node bench/main.ts pick                          what `find` picks against a word match (asks Jev: BENCH_JEV_ENV)
//   node bench/main.ts pick    --questions file.json  the same of a file's questions: [{ trace, kind, ask, target }]
//   node bench/main.ts find    [--traces a,b] [--variants find]   the same questions with an agent in between, with and without `find`
//   node bench/main.ts grade   [--model m]           grade what a program cannot
//   node bench/main.ts report  [--from dir]          the tables, of the box or of results that were published
//   node bench/main.ts publish --to dir [--variants a,b]   the units, grades and tables, without the paths of this machine
//
// `run` asks the trace's questions; `probe` asks one that needs no history, to
// measure what a compaction left against what the plugin estimated.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { providerFrom } from '../src/ask.ts';
import type { Http } from '../src/types.ts';
import { build, type Conversation, type Places } from './build.ts';
import { currentOf, grade, published, scrubbed, unitsUnder, type Grades } from './grade.ts';
import { keysIn } from './lib.ts';
import { pick, pickTable, wentOf, type Pick } from './pick.ts';
import { whole } from './report.ts';
import { leaf, runAll, variantsOf } from './run.ts';
import { BUILT, FOUND, PROBED, TRACES, described, unnamed } from './traces.ts';

const HAIKU = 'claude-haiku-4-5-20251001';

function flag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : args[at + 1];
}

/**
 * The keys `find` asks Jev with, from the file BENCH_JEV_ENV names: lines of
 * NAME=value for CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, or
 * TYPESAFE_API_KEY. They are read here and handed on; nothing prints them.
 */
function jevKeys(): { keys: Record<string, string>; provider: 'cloudflare' | 'typesafe' } {
  const path = process.env['BENCH_JEV_ENV'];
  if (path === undefined || path === '') throw new Error('set BENCH_JEV_ENV to a file holding the key for Jev: this command sends excerpts of the made-up traces to its API');
  const keys = keysIn(readFileSync(path, 'utf8'));
  if (Object.keys(keys).length === 0) throw new Error(`${path}: no key for Jev is in it`);
  return { keys, provider: keys['CLOUDFLARE_API_TOKEN'] !== undefined ? 'cloudflare' : 'typesafe' };
}

const overHttp: Http = async (url, init) => {
  const response = await fetch(url, init);
  return { status: response.status, ok: response.ok, text: await response.text() };
};

/** What was measured under a directory: the box, or results as they were published. */
function measuredUnder(dir: string) {
  const { units, older } = currentOf(unitsUnder(dir));
  const read = <T>(name: string): T | null => (existsSync(join(dir, name)) ? (JSON.parse(readFileSync(join(dir, name), 'utf8')) as T) : null);
  return { units, older, grades: read<Grades>('grades.json'), picks: read<{ picks: Pick[] }>('picks.json') };
}

const list = (value: string | undefined, all: readonly string[]) => (value === undefined ? [...all] : value.split(',').filter((item) => item !== ''));

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const pluginDir = resolve(import.meta.dirname, '..');
  if (command === 'describe') {
    const out = flag(args, 'out');
    const text = `${JSON.stringify(described(), null, 2)}\n`;
    if (out === undefined) process.stdout.write(text);
    else writeFileSync(out, text);
    return;
  }
  if (command === 'report' && flag(args, 'from') !== undefined) {
    const { units, older, grades, picks } = measuredUnder(resolve(flag(args, 'from') as string));
    process.stdout.write(whole(units, grades, older, picks?.picks ?? null));
    return;
  }
  const box = process.env['BENCH_BOX'];
  if (box === undefined || box === '') throw new Error('set BENCH_BOX to a directory outside the repository: sessions work there and their records stay there');
  if (`${resolve(box)}${sep}`.startsWith(`${pluginDir}${sep}`)) throw new Error(`BENCH_BOX is inside the repository (${pluginDir}): records of sessions stay outside it`);
  const places: Places = { box: resolve(box), pluginDir };
  const log = (text: string) => console.error(text);
  // With no trace named: every conversation but the large one is built; questions are asked of the six they were written for.
  // A probe leaves out those asked only what `find` is for: their size was not set against the count (#37).
  const traces = list(flag(args, 'traces'), unnamed(command ?? '').map((trace) => trace.name));
  const buildModel = flag(args, 'build-model') ?? HAIKU;
  if (command === 'build') {
    for (const name of traces) {
      const trace = BUILT.find((one) => one.name === name);
      if (trace === undefined) throw new Error(`no trace named ${name}`);
      const base = await build(trace, buildModel, places, log);
      console.log(JSON.stringify({ trace: base.trace, tokens: base.tokens, thinkingTokens: base.thinkingTokens, toolCalls: base.toolCalls, session: base.sessionId }));
    }
    return;
  }
  if (command === 'run' || command === 'probe' || command === 'chain') {
    const unasked = command !== 'probe' ? traces.filter((name) => [...PROBED, ...FOUND].some((one) => one.name === name)) : [];
    if (unasked.length > 0) throw new Error(`no question but those of \`find\` is asked of ${unasked.join(', ')}: built for \`probe\`, \`find\` or \`pick\` only`);
    const models = list(flag(args, 'models'), [HAIKU]);
    const runs = Number(flag(args, 'runs') ?? 1);
    const variants = variantsOf(flag(args, 'plugin-dirs'), flag(args, 'max-after'), pluginDir, flag(args, 'target'));
    const arms = flag(args, 'arms');
    const units = await runAll(
      { traces, models, runs, buildModel, mode: command === 'probe' ? 'probe' : command === 'chain' ? 'chain' : 'ask', ...(variants ? { variants } : {}), ...(arms ? { arms: arms.split(',') as ('plugin' | 'builtin')[] } : {}) },
      places,
      log,
    );
    console.log(`${units.length} units under ${places.box}/units`);
    return;
  }
  if (command === 'pick') {
    const { keys, provider: kind } = jevKeys();
    const provider = providerFrom({ provider: kind }, keys);
    if (provider === null || 'error' in provider) throw new Error(`the key for Jev cannot be used: ${provider === null ? 'none was given' : provider.error}`);
    const picks: Pick[] = [];
    const conversationOf = (name: string) => JSON.parse(readFileSync(join(places.box, 'bases', `${name}.conversation.json`), 'utf8')) as Conversation;
    // With --questions, the questions of that file instead, each on the conversation it names: written beside picks.json under the file's own name.
    const file = flag(args, 'questions');
    if (file !== undefined) {
      const asked = JSON.parse(readFileSync(file, 'utf8')) as { trace: string; kind: string; ask: string; target: string }[];
      for (const one of asked) {
        const [got] = await pick(one.trace, [{ id: one.kind, by: 'value', ask: one.ask, target: one.target }], conversationOf(one.trace), provider, overHttp);
        if (got === undefined) throw new Error(`${one.trace} ${one.kind}: not asked`);
        console.log(`${one.trace} ${one.kind}: ${wentOf(got)}`);
        picks.push(got);
      }
      writeFileSync(join(places.box, `picks-${basename(file)}`), `${JSON.stringify({ at: new Date().toISOString(), provider: provider.kind, picks }, null, 1)}\n`);
      return;
    }
    for (const name of traces) {
      const trace = [...TRACES, ...FOUND].find((one) => one.name === name);
      if (trace === undefined) throw new Error(`no trace named ${name}`);
      const of = await pick(name, trace.finds, conversationOf(name), provider, overHttp);
      for (const one of of) log(`${name} ${one.question}: ${one.options} options, ${one.jev.kind} in ${one.jev.ms} ms`);
      picks.push(...of);
    }
    writeFileSync(join(places.box, 'picks.json'), `${JSON.stringify({ at: new Date().toISOString(), provider: provider.kind, picks }, null, 1)}\n`);
    console.log(pickTable(picks));
    return;
  }
  if (command === 'find') {
    const { keys, provider } = jevKeys();
    const only = flag(args, 'variants')?.split(',');
    const units = await runAll(
      {
        traces: list(flag(args, 'traces'), ['results', 'short']),
        models: list(flag(args, 'models'), [HAIKU]),
        runs: Number(flag(args, 'runs') ?? 1),
        buildModel,
        mode: 'find',
        arms: ['plugin'],
        // With --variants, only those named: `find` alone, where the arm without a key is already measured on the same code path.
        variants: [
          { name: 'default', pluginDir },
          { name: 'find', pluginDir, options: { provider }, env: keys },
        ].filter((variant) => only === undefined || only.includes(variant.name)),
      },
      places,
      log,
    );
    console.log(`${units.length} units under ${places.box}/units`);
    return;
  }
  if (command === 'grade') {
    const grades = await grade(places, flag(args, 'model') ?? HAIKU, log);
    console.log(JSON.stringify({ answers: Object.keys(grades.verdicts).length, controls: grades.controls, disagreements: grades.disagreements, ungraded: grades.ungraded.length }));
    return;
  }
  if (command === 'report') {
    const { units, older, grades, picks } = measuredUnder(places.box);
    process.stdout.write(whole(units, grades, older, picks?.picks ?? null));
    return;
  }
  if (command === 'publish') {
    const to = flag(args, 'to');
    if (to === undefined) throw new Error('publish takes --to, the directory to write to');
    // With --variants, only the units of those variants: the probes of two checkouts, say, out of a box that holds more.
    const only = flag(args, 'variants')?.split(',');
    const measured = measuredUnder(places.box);
    const units = only === undefined ? measured.units : measured.units.filter((unit) => only.includes(unit.variant));
    // Grades are of the questions asked, and what `find` picked is of no variant: neither goes with a selection that asked nothing.
    const grades = only === undefined || units.some((unit) => unit.mode !== 'probe') ? measured.grades : null;
    const picks = only === undefined ? measured.picks : null;
    const machine = { box: places.box, home: homedir() };
    const out = published(units, grades, machine);
    const write = (path: string, text: string) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    };
    for (const unit of out.units) write(join(to, 'units', unit.trace, unit.model, `run-${unit.run}`, `${leaf(unit.arm, unit.variant, unit.mode)}.json`), `${JSON.stringify(unit, null, 1)}\n`);
    if (out.grades !== null) write(join(to, 'grades.json'), `${JSON.stringify(out.grades, null, 1)}\n`);
    const picked = picks === null ? null : scrubbed(picks, machine);
    if (picked !== null) write(join(to, 'picks.json'), `${JSON.stringify(picked, null, 1)}\n`);
    write(join(to, 'report.md'), whole(out.units, out.grades, 0, picked?.picks ?? null));
    console.log(`${out.units.length} units, their grades and the tables under ${to}`);
    return;
  }
  throw new Error('commands: describe, build, run, probe, pick, find, grade, report, publish');
}

await main();
