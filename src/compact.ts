// One compaction: choose what leaves, move it out, hand the conversation back.

import { bodyText, selectBodies, type BodyCandidate } from './body.ts';
import { fold, runsIn, type Run } from './fold.ts';
import { messagesFromApi } from './keep.ts';
import { IMAGE_TOKENS, encodeMedia, type MediaPart } from './media.ts';
import { lastSaid, ruleOrder, select, selectInputs, type Candidate, type InputCandidate } from './select.ts';
import { isStored, moveBodyOut, moveInputOut, moveOut, readTicket, ticketText, type BodyTicket, type Moved, type MovedInput, type NotMoved, type StoreDirs, type Ticket } from './store.ts';
import type { Files, Message, ToolResult, ToolUse } from './types.ts';

export type Config = {
  /** Where results are written, and every place they are read from. */
  store: StoreDirs;
  /**
   * The newest result that could leave stays whatever its size; the ones before
   * it stay while they and the newest add up to this many tokens.
   */
  keepTokens: number;
  minChars: number;
  /** Results leave until the conversation is estimated under this share of the window, in percent. */
  targetPercent: number;
  /**
   * Over this share of the window after moving out, in percent, too much is still
   * in use to go on with and the built-in compaction takes over.
   */
  maxAfterPercent: number;
  /**
   * False leaves every call where it stands, whatever is still needed: what is measured is then the stages before
   * folding (ADR 0022). Not a setting: the hook never sets it, and a compaction folds.
   */
  fold?: false;
};

/** What a compaction needs of the host: files, and a clock. Nothing is sent anywhere. */
export type Host = {
  files: Files;
  now(): number;
};

export type Input = {
  messages: readonly Message[];
  /** Tokens in the context now: the conversation, the system prompt and the tools' definitions. */
  tokens: number;
  /**
   * How to count a size from what stays, see `countFrom`. Absent when it cannot be
   * told, and sizes are estimated from `tokens` alone, at three characters a token.
   */
  count?: Count;
  /** The size the context may reach, see `windowFrom`. */
  window: number;
  /** What the person is working on, in their words. */
  goal: string;
  /**
   * A /compact typed without instructions: once what is older than the newest `keepTokens` is out, the newest
   * calls are reached into too, up to what the person said last (ADR 0023).
   */
  byHand?: boolean;
  /**
   * The tool results that hold an image, by the id of their call, see `mediaIn`.
   * Each is moved out whatever its age or size: a rebuilt message cannot carry it.
   */
  media?: ReadonlyMap<string, readonly MediaPart[]>;
};

export type Report = {
  results: number;
  candidates: number;
  moved: number;
  /** Long values of the inputs of the tools that write a file and of Bash that left, each a ticket now in its call. */
  inputs: number;
  /** Long messages whose middles left, each kept whole (ADR 0024). */
  bodies?: number;
  /** Old tool calls folded into lists, each run kept as a part (ADR 0022). */
  folded: number;
  /** Of the results, inputs, middles and calls above, those taken from the newest turns by a /compact typed by hand (ADR 0023). */
  recent?: number;
  /** The images that left with their results; those results are among `moved`. */
  images: number;
  charsBefore: number;
  charsAfter: number;
  /** Estimated: the context after, in tokens, and the size it was measured against. */
  tokensAfter: number;
  /**
   * Whether `tokensAfter` is counted from what stays. When false it is `tokens` less
   * what was moved out, which still counts the thinking every compaction drops, and
   * is not a figure to show.
   */
  counted: boolean;
  window: number;
  /** Why results stayed: by what the store said, and `call-differs` for a call whose own text was another. */
  notMoved: Partial<Record<NotMoved['reason'] | 'call-differs', number>>;
  /** What the host said when writes failed, each once, at most three: ENOSPC for a full disk. */
  writeErrors: string[];
  ms: number;
};

export type Outcome = {
  /** The conversation after moving out, every message rebuilt without Claude Code's handle. */
  messages: Message[];
  /**
   * False when nothing left, or when too much is still in use and a summary of
   * what is left could change that: the built-in compaction should run on `messages`.
   */
  enough: boolean;
  /**
   * Why nothing was rebuilt: a result that holds an image could not be moved
   * out. `messages` are then the ones handed in, untouched, handles and all.
   */
  abandoned?: string;
  /**
   * The size results were moved out to reach, in tokens: `targetPercent` of the window, and never more
   * than half of what was in use. Where the oldest messages are kept in place of a summary, they are cut
   * down to the same size (src/cut.ts).
   */
  target: number;
  report: Report;
};

// ponytail: three characters a token is what `keepTokens` is turned into characters
// with, and what sizes are estimated at when the breakdown cannot be relied on. Results
// of reading source code measured 2.2 to 2.3 characters a token, prose in English runs
// near 4, Japanese at a character or less. There a size is `tokens` less what was moved
// out, and too high a figure is the worse mistake: what was saved is underestimated, and
// a compaction that did enough is handed to the built-in one. Where the breakdown can be
// relied on, sizes are counted at the session's own density instead (`countFrom`). The
// host counts no text for a plugin.
export const CHARS_PER_TOKEN = 3;
const WRITES_IN_FLIGHT = 16;

/** What Claude Code says of the context, as far as `countFrom` reads it. */
export type Breakdown = { categories?: unknown; apiUsage?: unknown };

/** What Claude Code says of the context, cut down to what a compaction measures against. */
export type Context = { window?: unknown; breakdown?: { autoCompactThreshold?: unknown } & Breakdown };

/**
 * The size the context may reach: where Claude Code compacts on its own when
 * it says so, else the model's window. Measured against the model's window, a
 * compaction could hand back a conversation that is compacted again at once.
 */
export function windowFrom(context: Context | undefined, fallback: number): number {
  const sizes = [context?.breakdown?.autoCompactThreshold, context?.window];
  return sizes.find((size): size is number => typeof size === 'number' && Number.isFinite(size) && size > 0) ?? fallback;
}

/** What the person and the model said, the calls' inputs and the results, each text measured and added up. */
function sizeOf(messages: readonly Message[], measure: (text: string) => number): number {
  let total = 0;
  for (const message of messages) {
    total += measure(message.text);
    for (const use of message.toolUses) total += measure(JSON.stringify(use.input));
    for (const result of message.toolResults ?? []) total += measure(result.text);
  }
  return total;
}

const lengthOf = (text: string): number => text.length;

/**
 * The characters of a text weighted by what they tend to come to in tokens: a digit as
 * two characters, a character that is not ASCII as three. Measured, logs of numbers ran
 * near twice the tokens a character of English prose, and Japanese near three times: at
 * one figure for all of them, Japanese left after logs were moved out came 20 % under
 * (ADR 0013).
 */
export function weigh(text: string): number {
  let total = text.length;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (code > 127) total += 2;
    else if (code >= 48 && code <= 57) total += 1;
  }
  return total;
}

/** The characters of a conversation: what the person and the model said, the calls' inputs, the results. */
export function charsOf(messages: readonly Message[]): number {
  return sizeOf(messages, lengthOf);
}

/** The characters of a conversation, weighted as `weigh` does. */
export function weightOf(messages: readonly Message[]): number {
  return sizeOf(messages, weigh);
}

/**
 * The tokens `messages` come to, the way a compaction counts them: weighted characters at the
 * session's density where sizes are counted from what stays, else characters at three a token.
 */
export function tokensOf(messages: readonly Message[], count: Count | undefined): number {
  return count === undefined ? charsOf(messages) * (1 / CHARS_PER_TOKEN) : weightOf(messages) * count.density;
}

async function inParallel<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const work = async () => {
    for (let index = next++; index < items.length; index = next++) {
      out[index] = await run(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work));
  return out;
}

/** The results that already are tickets of this store, by the id of their call, with what the ticket says. */
async function storedTickets(files: Files, dirs: readonly string[], messages: readonly Message[]): Promise<Map<string, Ticket>> {
  const shaped = messages.flatMap((message) => message.toolResults ?? []).filter((result) => readTicket(result.text));
  const kept = await inParallel(shaped, WRITES_IN_FLIGHT, (result) => isStored(files, dirs, result.text));
  return new Map(shaped.filter((_, index) => kept[index]).map((result) => [result.tool_use_id, readTicket(result.text) as Ticket]));
}

/** One value of a call's input that left: where it stood in the input, and the line that stands there now. */
type MovedValue = { path: readonly (string | number)[]; line: string };

/** A copy of `input` with each value named by a path replaced by its line. What is not on a path is the same value. */
function withValues(input: Record<string, unknown>, values: readonly MovedValue[]): Record<string, unknown> {
  const copy = (value: unknown, path: (string | number)[]): unknown => {
    const here = values.find((one) => one.path.length === path.length && one.path.every((step, at) => step === path[at]));
    if (here !== undefined) return here.line;
    if (Array.isArray(value)) return value.map((inner, index) => copy(inner, [...path, index]));
    if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copy(inner, [...path, key])]));
    return value;
  };
  return copy(input, []) as Record<string, unknown>;
}

/**
 * Every message without its handle, moved-out results replaced by their tickets
 * on both sides of the call. A ticket an earlier compaction left is written in
 * the current wording, same id and size, so that a conversation compacted again
 * names the tool that exists now (ADR 0004). A message handed back with its
 * handle makes Claude Code restore the whole history when the session is resumed.
 */
function rebuild(
  messages: readonly Message[],
  moved: ReadonlyMap<string, Moved>,
  stored: ReadonlyMap<string, Ticket>,
  inputs: ReadonlyMap<string, readonly MovedValue[]> = new Map(),
  bodies: ReadonlyMap<number, string> = new Map(),
): Message[] {
  const lineFor = (id: string): string | undefined => {
    const ticket = moved.get(id) ?? stored.get(id);
    return ticket && ticketText(ticket);
  };
  const out: Message[] = [];
  for (const [at, message] of messages.entries()) {
    const toolUses = message.toolUses.map((use): ToolUse => {
      const values = inputs.get(use.tool_use_id);
      const input = values === undefined ? use.input : withValues(use.input, values);
      const line = lineFor(use.tool_use_id);
      if (line === undefined) return { ...use, input };
      const { result: _result, ...rest } = use;
      return { ...rest, input, text: line };
    });
    const toolResults = (message.toolResults ?? []).map((result): ToolResult => {
      const line = lineFor(result.tool_use_id);
      return line === undefined ? { ...result } : { tool_use_id: result.tool_use_id, text: line, isError: false };
    });
    if (message.text === '' && toolUses.length === 0 && toolResults.length === 0) continue;
    const rebuilt: Message = { role: message.role, text: bodies.get(at) ?? message.text, toolUses };
    if (toolResults.length > 0) rebuilt.toolResults = toolResults;
    out.push(rebuilt);
  }
  return answeredNext(out);
}

/**
 * The messages with every call answered in the message right after it. Claude Code keeps each block of a response
 * as a message of its own, and writes a result as soon as its call ends, while the response may still be making
 * calls: a call, another, the first's result, a third, the others' results. With its handle a message is the
 * engine's and is put back together; rebuilt without one, a call whose result is not in the message right after it
 * is answered as lost to an internal error, and a result that answers no call right before it is dropped (measured
 * on Claude Code 2.1.289).
 *
 * So while calls of a response wait for results the conversation holds further on, the assistant messages that
 * come are of that response and join it, the results join the one message right after it, and what a person said
 * meanwhile comes after the results, as Claude Code hands it to the model. A call with no result further on is not
 * waited for. Where every call is answered right after it, nothing waits, and every message stays as it was.
 * `messages` are rebuilt ones, of the caller's own making: they are put together in place.
 */
function answeredNext(messages: Message[]): Message[] {
  // Where each call's last result stands: a call waits only for a result further on, so that a wait always ends.
  const lastResult = new Map<string, number>();
  messages.forEach((message, at) => {
    for (const result of message.toolResults ?? []) lastResult.set(result.tool_use_id, at);
  });
  const answeredAfter = (id: string, at: number): boolean => (lastResult.get(id) ?? -1) > at;
  const out: Message[] = [];
  const waiting = new Set<string>();
  // The response whose calls wait, the message of its results, and what was said while they ran.
  let open: Message | null = null;
  let results: Message | null = null;
  let held: Message[] = [];
  const close = () => {
    out.push(...held);
    open = null;
    results = null;
    held = [];
    waiting.clear();
  };
  for (const [at, message] of messages.entries()) {
    if (open !== null && message.role === 'assistant' && message.toolResults === undefined) {
      open.text = [open.text, message.text].filter((text) => text !== '').join('\n');
      open.toolUses.push(...message.toolUses);
      for (const use of message.toolUses) if (answeredAfter(use.tool_use_id, at)) waiting.add(use.tool_use_id);
      continue;
    }
    if (open !== null && message.role === 'user') {
      const answers = message.toolResults ?? [];
      if (answers.length > 0 && results === null) {
        // The first of the results stands as it came, what was said in it as well.
        results = message;
        out.push(message);
      } else {
        if (answers.length > 0) (results as Message).toolResults?.push(...answers);
        if (message.text !== '') held.push({ role: 'user', text: message.text, toolUses: [] });
      }
      for (const answer of answers) waiting.delete(answer.tool_use_id);
      if (waiting.size === 0) close();
      continue;
    }
    // An assistant message that holds results is not one Claude Code makes: it stands, and ends what waited.
    if (open !== null) close();
    out.push(message);
    if (message.role !== 'assistant') continue;
    for (const use of message.toolUses) if (answeredAfter(use.tool_use_id, at)) waiting.add(use.tool_use_id);
    if (waiting.size > 0) open = message;
  }
  if (open !== null) close();
  return out;
}

/**
 * A size counted from what stays: what is not the conversation, and the density of the
 * conversation, the tokens one weighted character of it came to as it was sent
 * (`countFrom`).
 */
export type Count = { fixedTokens: number; density: number };

/** How many images a conversation read with its blocks holds, wherever they stand. */
export function imagesOf(api: unknown): number {
  let total = 0;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object' || node === null) return;
    if ((node as { type?: unknown }).type === 'image') total += 1;
    else visit((node as { content?: unknown }).content);
  };
  if (Array.isArray(api)) for (const message of api) visit((message as { content?: unknown } | null)?.content);
  return total;
}

// What a signature grows by for every token of the thinking it signs. Measured per
// response, a signature was as long as a fixed part and 2.1 to 2.2 characters a token on
// Haiku 4.5, 1.95 to 2.1 on Opus 5.5. A little over both: the shortest signature, which
// stands in for the fixed part, was shorter than it on Haiku.
const SIGNATURE_CHARS_PER_TOKEN = 2.3;
/** Above this share of the `Messages` row, an estimate of the thinking is not one to count with. */
const MOST_THINKING = 0.9;
/** The tokens a weighted character can come to. Measured, 0.2 to 0.5. */
const DENSITY = { least: 0.05, most: 3 };
// What Claude Code added to a conversation as it sent it came to fewer tokens than as many weighted characters
// of the messages did: 0.75 to 0.88 of them in four long working sessions on Opus 5.5, for no reason that was
// found. Counted as the messages are, those sessions came 4 % to 10 % under. At four fifths they come 2 % under
// to 3 % over, the size being held closer on the side of too little.
const ADDED = 0.8;

/**
 * The tokens of the thinking in a conversation read with its blocks. They are in the
 * `Messages` row and gone once the messages are rebuilt, and nothing says how many they
 * are: the breakdown has no row for them and a message carries no usage. What can be
 * read is each thinking block's signature, whose length is a line in the tokens it
 * signs. What every block carries whatever it thought is not known and differs by
 * model, so the shortest signature of the conversation stands in for it. A block
 * without a signature counts as none.
 */
export function thinkingOf(api: unknown): number {
  let blocks = 0;
  let chars = 0;
  let shortest = Infinity;
  if (Array.isArray(api)) {
    for (const message of api) {
      const content = (message as { content?: unknown } | null)?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const { type, signature } = (block ?? {}) as { type?: unknown; signature?: unknown };
        if (type !== 'thinking' || typeof signature !== 'string' || signature === '') continue;
        blocks += 1;
        chars += signature.length;
        shortest = Math.min(shortest, signature.length);
      }
    }
  }
  return blocks === 0 ? 0 : (chars - blocks * shortest) / SIGNATURE_CHARS_PER_TOKEN;
}

/**
 * How to count a size from what stays, from Claude Code's breakdown. What is not the
 * conversation is every row in use but `Messages`. The conversation is that row less
 * what goes whatever is moved out: the images, which a rebuilt message cannot carry,
 * the thinking (`thinkingOf`), and what Claude Code added to the conversation as it
 * sent it: reminders after results and after what the person said, the text of
 * commands and of what was attached. That is in no message a hook is handed and so in
 * none it hands back; in a long working session it was three quarters as much again as
 * the messages held. The row less images and thinking is spread over the weighted
 * characters of the conversation as it was sent, read with its blocks, those Claude
 * Code added counting for less (`ADDED`); that is the density, and a rebuilt
 * conversation is counted at it over the characters of its messages (ADR 0013).
 *
 * Undefined unless it can be relied on: `tokens` is Claude Code's own figure, the
 * breakdown carries the last response's usage, which its `Messages` row is
 * reconciled to, there is such a row, what is left lies between nothing and
 * `tokens`, the conversation can be read as it was sent, the thinking comes out at no
 * more than nine tenths of the row, and the density within what a tokenizer can come to.
 */
export function countFrom(breakdown: Breakdown | undefined, tokens: unknown, api: unknown, messages: readonly Message[]): Count | undefined {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) return undefined;
  if (typeof breakdown?.apiUsage !== 'object' || breakdown.apiUsage === null || !Array.isArray(breakdown.categories)) return undefined;
  const used = breakdown.categories.filter(
    (row): row is { name: string; tokens: number } =>
      typeof row === 'object' && row !== null && (row as { kind?: unknown }).kind === 'used' &&
      typeof (row as { name?: unknown }).name === 'string' &&
      typeof (row as { tokens?: unknown }).tokens === 'number' && Number.isFinite((row as { tokens: number }).tokens),
  );
  const conversation = used.find((row) => row.name === 'Messages');
  if (conversation === undefined) return undefined;
  const fixedTokens = used.filter((row) => row !== conversation).reduce((sum, row) => sum + row.tokens, 0);
  if (!(fixedTokens > 0 && fixedTokens < tokens)) return undefined;
  const thinking = thinkingOf(api);
  if (thinking > conversation.tokens * MOST_THINKING) return undefined;
  // Images are left out on both sides: their bytes are not among the characters, so
  // their tokens are taken off the row. Left in the row alone, the figure would say
  // a conversation of screenshots is still too full once every one of them is gone.
  // As it is read to be kept before a summary: what was said, the inputs and the results, no thinking, and a
  // line of sixteen characters for an image. Where it cannot be read, what Claude Code added cannot be told
  // from what stays, and nothing is counted. What it holds beyond the messages is what was added.
  const read = messagesFromApi(api);
  if (read === null) return undefined;
  const held = weightOf(messages);
  const sent = held + ADDED * Math.max(0, weightOf(read) - held);
  const density = (conversation.tokens - imagesOf(api) * IMAGE_TOKENS - thinking) / sent;
  if (!(density >= DENSITY.least && density <= DENSITY.most)) return undefined;
  return { fixedTokens, density };
}

export async function compact(input: Input, config: Config, host: Host): Promise<Outcome> {
  const started = host.now();
  const { files } = host;
  const stored = await storedTickets(files, config.store.read, input.messages);
  const resultCount = input.messages.reduce((sum, message) => sum + (message.toolResults?.length ?? 0), 0);

  // First, and whatever else is decided: every result that holds an image. Each is
  // stored whole, text and images, and becomes one ticket. If one of them cannot be,
  // nothing is rebuilt, since a rebuilt message would lose the image without a word.
  const moved = new Map<string, Moved>();
  const held = input.media ?? new Map<string, readonly MediaPart[]>();
  let images = 0;
  if (held.size > 0) {
    const tools = new Map(input.messages.flatMap((message) => message.toolUses.map((use) => [use.tool_use_id, use.tool] as const)));
    const here = new Set(input.messages.flatMap((message) => (message.toolResults ?? []).map((result) => result.tool_use_id)));
    const abandon = (why: string): Outcome => ({
      messages: [...input.messages],
      enough: false,
      abandoned: why,
      target: Math.min((input.window * config.targetPercent) / 100, input.tokens / 2),
      report: {
        results: resultCount,
        candidates: 0,
        moved: 0,
        inputs: 0,
        folded: 0,
        images: 0,
        charsBefore: charsOf(input.messages),
        charsAfter: charsOf(input.messages),
        tokensAfter: input.tokens,
        counted: false,
        window: input.window,
        notMoved: {},
        writeErrors: [],
        ms: host.now() - started,
      },
    });
    // Whatever the hook's messages say of them: what holds an image as it was sent is moved out.
    const ids = [...held.keys()];
    if (ids.some((id) => !here.has(id))) return abandon('a tool result that holds an image is not among the messages shown');
    // The same image returned twice is one text: the first of each is written side by side
    // with the others, and the rest after, when the text is there and only the ticket is made.
    // Two writes of one file at a time can spoil each other.
    const texts = new Map(ids.map((id) => [id, encodeMedia(held.get(id) as readonly MediaPart[])]));
    const first = new Map<string, string>();
    for (const id of ids) if (!first.has(texts.get(id) as string)) first.set(texts.get(id) as string, id);
    const leading = [...first.values()];
    const store = (id: string) => moveOut(files, config.store.write, tools.get(id) ?? 'tool', texts.get(id) as string);
    const written = await inParallel(leading, WRITES_IN_FLIGHT, store);
    const firsts = new Map(leading.map((id, at) => [id, written[at] as Moved | NotMoved]));
    for (const id of ids) {
      const result = firsts.get(id) ?? (await store(id));
      if ('reason' in result) {
        return abandon(`a tool result that holds an image could not be moved out (${result.code ?? result.reason})`);
      }
      moved.set(id, result);
      images += (held.get(id) as readonly MediaPart[]).filter((part) => part.type === 'image').length;
    }
  }

  const { candidates, left: stayed } = select(
    input.messages,
    { keepChars: config.keepTokens * CHARS_PER_TOKEN, minChars: config.minChars },
    // A result that left above is no more a candidate than one that is a ticket already.
    new Set([...stored.keys(), ...moved.keys()]),
  );

  // What is in use, counted from what stays when what is not the conversation is
  // known. Every message is rebuilt and carries no thinking, so the thinking in
  // `tokens` is gone afterwards whatever is moved out: counted from `tokens`, a
  // conversation that fits could be handed to the built-in summary (#24).
  const { count } = input;
  // One measure for every size below, what is needed and what a result saves included:
  // weighted characters at the session's density when sizes are counted, else characters
  // at three a token. Measured one way and saved another, results would be moved out
  // until a goal is met that the size afterwards then misses.
  const measure = count === undefined ? lengthOf : weigh;
  const perUnit = count?.density ?? 1 / CHARS_PER_TOKEN;
  const charsBefore = charsOf(input.messages);
  const before = count === undefined ? input.tokens : count.fixedTokens + tokensOf(input.messages, count);
  // At most the target, and never more than half of what is there now: a
  // compaction that was asked for should leave room to work in. Both measured the
  // same way, so that something is always needed.
  const target = Math.min((input.window * config.targetPercent) / 100, before / 2);
  const need = before - target;
  // The order results leave in is decided by rules alone: those a later call made
  // obsolete first, then those sharing the least with the goal, then the oldest.
  const order = ruleOrder(candidates, input.goal);

  const notMoved: Report['notMoved'] = {};
  const writeErrors: string[] = [];
  if (stayed.unlike > 0) notMoved['call-differs'] = stayed.unlike;
  // Counted from what stays, images are in neither size. Where a size is `tokens` less
  // what left, the images that left above are taken off as well, at the same rough figure:
  // `tokens` holds them, as Claude Code's own figure or as the caller made it up.
  let saved = count === undefined ? images * IMAGE_TOKENS * CHARS_PER_TOKEN : 0;
  const short = (): boolean => saved * perUnit < need;
  const missed = (result: NotMoved): void => {
    notMoved[result.reason] = (notMoved[result.reason] ?? 0) + 1;
    if (result.code !== undefined && !writeErrors.includes(result.code) && writeErrors.length < 3) writeErrors.push(result.code);
  };

  // Results, as many at a time as the estimate says are still needed, written side by side. Each round takes at
  // least one, so the loop ends when the candidates do.
  const tried = new Set<string>();
  const moveResults = async (queue: readonly Candidate[]): Promise<number> => {
    const left = [...queue];
    let n = 0;
    while (short() && left.length > 0) {
      const wave: Candidate[] = [];
      const sizes: number[] = [];
      let expected = saved;
      do {
        const candidate = left.shift() as Candidate;
        const size = measure(candidate.text);
        tried.add(candidate.id);
        wave.push(candidate);
        sizes.push(size);
        expected += size;
      } while (left.length > 0 && expected * perUnit < need);
      const written = await inParallel(wave, WRITES_IN_FLIGHT, (candidate) =>
        moveOut(files, config.store.write, candidate.tool, candidate.text),
      );
      wave.forEach((candidate, at) => {
        const result = written[at] as Moved | NotMoved;
        if ('reason' in result) return missed(result);
        moved.set(candidate.id, result);
        n += 1;
        saved += Math.max(0, (sizes[at] as number) - measure(result.text));
      });
    }
    return n;
  };

  // Then the long values handed to the tools that write a file and to Bash, with an allowance of their own for the
  // newest (ADR 0020). What a write tool was handed is on disk as well.
  const inputs = new Map<string, MovedValue[]>();
  let inputsMoved = 0;
  const valueOf = (one: InputCandidate): string => `${one.id} ${JSON.stringify(one.path)}`;
  const triedValues = new Set<string>();
  const moveInputs = async (queue: readonly InputCandidate[]): Promise<number> => {
    const waiting = [...queue];
    let n = 0;
    while (short() && waiting.length > 0) {
      const wave: InputCandidate[] = [];
      let expected = saved;
      do {
        const candidate = waiting.shift() as InputCandidate;
        triedValues.add(valueOf(candidate));
        wave.push(candidate);
        expected += measure(candidate.text);
      } while (waiting.length > 0 && expected * perUnit < need);
      const written = await inParallel(wave, WRITES_IN_FLIGHT, (candidate) =>
        moveInputOut(files, config.store.write, candidate.tool, candidate.field, candidate.text),
      );
      wave.forEach((candidate, at) => {
        const result = written[at] as MovedInput | NotMoved;
        if ('reason' in result) return missed(result);
        inputs.set(candidate.id, [...(inputs.get(candidate.id) ?? []), { path: candidate.path, line: result.text }]);
        inputsMoved += 1;
        n += 1;
        saved += Math.max(0, measure(candidate.text) - measure(result.text));
      });
    }
    return n;
  };

  // Then the middles of long messages, a person's or Claude's: the whole message kept, its first and last paragraphs
  // and a line in its place (ADR 0024).
  const bodies = new Map<number, string>();
  let bodiesMoved = 0;
  const triedBodies = new Set<number>();
  const moveBodies = async (queue: readonly BodyCandidate[]): Promise<number> => {
    const waiting = [...queue];
    let n = 0;
    while (short() && waiting.length > 0) {
      const wave: BodyCandidate[] = [];
      let expected = saved;
      do {
        const candidate = waiting.shift() as BodyCandidate;
        triedBodies.add(candidate.at);
        wave.push(candidate);
        expected += measure(candidate.text);
      } while (waiting.length > 0 && expected * perUnit < need);
      const written = await inParallel(wave, WRITES_IN_FLIGHT, (candidate) => moveBodyOut(files, config.store.write, candidate.role, candidate.text));
      wave.forEach((candidate, at) => {
        const result = written[at] as (BodyTicket & { text: string }) | NotMoved;
        if ('reason' in result) return missed(result);
        const text = bodyText(candidate.head, result.text, candidate.tail);
        bodies.set(candidate.at, text);
        bodiesMoved += 1;
        n += 1;
        saved += Math.max(0, measure(candidate.text) - measure(text));
      });
    }
    return n;
  };

  // Then runs of old calls, oldest first: each kept whole as a part, and a list of the calls in its place. What the
  // person and Claude said stays as it was (ADR 0022).
  const lists = new Map<number, { run: Run; list: Message }>();
  let folded = 0;
  // A run found again by the pass that reaches the newest calls, less what the first pass folded of it. Runs begin
  // at the same messages in both passes, so what was folded of one is its first pairs.
  const unfolded = (run: Run): Run | null => {
    const done = lists.get(run.first);
    if (done === undefined) return run;
    if (done.run.last >= run.last) return null;
    const first = done.run.last + 1;
    return { first, last: run.last, messages: run.messages.slice(first - run.first) };
  };
  const failedRuns = new Set<number>();
  const foldRuns = async (runs: readonly Run[]): Promise<number> => {
    let n = 0;
    for (const found of runs) {
      if (!short()) break;
      const run = unfolded(found);
      if (run === null || failedRuns.has(run.first)) continue;
      // Folded only where the list takes less room than the calls it stands for, measured as every size here is.
      const done = await fold(files, config.store.write, run, (list) => sizeOf([list], measure) < sizeOf(run.messages, measure));
      if ('notWorth' in done) continue;
      if ('reason' in done) {
        missed(done);
        failedRuns.add(run.first);
        continue;
      }
      lists.set(run.first, { run, list: done.list });
      folded += done.calls;
      n += done.calls;
      saved += Math.max(0, sizeOf(run.messages, measure) - sizeOf([done.list], measure));
    }
    return n;
  };

  // First everything older than the newest `keepTokens`, in that order.
  const keepChars = config.keepTokens * CHARS_PER_TOKEN;
  await moveResults(order);
  await moveInputs(selectInputs(input.messages, { keepChars, minChars: config.minChars }));
  await moveBodies(selectBodies(input.messages, { keepChars, minChars: config.minChars }));
  let rebuilt = rebuild(input.messages, moved, stored, inputs, bodies);
  if (config.fold !== false && short()) await foldRuns(runsIn(rebuilt, keepChars, config.minChars));

  // Then, for a /compact typed without instructions and while still short, the same four into the newest calls,
  // up to what the person said last: they asked for it now, and what they asked for and what was done for it since
  // stays (ADR 0023).
  let recent = 0;
  const said = input.byHand === true ? lastSaid(input.messages) : -1;
  if (said > 0 && short()) {
    const older = input.messages.slice(0, said);
    // A call answered at or after what the person said last is of what came after it, wherever the call stands: its
    // long input and its run stay. Its result is not among `older`.
    const late = new Set(input.messages.slice(said).flatMap((message) => (message.toolResults ?? []).map((result) => result.tool_use_id)));
    // Nothing the first round moved or tried: a result that left above with its images would be written again as
    // its text alone, and its ticket would no longer bring them back.
    const newer = select(older, { keepChars: 0, minChars: config.minChars, keepNewest: false }, new Set([...stored.keys(), ...moved.keys(), ...tried]));
    recent += await moveResults(ruleOrder(newer.candidates, input.goal));
    const values = selectInputs(older, { keepChars: 0, minChars: config.minChars, keepNewest: false });
    recent += await moveInputs(values.filter((one) => !late.has(one.id) && !triedValues.has(valueOf(one))));
    recent += await moveBodies(selectBodies(older, { keepChars: 0, minChars: config.minChars, keepNewest: false }).filter((one) => !triedBodies.has(one.at)));
    rebuilt = rebuild(input.messages, moved, stored, inputs, bodies);
    const saidHere = lastSaid(rebuilt);
    const runs = saidHere > 0 ? runsIn(rebuilt.slice(0, saidHere), 0, config.minChars) : [];
    const earlier = runs.filter((run) => !run.messages.some((message) => message.toolUses.some((use) => late.has(use.tool_use_id))));
    if (config.fold !== false && short()) recent += await foldRuns(earlier);
  }
  const messages: Message[] = [];
  for (let at = 0; at < rebuilt.length; at += 1) {
    const here = lists.get(at);
    if (here === undefined) {
      messages.push(rebuilt[at] as Message);
      continue;
    }
    // What Claude said with the first calls of the run stays, and the list stands after it.
    const said = (rebuilt[at] as Message).text;
    if (said !== '') messages.push({ role: 'assistant', text: said, toolUses: [] });
    messages.push(here.list);
    at = here.run.last;
  }
  // What is measured against the window is everything in it: the system prompt and the
  // tools' definitions too, which no compaction makes smaller.
  const charsAfter = charsOf(messages);
  const conversationAfter = tokensOf(messages, count);
  const tokensAfter = Math.round(count === undefined ? input.tokens - saved * perUnit : count.fixedTokens + conversationAfter);
  // How far over what may stay in use. A summary can take away no more than the
  // conversation that is left: when that does not cover it, handing over gains nothing.
  const over = tokensAfter - mayStay(input.window, config.maxAfterPercent);
  return {
    messages,
    enough: moved.size + inputsMoved + bodiesMoved + folded > 0 && (over <= 0 || conversationAfter < over),
    target,
    report: {
      results: resultCount,
      candidates: candidates.length,
      moved: moved.size,
      inputs: inputsMoved,
      bodies: bodiesMoved,
      folded,
      recent,
      images,
      charsBefore,
      charsAfter,
      tokensAfter,
      counted: count !== undefined,
      window: input.window,
      notMoved,
      writeErrors,
      ms: host.now() - started,
    },
  };
}

/** The line a compaction shows. A size of the context is named only when it was counted from what stays. */
export function reportLine(report: Report): string {
  const took = report.ms < 1000 ? `${report.ms} ms` : `${(report.ms / 1000).toFixed(1)} s`;
  const stayed = Object.entries(report.notMoved)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ');
  return (
    `moved ${report.moved} of ${report.results} tool results out` +
    (report.images === 0 ? '' : `, ${report.images} ${report.images === 1 ? 'image' : 'images'} with them`) +
    (report.inputs === 0 ? '' : ` and ${report.inputs} tool ${report.inputs === 1 ? 'input' : 'inputs'}`) +
    (report.bodies ? `, the middle of ${report.bodies} long ${report.bodies === 1 ? 'message' : 'messages'}` : '') +
    (report.folded === 0 ? ' ' : `, ${report.folded} old tool ${report.folded === 1 ? 'call' : 'calls'} folded into lists `) +
    `(${report.charsBefore} -> ${report.charsAfter} chars` +
    (report.counted ? `, about ${report.tokensAfter} of ${report.window} tokens in use) ` : ') ') +
    `in ${took}` +
    (report.recent ? `; ${report.recent} of these from the newest turns` : '') +
    (stayed === '' ? '' : `; left in place: ${stayed}`) +
    (report.writeErrors.length === 0 ? '' : `; could not write: ${report.writeErrors.join(', ')}`)
  );
}

/**
 * The tokens that may stay in use to go on with: `maxAfterPercent` of the size at
 * which Claude Code compacts on its own. One line for what is left after moving
 * out, for what is in use where nothing could be moved, and for what is left once
 * the oldest messages are kept in place of a summary (src/cut.ts).
 */
export function mayStay(window: number, maxAfterPercent: number): number {
  return (window * maxAfterPercent) / 100;
}

/** What a compaction that moved nothing out is decided by, see `leftUndone`. */
export type CompactRequest = {
  /** Who asked for the compaction, as Claude Code says it. */
  trigger: string | undefined;
  /** What `/compact` was given to summarize by. */
  instructions: string | undefined;
  /**
   * What is in use now, as Claude Code gives it, thinking included: a compaction left
   * undone rebuilds nothing, so nothing of it goes. Not the size a report estimates,
   * which is less the thinking.
   */
  inUse: number;
  /** The size at which Claude Code compacts on its own, see `windowFrom`. */
  window: number;
  maxAfterPercent: number;
  /** The results that could have left. */
  candidates: number;
};

/**
 * Whether a compaction that moved nothing out is left undone, where it would be
 * handed to the built-in summary (ADR 0015): run by hand, with no instructions,
 * with nothing that could leave, and with no more in use than may stay. An
 * automatic compaction never is: it runs because the conversation is full.
 */
export function leftUndone(asked: CompactRequest): boolean {
  return (
    asked.trigger === 'manual' &&
    asked.candidates === 0 &&
    (asked.instructions ?? '').trim() === '' &&
    asked.inUse <= mayStay(asked.window, asked.maxAfterPercent)
  );
}

/** The line a `/compact` left undone shows. What is in use is named only when Claude Code gave the figure. */
export function undoneLine(inUse: number | null, window: number, parts?: { fixed: number; first: number }): string {
  // What takes the room, where it was counted: what no compaction makes smaller, the first message, which stays,
  // and the rest (ADR 0023).
  const taken =
    inUse === null || parts === undefined
      ? ''
      : `; of what is in use, ${parts.fixed} are sent with every request (the system prompt, tools, memory and the like), ${parts.first} the first message and ${Math.max(0, inUse - parts.fixed - parts.first)} the rest`;
  return (
    `nothing to move out${inUse === null ? '' : `, ${inUse} of ${window} tokens in use`}: ` +
    `the conversation is left as it is${taken}. /compact with instructions runs Claude Code's summary`
  );
}
