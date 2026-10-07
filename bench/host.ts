// Checks the working tree in the Claude Code you have, with no person watching:
// that it registers recall, that a /compact moves results out and recall gives
// one back as it was, that a conversation over what may stay is cut with no
// summary and what was cut is kept (ADR 0019), that a compaction whose hook
// throws, answers what Claude Code refuses, throws after the summary ran, or
// waits past its time keeps the conversation before the summary and says so
// (#102, on copies broken as test/fixtures/failing says), and that a hook file Claude Code
// does not load leaves the plugin "enabled but not running", told at the first
// message and holding a /compact. Nothing is set for the plugin to run: every
// session is started without CLAUDE_CODE_ENABLE_FUNCTION_HOOKS, and one more with
// it at 0, which Claude Code ignores from 2.1.287. Prints the Claude Code version
// it ran on; exits 1 when a check fails.
//
//   npm run check:host
//   node bench/host.ts --plugin-dir <a copy>     the running plugin's checks on another copy (the not-running
//                                                 copy and the broken ones are always made from the working tree)
//
// Signs in as you do and spends about 1.70 USD of Sonnet 5.5, about 0.90 of it on
// the summaries the broken copies run. The files it reads and
// the plugin's store are in a directory of its own; Claude Code keeps its record
// of each session where it keeps every session's (`--resume` needs it), and what
// hooks/notice.sh remembers (told, held) goes where it keeps the plugin's data,
// a line per run.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { PART, PLUGIN, RECALL_TOOL, idOf, readPartTicket } from '../src/store.ts';
import { FUNCTION_HOOKS, argsOf, envOf } from './cc.ts';
import { logFile } from './fixtures.ts';
import { readLine } from './lib.ts';

const MODEL = 'claude-sonnet-5-5';
/** Long enough that a /compact moves some of them out: about 20,000 characters each, past the newest 60,000 kept. */
const FILES = 6;
// Each read is a pair larger than a part (src/keep.ts PART_BYTES), so that the cut below is not met by folding old calls into lists (#83).
const LINES = 700;
const NOT_RUNNING = 'is enabled but is not running in this session';
const HELD = 'Compaction blocked by PreCompact hook';
/** A session that has not ended by now is stopped. */
const LIMIT_MS = 10 * 60 * 1000;
/** The mark of a process that is not the one asked: the plugin's notice must tell it from its own. */
const ANOTHER_MARK = '99999';

/** What a session started with `--output-format stream-json --verbose --include-hook-events` printed, as far as these checks read it. */
export type Stream = {
  sessionId: string;
  version: string;
  tools: string[];
  /** Where Claude Code loaded this plugin from, or '' when it is not listed. */
  pluginPath: string;
  /** How many plugins of this name were loaded: one, for the copy checked to be the one that ran. */
  pluginCount: number;
  /** Classic hooks that ran, by event, with what they printed. */
  hooks: { event: string; exitCode: number | null; stdout: string }[];
  calls: { id: string; name: string; input: Record<string, unknown> }[];
  /** Tool results by the id of the call they answer. */
  results: Map<string, string>;
  /** Lines the plugin showed (`ui_log`). */
  logs: string[];
  /** The text of the final result event. */
  result: string;
  /** How many compactions the session made: Claude Code prints a boundary for each. */
  boundaries: number;
};

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block) => (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text' ? String((block as { text?: unknown }).text ?? '') : '')).join('')
      : '';

export function streamOf(text: string): Stream {
  const stream: Stream = { sessionId: '', version: '', tools: [], pluginPath: '', pluginCount: 0, hooks: [], calls: [], results: new Map(), logs: [], result: '', boundaries: 0 };
  for (const line of text.split('\n')) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const { type, subtype } = event;
    if (type === 'system' && subtype === 'init') {
      stream.sessionId = String(event['session_id'] ?? '');
      stream.version = String(event['claude_code_version'] ?? '');
      stream.tools = Array.isArray(event['tools']) ? event['tools'].map(String) : [];
      const plugins = Array.isArray(event['plugins']) ? (event['plugins'] as { name?: unknown; path?: unknown }[]) : [];
      const ours = plugins.filter((one) => one.name === 'lossless-compaction');
      stream.pluginCount = ours.length;
      stream.pluginPath = String(ours[0]?.path ?? '');
    } else if (type === 'system' && subtype === 'hook_response') {
      const code = event['exit_code'];
      stream.hooks.push({ event: String(event['hook_event'] ?? ''), exitCode: typeof code === 'number' ? code : null, stdout: String(event['stdout'] ?? '') });
    } else if (type === 'system' && subtype === 'ui_log') {
      stream.logs.push(String(event['text'] ?? ''));
    } else if (type === 'system' && subtype === 'compact_boundary') {
      stream.boundaries += 1;
    } else if (type === 'assistant' || type === 'user') {
      const content = (event['message'] as { content?: unknown } | undefined)?.content;
      for (const block of Array.isArray(content) ? content : []) {
        const b = block as Record<string, unknown>;
        if (b['type'] === 'tool_use') stream.calls.push({ id: String(b['id']), name: String(b['name']), input: (b['input'] ?? {}) as Record<string, unknown> });
        if (b['type'] === 'tool_result') stream.results.set(String(b['tool_use_id']), textOf(b['content']));
      }
    } else if (type === 'result') {
      stream.result = String(event['result'] ?? '');
    }
  }
  return stream;
}

export type Check = { name: string; ok: boolean; detail: string };

const promptHook = (stream: Stream) => stream.hooks.find((hook) => hook.event === 'UserPromptSubmit');

/** The checks every session shares: the Claude Code version is known and the same in each, and the plugin was loaded from the copy asked for. */
export function judgeSessions(sessions: readonly { label: string; stream: Stream; pluginPath: string }[]): Check[] {
  const versions = [...new Set(sessions.map(({ stream }) => stream.version))];
  const elsewhere = sessions.filter(({ stream, pluginPath }) => stream.pluginCount !== 1 || stream.pluginPath !== pluginPath);
  return [
    { name: 'one Claude Code version, known', ok: versions.length === 1 && versions[0] !== '', detail: versions.join(', ') || 'none' },
    { name: 'the plugin is loaded from the copy checked', ok: elsewhere.length === 0, detail: elsewhere.length === 0 ? `in all ${sessions.length} sessions` : elsewhere.map(({ label, stream }) => `${label}: ${stream.pluginCount > 1 ? `${stream.pluginCount} copies loaded` : stream.pluginPath || 'not listed'}`).join('; ') },
  ];
}

/** The plugin running: recall registered, nothing told at the first message, a /compact that moved results out, and recall giving one back as it was. */
export function judgeRunning(first: Stream, compact: Stream, recalled: Stream, id: string, original: string): Check[] {
  const told = promptHook(first);
  // Read as the benchmark reads the line, in any of its forms: a pattern of its own here was blind to the worded one (#141).
  const moved = compact.logs.map((line) => ({ line, read: readLine(line) })).find(({ read }) => read !== null && read.outcome !== 'undone' && read.outcome !== 'other');
  const call = recalled.calls.find((one) => one.name === RECALL_TOOL && one.input['id'] === id);
  const back = call === undefined ? undefined : recalled.results.get(call.id);
  return [
    { name: 'recall is registered', ok: first.tools.includes(RECALL_TOOL), detail: first.tools.filter((tool) => tool.startsWith('mcp__')).join(', ') || 'no tool of a plugin' },
    { name: 'nothing is told at the first message', ok: told !== undefined && told.stdout.trim() === '', detail: told === undefined ? 'no UserPromptSubmit hook ran' : told.stdout.trim().slice(0, 120) || 'nothing' },
    { name: 'a /compact moves results out', ok: moved !== undefined && (moved.read?.moved ?? 0) > 0, detail: moved?.line.slice(0, 160) ?? (compact.logs.join(' | ').slice(0, 160) || compact.result.slice(0, 160)) },
    {
      name: 'recall gives a result back as it was',
      ok: back !== undefined && back === original,
      detail: call === undefined ? `recall was not called with ${id.slice(0, 12)}…` : back === undefined ? 'no result came back' : back === original ? `${back.length} characters, the same` : `${back.length} characters, not what was read (${original.length})`,
    },
  ];
}

/** The parts of a kept conversation in a store, as text: told by their entries and read from the files, with no session. */
export function partsIn(store: string): string[] {
  const index = join(store, 'index');
  if (!existsSync(index)) return [];
  const parts: string[] = [];
  for (const name of readdirSync(index)) {
    try {
      const entry = JSON.parse(readFileSync(join(index, name), 'utf8')) as { tool?: unknown };
      if (entry.tool === PART) parts.push(readFileSync(join(store, 'blobs', name.replace(/\.json$/, '.txt')), 'utf8'));
    } catch {
      // An entry that cannot be read holds no part.
    }
  }
  return parts;
}

/**
 * A conversation over what may stay in use: its oldest messages are kept in
 * parts in place of a summary (ADR 0019). What was said later is in one of
 * them as it was said, and what was said first is in none: the first message
 * stays in the conversation.
 */
export function judgeCut(cut: Stream, parts: readonly string[], first: string, later: string): Check[] {
  const read = cut.logs.map((line) => ({ line, kept: readLine(line) })).find(({ kept }) => kept?.outcome === 'cut');
  const summarized = cut.logs.some((line) => line.includes('built-in compaction'));
  const holding = (said: string) => parts.filter((part) => part.includes(said)).length;
  const some = `${parts.length} part${parts.length === 1 ? '' : 's'} in the store`;
  return [
    {
      name: 'a conversation too full is cut, and no summary runs',
      ok: read?.kept?.cut !== undefined && read.kept.cut.last >= read.kept.cut.first && !summarized,
      detail: read?.line ?? (cut.logs.join(' | ').slice(0, 160) || cut.result.slice(0, 160)),
    },
    { name: 'what was cut is kept, as it was said', ok: holding(later) > 0, detail: `${some}, ${holding(later)} holding what was said later` },
    {
      name: 'the first message is not cut',
      ok: read?.kept?.cut?.first === 2 && holding(first) === 0,
      detail: `${some}, ${holding(first)} holding what was said first; kept from message ${read?.kept?.cut?.first ?? '?'}`,
    },
  ];
}

/**
 * How each copy of test/fixtures/failing breaks the compaction hook: how Claude Code tells the failure, and what of
 * it the line repeats. `timeout` waits past the hook's ten seconds right after the compaction was tried.
 */
export const FAILING = [
  { patch: 'throw', kind: 'throw', repeated: 'thrown on purpose by bench/host.ts' },
  { patch: 'refused', kind: 'throw', repeated: '' },
  { patch: 'after-summary', kind: 'throw', repeated: 'thrown on purpose by bench/host.ts after the summary' },
  { patch: 'timeout', kind: 'timeout', repeated: '' },
] as const;

/**
 * The ids of the parts whose tickets the conversation holds after its last compaction, read from Claude Code's record of
 * the session; with `kind`, those of that kind alone (#105).
 */
export function namedAfterCompaction(transcript: string, kind?: 'conversation' | 'attached'): string[] {
  const rows = transcript.split('\n').flatMap((line): Record<string, unknown>[] => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
  const boundary = rows.findLastIndex((row) => row['subtype'] === 'compact_boundary');
  if (boundary < 0) return [];
  return rows
    .slice(boundary + 1)
    .filter((row) => row['type'] === 'user')
    .flatMap((row) => textOf((row['message'] as { content?: unknown } | undefined)?.content).split('\n'))
    .flatMap((line) => {
      const part = readPartTicket(line);
      return part === null || (kind !== undefined && part.kind !== kind) ? [] : [part.id];
    });
}

/**
 * A compaction whose hook failed (#102): the line says so and nothing of the hook is said after it, the conversation
 * is kept, the built-in summary runs once, and the conversation after it holds the tickets of parts in the copy's own
 * store. `parts` are those of that store, `named` the parts the session's record names, `said` what the person said.
 */
export function judgeFailed(
  label: string,
  stream: Stream,
  parts: readonly string[],
  named: readonly { id: string; stored: boolean }[],
  said: string,
  failure: { kind: string; repeated: string },
): Check[] {
  const at = stream.logs.findIndex((line) => line.startsWith(`${PLUGIN}: the compaction stopped (${failure.kind}`));
  const failed = stream.logs[at];
  const kept = (line: string) => /^lossless-compaction: kept the conversation in \d+ parts? before the built-in summary$/.test(line);
  // After the failure's line, the handler's one line saying it was kept and nothing else: a second such line is the hook's.
  const after = at < 0 ? [] : stream.logs.slice(at + 1);
  const handlers = after.findIndex(kept);
  const late = after.filter((_, index) => index !== handlers);
  const holding = parts.filter((part) => part.includes(said)).length;
  return [
    { name: `${label}: the failure is said`, ok: failed !== undefined && failed.includes(failure.repeated), detail: (failed ?? stream.logs.join(' | ')).slice(0, 200) || 'nothing said' },
    { name: `${label}: nothing of the hook is said after it`, ok: at >= 0 && late.length === 0, detail: late.join(' | ').slice(0, 200) || 'nothing' },
    { name: `${label}: the conversation is kept before the summary`, ok: stream.logs.some(kept) && holding > 0, detail: `${stream.logs.find(kept) ?? 'no line saying it was kept'}; ${parts.length} part${parts.length === 1 ? '' : 's'}, ${holding} holding what was said` },
    { name: `${label}: one compaction`, ok: stream.boundaries === 1, detail: `${stream.boundaries} boundar${stream.boundaries === 1 ? 'y' : 'ies'}` },
    {
      name: `${label}: the conversation after it holds the tickets`,
      ok: named.length > 0 && named.every((one) => one.stored),
      detail: named.length === 0 ? 'no ticket of a part after the compaction' : `${named.length} named, ${named.filter((one) => one.stored).length} in the copy's store`,
    },
  ];
}

/** The words Claude Code attaches in the check of #105: one of a file handed over with `@` is never said again in the conversation. */
export const ATTACHED_WORDS = { first: 'heron', second: 'marigold', hook: 'walrus', after: 'otter' } as const;

/**
 * What Claude Code attached as it sent the messages is kept at a compaction that rebuilt the conversation, and
 * comes back (#105): a part the conversation names afterwards as what was attached (`parts`, read from the store)
 * holds the three words no message handed over holds, and the agent, with no tool to read a file, recalled and gave
 * all three.
 */
export function judgeAttached(compact: Stream, asked: Stream, parts: readonly string[]): Check[] {
  const { second, hook, after } = ATTACHED_WORDS;
  const holding = parts.filter((part) => [second, hook, after].every((word) => part.includes(word)));
  const recalled = asked.calls.filter((call) => call.name === RECALL_TOOL).length;
  const answer = asked.result.toLowerCase();
  return [
    { name: 'attached: a compaction keeps what Claude Code attached', ok: compact.boundaries === 1 && holding.length > 0, detail: `${compact.boundaries} compaction, ${parts.length} part${parts.length === 1 ? '' : 's'} named as what was attached, ${holding.length} holding the three words` },
    { name: 'attached: the agent recalls it and gives the three words', ok: recalled > 0 && [second, hook, after].every((word) => answer.includes(word)), detail: `${recalled} recall${recalled === 1 ? '' : 's'}; ${asked.result.slice(0, 120) || 'nothing said'}` },
  ];
}

/** The session started with CLAUDE_CODE_ENABLE_FUNCTION_HOOKS at 0, and how a session started without it is written. */
export const ZERO = 'variable-0';
export const UNSET = 'unset';

/**
 * Nothing to set: every session is started without CLAUDE_CODE_ENABLE_FUNCTION_HOOKS but one, which has it at 0, the value that
 * turned function hooks off before Claude Code 2.1.287, and the plugin runs in that one too. The values are those the sessions
 * were started with, so a run that handed the variable on from whoever ran it says so here.
 */
export function judgeNothingToSet(sessions: readonly { label: string; variable: string }[], zero: Stream): Check[] {
  const told = promptHook(zero);
  const others = sessions.filter(({ label }) => label !== ZERO);
  const zeroed = sessions.find(({ label }) => label === ZERO)?.variable;
  return [
    {
      name: `${FUNCTION_HOOKS} is unset in every session but one, and 0 there`,
      ok: others.length > 0 && others.every(({ variable }) => variable === UNSET) && zeroed === '0',
      detail: sessions.map(({ label, variable }) => `${label}=${variable}`).join(', '),
    },
    {
      name: `with ${FUNCTION_HOOKS}=0 the plugin still runs`,
      ok: zero.tools.includes(RECALL_TOOL) && told !== undefined && told.stdout.trim() === '',
      detail: `${zero.tools.includes(RECALL_TOOL) ? 'recall registered' : 'no recall'}, ${told === undefined ? 'no UserPromptSubmit hook ran' : told.stdout.trim().slice(0, 80) || 'nothing told'}`,
    },
  ];
}

/** The plugin enabled and not running: no recall, told at the first message, and a /compact held. */
export function judgeNotRunning(first: Stream, compact: Stream): Check[] {
  const told = promptHook(first);
  return [
    { name: 'not running: no recall', ok: !first.tools.includes(RECALL_TOOL), detail: first.tools.filter((tool) => tool.startsWith('mcp__')).join(', ') || 'no tool of a plugin' },
    { name: 'not running: told at the first message', ok: told !== undefined && told.stdout.includes(NOT_RUNNING), detail: told === undefined ? 'no UserPromptSubmit hook ran' : told.stdout.slice(0, 120) || 'nothing' },
    { name: 'not running: a /compact is held', ok: compact.result.includes(HELD), detail: compact.result.slice(0, 120) },
  ];
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..');
  // The plugin checked: the working tree, or one named (to see the checks fail on a broken one).
  const at = process.argv.indexOf('--plugin-dir');
  const named = at > 0 ? process.argv[at + 1] : undefined;
  const plugin = named ? resolve(named) : root;
  const dir = mkdtempSync(join(tmpdir(), 'lossless-host-'));
  const work = join(dir, 'work');
  const store = join(dir, 'store');
  spawnSync('mkdir', ['-p', work, store]);
  const names = Array.from({ length: FILES }, (_, i) => `f${i + 1}.txt`);
  names.forEach((name, i) => writeFileSync(join(work, name), logFile(300 + i, LINES)));

  // A copy of what git keeps, with the hook file changed as `patch` says.
  const list = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (list.status !== 0) throw new Error('could not list the working tree');
  const copyWith = (name: string, patch: string): string => {
    const copy = join(dir, name);
    spawnSync('mkdir', ['-p', copy]);
    const tar = spawnSync('sh', ['-c', `cd "${root}" && tar -cf - --null -T - | (cd "${copy}" && tar -xf -)`], { input: list.stdout });
    const patched = spawnSync('patch', ['-p1', '-s', '-N', '-d', copy, '-i', join(root, patch)]);
    if (tar.status !== 0 || patched.status !== 0) throw new Error(`could not make the copy of the working tree that ${patch} changes`);
    return copy;
  };
  // Broken the way test/fixtures/validate says: Claude Code loads no hook from it.
  const broken = copyWith('broken', 'test/fixtures/validate/pass-to-import.patch');

  const sessions: { label: string; stream: Stream; pluginPath: string; variable: string }[] = [];
  // With `fork`, a copy of the session goes on and the session is left as it was.
  const run = (
    label: string,
    pluginDir: string,
    prompt: string,
    resume?: string,
    env: Record<string, string> = {},
    pluginOptions?: Record<string, unknown>,
    {
      fork = false,
      storeDir = store,
      allowedTools = ['Read', 'ToolSearch', RECALL_TOOL],
      hooks,
    }: { fork?: boolean; storeDir?: string; allowedTools?: readonly string[]; hooks?: Record<string, unknown> } = {},
  ): Stream => {
    const args = argsOf({
      out: '',
      cwd: work,
      model: MODEL,
      arm: 'plugin',
      pluginDir,
      storeDir,
      allowedTools,
      prompt,
      ...(resume ? { resume, fork } : {}),
      ...(pluginOptions ? { pluginOptions } : {}),
      ...(hooks ? { hooks } : {}),
    });
    const started = envOf({ env });
    const ran = spawnSync('claude', [...args, '--include-hook-events'], { cwd: work, env: started, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: LIMIT_MS });
    if (ran.error !== undefined) throw new Error(`claude could not be run, or ran past ${LIMIT_MS / 60000} minutes: ${ran.error.message}`);
    writeFileSync(join(dir, `${label}.jsonl`), ran.stdout);
    if (ran.stdout === '') throw new Error(`claude printed nothing (exit ${ran.status}): ${String(ran.stderr).slice(0, 300)}`);
    const stream = streamOf(ran.stdout);
    // Both as the file system resolves them: macOS names one temporary directory /var/folders/… and /private/var/folders/….
    const real = (path: string) => (path !== '' && existsSync(path) ? realpathSync(path) : path);
    sessions.push({ label, stream: { ...stream, pluginPath: real(stream.pluginPath) }, pluginPath: real(pluginDir), variable: started[FUNCTION_HOOKS] ?? UNSET });
    return stream;
  };

  // No mark handed down to the running side: one of the calling session's ("any" when it could not read its own id)
  // would quiet hooks/notice.sh whatever the module does, and "nothing is told" would pass for the wrong reason.
  const unmarked = { LOSSLESS_COMPACTION_RUNNING: '' };
  const said = `Read ${names.join(', ')} with the Read tool, one file per call, in that order. Then reply only: read.`;
  const first = run('first', plugin, said, undefined, unmarked);
  // Before the session is compacted: each broken copy compacts a copy of it, into a store of its own (#102). What the
  // conversation holds afterwards is read from Claude Code's record of the copy, wherever it keeps its projects.
  const projects = join(process.env['CLAUDE_CONFIG_DIR'] || join(homedir(), '.claude'), 'projects');
  const recordOf = (sessionId: string): string => {
    const found = readdirSync(projects).map((name) => join(projects, name, `${sessionId}.jsonl`)).find((path) => existsSync(path));
    return found === undefined ? '' : readFileSync(found, 'utf8');
  };
  const failing = FAILING.map((failure) => {
    const own = join(dir, `store-${failure.patch}`);
    spawnSync('mkdir', ['-p', own]);
    const stream = run(failure.patch, copyWith(failure.patch, `test/fixtures/failing/${failure.patch}.patch`), '/compact', first.sessionId, unmarked, undefined, { fork: true, storeDir: own });
    const named = namedAfterCompaction(recordOf(stream.sessionId)).map((id) => ({ id, stored: existsSync(join(own, 'blobs', `${id}.txt`)) }));
    return judgeFailed(failure.patch, stream, partsIn(own), named, said, failure);
  });
  // What Claude Code attaches to messages as it sends them (#105): a file handed over with `@`, a word a hook adds to the
  // first thing said, and one a hook adds after a file is read; none is in a message the plugin is handed. Asked after
  // a /compact with no tool to read a file, the agent has them only from what was kept.
  const attachedStore = join(dir, 'store-attached');
  spawnSync('mkdir', ['-p', attachedStore]);
  writeFileSync(join(work, 'notes.txt'), `Notes for the check.\nFIRST-WORD: ${ATTACHED_WORDS.first}\nSECOND-WORD: ${ATTACHED_WORDS.second}\n`);
  const once = join(dir, 'prompt-hook-ran');
  const promptHookFile = join(dir, 'prompt-hook.sh');
  const readHookFile = join(dir, 'read-hook.sh');
  const context = (event: string, text: string) => JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
  writeFileSync(promptHookFile, `#!/bin/sh\ncat >/dev/null\n[ -e '${once}' ] && exit 0\n: > '${once}'\nprintf '%s\\n' '${context('UserPromptSubmit', `HOOK-WORD: ${ATTACHED_WORDS.hook}`)}'\n`);
  writeFileSync(readHookFile, `#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' '${context('PostToolUse', `AFTER-WORD: ${ATTACHED_WORDS.after}`)}'\n`);
  spawnSync('chmod', ['+x', promptHookFile, readHookFile]);
  const hooks = {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: promptHookFile }] }],
    PostToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: readHookFile }] }],
  };
  const withAttached = { storeDir: attachedStore, hooks };
  const attachedFirst = run('attached', plugin, `Here are my notes: @notes.txt. Remember the first word in them. Then read ${names[0]} with the Read tool, and reply only: read.`, undefined, unmarked, undefined, withAttached);
  // A turn more, so that the read is before the last thing said, which a /compact typed by hand reaches up to (ADR 0023).
  run('attached-then', plugin, 'Reply only: ok.', attachedFirst.sessionId, unmarked, undefined, withAttached);
  const attachedCompact = run('attached-compact', plugin, '/compact', attachedFirst.sessionId, unmarked, { keepTokens: 0 }, withAttached);
  const attachedAsked = run(
    'attached-asked',
    plugin,
    'Do not read any file. Reply with three words, a space apart and nothing else: the second word in my notes, the word the hook added to my first message, and the word added after you read the log. Recall what was kept if you need it.',
    attachedFirst.sessionId,
    unmarked,
    undefined,
    // No Read; ToolSearch stays, as with none at all Claude Code offers no tool of a plugin either.
    { ...withAttached, allowedTools: ['ToolSearch', RECALL_TOOL] },
  );

  const compact = run('compact', plugin, '/compact', first.sessionId, unmarked);
  // A result that was moved out, chosen by its own text: the id is the SHA-256 of what was read.
  let chosen: { id: string; text: string } | undefined;
  for (const call of first.calls.filter((one) => one.name === 'Read')) {
    const text = first.results.get(call.id) ?? '';
    const id = await idOf(text);
    if (existsSync(join(store, 'blobs', `${id}.txt`))) chosen = { id, text };
  }
  const asked = `Call ${RECALL_TOOL} with the id ${chosen?.id ?? '-'}. Then reply only: done.`;
  const recalled = chosen === undefined ? compact : run('recall', plugin, asked, first.sessionId, unmarked);
  // The same conversation with next to nothing allowed to stay and no result long enough to leave: over the line with
  // nothing to move out, whatever it holds and whatever the system prompt comes to, so its oldest messages are cut,
  // all but the first and the newest.
  // (With results to move out, a conversation over the line for what is not the conversation is handed back as it is.)
  // A /compact calls no model, and the parts are read from the store's files.
  const cut = run('cut', plugin, '/compact', first.sessionId, unmarked, { maxAfterPercent: 1, keepTokens: 0, minChars: 10_000_000 });
  // With another process's mark handed down, as from a session that started this one: it must not count as this one's.
  const notFirst = run('not-running-first', broken, 'Reply only: ok', undefined, { LOSSLESS_COMPACTION_RUNNING: ANOTHER_MARK });
  const notCompact = run('not-running-compact', broken, '/compact', notFirst.sessionId, { LOSSLESS_COMPACTION_RUNNING: ANOTHER_MARK });
  // The value that turned function hooks off before Claude Code 2.1.287: ignored since, so the plugin runs here as well.
  const zero = run(ZERO, plugin, 'Reply only: ok', undefined, { ...unmarked, [FUNCTION_HOOKS]: '0' });

  const checks = [
    ...judgeSessions(sessions),
    ...judgeRunning(first, compact, recalled, chosen?.id ?? '-', chosen?.text ?? ''),
    ...judgeCut(cut, partsIn(store), said, asked),
    ...failing.flat(),
    // The parts the conversation names after the compaction as what Claude Code attached: not a conversation kept as sent.
    ...judgeAttached(
      attachedCompact,
      attachedAsked,
      namedAfterCompaction(recordOf(attachedFirst.sessionId), 'attached').flatMap((id) => {
        const blob = join(attachedStore, 'blobs', `${id}.txt`);
        return existsSync(blob) ? [readFileSync(blob, 'utf8')] : [];
      }),
    ),
    ...judgeNotRunning(notFirst, notCompact),
    ...judgeNothingToSet(sessions, zero),
  ];
  console.log(`Claude Code ${first.version || '?'} (${MODEL}), plugin from ${plugin}`);
  for (const check of checks) console.log(`${check.ok ? 'ok  ' : 'FAIL'} ${check.name}: ${check.detail}`);
  console.log(`(sessions and copies in ${dir})`);
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

if (import.meta.main) await main();
