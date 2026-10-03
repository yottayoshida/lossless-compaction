import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { Provider } from '../src/ask.ts';
import { changedLine, shownAgainLine } from '../src/changed.ts';
import { KEPT } from '../src/keep.ts';
import { FIND_IN_RECALL, recallDescription } from '../src/tools.ts';
import { FIND_TOOL, RECALL_TOOL, STORE_COMMAND } from '../src/store.ts';
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
  assert.ok(hooks.includes('const config: Config = {\n      store,'), 'the compaction is handed both places');
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
  // Each of recall, find, the compaction, the clean-up and /lossless-store takes the place from storeOf and gives up on its reason.
  const givingUp = hooks.split("if (typeof store === 'string')").length - 1;
  // The compaction calls it `place` until the place is known to be private (it keeps the conversation after that).
  assert.equal(givingUp + (hooks.split("if (typeof place === 'string')").length - 1), 5, 'five callers');
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('function numberIn('));
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
  // The id that was meant is told by the main conversation: a subagent's call is handed an empty one, and refused as before (#54).
  assert.ok(recallHook.includes('const found = await recallMeant('), 'recall, by the id that was meant');
  assert.ok(recallHook.includes('async () => (agentId === undefined ? ((await $.session.messages()) as readonly Message[]) : []),'), 'recall, the main conversation alone');
  assert.ok(recallHook.includes('const agentId = (e as { agentId?: string | undefined }).agentId;'), "recall, the subagent told by the event's own agentId");
  // What is put back takes along what the kept parts among it name, through earlier parts (#73).
  const restoreForAt = hooks.indexOf('async function restoreFor(');
  assert.ok(hooks.slice(restoreForAt, hooks.indexOf('\n}\n', restoreForAt)).includes('restoreThroughParts(filesOf($), listOf($), execOf($), store.read, ids, parts)'), 'through the parts');
  const putBack = recalled.indexOf('restoreFor($, store, new Set([id]))');
  assert.ok(recalledAt > 0 && putBack > 0 && putBack < recalled.lastIndexOf('recall(filesOf($), store.read, id)'), 'recall, put back first');
  const findHook = hooks.slice(hooks.indexOf(hookOn('tool.call', FIND_TOOL)), hooks.indexOf("on('session.compact'"));
  assert.ok(findHook.indexOf('restoreFor($, store, ticketIds(messages), partIds(messages))') < findHook.indexOf('await find('), 'find, first');
  const attempt = hooks.slice(hooks.indexOf('async function attempt('), hooks.indexOf('export const register'));
  assert.ok(attempt.indexOf('restoreFor($, store, ticketIds(messages), partIds(messages))') < attempt.indexOf('await compact('), 'the compaction, first');
  assert.ok(attempt.indexOf('await privateOf($, store)') < attempt.indexOf('noteRootOf('), 'the place recorded once private');
});

test('a compaction imports nothing that sends: compact.ts does not reach ask.ts', () => {
  assert.ok(!compaction.includes("from './ask.ts'"));
  assert.ok(!compaction.includes('http'));
});

test('every way the main conversation reaches the built-in summary keeps it first; only a subagent goes straight on', () => {
  const handler = hooks.slice(hooks.indexOf("on('session.compact'"));
  assert.deepEqual(handler.match(/return next\(e\)/g), ['return next(e)'], 'the subagent branch alone');
  assert.ok(handler.includes('if (e.agentId !== undefined) return next(e);'), 'and it is the subagent branch');
  assert.equal(handler.match(/return summarizeKeeping\(\$, /g)?.length, 3, 'the three branches that hand over');
  assert.ok(handler.includes('return summarizeKeeping($, e, next, tried.keep);'), 'why the compaction did not run');
  assert.ok(handler.includes("summarizeKeeping($, e, next, { store, messages: e.messages as readonly Message[] })"), 'nothing moved out');
  assert.ok(handler.includes('summarizeKeeping($, { ...e, messages: outcome.messages }, next, { store, messages: outcome.messages })'), 'too much left');
  assert.ok(hooks.includes('asSent = messagesFromApi(api) ?? messages;'), 'a conversation that is not rebuilt is kept from its blocks, or as handed');
  assert.ok(hooks.includes('return { why, keep: { store, messages: asSent } };'), 'when it cannot be rebuilt');
  assert.ok(hooks.includes('if (outcome.abandoned !== undefined) return { why: outcome.abandoned, keep: { store, messages: asSent } };'), 'when a result that holds an image could not be moved out');
  assert.ok(hooks.includes("keep: store === null ? { unkept: 'the place to keep it in could not be read' } : { store, messages: asSent }"), 'a failure once the place is known still keeps it');
});

test('a clean-up keeps what kept parts name: it collects against the ids followed through them, and stops when they cannot be read', () => {
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('function numberIn('));
  assert.ok(collecting.includes('const named = await namedThroughParts(files, dirs, live.ids);'), 'followed');
  assert.ok(collecting.includes("if ('stop' in named) {"), 'stops');
  assert.ok(collecting.includes('collect(list, execOf($), dir, named, now)'), 'collected against them');
  assert.ok(!collecting.includes('collect(list, execOf($), dir, live.ids, now)'), 'not against the transcripts alone');
});

test('stored results are written through mv where it starts, the reason a write failed is said, and a summary can be skipped', () => {
  assert.ok(hooks.includes('return { files: storingFilesOf($), now: () => Date.now() };'), 'the compaction writes through it');
  assert.ok(hooks.includes('return keepThenSummarize(storingFilesOf($), where,'), 'keeping the conversation too');
  assert.ok(hooks.includes("(why) => ({ skip: why })"), 'a skip is what the hook returns');
  assert.ok(compaction.includes("`; could not write: ${report.writeErrors.join(', ')}`"), 'the reason is said');
  const storing = hooks.slice(hooks.indexOf('function storingFilesOf('), hooks.indexOf('function runOf('));
  assert.ok(storing.includes("started('mv', ['-f', '--', from, to])"), 'mv -f --');
  assert.ok(storing.includes('$.process.run([`${place}/${program}`, ...args], { timeoutMs: 10_000 })'), 'from /bin, else /usr/bin, never through PATH');
  assert.ok(storing.includes("there.kind === 'file'"), 'what stands at the name after the move is a file');
  assert.ok(storing.includes("available: async () => (canMove ||= (await started('mv', [])) !== null),"), 'only that mv starts is remembered, never that it did not');
  assert.ok(hooks.includes('let canMove = false;'), 'and it starts out not known');
  assert.ok(storing.includes("started('mkdir', ['-p', '--', path])"), 'mkdir -p --');
  assert.ok(storing.includes("started('rm', ['-f', '--', path])"), 'rm -f --');
});

test("a compaction is told what is not the conversation from Claude Code's breakdown, and the line comes from src/", () => {
  assert.ok(hooks.includes('const count = countFrom(context?.breakdown, tokens, api, messages);'), 'count: the thinking from the blocks, the density over the messages the hook was handed');
  assert.ok(hooks.includes('        tokens: inUse,\n        count,\n        window: windowFrom(context, FALLBACK_WINDOW),'), 'and the compaction is handed it');
  assert.ok(!hooks.includes('function summary('), 'no line of its own');
  assert.equal(hooks.split('reportLine(outcome.report)').length - 1, 3, 'every line a compaction shows that moved results out or handed over');
  // Where the oldest messages are kept in place of a summary, the line is src/cut.ts's, around the same report.
  assert.equal(hooks.split('cutLine(').length - 1, 2, 'cut, or handed back as rebuilt');
});

test('a conversation too full, or with nothing to move out, is cut in place of a summary where src/ says so, and handed over as before where it does not (ADR 0019)', () => {
  const handler = hooks.slice(hooks.indexOf("on('session.compact'"));
  // The call, argument by argument: what the compaction rebuilt and what it estimated, how it counted, and what `/compact` was given.
  const call =
    'const decision = decide({ messages: outcome.messages, tokens: outcome.report.tokensAfter, count: tried.count, window: outcome.report.window, ' +
    'maxAfterPercent: tried.maxAfterPercent, cutTo: outcome.target, keepTokens: tried.keepTokens, instructions: e.instructions });';
  assert.ok(handler.includes(call), 'the call');
  assert.equal(handler.split('decide(').length - 1, 1, 'nowhere else');
  // After a compaction that did enough is handed back, and before either branch that hands over for the size.
  const decided = handler.indexOf(call);
  assert.ok(handler.indexOf('if (!nothing && outcome.enough) {') < decided, 'a compaction that did enough is not asked');
  assert.ok(decided < handler.indexOf('say($, `built-in compaction: nothing could be moved out'), 'before nothing to move out is handed over');
  assert.ok(decided < handler.indexOf('say($, `built-in compaction on what is left, too much is still in use'), 'before too much left is handed over');
  // Handed back only where the decision says so: as rebuilt, or cut. A part that could not be written falls through to the hand-over.
  const back = handler.slice(handler.indexOf("if (decision.hand === 'back') {"), handler.indexOf('if (nothing) {'));
  assert.ok(back.includes('if (decision.at === 0) {\n        say($, cutLine(outcome.report, null));\n        return { messages: outcome.messages };'), 'room once rebuilt: the rebuilt messages, no handle');
  assert.ok(back.includes('const cut = await cutKeeping($, tried, decision.after, decision.at, decision.over);\n      if (cut !== null) return cut;'), 'cut, or not');
  assert.ok(!back.includes('next(') && !back.includes('summarizeKeeping('), 'no summary in that branch');
  // What is cut is what the compaction rebuilt, never the messages the hook was handed, which carry Claude Code's handles.
  const keeping = hooks.slice(hooks.indexOf('async function cutKeeping('), hooks.indexOf('type WithTools'));
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
  const handler = hooks.slice(hooks.indexOf("on('session.compact'"));
  // The call, argument by argument: the trigger and the instructions as Claude Code hands them, the figure of what
  // was in use and not the size a report estimates, the window the compaction measured against, and the candidates.
  assert.ok(
    handler.includes(
      'if (nothing && leftUndone({ trigger: e.trigger, instructions: e.instructions, inUse: tried.inUse, window: outcome.report.window, maxAfterPercent: tried.maxAfterPercent, candidates: outcome.report.candidates })) {',
    ),
  );
  // What was in use is Claude Code's own figure, thinking included, made up from characters only when it gives none; the compaction is handed the same.
  assert.ok(hooks.includes("const given = typeof tokens === 'number' && tokens > 0;"));
  assert.ok(hooks.includes('const inUse = given ? tokens : Math.ceil(charsOf(messages) / CHARS_PER_TOKEN) + media.images * IMAGE_TOKENS;'));
  assert.ok(hooks.includes('tokens: inUse,'));
  assert.ok(hooks.includes('      inUse,\n      given,\n      maxAfterPercent: config.maxAfterPercent,'), 'and they are what the hook decides from');
  // Only where nothing was moved out, and before anything else is decided: nothing of the conversation is kept, cut or summarized.
  assert.ok(handler.includes('const nothing = outcome.report.moved === 0;'));
  const branch = handler.slice(handler.indexOf('const nothing = outcome.report.moved === 0;'), handler.indexOf('if (!nothing && outcome.enough) {'));
  assert.ok(branch.includes('leftUndone('));
  assert.ok(branch.indexOf('return { skip: ') > 0 && !branch.includes('decide(') && !branch.includes('summarizeKeeping('));
  assert.ok(handler.indexOf('return { skip: `${PLUGIN}: ${undoneLine(') < handler.indexOf('decide('), 'before a cut is decided');
  assert.equal(handler.split('leftUndone(').length - 1, 1, 'nowhere else');
  // The line names the figure only when Claude Code gave it, and is said once: as the reason of the skip, with no line of the plugin's before it.
  assert.ok(branch.includes('return { skip: `${PLUGIN}: ${undoneLine(tried.given ? tried.inUse : null, outcome.report.window)}` };'));
  assert.ok(!branch.slice(0, branch.indexOf('return { skip: ')).includes('say($,'));
  // Two skips in all: a compaction computed ahead, and this.
  assert.equal(handler.match(/return \{ skip: /g)?.length, 2);
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
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('function numberIn('));
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

test('a clean-up that stops records the kind, never its words: from where it stopped, or as unexpected; one that ends clears it', () => {
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('function numberIn('));
  assert.ok(collecting.includes('const record = await noteTried(files, store.write, state, now);'));
  assert.ok(collecting.includes('await stoppedAs(files, store.write, record, live.kind);'));
  assert.ok(collecting.includes('await stoppedAs(files, store.write, record, named.kind);'));
  assert.ok(collecting.includes('stopped ??= done.kind;'));
  assert.ok(collecting.includes('if (stopped === null) await noteRun(files, store.write, now);\n    else await stoppedAs(files, store.write, record, stopped);'));
  assert.ok(collecting.includes("if (tried !== null) await stoppedAs(filesOf($), tried.dir, tried.record, 'unexpected');"));
  // The words are said, and only said.
  assert.equal(collecting.split('stoppedAs(').length - 1, 5, 'four places it stops and the declaration');
  assert.ok(!/noteStopped\([^)]*\.stop\b/.test(collecting));
});

test('a session says the clean-up is late right after its record is read, whether it then tries or not, once a process (ADR 0016)', () => {
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('function numberIn('));
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
