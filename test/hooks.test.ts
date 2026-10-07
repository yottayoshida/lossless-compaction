import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { Provider } from '../src/ask.ts';
import { changedLine, shownAgainLine } from '../src/changed.ts';
import { forgetMove } from '../src/commands.ts';
import { failedLine } from '../src/flow.ts';
import { KEPT } from '../src/keep.ts';
import type { Message } from '../src/types.ts';
import { MemoryFiles, conversation, enospc, sized } from './helpers.ts';
import { FIND_IN_RECALL, recallDescription } from '../src/tools.ts';
import { ATTACHED_KEPT, EXPORT_COMMAND, FIND_TOOL, IMPORT_COMMAND, PLUGIN as PLUGIN_NAME, RECALL_TOOL, STATUS_COMMAND, STORE_COMMAND, readPartTicket, readTicket, recall, ticketText } from '../src/store.ts';
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
    // What `on` returns, which the compaction hook's `.catch` is called on.
    return { catch: () => undefined };
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
  // Each of recall, find, the compaction, a subagent's compaction (ADR 0026), the clean-up, /lossless-store, a message
  // sent again from a rewind (ADR 0024), /lossless-export and /lossless-import (#116) takes the place from storeOf and
  // gives up on its reason.
  const givingUp = hooks.split("if (typeof store === 'string')").length - 1;
  // The compaction calls it `place` until the place is known to be private (it keeps the conversation after that).
  assert.equal(givingUp + (hooks.split("if (typeof place === 'string')").length - 1), 9, 'nine callers');
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('type HandedOver'));
  assert.ok(collecting.includes("const store = await storeOf($, options);\n    if (typeof store === 'string') return;"), 'the clean-up too');
});

test('a compaction makes the place private before anything is written, and gives up when it cannot', () => {
  // The place is prepared in one function, which the compaction and the handler of its failure both start from.
  const placing = hooks.slice(hooks.indexOf('async function placeOf('), hooks.indexOf('async function attempt('));
  const attempt = hooks.slice(hooks.indexOf('async function attempt('), hooks.indexOf('export const register'));
  const made = placing.indexOf('await privateOf($, place)');
  assert.ok(made > 0, 'privateOf is called');
  assert.ok(
    placing.includes("if (unsafe !== null) return { why: unsafe, unkept: 'the place to keep it in could not be made private' };"),
    'and gives up on its reason, keeping nothing',
  );
  assert.ok(made < placing.indexOf('await noteRootOf($, place, options);') && made < placing.indexOf('await restoreFor($, place,'), 'nothing is written to it before');
  assert.ok(made < placing.indexOf('return { store: place };'), 'the conversation is kept only in a place made private');
  const placed = attempt.indexOf('const placed = await placeOf($, messages, options);');
  assert.ok(placed > 0 && placed < attempt.indexOf('await compact('), 'before the compaction writes');
  assert.ok(placed < attempt.indexOf('whyNotRebuilt('), "and before a conversation that is not rebuilt is kept, this session's transcript noted");
  assert.ok(attempt.includes("if (!('store' in placed)) return { why: placed.why, keep: { unkept: placed.unkept } };"), 'kept nowhere where there is no place');
  const handler = hooks.slice(hooks.indexOf('}).catch(async ($, e, next) => {'));
  const handlerPlaced = handler.indexOf('const placed = await placeOf($, messages, options);');
  assert.ok(handlerPlaced > 0 && handlerPlaced < handler.indexOf("const keep = 'store' in placed ? { store: placed.store,") && handler.includes('summarizeKeeping($, e, summarize, keep)'), 'and the handler of a failure keeps it only there');
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
  assert.ok(hooks.slice(restoreForAt, hooks.indexOf('\n}\n', restoreForAt)).includes('restoreThroughParts(filesOf($), listOf($), execOf($), ownedOf(store), ids, parts)'), 'through the parts, in the places of the settings in use: an earlier place is read alone (#116)');
  const putBack = recalled.indexOf('restoreFor($, store, new Set([id]))');
  assert.ok(recalledAt > 0 && putBack > 0 && putBack < recalled.lastIndexOf('recall(filesOf($), store.read, id)'), 'recall, put back first');
  const findHook = hooks.slice(hooks.indexOf(hookOn('tool.call', FIND_TOOL)), hooks.indexOf("on('session.compact'"));
  assert.ok(findHook.indexOf('restoreFor($, store, ticketIds(messages), partIds(messages))') < findHook.indexOf('await find('), 'find, first');
  const placing = hooks.slice(hooks.indexOf('async function placeOf('), hooks.indexOf('async function attempt('));
  const attempt = hooks.slice(hooks.indexOf('async function attempt('), hooks.indexOf('async function summarizeKeeping('));
  assert.ok(placing.indexOf('await restoreFor($, place, ticketIds(messages), partIds(messages));') > 0, 'put back where the place is prepared');
  assert.ok(attempt.indexOf('await placeOf(') > 0 && attempt.indexOf('await placeOf(') < attempt.indexOf('await compact('), 'the compaction, first');
  // Both found, in that order: an index of -1 would pass a bare comparison without either being there.
  const madePrivate = placing.indexOf('await privateOf($, place)');
  assert.ok(madePrivate > 0 && madePrivate < placing.indexOf('noteRootOf('), 'the place recorded once private');
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

/** The compaction hook's handler of a failure, registered as Claude Code is handed it: `on(...).catch(handler)`. */
async function compactionCatch(): Promise<Caught> {
  const { register } = (await import(new URL('../hooks/move-out.ts', import.meta.url).href)) as {
    register: (on: (name: string, ...rest: unknown[]) => unknown, options: Record<string, unknown>) => void;
  };
  const handlers: Caught[] = [];
  register((name) => (name === 'session.compact' ? { catch: (handler: Caught) => void handlers.push(handler) } : undefined), {});
  assert.equal(handlers.length, 1, 'one handler, on the compaction hook');
  return handlers[0] as Caught;
}

type Compacted = { messages?: { role: string; text: string }[]; skip?: string } | undefined;
type Next = ((e: unknown) => Promise<Compacted>) & { error: { kind: 'throw' | 'timeout'; message?: string; budget: number }; called: boolean };
type Caught = ($: unknown, e: { trigger: string; agentId?: string; messages: readonly Message[] }, next: Next) => Promise<Compacted>;

const CAUGHT_STORE = '/home/u/.claude/lossless-compaction';
const SUMMARY = { role: 'user', text: 'This session is being continued from a previous conversation.', toolUses: [] };

/** A conversation as Claude Code sends it: its blocks, and what it adds to the first message. */
const asSent = (messages: readonly Message[], added: string) =>
  messages.map((message, index) => ({
    role: message.role,
    content: [
      ...(index === 0 ? [{ type: 'text', text: added }] : []),
      ...(message.text === '' ? [] : [{ type: 'text', text: message.text }]),
      ...message.toolUses.map((use) => ({ type: 'tool_use', id: use.tool_use_id, name: use.tool, input: use.input })),
      ...(message.toolResults ?? []).map((result) => ({ type: 'tool_result', tool_use_id: result.tool_use_id, content: result.text })),
    ],
  }));

/**
 * A host for the handler: the store in memory, `mkdir` and `chmod` that succeed, no `mv` (a text is written in place),
 * and what the plugin says. `home` unset leaves no place to keep anything in.
 */
function caughtHost(files: MemoryFiles, messages: readonly Message[], api: unknown, home: string | null = '/home/u') {
  const said: string[] = [];
  const run = async (argv: readonly string[]) => {
    const program = String(argv[0]).slice(String(argv[0]).lastIndexOf('/') + 1);
    if (program === 'mkdir') files.dirs.add(String(argv.at(-1)));
    else if (program !== 'chmod') throw new Error(`${program} cannot be started here`);
    return { exitCode: 0, stdout: '' };
  };
  const $ = {
    ui: { log: (text: string) => void said.push(text), toast: () => undefined },
    env: { get: async (name: string) => (name === 'HOME' ? (home ?? undefined) : undefined) },
    settings: { read: async () => ({}) },
    fs: {
      read: (path: string) => files.read(path),
      write: (path: string, text: string) => files.write(path, text),
      stat: (path: string) => files.stat(path),
      list: (path: string) => files.list(path),
      exists: async (path: string) => files.files.has(path) || files.dirs.has(path),
    },
    process: { run },
    session: { id: async () => 'session-1', messages: async (args?: { as?: string }) => (args?.as === 'api' ? api : messages) },
  };
  return { $, said };
}

/** A `next` as a handler is handed it: what the built-in summary comes to, why the hook failed, and whether it had called `next`. */
function nextOf(answer: (e: unknown) => Promise<Compacted>, error: Next['error'], called = false): Next & { handed: unknown[] } {
  const handed: unknown[] = [];
  return Object.assign(async (e: unknown) => (handed.push(e), answer(e)), { error, called, handed });
}

test('a compaction hook that throws or runs out of time keeps the conversation as it was sent before the built-in summary, and says so (#102)', async () => {
  forgetMove();
  const caught = await compactionCatch();
  const messages = conversation([sized('a.ts', 3000), sized('b.ts', 2500), sized('c.ts', 600)]);
  const results = messages.flatMap((message) => message.toolResults ?? []).map((result) => result.text);

  for (const error of [{ kind: 'throw', message: 'boom\n  at nextStep', budget: 1000 }, { kind: 'timeout', budget: 1000 }] as const) {
    const files = new MemoryFiles();
    const { $, said } = caughtHost(files, messages, asSent(messages, '<system-reminder>Attached by Claude Code: walrus</system-reminder>'));
    const e = { trigger: 'auto', messages };
    const next = nextOf(async () => ({ messages: [SUMMARY] }), error);
    const answered = await caught($, e, next);

    // The built-in summary ran once, on the conversation as it was handed in, and the tickets of what was kept follow it.
    assert.deepEqual(next.handed, [e], error.kind);
    assert.equal(answered?.messages?.length, 2, error.kind);
    assert.deepEqual(answered?.messages?.[0], SUMMARY);
    const kept = answered?.messages?.[1]?.text ?? '';
    assert.ok(kept.startsWith(KEPT), error.kind);
    // What the parts hold is the conversation as Claude Code sent it: what it added included, each result by its ticket.
    const parts: string[] = [];
    for (const line of kept.split('\n')) {
      const part = readPartTicket(line);
      if (part === null) continue;
      const got = await recall(files, [CAUGHT_STORE], part.id);
      assert.ok(!('error' in got), line);
      parts.push(got.text);
    }
    const text = parts.join('');
    assert.ok(text.includes('Fix the failing parser test.') && text.includes('walrus'), error.kind);
    const tickets = text.split('\n').flatMap((line) => readTicket(line) ?? []);
    const recalled = await Promise.all(tickets.map(async (ticket) => recall(files, [CAUGHT_STORE], ticket.id)));
    for (const result of results) assert.ok(recalled.some((got) => !('error' in got) && got.text === result), `the result of ${result.slice(0, 4)} comes back`);
    // Said first, what failed and that the summary runs in its place, then that the conversation was kept.
    assert.equal(said[0], `${PLUGIN_NAME}: ${failedLine(error)}`);
    assert.ok(said.includes(`${PLUGIN_NAME}: kept the conversation in ${parts.length} part${parts.length === 1 ? '' : 's'} before the built-in summary`), said.join(' | '));
  }
});

test('a handler run after the hook had called the built-in summary puts the tickets after what that call came to (#102)', async () => {
  forgetMove();
  const caught = await compactionCatch();
  const messages = conversation([sized('a.ts', 3000)]);
  const { $, said } = caughtHost(new MemoryFiles(), messages, asSent(messages, ''));
  // As Claude Code hands it: once the hook had called `next`, calling it again hands back what that call settled to.
  const settled = { messages: [SUMMARY, { role: 'assistant', text: 'Picking up where we were.' }] };
  const error = { kind: 'throw', message: 'after the summary', budget: 1000 } as const;
  const next = nextOf(async () => settled, error, true);
  const answered = await caught($, { trigger: 'manual', messages }, next);
  assert.equal(next.handed.length, 1, 'asked once, for what the call came to');
  assert.deepEqual(answered?.messages?.[0], SUMMARY);
  assert.ok(answered?.messages?.[1]?.text.startsWith(KEPT), 'the tickets, right after the summary');
  assert.deepEqual(answered?.messages?.[2], settled.messages[1]);
  assert.equal(said[0], `${PLUGIN_NAME}: ${failedLine(error, true)}`);

  // The summary the hook asked for had failed: it fails again here, before anything is written, and the handler is absent.
  const none = new MemoryFiles();
  const failed = caughtHost(none, messages, asSent(messages, ''));
  const rejected = nextOf(async () => Promise.reject(new Error('prompt is too long')), error, true);
  assert.equal(await caught(failed.$, { trigger: 'auto', messages }, rejected), undefined);
  assert.equal(none.files.size, 0, 'nothing written');
  assert.deepEqual(failed.said, [
    `${PLUGIN_NAME}: ${failedLine(error, true)}`,
    `${PLUGIN_NAME}: handing the conversation to the built-in summary failed as well: prompt is too long`,
  ]);
});

test('a handler with no place to keep the conversation in says why and hands it over as it is; one whose hand-over fails as well is absent (#102)', async () => {
  forgetMove();
  const caught = await compactionCatch();
  const messages = conversation([sized('a.ts', 3000)]);
  const error = { kind: 'throw', message: 'boom', budget: 1000 } as const;

  const nowhere = caughtHost(new MemoryFiles(), messages, asSent(messages, ''), null);
  const next = nextOf(async () => ({ messages: [SUMMARY] }), error);
  assert.deepEqual(await caught(nowhere.$, { trigger: 'auto', messages }, next), { messages: [SUMMARY] });
  assert.equal(next.handed.length, 1);
  assert.equal(nowhere.said[0], `${PLUGIN_NAME}: ${failedLine(error)}`);
  assert.ok(nowhere.said[1]?.startsWith(`${PLUGIN_NAME}: nothing of the conversation is kept before the built-in summary: `), nowhere.said.join(' | '));

  // The summary itself fails: nothing is answered, and what Claude Code makes of the failure stands.
  const failing = caughtHost(new MemoryFiles(), messages, asSent(messages, ''));
  const refused = nextOf(async () => Promise.reject(new Error('the summary could not be made')), error);
  assert.equal(await caught(failing.$, { trigger: 'auto', messages }, refused), undefined);
  assert.equal(failing.said.at(-1), `${PLUGIN_NAME}: handing the conversation to the built-in summary failed as well: the summary could not be made`);
});

test('a handler leaves a compaction computed ahead and a subagent\'s to Claude Code, touching nothing (#102)', async () => {
  const caught = await compactionCatch();
  const touched: string[] = [];
  const $ = new Proxy({}, { get: (_, noun) => void touched.push(String(noun)) });
  const next = nextOf(async () => ({ messages: [SUMMARY] }), { kind: 'throw', budget: 1000 });
  assert.equal(await caught($, { trigger: 'precompute', messages: [] }, next), undefined);
  assert.equal(await caught($, { trigger: 'auto', agentId: 'a1', messages: [] }, next), undefined);
  assert.deepEqual(touched, []);
  assert.equal(next.handed.length, 0);
});

test("every way a conversation reaches the built-in summary keeps it first: a subagent's too, through its own step (ADR 0026)", () => {
  // The hook, and the handler of its failure (#102), each read on its own.
  const handler = hooks.slice(hooks.indexOf("on('session.compact'"), hooks.indexOf('}).catch(async ($, e, next) => {'));
  const caught = hooks.slice(hooks.indexOf('}).catch(async ($, e, next) => {'));
  const carrying = hooks.slice(hooks.indexOf('async function carryOut('), hooks.indexOf('type WithTools'));
  assert.deepEqual([...handler.matchAll(/next\(e\)/g)].length, 0, 'nothing is handed straight on');
  // The handler asks only for what the hook's own call came to, and hands over through summarizeKeeping otherwise.
  assert.deepEqual([...caught.matchAll(/next\(e\)/g)].map((match) => caught.slice(caught.lastIndexOf('\n', match.index) + 1, caught.indexOf('\n', match.index)).trim()), [
    'const settled = next.called ? await next(e) : undefined;',
  ]);
  assert.equal(caught.split('summarizeKeeping($, e, summarize, keep)').length - 1, 1, 'kept first, or said why not');
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
    carrying.includes(
      "return step.of === 'given'\n        ? summarizeKeeping($, e, next, { store, messages: [...(e.messages as readonly Message[]), ...(tried.attached === undefined ? [] : [tried.attached])] })",
    ),
    'nothing moved out: kept as handed in, with the message naming what Claude Code attached (#105), where the step says so',
  );
  // What Claude Code attached is kept for every step but a skip, and where it cannot be, the conversation goes over as sent (#105).
  assert.ok(handler.includes("const ready = step.step === 'skip' ? tried : await withAttached($, e, tried);"), 'kept before the step is carried out');
  assert.ok(handler.includes("say($, `built-in compaction: ${ready.why}`);\n        result = await summarizeKeeping($, e, next, ready.keep);"), 'or handed over, kept as sent');
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
  assert.ok(collecting.includes('collect(list, execOf($), dir, named, Date.now())'), 'collected against them, at the time of the moves (ADR 0038)');
  assert.ok(!collecting.includes('collect(list, execOf($), dir, live.ids,'), 'not against the transcripts alone');
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
        '        given: tried.given,\n        maxAfterPercent: tried.maxAfterPercent,\n        count: tried.count,\n        keepTokens: tried.keepTokens,\n        entries: tried.entries,\n      });',
    ),
  );
  // Handed back only where the step says so: as rebuilt, or cut. A part that could not be written goes on to the hand-over the step names.
  const carrying = hooks.slice(hooks.indexOf('async function carryOut('), hooks.indexOf('type WithTools'));
  assert.ok(carrying.includes("case 'back':\n      say($, step.line);\n      return { messages: outcome.messages };"), 'the rebuilt messages, no handle');
  assert.ok(carrying.includes('const cut = await cutKeeping($, tried, step.after, step.at, step.over, step.held);'), 'cut where the step says, its length named where it was cut for it (ADR 0034)');
  // What Claude Code handed over is counted before anything is rebuilt: the larger of the messages and the conversation as sent.
  assert.ok(hooks.includes('entries: Math.max(messages.length, Array.isArray(api) ? api.length : 0),'), 'the entries, as Claude Code handed them over');
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
  assert.ok(hooks.includes("moved out of this conversation and the parts of it that were ` +\n            'kept, the one a question is about, and returns it unchanged. Ask in words what the result contains or is about;"));
  // The line names the messages kept by their place in the conversation: from behind what stays in front, up to the cut.
  assert.ok(keeping.includes('say($, cutLine(report, { first: after + 1, last: at, of: outcome.messages.length, parts: cut.parts, over, ...(held === undefined ? {} : { held }) }));'));
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
  // Two skips in all: a compaction computed ahead, and a /compact left undone. The others are no compaction's: what the
  // hook answers once Claude Code went on without it, which Claude Code does not read (#102), looked at after each
  // thing the hook waits on before it says or hands on anything: the attempt, and keeping what was attached (#105).
  const handler = hooks.slice(hooks.indexOf("on('session.compact'"));
  assert.equal(handler.match(/return \{ skip: /g)?.length, 3);
  const abort = "if (next.signal.aborted) return { skip: `${PLUGIN} went on without this compaction` };";
  const aborted = handler.indexOf(abort);
  const attempted = handler.indexOf('const tried = await attempt($, e, options);');
  assert.ok(attempted > 0 && aborted > attempted && aborted < handler.indexOf('say($,'), 'right after the attempt, before anything is said or handed on');
  const kept = handler.indexOf("const ready = step.step === 'skip' ? tried : await withAttached($, e, tried);");
  const abortedAgain = handler.indexOf(abort, aborted + 1);
  assert.ok(kept > 0 && abortedAgain > kept && abortedAgain < handler.indexOf("say($, `built-in compaction: ${ready.why}`);"), 'and right after what was attached is kept');
  // A `/compact` by hand that would have been left undone, cut for its length, is left undone where what was attached cannot be kept (ADR 0034).
  const undone = handler.indexOf("if ('why' in ready && step.step === 'cut' && step.otherwise.step === 'skip') {\n        say($, `not cut for its length: ${ready.why}`);\n        result = { skip: step.otherwise.why };");
  assert.ok(undone > abortedAgain && undone < handler.indexOf("say($, `built-in compaction: ${ready.why}`);"), 'before what was attached sends it to the summary');
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
  // Registered at the start with no key, find sends nothing, as its description says, though a key turns up later in the
  // environment (a key set in the plugin's settings loads the hook again, and is used); and where looking for the key fails
  // when it is called, it looks here with none (#110).
  const calling = hooks.slice(hooks.indexOf("on('tool.call', { tool: 'mcp__lossless-compaction__find' }"), hooks.indexOf('const result = await find({'));
  assert.ok(calling.includes("if (findAtStart?.registered === true && 'local' in findAtStart) provider = null;"), calling);
  assert.ok(calling.includes('} catch {\n        provider = null;\n      }'), calling);
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
  // No key, or a lookup that failed: find is there all the same, looking on this machine (#110), and recall names it.
  for (const [what, outcome] of [
    ['no key', await run(null)],
    ['looking for the key failed', await run(undefined)],
  ] as const) {
    assert.deepEqual(outcome.names, ['find', 'recall'], what);
    assert.ok(outcome.recall.endsWith(` ${FIND_IN_RECALL}`), what);
  }
  // A key that may not be used, find refused: recall says nothing of find.
  for (const [what, outcome] of [
    ['a key that may not be used', await run({ error: 'set the key in your user settings' })],
    ['find could not be registered', await run(provider, true)],
  ] as const) {
    assert.deepEqual(outcome.names, ['recall'], what);
    assert.equal(outcome.recall, recallDescription(false), what);
    assert.ok(!outcome.recall.includes('find'), what);
  }
  assert.match((await run({ error: 'no' })).said.join('\n'), /: the find tool is not registered: no$/m);
  assert.match((await run(provider, true)).said.join('\n'), /: the find tool could not be registered: refused$/m);
});

test('/lossless-store is a command, not a tool: registered at the start, answered from storeOf over every place read, with nothing of a result read but under check (ADR 0016, #116, #117)', () => {
  assert.ok(hooks.includes(`on('command.run', { command: '${STORE_COMMAND}' }`), 'the matcher is spelled as STORE_COMMAND');
  const start = hooks.slice(hooks.indexOf("on('session.start'"), hooks.indexOf("on('command.run'"));
  assert.ok(start.includes('await $.command.register({\n        name: STORE_COMMAND,'), 'registered at the start');
  assert.ok(start.includes('immediate: true'), 'answers mid-turn too');
  // The tools the agent is offered are the two they were.
  assert.equal(hooks.split('$.tool.register(').length - 1, 2);
  const handler = hooks.slice(hooks.indexOf("on('command.run'"), hooks.indexOf(hookOn('tool.call', RECALL_TOOL)));
  assert.ok(handler.includes('const store = await storeOf($, options);'), 'the place as the repository cannot decide it');
  // A place is counted as the clean-up takes it: a plain directory, not a link. Those of the settings in use first.
  assert.ok(handler.includes('const owned = ownedOf(store);\n      const there = await plainDirsOf($, owned);'), 'the places the clean-up reads');
  assert.ok(handler.includes('for (const dir of owned) counted.push(there.includes(dir) ? await countStore(files, list, dir, now) : skipped(dir));'));
  // Then every other place read, the earlier ones, counted the same way and said as never cleaned up (#116).
  assert.ok(handler.includes('const before = store.read.filter((dir) => !owned.includes(dir));'), 'every place read');
  assert.ok(handler.includes('for (const dir of before) earlier.push(plain.includes(dir) ? await countStore(files, list, dir, now) : skipped(dir));'));
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('type HandedOver'));
  assert.ok(collecting.includes('const dirs = await plainDirsOf($, ownedOf(store));'), 'the same places as the clean-up, never an earlier one (#116)');
  const plain = hooks.slice(hooks.indexOf('async function plainDirsOf('), hooks.indexOf('async function collectOnce('));
  assert.ok(plain.includes("if (found && found.kind === 'dir' && found.isLink !== true) dirs.push(dir);"));
  // What an error says may name a path: it is not shown.
  assert.ok(!handler.includes('error.message'));
  assert.ok(handler.includes('const gc = await stateIn(files, list, there);'));
  // The machines it is used from, read from the same places, and this machine's id (ADR 0032).
  assert.ok(handler.includes('const readable = marks === null ? null : await readableSessions(files, list, gc.roots, marks);'));
  // It reads this machine's id and makes none.
  assert.ok(handler.includes('const self = markName(await machineOf($, options, false), session);'));
  assert.ok(handler.includes('const machines = { marks, self, unread: marks === null || readable === null ? null : unreadMarks(marks, self, session, readable).map((mark) => mark.name) };'));
  assert.ok(handler.includes('return { text: storeReport(counted, gc, now, set, machines, earlier) };'));
  // What answers it reads nothing itself: no recall, no read of a file.
  assert.ok(!/recall\(|\$\.fs\.read\(|files\.read\(/.test(handler));
  // But under check, which reads each text kept, in every place read, through src/check.ts alone, with the time the
  // command has (#117); and only that word: another is answered, not taken for none.
  assert.ok(start.includes("argumentHint: '[check]',"));
  const checking = handler.slice(handler.indexOf('const check = checkAsked(asked);'), handler.indexOf("if (asked !== '')"));
  assert.ok(checking.includes('const places = store.read.map((dir) => ({ dir, there: read.includes(dir), putsBack: owned.includes(dir) }));'), 'every place recall reads, and whether it puts back from its trash');
  assert.ok(checking.includes('await checkPlaces(filesOf($), listOf($), places, Date.now(), () => next.budget.remainingMs, check.from)'), 'with the time the hook has left, from where a run stopped');
  assert.ok(checking.includes('return { text: checkReport(done.checked, done.next, Date.now() - began) };'));
  assert.ok(handler.indexOf('const check = checkAsked(asked);') < handler.indexOf('const now = Date.now();'), 'answered before anything is counted');
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
  const registered: { name: string; description?: string }[] = [];
  const host = (refuseFind: boolean) => ({
    tool: {
      register: async (tool: { name: string; description?: string }) => {
        registered.push(tool);
        if (refuseFind && tool.name === 'find') throw new Error('refused by the host');
      },
    },
    ui: { log: () => {}, toast: () => {} },
  });
  const provider = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as unknown as Provider;
  assert.deepEqual(await registerTools(host(false), provider), { registered: true, kind: 'typesafe' });
  assert.deepEqual(await registerTools(host(true), provider), { registered: false, why: 'Claude Code did not take it, as a line at the start of the session said' });
  // With no key, or where looking for one failed, find is registered all the same, to look on this machine (#110).
  const finds = (since: number) => registered.slice(since).filter((tool) => tool.name === 'find');
  let since = registered.length;
  assert.deepEqual(await registerTools(host(false), null), { registered: true, local: true, why: 'no key' });
  assert.equal(finds(since).length, 1, 'registered once');
  assert.match(finds(since)[0]?.description ?? '', /^Looks, on this machine, .* and sends nothing\./);
  since = registered.length;
  assert.deepEqual(await registerTools(host(false), undefined), { registered: true, local: true, why: 'looking for its key failed' });
  assert.equal(finds(since).length, 1);
  // Settings that name a key that cannot be used: nothing is registered, and that is said.
  since = registered.length;
  assert.deepEqual(await registerTools(host(false), { error: 'cloudflare needs an account id' }), { registered: false, why: 'cloudflare needs an account id' });
  assert.equal(finds(since).length, 0);
  // With a key the description is Jev's.
  since = registered.length;
  await registerTools(host(false), provider);
  assert.match(finds(since)[0]?.description ?? '', /^Finds, among the tool results/);
});

test('a clean-up that stops records the kind, never its words: from where it stopped, or as unexpected; one that ends clears it', () => {
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('type HandedOver'));
  assert.ok(collecting.includes('const record = await noteTried(files, store.write, state, now);'));
  assert.ok(collecting.includes('await stoppedAs(files, store.write, record, live.kind);'));
  // What stopped it, one stored thing each, is recorded with it (#114).
  assert.ok(collecting.includes('await stoppedAs(files, store.write, record, named.kind, named.unread, named.more);'));
  assert.ok(collecting.includes('stopped ??= done.kind;'));
  assert.ok(collecting.includes('if (stopped === null) await noteRun(files, store.write, now);\n    else await stoppedAs(files, store.write, record, stopped);'));
  assert.ok(collecting.includes("if (tried !== null) await stoppedAs(filesOf($), tried.dir, tried.record, 'unexpected');"));
  // The words are said, and only said.
  assert.ok(collecting.includes('await stoppedAs(files, store.write, record, inTrash.kind);'));
  // A conversation whose noted ticket the search did not find stops it too, after the search and before anything goes back (ADR 0027).
  assert.ok(collecting.includes('await stoppedAs(files, store.write, record, unseen.kind);'));
  const witnessed = collecting.indexOf('const unseen = await checkWitnesses(');
  assert.ok(witnessed > collecting.indexOf('const live = await liveIds(') && witnessed < collecting.indexOf('const inTrash = await putBackNamed('), 'looked at after the search, before the trash');
  // Another machine's mark stops it after the try is noted and before anything of this machine's transcripts is read (ADR 0032).
  assert.ok(collecting.includes("await stoppedAs(files, store.write, record, 'shared');"));
  const shared = collecting.indexOf('const shared = sharedWith(marks, self, session, readable);');
  // The marks of other names whose transcripts are read here are taken off first, from the places the clean-up reads.
  const taken = collecting.indexOf('await takeOffMarks(remove, dirs, readMarks(marks, self, session, readable).map((mark) => mark.name));');
  assert.ok(taken > 0 && taken < shared, 'taken off before the marks left are looked at');
  assert.ok(collecting.includes('const readable = marks === null ? null : await readableSessions(files, list, state.roots, marks);'), "this machine's transcripts are where the sessions of the marks are looked for");
  assert.ok(shared > collecting.indexOf('const record = await noteTried(') && shared < collecting.indexOf('await writeSentinel('), 'after the try is noted, before the sentinel');
  // Each session marks the store, whether it collects or not, once the store is private.
  const marked = collecting.indexOf('if (unsafe === null) await noteMachineOf($, store, options);');
  assert.ok(marked > 0 && marked < collecting.indexOf('if (whyNotNow(state, now) !== null) return;'), 'marked before the week is looked at');
  // And at each compaction, of the main conversation and a subagent's, once its place is recorded.
  const attempting = hooks.slice(hooks.indexOf('async function placeOf('), hooks.indexOf('async function placeOf(') + 2500);
  assert.ok(attempting.includes('await noteRootOf($, place, options);\n  await noteMachineOf($, place, options);'), 'at a compaction');
  assert.ok(hooks.includes('await noteRootOf($, store, options);\n      await noteMachineOf($, store, options);'), "at a subagent's compaction");
  // A mark is named by the session where the machine has no id.
  assert.ok(hooks.includes('const name = markName(await machineOf($, options), session);'));
  assert.equal(collecting.split('stoppedAs(').length - 1, 8, 'seven places it stops and the declaration');
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
    // What `on` returns, which the compaction hook's `.catch` is called on.
    return { catch: () => undefined };
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
    // What `on` returns, which the compaction hook's `.catch` is called on.
    return { catch: () => undefined };
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

/** The compaction hook as Claude Code is handed it, registered with the plugin's settings `options`. */
async function compactionHook(options: Record<string, unknown> = {}) {
  const { register } = (await import(new URL('../hooks/move-out.ts', import.meta.url).href)) as {
    register: (on: (name: string, ...rest: unknown[]) => unknown, options: Record<string, unknown>) => void;
  };
  type Hook = ($: unknown, e: unknown, next: ((e: unknown) => Promise<unknown>) & { signal: AbortSignal }) => Promise<{ messages?: { role: string; text: string }[]; skip?: string }>;
  const hooks: Hook[] = [];
  register((name, ...rest) => {
    if (name === 'session.compact') hooks.push(rest[0] as Hook);
    return { catch: () => undefined };
  }, options);
  assert.equal(hooks.length, 1);
  return hooks[0] as Hook;
}

/** A `next` as Claude Code hands a hook it: what runs beneath, and the signal that says Claude Code went on without it. */
const nextOn = (beneath: (e: unknown) => Promise<unknown>) => Object.assign(beneath, { signal: new AbortController().signal });

/** A conversation as the hook is handed it, and as Claude Code sent it: a hook's word after the first thing said, a reminder after the first result (#105). */
function sentWithAttached() {
  const handed = conversation([sized('a.ts', 3000), sized('b.ts', 2500)], 'Keep the API notes in mind.');
  const api = asSent(handed, '<system-reminder>\nUserPromptSubmit hook additional context: PROBE-HOOK-WORD: walrus\n</system-reminder>');
  const result = api[2]?.content[0] as { content: string };
  result.content = `${result.content.trimEnd()}\n\n<system-reminder>\nPostToolUse hook additional context: PROBE-POST-WORD: otter\n</system-reminder>`;
  return { handed, api };
}

/** compactionHost for the main conversation: the conversation as it was sent apart from the one handed, and no figure of Claude Code's for what is in use. */
function mainHost(files: MemoryFiles, handed: readonly Message[], api: unknown, write?: (path: string, text: string) => Promise<void>) {
  const made = compactionHost(files, api);
  Object.assign(made.host.session, { messages: async (args?: { as?: string }) => (args?.as === 'api' ? api : handed), usage: async () => ({}) });
  if (write !== undefined) made.host.fs.write = write;
  return made;
}

/** The text of every part a message names, joined. */
async function partsNamed(files: MemoryFiles, text: string): Promise<string> {
  const got = await Promise.all(text.split('\n').flatMap((line) => readPartTicket(line)?.id ?? []).map((id) => recall(files, [CAUGHT_STORE], id)));
  return got.map((one) => ('text' in one ? one.text : '')).join('');
}

test('what Claude Code attached as it sent the messages is kept when the conversation is rebuilt, and a message at its end names it; what was said and returned are not in it (#105)', async () => {
  forgetMove();
  // Every result may leave: none is among the newest kept.
  const hook = await compactionHook({ keepTokens: 0 });
  const files = new MemoryFiles();
  const { handed, api } = sentWithAttached();
  const answer = await hook(
    mainHost(files, handed, api).host,
    { trigger: 'manual', messages: handed },
    nextOn(async () => {
      throw new Error('no summary is asked for');
    }),
  );
  const messages = answer.messages ?? [];
  const last = messages.at(-1);
  assert.ok(last !== undefined && last.text.startsWith(ATTACHED_KEPT), JSON.stringify(answer).slice(0, 300));
  assert.equal(messages.filter((message) => message.text.startsWith(ATTACHED_KEPT)).length, 1, 'one, at the end');
  const kept = await partsNamed(files, last.text);
  assert.ok(kept.includes('PROBE-HOOK-WORD: walrus') && kept.includes('PROBE-POST-WORD: otter'), kept.slice(0, 300));
  assert.ok(!kept.includes('Keep the API notes in mind.'), 'not what the person said');
  assert.ok(!kept.includes((handed[2]?.toolResults?.[0]?.text ?? '').slice(0, 200)), 'nor what a tool returned');
});

test('handed to the built-in summary as it was, the conversation is kept with the message naming what Claude Code attached, which the summary is followed by (#105)', async () => {
  forgetMove();
  // Nothing may leave, and the /compact asks for something: the conversation goes to the summary as handed in.
  const hook = await compactionHook({ minChars: 10_000_000 });
  const files = new MemoryFiles();
  const { handed, api } = sentWithAttached();
  const handedOn: unknown[] = [];
  const answer = await hook(mainHost(files, handed, api).host, { trigger: 'manual', instructions: 'Keep the API notes.', messages: handed }, nextOn(async (e) => (handedOn.push(e), { messages: [SUMMARY] })));
  assert.equal(handedOn.length, 1, 'summarized once');
  assert.deepEqual(answer.messages?.[0], SUMMARY);
  assert.ok(answer.messages?.[1]?.text.startsWith(KEPT), JSON.stringify(answer).slice(0, 300));
  // The kept conversation holds the message naming what was attached; through it, what was attached is reached.
  const conversationKept = await partsNamed(files, answer.messages?.[1]?.text ?? '');
  assert.ok(conversationKept.includes(ATTACHED_KEPT), conversationKept.slice(-400));
  assert.ok((await partsNamed(files, conversationKept)).includes('PROBE-HOOK-WORD: walrus'));
});

test('a /compact given instructions hands what is left, once moved out, to the summary with them, though it fits; an automatic compaction handed the same instructions is handed back rebuilt (ADR 0036)', async () => {
  forgetMove();
  // Every result may leave, and what is left fits: the step that gives no summary, but for the instructions.
  const hook = await compactionHook({ keepTokens: 0 });
  const instructions = 'keep the plan';

  const files = new MemoryFiles();
  const { handed, api } = sentWithAttached();
  const { host, logged } = mainHost(files, handed, api);
  const given: { messages: readonly { role: string; text: string; toolResults?: readonly { text: string }[] }[]; instructions?: string }[] = [];
  const answer = await hook(host, { trigger: 'manual', instructions, messages: handed }, nextOn(async (e) => (given.push(e as (typeof given)[number]), { messages: [SUMMARY] })));
  assert.ok(logged.some((line) => line.includes('built-in compaction on what is left, as it was asked for with instructions: moved ')), logged.join(' | '));
  assert.ok(!logged.some((line) => line.includes('too much is still in use')), 'it fits: not said to be too full');
  assert.equal(given.length, 1, 'summarized once');
  const [summarized] = given;
  assert.equal(summarized?.instructions, instructions, 'with the instructions as they were given');
  // What is left once moved out: the older result is a ticket (the newest call stays, as at any /compact given
  // instructions, ADR 0023), and what Claude Code attached is named at the end (#105).
  const results = (summarized?.messages ?? []).flatMap((message) => message.toolResults ?? []);
  assert.deepEqual(
    results.map((result) => result.text.startsWith('[moved out] ')),
    [true, false],
    JSON.stringify(results).slice(0, 300),
  );
  assert.ok(summarized?.messages.at(-1)?.text.startsWith(ATTACHED_KEPT));
  // The summary, then the parts of what it replaced, kept first.
  assert.deepEqual(answer.messages?.[0], SUMMARY);
  const kept = answer.messages?.[1]?.text ?? '';
  assert.ok(kept.startsWith(KEPT), JSON.stringify(answer).slice(0, 300));
  assert.ok((await partsNamed(files, kept)).includes('[moved out] '), 'the parts hold the tickets');

  // Asked for by a plugin (`$.session.compact({ instructions })`): the same.
  const byPlugin: unknown[] = [];
  const asked = await hook(mainHost(new MemoryFiles(), handed, api).host, { trigger: 'plugin', instructions, messages: handed }, nextOn(async (e) => (byPlugin.push(e), { messages: [SUMMARY] })));
  assert.equal(byPlugin.length, 1);
  assert.deepEqual(asked.messages?.[0], SUMMARY);

  // Where the disk refuses the parts of the conversation, the summary does not run, and nothing is handed back (ADR 0008).
  const full = new MemoryFiles();
  const refusing = async (path: string, text: string) => {
    if (text.includes('--- assistant')) throw enospc(path);
    return full.write(path, text);
  };
  let summaries = 0;
  const refused = await hook(mainHost(full, handed, api, refusing).host, { trigger: 'manual', instructions, messages: handed }, nextOn(async () => ((summaries += 1), { messages: [SUMMARY] })));
  assert.equal(summaries, 0);
  assert.equal(refused.messages, undefined);
  assert.match(refused.skip ?? '', /nothing could be kept \(could not write: ENOSPC\), so the summary did not run/);

  // The same conversation and instructions, at an automatic compaction: a hook above may have added them.
  const other = new MemoryFiles();
  const auto = await hook(
    mainHost(other, handed, api).host,
    { trigger: 'auto', instructions, messages: handed },
    nextOn(async () => {
      throw new Error('no summary is asked for');
    }),
  );
  assert.ok(auto.messages?.at(-1)?.text.startsWith(ATTACHED_KEPT), JSON.stringify(auto).slice(0, 300));
  assert.ok(!(auto.messages ?? []).some((message) => message.text.startsWith(KEPT)), 'rebuilt, with no summary');
});

test('where what Claude Code attached cannot be written, the conversation is not rebuilt: it is kept as sent, or, refused that too, the summary does not run (#105, ADR 0008)', async () => {
  forgetMove();
  // Every result may leave: none is among the newest kept.
  const hook = await compactionHook({ keepTokens: 0 });
  const files = new MemoryFiles();
  const { handed, api } = sentWithAttached();
  // The disk refuses whatever holds what was attached; the results alone go through.
  const write = async (path: string, text: string) => {
    if (text.includes('walrus')) throw enospc(path);
    return files.write(path, text);
  };
  const { host, logged } = mainHost(files, handed, api, write);
  let asked = 0;
  const answer = await hook(host, { trigger: 'manual', messages: handed }, nextOn(async () => ((asked += 1), { messages: [SUMMARY] })));
  assert.equal(answer.messages, undefined, 'no rebuilt conversation handed back');
  assert.match(answer.skip ?? '', /nothing could be kept \(could not write: ENOSPC\), so the summary did not run/);
  assert.equal(asked, 0);
  assert.ok(logged.includes(`${PLUGIN_NAME}: built-in compaction: what Claude Code attached to the messages could not be kept (could not write: ENOSPC)`), logged.join(' | '));
});

test("the places written to under these settings are noted in the plugin's own store and read after the current ones, with the defaults beside a storeDir of your own where the repository did not set what they are built from (#116)", () => {
  const at = hooks.indexOf('async function storeOf(');
  const storing = hooks.slice(at, hooks.indexOf('/** The provider', at));
  // After the repository's settings were looked at: a place they decide is refused before anything is noted.
  assert.ok(storing.indexOf('placeTaints(taints, options)') < storing.indexOf('earlierOf($, store.write)'));
  assert.ok(storing.includes('const defaults = storeDirSet(options) && taints !== null && variableTaints(taints).length === 0 ? defaultPlacesOf(places) : [];'), 'the defaults only where HOME and the like are your own');
  assert.ok(storing.includes('return withEarlier(store, [...(await earlierOf($, store.write)), ...defaults]);'));
  const noting = hooks.slice(hooks.indexOf('function earlierOf('), hooks.indexOf('/** The provider', at));
  assert.ok(noting.includes('() => $.store.get(PLACES_KEY),\n    (places) => $.store.set(PLACES_KEY, places),'), "in the plugin's own store, through notePlace (test/store.test.ts)");
});

test("/lossless-export and /lossless-import run only when you type them, check where they write before writing, and note what was read in as this conversation's (#116)", () => {
  const start = hooks.slice(hooks.indexOf("on('session.start'"), hooks.indexOf("on('command.run'"));
  assert.ok(start.includes('[EXPORT_COMMAND, ') && start.includes('[IMPORT_COMMAND, ') && start.includes('await $.command.register({ name, description });'), 'registered at the start, not mid-turn');
  assert.equal(EXPORT_COMMAND, 'lossless-export');
  assert.equal(IMPORT_COMMAND, 'lossless-import');
  const at = (command: string) => hooks.indexOf(`on('command.run', { command: '${command}' }`);
  const exporting = hooks.slice(at(EXPORT_COMMAND), at(IMPORT_COMMAND));
  const importing = hooks.slice(at(IMPORT_COMMAND), hooks.indexOf(hookOn('tool.call', RECALL_TOOL)));
  assert.ok(at(EXPORT_COMMAND) > 0 && at(IMPORT_COMMAND) > at(EXPORT_COMMAND));
  for (const handler of [exporting, importing]) {
    // Who typed it is looked at first: a channel, another agent or a scheduled run has nothing written.
    assert.ok(handler.indexOf('if (!byPerson(e.origin))') > 0 && handler.indexOf('if (!byPerson(e.origin))') < handler.indexOf('storeOf('));
    assert.ok(handler.includes('if (!plainPath('), 'a path from the root, with no . or .. (src/carry.ts)');
    // Not on Windows, where no mode keeps a directory to you alone: refused once the place is known, before anything is written.
    assert.ok(handler.indexOf('if (onWindows(store.write)) return { text: NOT_ON_WINDOWS };') > handler.indexOf('storeOf('));
    // Stopped while some of the hook's own time is left, and what is left said.
    assert.ok(handler.includes('() => next.budget.remainingMs > BUDGET_LEFT_MS'));
    assert.ok(handler.includes('} catch {') && !handler.includes('error.message'), 'what an error says is not shown');
  }
  assert.ok(hooks.includes("const byPerson = (origin: { kind: string } | undefined): boolean => origin?.kind === 'composer' || origin?.kind === 'bridge';"));
  // Where it writes is checked before anything is: a new directory, outside any repository, made private.
  // Gone on with only where the directory holds the mark this command writes first.
  assert.ok(exporting.includes('if (again && !(await $.fs.exists(`${to}/${EXPORT_MARK}`))) return'));
  const order = ['const again = await $.fs.exists(to);', 'if (await insideRepositoryOf($, to))', 'await restoreFor($, store, ticketIds(messages), partIds(messages));', 'await ensurePrivate(filesOf($), runOf($), to)', 'if (!again) await filesOf($).write(`${to}/${EXPORT_MARK}`,', 'await writeOut(storingFilesOf($), store.read, ids, to,'];
  const places = order.map((one) => exporting.indexOf(one));
  assert.ok(places.every((place, i) => place > 0 && (i === 0 || place > (places[i - 1] as number))), JSON.stringify(places));
  // Read in to the place written to, made private first; then the transcript's place and a witness, so that the clean-up counts it.
  const reading = ['privateOf($, store)', 'await readIn(storingFilesOf($), listOf($), from, store.write,', 'await noteRootOf($, store, options);', 'await noteWitnessOf($, witnessCandidates(messages), options, true);'];
  const read = reading.map((one) => importing.indexOf(one));
  assert.ok(read.every((place, i) => place > 0 && (i === 0 || place > (read[i - 1] as number))), JSON.stringify(read));
});
