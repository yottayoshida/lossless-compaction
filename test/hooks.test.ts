import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { Provider } from '../src/ask.ts';
import { changedLine, shownAgainLine } from '../src/changed.ts';
import { KEPT } from '../src/keep.ts';
import { MemoryFiles, enospc } from './helpers.ts';
import { FIND_IN_RECALL, recallDescription } from '../src/tools.ts';
import { FIND_TOOL, PLUGIN as PLUGIN_NAME, RECALL_TOOL, STATUS_COMMAND, STORE_COMMAND, ticketText } from '../src/store.ts';
import { refusal } from '../src/guard.ts';
import { KEY_VARIABLES, PLACE_VARIABLES, ROUTE_VARIABLES } from '../src/trust.ts';

const hooks = readFileSync(new URL('../hooks/move-out.ts', import.meta.url), 'utf8');
const compaction = readFileSync(new URL('../src/compact.ts', import.meta.url), 'utf8');

/**
 * How the hook file spells a hook on one tool. With the event: two events match the
 * same tool names, and by the name alone one would stand in for the other that is gone.
 */
const hookOn = (event: 'tool.call' | 'tool.describe', tool: string) => `on('${event}', { tool: '${tool}' }`;

/** The hooks the hook file registers for `event`, each with the matcher it gave: registered for real, so that what a hook answers is seen and not only how it is spelled. */
async function registered<Handler>(event: string): Promise<{ matcher: unknown; handler: Handler }[]> {
  const { register } = (await import(new URL('../hooks/move-out.ts', import.meta.url).href)) as {
    register: (on: (name: string, ...rest: unknown[]) => void, options: Record<string, unknown>) => void;
  };
  const found: { matcher: unknown; handler: Handler }[] = [];
  register((name, ...rest) => {
    if (name === event) found.push({ matcher: rest[0], handler: rest[1] as Handler });
  }, {});
  return found;
}

test('the tool.call matchers are spelled out in the hook and name the tools the store names', () => {
  assert.ok(hooks.includes(hookOn('tool.call', RECALL_TOOL)), 'recall matcher');
  assert.ok(hooks.includes(hookOn('tool.call', FIND_TOOL)), 'find matcher');
});

test('recall and find are listed in front of the agent, not behind ToolSearch, with the description they had (#54)', async () => {
  // Spelled out in the file, where Claude Code reads a matcher from: those two, and no other tool is moved.
  for (const tool of [RECALL_TOOL, FIND_TOOL]) assert.ok(hooks.includes(hookOn('tool.describe', tool)), tool);
  assert.equal(hooks.split("on('tool.describe'").length - 1, 2);

  // And registered: what each answers for a tool Claude Code keeps behind its tool search.
  type Described = { description: string; isDeferred?: boolean };
  type Describe = ($: unknown, e: { tool: string; description: string; isDeferred?: true }, next: (e: { description: string }) => Promise<Described>) => Promise<Described>;
  const describes = await registered<Describe>('tool.describe');
  assert.deepEqual(describes.map((one) => one.matcher), [{ tool: RECALL_TOOL }, { tool: FIND_TOOL }]);
  for (const { matcher, handler } of describes) {
    const { tool } = matcher as { tool: string };
    // The description is what the hooks after this one make of it, handed on as it is; only where the tool waits changes.
    const answered = await handler({}, { tool, description: 'as it was', isDeferred: true }, async (e) => ({ description: `${e.description}, computed`, isDeferred: true }));
    assert.deepEqual(answered, { description: 'as it was, computed', isDeferred: false }, tool);
  }
});

test('a file shown again that the plugin named as changed is answered with the line in its place: on the main conversation, of what the hooks after it show, and left as shown when the conversation cannot be read (#54)', async () => {
  // Spelled out in the file: one hook, on what Claude Code attaches as a file.
  assert.equal(hooks.split("on('prompt.attachment'").length - 1, 1);
  type Shown = { text: string | null };
  type Attach = ($: unknown, e: { type: string; text: string; agentId?: string }, next: (e: unknown) => Promise<Shown>) => Promise<Shown>;
  const attaches = await registered<Attach>('prompt.attachment');
  assert.deepEqual(attaches.map((one) => one.matcher), [{ type: 'file' }]);
  const attach = attaches[0]!.handler;

  const [path, reading] = ['/work/changing.log', 'c'.repeat(64)];
  const shown = `Called the Read tool with the following input: ${JSON.stringify({ file_path: path })}\nResult of calling the Read tool:\n1\tas it is now`;
  const conversation = [
    { role: 'user', text: 'This session is being continued from a previous conversation.', toolUses: [] },
    { role: 'user', text: `${KEPT}, in 1 part; recall a part by its id.\n${changedLine(path, reading)}`, toolUses: [] },
  ];
  let read = 0;
  const host = (messages: () => Promise<unknown> = async () => conversation) => ({
    session: {
      messages: () => {
        read += 1;
        return messages();
      },
    },
  });
  const e = { type: 'file', text: 'what Claude Code made of it' };
  const next = async () => ({ text: shown });

  // What is judged and handed on is what the hooks after this one show, not what the event came with.
  assert.deepEqual(await attach(host(), e, next), { text: shownAgainLine(path, reading) });
  assert.deepEqual(await attach(host(), e, async () => ({ text: shown.replace('changing', 'kept') })), { text: shown.replace('changing', 'kept') });
  // Left out by a hook after this one: it stays out, and the conversation is not read for it. Nor for a subagent's.
  read = 0;
  assert.deepEqual(await attach(host(), e, async () => ({ text: null })), { text: null });
  assert.deepEqual(await attach(host(), { ...e, agentId: 'agent-1' }, next), { text: shown });
  assert.equal(read, 0);
  // The conversation cannot be read: the file is shown as Claude Code shows it, and nothing is thrown.
  const failing = async () => {
    throw new Error('no session');
  };
  assert.deepEqual(await attach(host(failing), e, next), { text: shown });
  assert.equal(read, 1);
});

test('every tool and the compaction read where results are through placesOf, so the old place is read too', () => {
  assert.ok(hooks.includes("placesOf(filesOf($), options['storeDir']"), 'placesOf');
  assert.ok(!hooks.includes('storeDirFrom('), 'the plain default is never used on its own');
  assert.ok(hooks.includes('const config: Config = { store, ...configFrom(options) };'), 'the compaction is handed both places, and the settings as src/flow.ts reads them');
  assert.ok(!hooks.includes("options['keepTokens']") && !hooks.includes("options['targetPercent']"), 'no setting of the compaction is read here');
  assert.ok(hooks.includes('recall(filesOf($), store.read,'), 'recall reads both');
  assert.ok(hooks.includes('{ dir: keep.store.write, read: keep.store.read, messages: keep.messages }'), 'what is kept before a summary is handed both places: a reading moved out earlier may be in the older one');
  assert.ok(hooks.includes('dirs: store.read,'), 'find reads both');
});

test("the find hook hands find the host's clock, answers a broken provider setting itself, and catches what the host throws", () => {
  const handler = hooks.slice(hooks.indexOf(hookOn('tool.call', FIND_TOOL)));
  assert.ok(handler.includes('wait: (ms, signal) => $.clock.sleep(ms, { signal })'), 'clock');
  assert.ok(handler.includes('find cannot ask Jev: ${provider.error}'), 'provider error');
  assert.ok(handler.includes('} catch (error) {'), 'catch');
});

test("every variable trust.ts judges is read by the hook, so none of them is silently never the repository's", () => {
  const env = hooks.slice(hooks.indexOf('async function envOf('), hooks.indexOf('async function taintsOf('));
  for (const name of [...PLACE_VARIABLES, ...KEY_VARIABLES, ...ROUTE_VARIABLES]) {
    assert.ok(env.includes(`${name}: await $.env.get('${name}')`), name);
  }
});

test("where results are kept and where find sends both go through the repository's settings first", () => {
  assert.ok(hooks.includes("$.settings.read({ source: 'project' })") && hooks.includes("$.settings.read({ source: 'local' })"), 'both files');
  // The user file only tells the home directory apart: failing to read it must not stop anything.
  const taints = hooks.slice(hooks.indexOf('async function taintsOf('), hooks.indexOf('async function storeOf('));
  const [both, user] = taints.split("repo.user = await $.settings.read({ source: 'user' })");
  assert.ok(user !== undefined && both?.includes('repo = null;') && !user.includes('repo = null'), 'the user file is read on its own');
  assert.ok(hooks.includes('placeTaints(taints, options)'), 'the place');
  assert.ok(hooks.includes('sendTaints(taints, options)'), 'the sending');
  // Each of recall, find, the compaction, a subagent's compaction (ADR 0026), the clean-up, /lossless-store and a message
  // sent again from a rewind (ADR 0024) takes the place from storeOf and gives up on its reason.
  const givingUp = hooks.split("if (typeof store === 'string')").length - 1;
  // The compaction calls it `place` until the place is known to be private (it keeps the conversation after that).
  assert.equal(givingUp + (hooks.split("if (typeof place === 'string')").length - 1), 7, 'seven callers');
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('type HandedOver'));
  assert.ok(collecting.includes("const store = await storeOf($, options);\n    if (typeof store === 'string') return;"), 'the clean-up too');
});

test('a compaction makes the place private before anything is written, and gives up when it cannot', () => {
  const attempt = hooks.slice(hooks.indexOf('async function attempt('), hooks.indexOf('export const register'));
  const made = attempt.indexOf('await privateOf($, place)');
  assert.ok(made > 0, 'privateOf is called');
  assert.ok(made < attempt.indexOf('await compact('), 'before the compaction writes');
  assert.ok(made < attempt.indexOf('whyNotRebuilt('), 'and before a conversation that is not rebuilt is kept');
  assert.ok(
    attempt.includes("if (unsafe !== null) return { why: unsafe, keep: { unkept: 'the place to keep it in could not be made private' } };"),
    'and gives up on its reason, keeping nothing',
  );
  assert.ok(made < attempt.indexOf('store = place;'), 'the conversation is kept only in a place made private');
  assert.ok(attempt.indexOf('await noteRootOf($, store, options);') < attempt.indexOf('whyNotRebuilt('), "this session's transcript is noted before any summary");
  assert.ok(hooks.includes('$.process.run(argv, { timeoutMs: 10_000 })'), 'commands run through the host');
});

test("the place a session's transcript is looked for in is read from Claude Code's directory as the store's default is, not a second way", () => {
  const noting = hooks.slice(hooks.indexOf('async function noteRootOf('), hooks.indexOf('async function', hooks.indexOf('async function noteRootOf(') + 1));
  assert.ok(noting.includes('const config = configDirFrom(env);'), noting);
  assert.ok(!/env\.(HOME|USERPROFILE|CLAUDE_CONFIG_DIR)/.test(noting), 'no variable is read here on its own');
});

test('the clean-up runs after the session starts, unwaited, and recall, find and the compaction put back from the trash first', () => {
  const start = hooks.slice(hooks.indexOf("on('session.start'"), hooks.indexOf("on('tool.call'"));
  assert.ok(start.includes('void collectOnce($, options);'), 'not waited for');
  // Every id the recall hook reads, the one given and the one meant by it, is read through `recalled`, which puts back and reads again.
  const recallHook = hooks.slice(hooks.indexOf(hookOn('tool.call', RECALL_TOOL)), hooks.indexOf(hookOn('tool.call', FIND_TOOL)));
  assert.ok(recallHook.includes('(one) => recalled($, store, one),') && !recallHook.includes('recall(filesOf('), 'recall, through recalled alone');
  const recalledAt = hooks.indexOf('async function recalled(');
  const recalled = hooks.slice(recalledAt, hooks.indexOf('\n}\n', recalledAt));
  // The id that was meant is told by the conversation that calls: the main one, or the subagent's own, whose kept parts are
  // named after its summary (ADR 0026); one the session cannot read holds none (#54).
  assert.ok(recallHook.includes('const found = await recallMeant('), 'recall, by the id that was meant');
  assert.ok(recallHook.includes('const read = agentId === undefined ? await $.session.messages() : await $.session.messages({ agentId });'), "recall, the caller's conversation");
  assert.ok(recallHook.includes('return Array.isArray(read) ? (read as readonly Message[]) : [];'), 'recall, a conversation refused holds none');
  // Read once: the id meant and the tickets named on a refusal are told by the same conversation (#107).
  assert.ok(recallHook.includes('(conversation ??= (async () => {'), 'recall, the conversation read once');
  assert.ok(recallHook.includes('const found = await recallMeant((one) => recalled($, store, one), id, messages);'), 'the id meant, from it');
  assert.ok(recallHook.includes('const copied = found.error === NOT_AN_ID || found.error === NOT_STORED;'), 'tickets named only where the id may have been copied wrong');
  assert.ok(recallHook.includes('mayStandFor(id, await messages()'), 'named from the same conversation');
  assert.ok(recallHook.includes('const agentId = (e as { agentId?: string | undefined }).agentId;'), "recall, the subagent told by the event's own agentId");
  // What is put back takes along what the kept parts among it name, through earlier parts (#73).
  const restoreForAt = hooks.indexOf('async function restoreFor(');
  assert.ok(hooks.slice(restoreForAt, hooks.indexOf('\n}\n', restoreForAt)).includes('restoreThroughParts(filesOf($), listOf($), execOf($), store.read, ids, parts)'), 'through the parts');
  const putBack = recalled.indexOf('restoreFor($, store, new Set([id]))');
  assert.ok(recalledAt > 0 && putBack > 0 && putBack < recalled.lastIndexOf('recall(filesOf($), store.read, id)'), 'recall, put back first');
  const findHook = hooks.slice(hooks.indexOf(hookOn('tool.call', FIND_TOOL)), hooks.indexOf("on('session.compact'"));
  assert.ok(findHook.indexOf('restoreFor($, store, ticketIds(messages), partIds(messages))') < findHook.indexOf('await find('), 'find, first');
  const attempt = hooks.slice(hooks.indexOf('async function attempt('), hooks.indexOf('async function summarizeKeeping('));
  assert.ok(attempt.indexOf('restoreFor($, store, ticketIds(messages), partIds(messages))') < attempt.indexOf('await compact('), 'the compaction, first');
  // Both found, in that order: an index of -1 would pass a bare comparison without either being there.
  const madePrivate = attempt.indexOf('await privateOf($, place)');
  assert.ok(madePrivate > 0 && madePrivate < attempt.indexOf('noteRootOf('), 'the place recorded once private');
});

test('a compaction imports nothing that sends: compact.ts does not reach ask.ts', () => {
  assert.ok(!compaction.includes("from './ask.ts'"));
  assert.ok(!compaction.includes('http'));
});

test('a compaction computed ahead is skipped, run through the hook itself, before anything of the host is touched', async () => {
  const found = await registered<undefined>('session.compact');
  assert.equal(found.length, 1);
  // Registered with no matcher: the handler stands where a matcher would.
  const compacting = found[0]?.matcher as (...args: unknown[]) => Promise<unknown>;
  // Every noun of the host the handler reads is recorded.
  const touched: string[] = [];
  const $ = new Proxy({}, { get: (_, noun) => void touched.push(String(noun)) });
  const handed: unknown[] = [];
  const next = async (e: unknown) => (handed.push(e), { passed: true });
  assert.deepEqual(await compacting($, { trigger: 'precompute', messages: [] }, next), { skip: `${PLUGIN_NAME} computes nothing ahead of a compaction` });
  assert.deepEqual(handed, []);
  assert.deepEqual(touched, [], 'nothing of the host was read');
});

test("every way a conversation reaches the built-in summary keeps it first: a subagent's too, through its own step (ADR 0026)", () => {
  const handler = hooks.slice(hooks.indexOf("on('session.compact'"));
  const carrying = hooks.slice(hooks.indexOf('async function carryOut('), hooks.indexOf('type WithTools'));
  assert.deepEqual([...handler.matchAll(/next\(e\)/g)].length, 0, 'nothing is handed straight on');
  assert.ok(handler.includes("if (before.step === 'subagent') return summarizeSubagent($, e, next, options);"), 'a subagent, through its own step');
  const subagent = hooks.slice(hooks.indexOf('async function summarizeSubagent('), hooks.indexOf('async function cutKeeping('));
  assert.ok(subagent.includes("return keepThenSummarize(storingFilesOf($), keep, sayIt, () => next(e), (why) => ({ skip: why }), 'summarize');"), 'kept first, and summarized where a write is refused');
  assert.ok(subagent.includes("await $.session.messages({ as: 'api', agentId: e.agentId })"), "the subagent's own conversation, with its blocks");
  assert.ok(subagent.includes('const sayIt = (text: string) => say($, `subagent ${String(e.agentId)}: ${text}`, false);'), 'said in the transcript, with no notice, naming which subagent');
  // As before the main conversation's summary: the place its transcript is in recorded, what it names put back from the trash.
  const madePrivate = subagent.indexOf('await privateOf($, store, sayIt)');
  assert.ok(madePrivate > 0 && subagent.indexOf('await noteRootOf($, store, options);') > madePrivate, 'recorded once private');
  assert.ok(subagent.includes('await restoreFor($, store, ticketIds(messages), partIds(messages));'), 'put back first');
  assert.ok(!/\bnext\(/.test(carrying), 'no step is handed on but through summarizeKeeping, which keeps first');
  assert.ok(handler.includes('result = await summarizeKeeping($, e, next, tried.keep);'), 'why the compaction did not run');
  // Whatever the step, the newest ticket of the conversation handed back, else of the one handed in, is noted after (ADR 0027).
  assert.ok(handler.includes("const standing = 'messages' in result && Array.isArray(result.messages) ? result.messages : e.messages;\n    await noteWitnessOf($, newestOf(standing as readonly Message[], e.messages as readonly Message[]), options);\n    return result;"), 'the witness, after, this compaction\'s tickets first');
  assert.ok(
    carrying.includes("return step.of === 'given'\n        ? summarizeKeeping($, e, next, { store, messages: e.messages as readonly Message[] })"),
    'nothing moved out: kept as handed in, where the step says so',
  );
  assert.ok(carrying.includes(': summarizeKeeping($, { ...e, messages: outcome.messages }, next, { store, messages: outcome.messages });'), 'too much left: what is left');
  // The line is said before the summary runs, as it was said before a hand-over.
  const summarizing = carrying.slice(carrying.indexOf("case 'summarize':"));
  assert.ok(summarizing.startsWith("case 'summarize':\n      say($, step.line);\n"), 'said first');
  // The hook chooses no step: every branch on what the compaction came to is src/flow.ts's.
  assert.ok(!/\boutcome\.(enough|report)\b/.test(handler) && !handler.includes('decide(') && !handler.includes('leftUndone('), 'nothing decided in the handler');
  assert.ok(!/\bif \(/.test(carrying), 'and nothing chosen in carrying a step out but by the step');
  assert.ok(hooks.includes('asSent = messagesFromApi(api) ?? messages;'), 'a conversation that is not rebuilt is kept from its blocks, or as handed');
  assert.ok(hooks.includes('return { why, keep: { store, messages: asSent } };'), 'when it cannot be rebuilt');
  assert.ok(hooks.includes('if (outcome.abandoned !== undefined) return { why: outcome.abandoned, keep: { store, messages: asSent } };'), 'when a result that holds an image could not be moved out');
  assert.ok(hooks.includes("keep: store === null ? { unkept: 'the place to keep it in could not be read' } : { store, messages: asSent }"), 'a failure once the place is known still keeps it');
});

test('a clean-up keeps what kept parts name: it collects against the ids followed through them, and stops when they cannot be read', () => {
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('type HandedOver'));
  assert.ok(collecting.includes('const named = await namedThroughParts(files, dirs, live.ids, inTrash);'), 'followed');
  // What is named and in the trash goes back before the parts are followed: a part in the trash is not known for one.
  const back = collecting.indexOf('const inTrash = await putBackNamed(files, list, execOf($), dirs, live.ids);');
  assert.ok(back > 0 && back < collecting.indexOf('namedThroughParts('), 'put back first');
  assert.ok(collecting.slice(back, collecting.indexOf('namedThroughParts(')).includes("if ('stop' in inTrash) {"), 'and stopped where the trash cannot be read');
  assert.ok(collecting.includes("if ('stop' in named) {"), 'stops');
  assert.ok(collecting.includes('collect(list, execOf($), dir, named, now)'), 'collected against them');
  assert.ok(!collecting.includes('collect(list, execOf($), dir, live.ids, now)'), 'not against the transcripts alone');
});

test('stored results are written through mv where it starts, the reason a write failed is said, and a summary can be skipped', () => {
  assert.ok(hooks.includes('return { files: storingFilesOf($), now: () => Date.now() };'), 'the compaction writes through it');
  assert.ok(hooks.includes('return keepThenSummarize(storingFilesOf($), where,'), 'keeping the conversation too');
  assert.ok(hooks.includes("(why) => ({ skip: why })"), 'a skip is what the hook returns');
  assert.ok(compaction.includes("`; could not write: ${report.writeErrors.join(', ')}`"), 'the reason is said');
  // How mv is run and what a rename checks is src/commands.ts's, run in test/commands.test.ts; the hook hands it the host's calls.
  const storing = hooks.slice(hooks.indexOf('function storingFilesOf('), hooks.indexOf('function runOf('));
  assert.ok(storing.includes('return { ...filesOf($), move: moverOf(runOf($), (path) => $.fs.stat(path)) };'));
  const running = hooks.slice(hooks.indexOf('function runOf('), hooks.indexOf('function listOf('));
  assert.ok(running.includes('$.process.run(argv, { timeoutMs: 10_000 })'), 'each command within ten seconds, by the vector src/commands.ts builds');
});

test("a compaction is told what is not the conversation from Claude Code's breakdown, and the line comes from src/", () => {
  assert.ok(hooks.includes('const count = countFrom(context?.breakdown, tokens, api, messages);'), 'count: the thinking from the blocks, the density over the messages the hook was handed');
  assert.ok(hooks.includes('        tokens: inUse,\n        count,\n        window: windowFrom(context, FALLBACK_WINDOW),'), 'and the compaction is handed it');
  assert.ok(!hooks.includes('function summary('), 'no line of its own');
  // Every line a compaction shows is src/'s: src/flow.ts writes those of each step (test/flow.test.ts), and the line of
  // a cut is src/cut.ts's, written here only because it names how many parts were kept, which the hook learns.
  assert.ok(!hooks.includes('reportLine('), 'no line of a step is written here');
  assert.equal(hooks.split('cutLine(').length - 1, 1, 'the line of a cut that was made');
  assert.equal(hooks.split('say($, step.line);').length - 1, 2, 'the line of a step is said as src/flow.ts wrote it: handed back, or handed over');
});

test('a conversation too full, or with nothing to move out, is cut in place of a summary where src/ says so, and handed over as before where it does not (ADR 0019)', () => {
  // Whether, and where, is src/flow.ts's and src/cut.ts's (test/flow.test.ts). The hook hands over what it measured, as it measured it:
  // the trigger and the instructions as Claude Code gives them, what the compaction rebuilt and estimated, and how it counted.
  const handler = hooks.slice(hooks.indexOf("on('session.compact'"));
  assert.ok(
    handler.includes(
      'const step = nextStep({\n        trigger: e.trigger,\n        instructions: e.instructions,\n        outcome: tried.outcome,\n        inUse: tried.inUse,\n' +
        '        given: tried.given,\n        maxAfterPercent: tried.maxAfterPercent,\n        count: tried.count,\n        keepTokens: tried.keepTokens,\n      });',
    ),
  );
  // Handed back only where the step says so: as rebuilt, or cut. A part that could not be written goes on to the hand-over the step names.
  const carrying = hooks.slice(hooks.indexOf('async function carryOut('), hooks.indexOf('type WithTools'));
  assert.ok(carrying.includes("case 'back':\n      say($, step.line);\n      return { messages: outcome.messages };"), 'the rebuilt messages, no handle');
  assert.ok(carrying.includes('const cut = await cutKeeping($, tried, step.after, step.at, step.over);'), 'cut where the step says');
  assert.ok(carrying.includes('return cut ?? carryOut($, e, next, tried, step.otherwise);'), 'or, when nothing could be cut, what the step says instead');
  // What is cut is what the compaction rebuilt, never the messages the hook was handed, which carry Claude Code's handles.
  const keeping = hooks.slice(hooks.indexOf('async function cutKeeping('), hooks.indexOf('async function carryOut('));
  assert.ok(
    keeping.includes('await keepOldest(storingFilesOf($), tried.store, { messages: outcome.messages, tokens: outcome.report.tokensAfter, count: tried.count }, after, at);'),
    'kept through the files a stored result is written through, in the place results are written to and read from',
  );
  assert.ok(keeping.includes("if ('failed' in cut) return null;"), 'nothing cut when a part could not be written');
  assert.ok(keeping.includes('return { messages: cut.messages };'));
  assert.ok(!/\be\.messages/.test(keeping) && !keeping.includes('next('), 'and calls no summary');
  // How far a cut goes is no setting of its own: the size `compact()` moved results out to reach, as it worked it out.
  assert.ok(compaction.includes('const target = Math.min((input.window * config.targetPercent) / 100, before / 2);'));
  assert.ok(!hooks.includes('cutToPercent') && !hooks.includes("options['cutTo"), 'nothing of it is read from the options');
  assert.ok(hooks.includes('keepTokens: config.keepTokens,'));
  // What `find` says of itself speaks of parts kept either way, and its sentences stand apart as they did.
  assert.ok(hooks.includes("moved out of this conversation and the parts of it that were ` +\n          'kept, the one a question is about, and returns it unchanged. Ask in words what the result contains or is about;"));
  // The line names the messages kept by their place in the conversation: from behind what stays in front, up to the cut.
  assert.ok(keeping.includes('say($, cutLine(report, { first: after + 1, last: at, of: outcome.messages.length, parts: cut.parts, over }));'));
});

test('a /compact left undone is decided in src/: by who asked, with what, what Claude Code says is in use, and what could have left (ADR 0015)', () => {
  // Whether it is left undone, and the line, are src/flow.ts's (test/flow.test.ts), from the figure of what was in use
  // and not the size a report estimates: the hook hands it `tried.inUse`.
  assert.ok(hooks.includes('        inUse: tried.inUse,\n        given: tried.given,'));
  // What was in use is Claude Code's own figure, thinking included, made up from characters only when it gives none; the compaction is handed the same.
  assert.ok(hooks.includes("const given = typeof tokens === 'number' && tokens > 0;"));
  assert.ok(hooks.includes('const inUse = given ? tokens : Math.ceil(charsOf(messages) / CHARS_PER_TOKEN) + media.images * IMAGE_TOKENS;'));
  assert.ok(hooks.includes('tokens: inUse,'));
  assert.ok(hooks.includes('      inUse,\n      given,\n      maxAfterPercent: config.maxAfterPercent,'), 'and they are what the hook decides from');
  // A skip is said once: as the reason Claude Code shows, with no line of the plugin's beside it, and nothing kept, cut or summarized.
  const carrying = hooks.slice(hooks.indexOf('async function carryOut('), hooks.indexOf('type WithTools'));
  assert.ok(carrying.includes("case 'skip':\n      return { skip: step.why };"));
  // Two skips in all: a compaction computed ahead, and a /compact left undone.
  const handler = hooks.slice(hooks.indexOf("on('session.compact'"));
  assert.equal(handler.match(/return \{ skip: /g)?.length, 1);
  assert.equal(carrying.match(/return \{ skip: /g)?.length, 1);
});

test('a result that holds an image is told from the blocks, handed to the compaction, and comes back from recall as an image', () => {
  assert.ok(hooks.includes('const media = mediaIn(api);'), 'read from the conversation with its blocks');
  assert.ok(hooks.includes('media: media.results,'), 'handed to the compaction');
  assert.ok(hooks.includes(': Math.ceil(charsOf(messages) / CHARS_PER_TOKEN) + media.images * IMAGE_TOKENS;'), 'a size made up from characters counts the images too, since the compaction takes them off');
  assert.ok(hooks.includes('whyNotRebuilt(messages, api) ?? (media.why === null ? null :'), 'what cannot be carried stops the rebuild');
  const handler = hooks.slice(hooks.indexOf(hookOn('tool.call', RECALL_TOOL)), hooks.indexOf(hookOn('tool.call', FIND_TOOL)));
  assert.ok(handler.includes('return { result: found.parts === undefined ? found.text : blocksOf(found.parts) };'), 'text as before, and what holds an image as its blocks (src/media.ts decides their form)');
});

test('recall names find in its description when find is registered, and only then', async () => {
  // Claude Code takes up the tools a plugin registers only where the hook file itself calls $.tool.register:
  // moved to another module, neither recall nor find was there (measured on 2.1.288).
  assert.equal(hooks.split('await $.tool.register({').length - 1, 2);
  assert.ok(hooks.includes('name: FIND,') && hooks.includes('name: RECALL,') && hooks.includes('description: recallDescription(withFind),'));
  // Loaded by its URL, so that the type check of the tests does not take in the host's types the hook is written against.
  const { registerTools } = (await import(new URL('../hooks/move-out.ts', import.meta.url).href)) as {
    registerTools: (
      $: { tool: { register: (tool: { name: string; description: string }) => Promise<unknown> }; ui: { log: (text: string) => void; toast: (text: string) => void } },
      provider: Provider | null | { error: string } | undefined,
    ) => Promise<void>;
  };
  const provider = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as unknown as Provider;
  const run = async (given: Parameters<typeof registerTools>[1], failFind = false) => {
    const registered: { name: string; description: string }[] = [];
    const said: string[] = [];
    await registerTools(
      {
        tool: {
          register: async (tool) => {
            if (failFind && tool.name === 'find') throw new Error('refused');
            registered.push({ name: tool.name, description: tool.description });
          },
        },
        ui: { log: (text) => said.push(text), toast: () => {} },
      },
      given,
    );
    return { names: registered.map((one) => one.name), recall: registered.find((one) => one.name === 'recall')?.description ?? '', said };
  };
  // A key: find first, then recall, which names it by the name the agent loads it by.
  const keyed = await run(provider);
  assert.deepEqual(keyed.names, ['find', 'recall']);
  assert.ok(keyed.recall.endsWith(` ${FIND_IN_RECALL}`));
  assert.ok(FIND_IN_RECALL.includes(FIND_TOOL));
  // No key, a key that may not be used, a lookup that failed, find refused: recall says nothing of find.
  for (const [what, outcome] of [
    ['no key', await run(null)],
    ['a key that may not be used', await run({ error: 'set the key in your user settings' })],
    ['looking for the key failed', await run(undefined)],
    ['find could not be registered', await run(provider, true)],
  ] as const) {
    assert.deepEqual(outcome.names, ['recall'], what);
    assert.equal(outcome.recall, recallDescription(false), what);
    assert.ok(!outcome.recall.includes('find'), what);
  }
  assert.match((await run({ error: 'no' })).said.join('\n'), /: the find tool is not registered: no$/m);
  assert.match((await run(provider, true)).said.join('\n'), /: the find tool could not be registered: refused$/m);
});

test('/lossless-store is a command, not a tool: registered at the start, answered from storeOf over every place read, with nothing of a result (ADR 0016)', () => {
  assert.ok(hooks.includes(`on('command.run', { command: '${STORE_COMMAND}' }`), 'the matcher is spelled as STORE_COMMAND');
  const start = hooks.slice(hooks.indexOf("on('session.start'"), hooks.indexOf("on('command.run'"));
  assert.ok(start.includes('await $.command.register({\n        name: STORE_COMMAND,'), 'registered at the start');
  assert.ok(start.includes('immediate: true'), 'answers mid-turn too');
  // The tools the agent is offered are the two they were.
  assert.equal(hooks.split('$.tool.register(').length - 1, 2);
  const handler = hooks.slice(hooks.indexOf("on('command.run'"), hooks.indexOf(hookOn('tool.call', RECALL_TOOL)));
  assert.ok(handler.includes('const store = await storeOf($, options);'), 'the place as the repository cannot decide it');
  assert.ok(handler.includes('for (const dir of store.read)'), 'every place read');
  // A place is counted as the clean-up takes it: a plain directory, not a link.
  assert.ok(handler.includes('const there = await plainDirsOf($, store);'), 'the places the clean-up reads');
  assert.ok(handler.includes('for (const dir of store.read) counted.push(there.includes(dir) ? await countStore(files, list, dir, now) : skipped(dir));'));
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('type HandedOver'));
  assert.ok(collecting.includes('const dirs = await plainDirsOf($, store);'), 'the same places as the clean-up');
  const plain = hooks.slice(hooks.indexOf('async function plainDirsOf('), hooks.indexOf('async function collectOnce('));
  assert.ok(plain.includes("if (found && found.kind === 'dir' && found.isLink !== true) dirs.push(dir);"));
  // What an error says may name a path: it is not shown.
  assert.ok(!handler.includes('error.message'));
  assert.ok(handler.includes('const gc = await stateIn(files, list, there);'));
  assert.ok(handler.includes('return { text: storeReport(counted, gc, now, set) };'));
  // What answers it reads nothing itself: no recall, no read of a file.
  assert.ok(!/recall\(|\$\.fs\.read\(|files\.read\(/.test(handler));
});

test('/lossless-status is a command, registered at the start, that opens no place results are kept in and hands statusReport no key variable (#108)', async () => {
  assert.ok(hooks.includes(`on('command.run', { command: '${STATUS_COMMAND}' }`), 'the matcher is spelled as STATUS_COMMAND');
  const start = hooks.slice(hooks.indexOf("on('session.start'"), hooks.indexOf("on('command.run'"));
  assert.ok(start.includes('await $.command.register({\n        name: STATUS_COMMAND,'), 'registered at the start');
  assert.ok(start.includes('findAtStart = await registerTools($, provider);'), 'what became of find is kept for it');
  // Loaded again for a change of the settings, with no session.start after: the record of an earlier start is dropped.
  const registering = hooks.slice(hooks.indexOf('export const register: Register'), hooks.indexOf("on('session.start'"));
  assert.ok(registering.includes('findAtStart = undefined;'), 'forgotten when register runs again');
  const at = hooks.indexOf(`on('command.run', { command: '${STATUS_COMMAND}' }`);
  const handler = hooks.slice(at, hooks.indexOf('\n  on(', at + 1));
  // Nothing of the store: no place, no stored result, no index entry, no file of the host's.
  assert.ok(!/storeOf\(|recall\(|recalled\(|filesOf\(|listOf\(|plainDirsOf\(|\$\.fs\./.test(handler), handler);
  // Of the key variables, only whether each holds something.
  assert.ok(handler.includes("keysIn: { TYPESAFE_API_KEY: (env.TYPESAFE_API_KEY ?? '').trim() !== '', CLOUDFLARE_API_TOKEN: (env.CLOUDFLARE_API_TOKEN ?? '').trim() !== '' },"));
  assert.ok(!/env\.(TYPESAFE_API_KEY|CLOUDFLARE_API_TOKEN)(?! \?\? '')/.test(handler), 'no key variable is handed on');
  assert.ok(handler.includes('now: findFrom(now),') && handler.includes('atStart: findAtStart,'), 'find as registered, and as the settings give it now');
  assert.ok(handler.includes('claudeCode = (await $.session.version()).version;'));
  assert.ok(!handler.includes('error.message'), 'what an error says is not shown');

  // What registration came to is what the command is told of find.
  const { registerTools } = (await import(new URL('../hooks/move-out.ts', import.meta.url).href)) as {
    registerTools: (
      $: { tool: { register: (tool: { name: string }) => Promise<unknown> }; ui: { log: (text: string) => void; toast: (text: string) => void } },
      provider: Provider | null | { error: string } | undefined,
    ) => Promise<unknown>;
  };
  const host = (refuseFind: boolean) => ({
    tool: {
      register: async (tool: { name: string }) => {
        if (refuseFind && tool.name === 'find') throw new Error('refused by the host');
      },
    },
    ui: { log: () => {}, toast: () => {} },
  });
  const provider = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as unknown as Provider;
  assert.deepEqual(await registerTools(host(false), provider), { registered: true, kind: 'typesafe' });
  assert.deepEqual(await registerTools(host(true), provider), { registered: false, why: 'Claude Code did not take it, as a line at the start of the session said' });
  assert.deepEqual(await registerTools(host(false), null), { registered: false, why: 'no key' });
});

test('a clean-up that stops records the kind, never its words: from where it stopped, or as unexpected; one that ends clears it', () => {
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('type HandedOver'));
  assert.ok(collecting.includes('const record = await noteTried(files, store.write, state, now);'));
  assert.ok(collecting.includes('await stoppedAs(files, store.write, record, live.kind);'));
  assert.ok(collecting.includes('await stoppedAs(files, store.write, record, named.kind);'));
  assert.ok(collecting.includes('stopped ??= done.kind;'));
  assert.ok(collecting.includes('if (stopped === null) await noteRun(files, store.write, now);\n    else await stoppedAs(files, store.write, record, stopped);'));
  assert.ok(collecting.includes("if (tried !== null) await stoppedAs(filesOf($), tried.dir, tried.record, 'unexpected');"));
  // The words are said, and only said.
  assert.ok(collecting.includes('await stoppedAs(files, store.write, record, inTrash.kind);'));
  // A conversation whose noted ticket the search did not find stops it too, after the search and before anything goes back (ADR 0027).
  assert.ok(collecting.includes('await stoppedAs(files, store.write, record, unseen.kind);'));
  const witnessed = collecting.indexOf('const unseen = await checkWitnesses(');
  assert.ok(witnessed > collecting.indexOf('const live = await liveIds(') && witnessed < collecting.indexOf('const inTrash = await putBackNamed('), 'looked at after the search, before the trash');
  assert.equal(collecting.split('stoppedAs(').length - 1, 7, 'six places it stops and the declaration');
  assert.ok(!/noteStopped\([^)]*\.stop\b/.test(collecting));
});

test('a session says the clean-up is late right after its record is read, whether it then tries or not, once a process (ADR 0016)', () => {
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('type HandedOver'));
  const read = collecting.indexOf('const state = await stateIn(files, list, dirs);');
  const late = collecting.indexOf('const since = lateSince(state, oldest, now);');
  const decided = collecting.indexOf('if (whyNotNow(state, now) !== null) return;');
  assert.ok(read > 0 && read < late && late < decided, 'after the record is read, before it is decided whether to try');
  // The oldest result only where no clean-up ended and no place is recorded.
  assert.ok(collecting.includes('const oldest = state.lastRun === 0 && state.roots.length === 0 ? await oldestResult(list, dirs) : null;'));
  assert.ok(collecting.includes('say($, lateLine(since, now, state.roots.length === 0));'));
  // Once a process.
  assert.ok(hooks.includes('let toldLate = false;'));
  // Claimed before the first await, so that a second session.start right after does not say it again.
  const claimed = collecting.indexOf('const tell = !toldLate;\n  toldLate = true;');
  assert.ok(claimed > 0 && claimed < collecting.indexOf('await '), 'before anything is awaited');
  assert.ok(collecting.includes('if (tell) {'));
  // Given back unless it was said: a later session.start in the same process, past the 14 days, says it.
  assert.ok(collecting.includes('say($, lateLine(since, now, state.roots.length === 0));\n        said = true;'));
  assert.ok(collecting.includes('} finally {\n    if (tell && !said) toldLate = false;\n  }'));
  assert.equal(hooks.split('lateLine(').length - 1, 1, 'said in one place');
});

test('every tool call is looked at for a ticket the conversation knows, and refused for one; the plugin\'s own tools, those that only read, and an input with no ticket go straight on (ADR 0020)', async () => {
  // One hook with no matcher: every tool, in a subagent too. Registered before recall's and find's, so that it stands outside them.
  const { register } = (await import(new URL('../hooks/move-out.ts', import.meta.url).href)) as {
    register: (on: (name: string, ...rest: unknown[]) => void, options: Record<string, unknown>) => void;
  };
  type Answer = { deny?: string; result?: unknown };
  type Call = ($: unknown, e: Record<string, unknown>, next: (e: unknown) => Promise<Answer>) => Promise<Answer>;
  const calls: unknown[][] = [];
  register((name, ...rest) => {
    if (name === 'tool.call') calls.push(rest);
  }, {});
  assert.equal(typeof calls[0]?.[0], 'function', 'the first tool.call hook has no matcher');
  assert.ok(calls.slice(1).every((rest) => typeof rest[0] === 'object'), 'every other one names its tool');
  const guard = calls[0]![0] as Call;

  const id = 'c'.repeat(64);
  const ticket = ticketText({ tool: 'Bash', bytes: 4000, id });
  const conversation = [{ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: ticket, isError: false }] }];
  let read = 0;
  // A host whose store cannot be told, as where HOME is unset: what is known is what the conversation holds.
  const host = {
    env: { get: async () => undefined },
    settings: { read: async () => ({}) },
    session: {
      messages: async () => {
        read += 1;
        return conversation;
      },
    },
  };
  const ran = async (e: Record<string, unknown>) => {
    let went = false;
    const answer = await guard(host, e, async () => {
      went = true;
      return { result: 'ran' };
    });
    return { went, answer };
  };

  // Refused, whatever the tool: what the model is told is the fixed refusal, and the call does not run.
  for (const e of [
    { tool: 'Write', tool_use_id: 'x', file_path: '/w/a.ts', content: ticket },
    { tool: 'Bash', tool_use_id: 'x', command: `cat > a.ts <<'EOF'\n${ticket}\nEOF` },
    { tool: 'mcp__notion__update', tool_use_id: 'x', content: `  // ${ticket}` },
    { tool: 'Edit', tool_use_id: 'x', agentId: 'agent-1', file_path: '/w/a.ts', old_string: 'a', new_string: ticket },
  ]) {
    const { went, answer } = await ran(e);
    assert.equal(went, false, String(e['tool']));
    assert.equal(answer.deny, refusal(id), String(e['tool']));
  }
  // Let through: an id nothing knows, the plugin's own tools, the tools known only to read; and with no ticket, nothing is read.
  for (const e of [
    { tool: 'Write', tool_use_id: 'x', file_path: '/w/a.ts', content: ticket.replace(id, 'd'.repeat(64)) },
    { tool: RECALL_TOOL, tool_use_id: 'x', id },
    { tool: 'Grep', tool_use_id: 'x', pattern: ticket },
  ]) {
    assert.deepEqual(await ran(e), { went: true, answer: { result: 'ran' } }, String(e['tool']));
  }
  read = 0;
  assert.deepEqual(await ran({ tool: 'Bash', tool_use_id: 'x', command: 'npm test' }), { went: true, answer: { result: 'ran' } });
  assert.equal(read, 0, 'an input with no ticket reads nothing');
});

test('what the guard counts as the conversation\'s is what the plugin put there: not the call being looked at, nor a ticket\'s shape in a file the agent wrote (ADR 0020)', async () => {
  const { register } = (await import(new URL('../hooks/move-out.ts', import.meta.url).href)) as {
    register: (on: (name: string, ...rest: unknown[]) => void, options: Record<string, unknown>) => void;
  };
  type Answer = { deny?: string; result?: unknown };
  type Call = ($: unknown, e: Record<string, unknown>, next: (e: unknown) => Promise<Answer>) => Promise<Answer>;
  let guard: Call | undefined;
  register((name, ...rest) => {
    if (name === 'tool.call' && guard === undefined) guard = rest[0] as Call;
  }, {});

  const example = ticketText({ tool: 'Read', bytes: 10, id: 'e'.repeat(64) });
  const doc = `# Tickets\n\nA ticket reads:\n\n    ${example}\n`;
  // The call being looked at stands in the conversation already, as Claude Code may hand it, and a file the agent wrote
  // before holds the same example: the id is held nowhere, so the call goes through, and so does the next one.
  const conversation = [
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'w1', tool: 'Write', input: { file_path: '/w/README.md', content: doc } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'w1', text: 'File created successfully.', isError: false }] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'e1', tool: 'Edit', input: { file_path: '/w/README.md', old_string: 'reads', new_string: `reads ${example}` } }] },
  ];
  const host = { env: { get: async () => undefined }, settings: { read: async () => ({}) }, session: { messages: async () => conversation } };
  const answered = await guard!(host, { tool: 'Edit', tool_use_id: 'e1', file_path: '/w/README.md', old_string: 'reads', new_string: `reads ${example}` }, async () => ({ result: 'ran' }));
  assert.deepEqual(answered, { result: 'ran' });
});

test('a /compact is by hand, reaching into the newest calls, only when typed without instructions (ADR 0023)', () => {
  const hooks = readFileSync(new URL('../hooks/move-out.ts', import.meta.url), 'utf8');
  assert.ok(hooks.includes("byHand: e.trigger === 'manual' && (e.instructions ?? '').trim() === '',"));
  assert.equal(hooks.split('byHand:').length - 1, 1, 'set in one place');
});

test('a number setting not used as it was set is said at the start of a session, each line once a process and a setting changed anew, in the words src/flow.ts gives (#99)', () => {
  const start = hooks.slice(hooks.indexOf("on('session.start'"), hooks.indexOf("on('command.run'"));
  const telling = 'for (const line of settingNotes(options)) {\n      if (toldSettings.has(line)) continue;\n      toldSettings.add(line);\n      say($, line);\n    }';
  assert.ok(start.includes(telling), 'said from settingNotes, each line once');
  // Before anything there can fail and be said instead.
  assert.ok(start.indexOf(telling) < start.indexOf('providerOf($, options)'), 'first');
  // Kept by the process, not by the register: a reload with the setting changed says the new line.
  assert.ok(hooks.includes('const toldSettings = new Set<string>();'));
  assert.equal(hooks.split('toldSettings.add(').length - 1, 1);
});

/** A host for the compaction hook: files in memory, mkdir, chmod, mv and rm as the store runs them, and a subagent's conversation. */
function compactionHost(files: MemoryFiles, conversation: unknown, options: { refuseWrites?: boolean } = {}) {
  const logged: string[] = [];
  const toasted: string[] = [];
  const read: unknown[] = [];
  const host = {
    env: { get: async (name: string) => (name === 'HOME' ? '/home/u' : undefined) },
    settings: { read: async () => ({}) },
    fs: {
      read: (path: string) => files.read(path),
      write: async (path: string, text: string) => {
        if (options.refuseWrites === true && path.includes('/lossless-compaction/')) throw enospc(path);
        return files.write(path, text);
      },
      stat: (path: string) => files.stat(path),
      list: (path: string) => files.list(path),
    },
    process: {
      run: async (argv: readonly string[]) => {
        const [program = '', ...args] = argv;
        const operands = args.filter((arg, at) => arg !== '--' && !arg.startsWith('-') && args[at - 1] !== '-m');
        if (program.endsWith('/mkdir')) {
          for (const dir of operands) for (let cut = dir.length; cut > 0; cut = dir.lastIndexOf('/', cut - 1)) files.dirs.add(dir.slice(0, cut));
          return { exitCode: 0, stdout: '' };
        }
        if (program.endsWith('/chmod')) return { exitCode: 0, stdout: '' };
        if (program.endsWith('/mv')) {
          const [from = '', to = ''] = operands;
          const text = files.files.get(from);
          if (text === undefined) return { exitCode: 1, stdout: '' };
          files.files.set(to, text);
          files.files.delete(from);
          return { exitCode: 0, stdout: '' };
        }
        if (program.endsWith('/rm')) {
          for (const path of operands) files.files.delete(path);
          return { exitCode: 0, stdout: '' };
        }
        return { exitCode: 127, stdout: '' };
      },
    },
    session: {
      id: async () => 'sess-1',
      messages: async (args?: unknown) => {
        read.push(args);
        return conversation;
      },
    },
    ui: { log: (text: string) => void logged.push(text), toast: (text: string) => void toasted.push(text) },
  };
  return { host, logged, toasted, read };
}

/** A subagent's conversation as Claude Code gives it with its blocks: a request, a call and what it returned. */
const SUBAGENT_API = [
  { role: 'user', content: [{ type: 'text', text: 'Find where the limit is set.' }] },
  { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'grep -rn limit src' } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'src/limit.ts:3: export const LIMIT = 40;\n'.repeat(40) }] },
];

test("a subagent's compaction keeps its conversation, hands it to the built-in summary once, puts the ticket of what was kept after the summary and says so in the transcript alone (ADR 0026)", async () => {
  const [found] = await registered<undefined>('session.compact');
  const compacting = found?.matcher as (...args: unknown[]) => Promise<{ messages?: { role: string; text: string }[]; skip?: string }>;
  const files = new MemoryFiles();
  // The session's transcript, where the place it is in can be recorded from.
  await files.write('/home/u/.claude/projects/-w/sess-1.jsonl', '');
  const { host, logged, toasted, read } = compactionHost(files, SUBAGENT_API);
  const handed: unknown[] = [];
  const summary = { role: 'user', text: 'Summary: the limit is in src/limit.ts.', toolUses: [] };
  const e = { trigger: 'auto', agentId: 'agent-1', messages: [] };
  const answer = await compacting(host, e, async (given: unknown) => (handed.push(given), { messages: [summary] }));
  assert.deepEqual(handed, [e], 'summarized once, as it came');
  assert.deepEqual(read, [{ as: 'api', agentId: 'agent-1' }], "the subagent's own conversation, with its blocks");
  // The summary stands first, the ticket of the kept conversation right after it.
  assert.equal(answer.messages?.[0], summary);
  assert.ok(answer.messages?.[1]?.text.startsWith(KEPT), JSON.stringify(answer.messages?.[1]));
  // What was kept reads back: its part holds the request.
  const id = /id ([0-9a-f]{64})/.exec(answer.messages?.[1]?.text ?? '')?.[1] ?? '';
  const part = files.files.get(`/home/u/.claude/lossless-compaction/blobs/${id}.txt`) ?? '';
  assert.ok(part.includes('Find where the limit is set.'), 'the part holds the conversation');
  assert.deepEqual(logged, [`${PLUGIN_NAME}: subagent agent-1: kept the conversation in 1 part before the built-in summary`]);
  assert.deepEqual(toasted, [], 'no notice: subagents run side by side');
  // The place the transcript is in is recorded, so that a clean-up reads what names the part.
  const roots = [...files.files.keys()].filter((path) => path.startsWith('/home/u/.claude/lossless-compaction/roots/'));
  assert.equal(roots.length, 1);
  assert.match(files.files.get(roots[0] as string) ?? '', /\/home\/u\/\.claude\/projects/);
});

test("a subagent's compaction runs the summary where the disk refuses the write, says nothing was kept, and never that the summary did not run (ADR 0026)", async () => {
  const [found] = await registered<undefined>('session.compact');
  const compacting = found?.matcher as (...args: unknown[]) => Promise<unknown>;
  const { host, logged } = compactionHost(new MemoryFiles(), SUBAGENT_API, { refuseWrites: true });
  let runs = 0;
  const summary = { messages: [{ role: 'user', text: 'Summary.', toolUses: [] }] };
  const answer = await compacting(host, { trigger: 'auto', agentId: 'agent-1', messages: [] }, async () => ((runs += 1), summary));
  assert.equal(runs, 1);
  assert.equal(answer, summary, 'as the built-in compaction made it');
  assert.deepEqual(logged, [`${PLUGIN_NAME}: subagent agent-1: nothing of the conversation is kept before the built-in summary: could not write: ENOSPC`]);
});
