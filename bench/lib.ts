// What the benchmark reads out of a headless session's record, and how it counts.
// Nothing here starts Claude Code or sends anything: `cc.ts` does, and hands the
// text it got back to these functions, which the tests hold to recorded sessions.

export type Arm = 'plugin' | 'builtin';

/** The token counts of one model over a session and every session it was forked from. */
export type Usage = { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; costUSD: number; thinkingTokens: number };

export type ToolCall = { name: string; input: Record<string, unknown> };

export type Compaction = { trigger: string; preTokens: number; postTokens: number; durationMs: number; preserved: boolean };

/** One headless session, as its stream of events says it went. */
export type Session = {
  sessionId: string;
  model: string;
  version: string;
  cwd: string;
  /** Plugins that are not Claude Code's own, by where they were loaded from. */
  plugins: { source: string; path: string }[];
  mcp: string[];
  tools: string[];
  /** What Claude Code said of its automatic memory, or null when it is off. */
  memory: unknown;
  /** Input tokens of each request, in order: fresh, read from cache and written to cache together. */
  requests: number[];
  toolCalls: ToolCall[];
  answer: string;
  isError: boolean;
  durationMs: number;
  denials: unknown[];
  /** Cumulative: what the sessions this one was forked from used is in it too. */
  modelUsage: Record<string, Usage>;
  /** The lines the plugin showed. */
  uiLog: string[];
  compaction: Compaction | null;
  /** What Claude Code said of a compaction that was not carried out, a hook having skipped it; null when none was. */
  skipped: string | null;
  /** Classic hooks that ran, by name. */
  hooks: string[];
  /**
   * The model Claude Code went on with after the session's own model refused
   * (its safeguards stopped a response), or null: what the session answered
   * then is that other model's.
   */
  fellBackTo: string | null;
};

const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Reads the events `claude -p --output-format stream-json --verbose` printed. Lines that are not JSON are passed over. */
export function readSession(text: string): Session {
  const session: Session = {
    sessionId: '',
    model: '',
    version: '',
    cwd: '',
    plugins: [],
    mcp: [],
    tools: [],
    memory: null,
    requests: [],
    toolCalls: [],
    answer: '',
    isError: true,
    durationMs: 0,
    denials: [],
    modelUsage: {},
    uiLog: [],
    compaction: null,
    skipped: null,
    hooks: [],
    fellBackTo: null,
  };
  const seen = new Set<string>();
  const called = new Set<string>();
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let event: Record<string, any>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event['type'] === 'system') {
      switch (event['subtype']) {
        case 'init':
          session.sessionId = String(event['session_id'] ?? '');
          session.model = String(event['model'] ?? '');
          session.version = String(event['claude_code_version'] ?? '');
          session.cwd = String(event['cwd'] ?? '');
          session.plugins = (event['plugins'] ?? [])
            .filter((plugin: any) => plugin?.path !== 'builtin')
            .map((plugin: any) => ({ source: String(plugin?.source ?? ''), path: String(plugin?.path ?? '') }));
          session.mcp = (event['mcp_servers'] ?? []).map((server: any) => String(server?.name ?? ''));
          session.tools = (event['tools'] ?? []).map(String);
          session.memory = event['memory_paths'] ?? null;
          break;
        case 'ui_log':
          if (typeof event['text'] === 'string') session.uiLog.push(event['text']);
          break;
        case 'compact_boundary': {
          const meta = event['compact_metadata'] ?? {};
          session.compaction = {
            trigger: String(meta['trigger'] ?? ''),
            // Not made zero when missing: `gapsOf` tells a figure that was not there from one that was nought.
            preTokens: Number(meta['pre_tokens']),
            postTokens: Number(meta['post_tokens']),
            durationMs: Number(meta['duration_ms']),
            preserved: meta['preserved_segment'] !== undefined,
          };
          break;
        }
        case 'status':
          // A compaction a hook skipped writes no boundary: Claude Code says it did not compact, and why.
          if (event['compact_result'] === 'failed' && typeof event['compact_error'] === 'string') session.skipped = event['compact_error'];
          break;
        case 'hook_started':
          session.hooks.push(String(event['hook_name'] ?? ''));
          break;
        case 'model_refusal_fallback':
          // Named or not, another model went on: the answer is not the session's own model's.
          session.fellBackTo = String(event['fallback_model'] || 'unknown');
          break;
      }
    } else if (event['type'] === 'assistant') {
      const message = event['message'] ?? {};
      // One response is printed once per block it holds, with the same usage each time.
      const id = String(message['id'] ?? '');
      if (!seen.has(id)) {
        seen.add(id);
        const usage = message['usage'] ?? {};
        session.requests.push(number(usage['input_tokens']) + number(usage['cache_read_input_tokens']) + number(usage['cache_creation_input_tokens']));
      }
      for (const block of message['content'] ?? []) {
        if (block?.type !== 'tool_use') continue;
        // A call is counted once by its id: a compaction prints the conversation again, calls and all.
        const callId = String(block.id ?? '');
        if (callId !== '' && called.has(callId)) continue;
        called.add(callId);
        session.toolCalls.push({ name: String(block.name ?? ''), input: block.input ?? {} });
      }
    } else if (event['type'] === 'result') {
      session.answer = typeof event['result'] === 'string' ? event['result'] : '';
      session.isError = event['is_error'] !== false;
      session.durationMs = number(event['duration_ms']);
      session.denials = Array.isArray(event['permission_denials']) ? event['permission_denials'] : [];
      for (const [model, usage] of Object.entries((event['modelUsage'] ?? {}) as Record<string, any>)) {
        session.modelUsage[model] = {
          inputTokens: number(usage?.inputTokens),
          outputTokens: number(usage?.outputTokens),
          cacheReadInputTokens: number(usage?.cacheReadInputTokens),
          cacheCreationInputTokens: number(usage?.cacheCreationInputTokens),
          costUSD: number(usage?.costUSD),
          thinkingTokens: number(usage?.thinkingTokens),
        };
      }
    }
  }
  return session;
}

/**
 * What one session used by itself: its cumulative usage less that of the session
 * it was forked from. The figures a session prints at its end count every session
 * before it, so a compaction that called no model shows the cost of the whole trace.
 */
export function ownUsage(session: Pick<Session, 'modelUsage'>, parent: Pick<Session, 'modelUsage'> | null): Usage {
  const own: Usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0, thinkingTokens: 0 };
  for (const [model, usage] of Object.entries(session.modelUsage)) {
    const before = parent?.modelUsage[model];
    for (const key of Object.keys(own) as (keyof Usage)[]) own[key] += usage[key] - (before?.[key] ?? 0);
  }
  return own;
}

export type Expect = {
  arm: Arm;
  /** Every tool the session may have, and no other: what a question can do is part of what is measured. */
  tools: readonly string[];
  pluginPath?: string;
  version?: string;
  /** At a question, a call that was refused is what the agent tried, and is counted; while a trace is built it means the trace did not happen as written. */
  refusalsCounted?: boolean;
};

const PLUGIN = 'lossless-compaction';

/**
 * Why a session is not the one the benchmark meant to run, or an empty list.
 * The arm is told by where the plugin was loaded from, not by its version: two
 * checkouts of it can carry the same one.
 */
export function problemsOf(session: Session, expect: Expect): string[] {
  const problems: string[] = [];
  const ours = session.plugins.filter((plugin) => plugin.source.startsWith(`${PLUGIN}@`));
  const others = session.plugins.filter((plugin) => !plugin.source.startsWith(`${PLUGIN}@`));
  if (session.sessionId === '') problems.push('the session did not start');
  else if (session.version === '') problems.push('the session did not say which Claude Code it is');
  if (session.isError) problems.push('the session ended in an error');
  if (expect.arm === 'builtin' && ours.length > 0) problems.push('the plugin is loaded in the built-in arm');
  if (expect.arm === 'plugin' && ours.length !== 1) problems.push('the plugin is not loaded once in the plugin arm');
  if (expect.arm === 'plugin' && expect.pluginPath !== undefined && ours[0]?.path !== expect.pluginPath) {
    problems.push(`the plugin was loaded from ${ours[0]?.path ?? 'nowhere'}`);
  }
  if (others.length > 0) problems.push(`other plugins are loaded: ${others.map((plugin) => plugin.source).join(', ')}`);
  const strangers = session.mcp.filter((name) => name !== PLUGIN);
  if (strangers.length > 0) problems.push(`other MCP servers are connected: ${strangers.join(', ')}`);
  const want = [...new Set(expect.tools)].sort().join(', ');
  const have = [...new Set(session.tools)].sort().join(', ');
  if (have !== want) problems.push(`the session's tools are ${have || 'none'}, not ${want || 'none'}`);
  if (session.memory !== null) problems.push('automatic memory is on');
  if (session.denials.length > 0 && expect.refusalsCounted !== true) problems.push(`${session.denials.length} tool call(s) were refused`);
  if (expect.version !== undefined && session.version !== expect.version) problems.push(`Claude Code is ${session.version}, not ${expect.version}`);
  // The plugin's own classic hook is the one hook a session may run.
  const foreign = session.hooks.filter((name) => !name.startsWith('SessionStart') && !name.startsWith('PreCompact') && !name.startsWith('UserPromptSubmit'));
  if (expect.arm === 'builtin' && session.hooks.length > 0) problems.push(`hooks ran in the built-in arm: ${session.hooks.join(', ')}`);
  if (foreign.length > 0) problems.push(`hooks ran that are not the plugin's: ${foreign.join(', ')}`);
  return problems;
}

/**
 * The figures a table would show of a session that the session did not give. A
 * count that is missing reads as zero, and a zero in a table is a measurement:
 * a session with a gap is not used.
 */
export function gapsOf(session: Session, what: 'compaction' | 'question'): string[] {
  const gaps: string[] = [];
  if (what === 'compaction') {
    const { compaction } = session;
    if (compaction === null) return ['nothing was compacted'];
    if (!Number.isFinite(compaction.preTokens) || compaction.preTokens <= 0) gaps.push('the compaction did not say what was in use before it');
    if (!Number.isFinite(compaction.postTokens)) gaps.push('the compaction did not say what it left');
    if (!Number.isFinite(compaction.durationMs)) gaps.push('the compaction did not say how long it took');
    return gaps;
  }
  if (session.requests.length === 0) gaps.push('the question made no request');
  else if (session.requests.some((tokens) => tokens <= 0)) gaps.push('a request did not say what it was sent');
  if (session.durationMs <= 0) gaps.push('the question did not say how long it took');
  if (Object.keys(session.modelUsage).length === 0) gaps.push('the question did not say what it used');
  return gaps;
}

/**
 * What of the environment gives the plugin a key for `find`. A session is
 * started without them unless it is one that compares `find`, which is handed
 * them by name: a key lying in the environment of whoever runs the benchmark
 * would otherwise give the plugin's arm a tool nobody named.
 */
export const KEY_VARS = ['TYPESAFE_API_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'] as const;

/** The keys in a file of NAME=value lines, as a shell would read them. Other names are passed over, and no value is ever printed. */
export function keysIn(text: string): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    const name = match?.[1];
    if (match === null || name === undefined || !(KEY_VARS as readonly string[]).includes(name)) continue;
    const value = (match[2] ?? '').replace(/^(['"])(.*)\1$/, '$2');
    if (value !== '') keys[name] = value;
  }
  return keys;
}

export type Line = {
  /**
   * `moved`: the plugin compacted. `undone`: it left a `/compact` with nothing to move out
   * and room left as it was, and nothing was compacted. The others name why the built-in
   * compaction ran.
   */
  outcome: 'moved' | 'too-much' | 'nothing' | 'other' | 'undone' | 'cut' | 'rebuilt';
  moved: number;
  /** Long values of tool inputs moved out (ADR 0020); absent where the line names none. */
  inputs?: number;
  /** Long messages whose middles left (ADR 0024); absent where the line names none. */
  bodies?: number;
  /** Old tool calls folded into lists (ADR 0022); absent where the line names none. */
  folded?: number;
  results: number;
  images: number;
  charsBefore: number;
  charsAfter: number;
  /** The plugin's estimate of the tokens in use afterwards, and what it measured against; absent when it gave none. */
  estimate?: number;
  window?: number;
  /** Of a compaction left undone: what was in use, as Claude Code gave it; absent when it gave none. */
  inUse?: number;
  /** Of a conversation cut in place of a summary (ADR 0019): which of its messages were kept, of how many, in how many parts. */
  cut?: { first: number; last: number; of: number; parts: number };
  ms: number;
};

const LINE =
  /moved (?<moved>\d+) of (?<results>\d+) tool results out(?:, (?<images>\d+) images? with them)?(?: and (?<inputs>\d+) tool inputs?)?(?:, the middle of (?<bodies>\d+) long messages?)?(?:, (?<folded>\d+) old tool calls? folded into lists)? \((?<before>\d+) -> (?<after>\d+) chars(?:, about (?<estimate>\d+) of (?<window>\d+) tokens in use)?\) in (?<took>[\d.]+) (?<unit>ms|s)/;
const UNDONE = /nothing to move out(?:, (\d+) of (\d+) tokens in use)?: the conversation is left as it is/;
// No summary in place of one (ADR 0019, src/cut.ts writes the line): the oldest messages kept, or nothing to cut once rebuilt.
const CUT = /no summary, messages (\d+)-(\d+) of (\d+) kept in (\d+) parts?: /;
const REBUILT = 'no summary, nothing to cut: ';

/** True when the built-in summary ran on what the plugin left: it handed over, for the size or for what it cannot rebuild. */
export const summarizedBy = (line: Line): boolean => line.outcome === 'too-much' || line.outcome === 'nothing' || line.outcome === 'other';

/** Reads the line the plugin shows at a compaction, in any of the forms it has had since 0.5.0. */
export function readLine(text: string): Line | null {
  const match = LINE.exec(text);
  // A line that names no results moved: none, and no time of the plugin's.
  const none = { moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, ms: 0 };
  const undone = match ? null : UNDONE.exec(text);
  if (undone) {
    const line: Line = { outcome: 'undone', ...none };
    if (undone[1] !== undefined) line.inUse = Number(undone[1]);
    if (undone[2] !== undefined) line.window = Number(undone[2]);
    return line;
  }
  if (!match) return text.includes('built-in compaction:') ? { outcome: 'other', ...none } : null;
  const cut = CUT.exec(text);
  const got = match.groups as Record<string, string | undefined>;
  const line: Line = {
    outcome: text.includes('too much is still in use') ? 'too-much' : text.includes('nothing could be moved out') ? 'nothing' : cut ? 'cut' : text.includes(REBUILT) ? 'rebuilt' : 'moved',
    moved: Number(got['moved']),
    results: Number(got['results']),
    images: Number(got['images'] ?? 0),
    charsBefore: Number(got['before']),
    charsAfter: Number(got['after']),
    ms: Number(got['took']) * (got['unit'] === 's' ? 1000 : 1),
  };
  if (cut) line.cut = { first: Number(cut[1]), last: Number(cut[2]), of: Number(cut[3]), parts: Number(cut[4]) };
  if (got['inputs'] !== undefined) line.inputs = Number(got['inputs']);
  if (got['bodies'] !== undefined) line.bodies = Number(got['bodies']);
  if (got['folded'] !== undefined) line.folded = Number(got['folded']);
  if (got['estimate'] !== undefined) line.estimate = Number(got['estimate']);
  if (got['window'] !== undefined) line.window = Number(got['window']);
  return line;
}

// Emphasis, code marks, quote marks and table bars are how an answer is laid out, not what it says.
// The marks of emphasis and code are taken out, not spaced out: they sit against the punctuation of what they wrap.
const flat = (text: string): string =>
  text
    .replace(/^[ \t]*>+[ \t]?/gm, '')
    .replace(/[*`_]/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** True when the answer holds every one of `needles`; whitespace, case and Markdown's marks aside. */
export function holdsAll(answer: string, needles: readonly string[]): boolean {
  const hay = flat(answer);
  return needles.length > 0 && needles.every((needle) => hay.includes(flat(needle)));
}

export type Outcome =
  | 'correct from context'
  | 'correct after recall'
  | 'correct after find'
  | 'correct after reading outside the working directory'
  | 'correct after reading again'
  | 'incorrect without retrieval'
  | 'incorrect after retrieval'
  | 'incorrect after reading outside the working directory'
  | 'incorrect after reading again'
  | 'abstained';

export const OUTCOMES: readonly Outcome[] = [
  'correct from context',
  'correct after recall',
  'correct after find',
  'correct after reading outside the working directory',
  'correct after reading again',
  'incorrect without retrieval',
  'incorrect after retrieval',
  'incorrect after reading outside the working directory',
  'incorrect after reading again',
  'abstained',
];

const isRecall = (name: string) => name.endsWith('__recall');
const isFind = (name: string) => name.endsWith('__find');
const READS = new Set(['Read', 'Grep']);

/**
 * How a question went, from the verdict on its answer and the tools the session
 * called. `find` counts before `recall`, which it leads to; reading counts only
 * when nothing was brought back by the plugin. `outside` is true when the session
 * read outside its working directory: Claude Code keeps its own record of a
 * session there and a summary names it, so what a compaction dropped can be dug
 * out of it. That is not reading a file of the work again, and is told apart.
 */
export function outcomeOf(verdict: 'correct' | 'incorrect' | 'abstained', calls: readonly ToolCall[], outside = false): Outcome {
  const found = calls.some((call) => isFind(call.name));
  const recalled = calls.some((call) => isRecall(call.name));
  const read = calls.some((call) => READS.has(call.name));
  if (verdict === 'abstained') return 'abstained';
  if (verdict === 'correct') {
    if (found) return 'correct after find';
    if (recalled) return 'correct after recall';
    if (outside) return 'correct after reading outside the working directory';
    return read ? 'correct after reading again' : 'correct from context';
  }
  if (found || recalled) return 'incorrect after retrieval';
  if (outside) return 'incorrect after reading outside the working directory';
  return read ? 'incorrect after reading again' : 'incorrect without retrieval';
}

/** True when a session looked outside its working directory: at Claude Code's own records, or the plugin's store. */
export function lookedOutside(calls: readonly ToolCall[], cwd: string): boolean {
  return calls.some((call) => {
    if (!READS.has(call.name) && call.name !== 'Glob') return false;
    const where = [call.input['file_path'], call.input['path']].filter((value): value is string => typeof value === 'string');
    return where.some((path) => (path.startsWith('/') && !path.startsWith(`${cwd}/`) && path !== cwd) || path.includes('..') || path.startsWith('~'));
  });
}

export type Retrieval = { recalls: number; finds: number; searches: number; reads: number };

export function retrievalOf(calls: readonly ToolCall[]): Retrieval {
  return {
    recalls: calls.filter((call) => isRecall(call.name)).length,
    finds: calls.filter((call) => isFind(call.name)).length,
    searches: calls.filter((call) => call.name === 'ToolSearch').length,
    reads: calls.filter((call) => READS.has(call.name)).length,
  };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** A few runs are shown as they are; more, as their median and range. */
export function spread(values: readonly number[], digits = 0): string {
  const show = (value: number) => value.toFixed(digits);
  if (values.length === 0) return '—';
  if (values.length <= 3) return values.map(show).join(', ');
  return `${show(median(values))} (${show(Math.min(...values))}–${show(Math.max(...values))})`;
}

const WORD = /[a-z0-9_]{3,}/g;

/**
 * The entry sharing the most distinct words with the question: the plain
 * baseline `find` is measured against. Ties go to the first entry.
 */
export function lexicalPick<T extends { text: string }>(question: string, entries: readonly T[]): T | null {
  const asked = new Set(question.toLowerCase().match(WORD) ?? []);
  let best: T | null = null;
  let most = -1;
  for (const entry of entries) {
    const words = new Set(entry.text.toLowerCase().match(WORD) ?? []);
    let shared = 0;
    for (const word of asked) if (words.has(word)) shared += 1;
    if (shared > most) [best, most] = [entry, shared];
  }
  return best;
}

/** Words in an answer that tell which arm gave it. Counted, so that the grading can be shown not to turn on them. */
export const TELLS = /\b(recall(?:ed)?|moved out|moved-out|lossless-compaction|summary|summari[sz]ed|compact(?:ed|ion))\b/gi;

export function tellsIn(answer: string): number {
  return answer.match(TELLS)?.length ?? 0;
}

/** A seeded shuffle: the order answers are graded in does not follow the order they were given in, and can be made again. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
