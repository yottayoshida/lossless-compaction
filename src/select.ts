// Which tool results may leave the conversation, and the order they leave in
// when nothing but rules decides it.

import { PLUGIN, readBodyTicket, readInputTicket } from './store.ts';
import type { Message, ToolUse } from './types.ts';

export type Candidate = {
  /** The tool_use_id of the call this result answers. */
  id: string;
  /** Position among every tool result of the conversation, oldest first. */
  position: number;
  tool: string;
  input: Record<string, unknown>;
  text: string;
  /** A later call made this result obsolete. Read off the calls; nothing is asked. */
  superseded: boolean;
};

export type Selection = {
  candidates: Candidate[];
  /** Why the other results stay: counted, so a report can say what was left alone. */
  left: { newest: number; short: number; failed: number; tickets: number; unlike: number };
};

export type SelectOptions = {
  /**
   * The newest result that could leave stays whatever its size; the ones before
   * it stay while they and the newest add up to this many characters. The first
   * message always stays.
   */
  keepChars: number;
  /** Results shorter than this many characters stay. */
  minChars: number;
  /**
   * False: the newest stays only within `keepChars`, as when a /compact typed by hand reaches into the newest
   * calls and what stays is told by what the person said last (ADR 0023).
   */
  keepNewest?: false;
};

/** The tools that write to the file their input names. */
export const WRITES: ReadonlySet<string> = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** The file a call's input names, for the tools that read or write one. */
export function fileOf(input: Record<string, unknown>): string | null {
  const path = input['file_path'] ?? input['notebook_path'];
  return typeof path === 'string' ? path : null;
}

/** What a call was aimed at, for the tools whose repeat makes the earlier result obsolete. */
function targetOf(use: ToolUse): string | null {
  switch (use.tool) {
    case 'Read':
      return JSON.stringify(['Read', fileOf(use.input), use.input['offset'] ?? null, use.input['limit'] ?? null]);
    case 'Bash':
      return JSON.stringify(['Bash', use.input['command'] ?? null]);
    case 'Grep':
    case 'Glob':
      return JSON.stringify([use.tool, use.input]);
    default:
      return null;
  }
}

/**
 * The results that may be moved out, oldest first. `stored` holds the ids of
 * results that already are tickets of this store; a line that only looks like
 * one is an ordinary result.
 */
export function select(messages: readonly Message[], options: SelectOptions, stored: ReadonlySet<string>): Selection {
  const uses = new Map<string, ToolUse>();
  const order: string[] = [];
  for (const message of messages) {
    for (const use of message.toolUses) {
      uses.set(use.tool_use_id, use);
      order.push(use.tool_use_id);
    }
  }

  // The last call aimed at each target, and the last write to each file.
  const lastCall = new Map<string, number>();
  const lastWrite = new Map<string, number>();
  order.forEach((id, index) => {
    const use = uses.get(id);
    if (!use) return;
    const target = targetOf(use);
    if (target !== null) lastCall.set(target, index);
    const file = fileOf(use.input);
    if (file !== null && WRITES.has(use.tool)) lastWrite.set(file, index);
  });
  const callIndex = new Map(order.map((id, index) => [id, index]));

  const left = { newest: 0, short: 0, failed: 0, tickets: 0, unlike: 0 };
  // Every result that could leave, oldest first; which of them do is decided below.
  const could: Candidate[] = [];
  let position = 0;

  messages.forEach((message, index) => {
    for (const result of message.toolResults ?? []) {
      position += 1;
      if (stored.has(result.tool_use_id)) {
        left.tickets += 1;
        continue;
      }
      if (index === 0) {
        left.newest += 1;
        continue;
      }
      if (result.isError) {
        left.failed += 1;
        continue;
      }
      if (result.text.length < options.minChars) {
        left.short += 1;
        continue;
      }
      const use = uses.get(result.tool_use_id);
      // What is stored is the text on the result's side. The text on the call's
      // side leaves with it, so it has to be the same text.
      if (use?.text !== undefined && use.text !== result.text) {
        left.unlike += 1;
        continue;
      }
      const at = callIndex.get(result.tool_use_id) ?? -1;
      const target = use ? targetOf(use) : null;
      const file = use && use.tool === 'Read' ? fileOf(use.input) : null;
      const repeated = target !== null && (lastCall.get(target) ?? -1) > at;
      const rewritten = file !== null && (lastWrite.get(file) ?? -1) > at;
      could.push({
        id: result.tool_use_id,
        position,
        tool: use?.tool ?? 'tool',
        input: use?.input ?? {},
        text: result.text,
        superseded: repeated || rewritten,
      });
    }
  });

  // The newest result that could leave stays whatever its size; the ones before
  // it stay while they and the newest add up to keepChars. From the first that
  // goes over, every older one is a candidate. A result a later call made
  // obsolete is a candidate wherever it sits and counts for nothing.
  const candidates: Candidate[] = [];
  let kept = 0;
  let total = 0;
  let closed = false;
  for (let index = could.length - 1; index >= 0; index -= 1) {
    const candidate = could[index] as Candidate;
    if (candidate.superseded || closed) {
      candidates.push(candidate);
      continue;
    }
    if ((kept === 0 && options.keepNewest !== false) || total + candidate.text.length <= options.keepChars) {
      kept += 1;
      total += candidate.text.length;
      left.newest += 1;
      continue;
    }
    closed = true;
    candidates.push(candidate);
  }
  candidates.reverse();

  return { candidates, left };
}

const WORD = /[a-z0-9_]{3,}/g;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu;

/** Words, and for text written without spaces, every pair of neighbouring characters. */
export function termsOf(text: string): Set<string> {
  const terms = new Set<string>(text.toLowerCase().match(WORD) ?? []);
  for (const run of text.match(UNSPACED) ?? []) {
    for (let i = 0; i + 1 < run.length; i += 1) terms.add(run.slice(i, i + 2));
  }
  return terms;
}

/** The share of the goal's terms that a candidate's call and the start of its result mention. */
export function overlap(goal: ReadonlySet<string>, candidate: Candidate): number {
  if (goal.size === 0) return 0;
  const mentioned = termsOf(`${JSON.stringify(candidate.input)}\n${candidate.text.slice(0, 4000)}`);
  let shared = 0;
  for (const term of goal) if (mentioned.has(term)) shared += 1;
  return shared / goal.size;
}

/**
 * The order results leave in when only rules decide: those a later call made
 * obsolete, then those that share the least with the goal, then the oldest.
 */
export function ruleOrder(candidates: readonly Candidate[], goal: string): Candidate[] {
  const terms = termsOf(goal);
  const shared = new Map(candidates.map((candidate) => [candidate.id, overlap(terms, candidate)]));
  return [...candidates].sort(
    (a, b) =>
      Number(b.superseded) - Number(a.superseded) ||
      (shared.get(a.id) ?? 0) - (shared.get(b.id) ?? 0) ||
      a.position - b.position,
  );
}

/**
 * The tools whose long input values may leave: those that write a file, and Bash, whose command can hold one.
 * Named, not told by shape: Claude Code reads back what some tools were handed (a plan, a list of tasks), and
 * a tool this plugin has never heard of keeps its input.
 */
export const INPUT_TOOLS: ReadonlySet<string> = new Set([...WRITES, 'Bash']);

/** One long value of a tool call's input that may leave the conversation. */
export type InputCandidate = {
  /** The tool_use_id of the call. */
  id: string;
  tool: string;
  /** Where the value stands in the input: the keys and indexes down to it. */
  path: readonly (string | number)[];
  /** The key the value stands under, as its ticket names it. */
  field: string;
  text: string;
};

/** How deep an input is walked for long values; none of the tools named goes deeper than a list of edits. */
const INPUT_DEPTH = 8;

function longValues(value: unknown, minChars: number, path: (string | number)[], into: { path: (string | number)[]; text: string }[]): void {
  if (typeof value === 'string') {
    // A value that left at an earlier compaction is a ticket, and stays one.
    if (value.length >= minChars && readInputTicket(value) === null) into.push({ path: [...path], text: value });
    return;
  }
  if (typeof value !== 'object' || value === null || path.length >= INPUT_DEPTH) return;
  const steps: [string | number, unknown][] = Array.isArray(value) ? value.map((inner, index) => [index, inner]) : Object.entries(value);
  for (const [step, inner] of steps) {
    path.push(step);
    longValues(inner, minChars, path, into);
    path.pop();
  }
}

/**
 * The long values of inputs that may be moved out, in the order they leave: those of the tools that write a
 * file, oldest first, then Bash commands, oldest first. What a write tool was handed is on disk; a command
 * is what `find` and the check for a repeated call read, so it goes last.
 *
 * The first message stays, as its results do, and so does the input of a call that failed. The newest long
 * value stays whatever its size, and those before it stay while they and it add up to `keepChars`: an
 * allowance of the inputs' own, apart from the results', so that what results stay is as it was (ADR 0002).
 * From the first that goes over, every older one is a candidate.
 */
export function selectInputs(messages: readonly Message[], options: SelectOptions): InputCandidate[] {
  const failed = new Set<string>();
  for (const message of messages) {
    for (const result of message.toolResults ?? []) if (result.isError) failed.add(result.tool_use_id);
  }

  // Every long value that could leave, oldest first.
  const could: InputCandidate[] = [];
  messages.forEach((message, index) => {
    if (index === 0) return;
    for (const use of message.toolUses) {
      if (!INPUT_TOOLS.has(use.tool) || use.isError === true || failed.has(use.tool_use_id)) continue;
      const found: { path: (string | number)[]; text: string }[] = [];
      longValues(use.input, options.minChars, [], found);
      for (const { path, text } of found) {
        const field = [...path].reverse().find((step): step is string => typeof step === 'string') ?? 'value';
        could.push({ id: use.tool_use_id, tool: use.tool, path, field, text });
      }
    }
  });

  const candidates: InputCandidate[] = [];
  let kept = 0;
  let total = 0;
  let closed = false;
  for (let index = could.length - 1; index >= 0; index -= 1) {
    const candidate = could[index] as InputCandidate;
    if (!closed && ((kept === 0 && options.keepNewest !== false) || total + candidate.text.length <= options.keepChars)) {
      kept += 1;
      total += candidate.text.length;
      continue;
    }
    closed = true;
    candidates.push(candidate);
  }
  candidates.reverse();
  return [...candidates.filter((candidate) => candidate.tool !== 'Bash'), ...candidates.filter((candidate) => candidate.tool === 'Bash')];
}

/** Text the host writes into a person's turn. It is not what they said or are working on. */
export const HOST_TEXT = /<(system-reminder|task-notification|local-command-[a-z]+|command-[a-z]+)>[\s\S]*?<\/\1>/g;

/** The host hands a plugin the newest 4096 messages of a conversation and no more. */
export const HOST_SHOWS = 4096;

// The kinds of block a rebuilt message carries as text, or loses in the way the
// README says it does (thinking). Any other kind is something that would go
// missing without a word: a document, a kind that does not exist yet, an image
// in a person's message. An image inside a tool result leaves with that result
// (src/media.ts), so it is not one of them.
const REBUILT = new Set(['text', 'tool_use', 'tool_result', 'tool_reference', 'thinking', 'redacted_thinking']);

/**
 * Why this conversation is left to the built-in compaction, or null when
 * every message of it can be rebuilt. `api` is the conversation with its
 * blocks intact.
 */
export function whyNotRebuilt(messages: readonly Message[], api: unknown): string | null {
  if (!Array.isArray(api)) return 'the conversation could not be read with its blocks';
  if (messages.length >= HOST_SHOWS || api.length >= HOST_SHOWS) {
    return `the conversation has ${HOST_SHOWS} messages or more, and older ones may not have been shown`;
  }
  const kinds = new Set<string>();
  // `inResult` holds for the blocks of a tool result that is a message's own block
  // (`depth` 0): the one place `mediaIn` takes an image from. An image anywhere else stops the rebuild.
  const visit = (node: unknown, depth: number, inResult: boolean): void => {
    if (Array.isArray(node)) return node.forEach((one) => visit(one, depth, inResult));
    if (typeof node !== 'object' || node === null) return;
    const block = node as Record<string, unknown>;
    const kind = block['type'];
    if (typeof kind !== 'string') kinds.add('a block without a kind');
    else if (kind === 'image' && inResult) return;
    else if (!REBUILT.has(kind)) kinds.add(/^[a-z_]{1,40}$/.test(kind) ? kind : 'a kind with an unusual name');
    visit(block['content'], depth + 1, kind === 'tool_result' && depth === 0);
  };
  for (const message of api) visit((message as { content?: unknown } | null)?.content, 0, false);
  return kinds.size === 0 ? null : `the conversation holds what a rebuilt message cannot carry: ${[...kinds].sort().join(', ')}`;
}

/** What the person is working on: what they asked the compaction to keep, then their latest turns. */
export function goalOf(messages: readonly Message[], instructions: string | undefined): string {
  const said = messages.filter(saidByAPerson).map(sayingOf).slice(-3);
  return [instructions?.trim() ?? '', ...said].filter((text) => text !== '').join('\n\n');
}

const sayingOf = (message: Message): string =>
  message.text
    .replace(HOST_TEXT, '')
    .split('\n')
    // The line in place of the middle of what was said is this plugin's (ADR 0024).
    .filter((line) => readBodyTicket(line) === null)
    .join('\n')
    .trim();

/**
 * Whether a message is something a person said: theirs, no results, and not the host's text, a command, or a
 * line this plugin put in the conversation.
 */
export function saidByAPerson(message: Message): boolean {
  if (message.role !== 'user' || (message.toolResults?.length ?? 0) > 0) return false;
  const text = sayingOf(message);
  return text !== '' && !text.startsWith('/') && !text.startsWith(`[${PLUGIN}]`) && !WRITTEN_BY_CLAUDE_CODE.test(text);
}

// What Claude Code writes in a person's place: the mark of a turn stopped with Esc, what a Stop hook said back, a
// message another session sent, a command run with `!` and what it printed, and the note after a summary that
// held what others wrote.
const WRITTEN_BY_CLAUDE_CODE =
  /^(?:\[Request interrupted by user[^\]]*\]$|Stop hook feedback:|Another Claude session sent a message:|<bash-(?:input|stdout|stderr)>|<artifact-content-authored-by-others\/>)/;

/** Where the newest thing a person said stands, or -1: told as `goalOf` tells it. */
export function lastSaid(messages: readonly Message[]): number {
  for (let at = messages.length - 1; at >= 0; at -= 1) if (saidByAPerson(messages[at] as Message)) return at;
  return -1;
}
