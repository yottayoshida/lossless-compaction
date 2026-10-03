// Finding, among the results moved out of a conversation, the one a question
// is about: what the `find` tool answers with.

import { choose, digest, inputLine, stateFor, type Provider } from './ask.ts';
import { unnumbered } from './changed.ts';
import { callsOfLines } from './keep.ts';
import { PART, PLUGIN, RECALL_TOOL, isOwnTool, isStored, readPartTicket, readTicket, recall, type Ticket } from './store.ts';
import type { Files, Http, Message } from './types.ts';

/** The text of a result is returned when the likeliest option has at least this probability ... */
export const FOUND_AT = 0.5;
/** ... and is at least this far ahead of the next one. Otherwise the likeliest few are listed. */
export const MARGIN = 0.3;
/** How many are listed then. */
export const LISTED = 3;
/** A phrase the question quotes narrows the options only when it is at least this long. */
export const MIN_PHRASE = 12;
/** The option put beside the results in every request: the answer may be none of them. */
export const NONE = 'none';
const NONE_TEXT = 'None of these: the result the question is about is not among the moved-out results.';
/** A stored text up to this size is blanked whole before it is digested; a larger one only in its head. */
export const WHOLE_UP_TO = 256 * 1024;
export const HEAD_CHARS = 8 * 1024;
const DIGEST_CHARS = 400;
/** At most this many parts of kept conversations are read for the tickets in them. */
export const MAX_PARTS = 64;
/**
 * Tickets read from kept parts are offered until the choice holds this many:
 * with eighty options to a request it takes about seventeen requests, under
 * the twenty-four a question may make. The conversation's own tickets are
 * always offered, however many they are.
 */
export const MAX_OFFERED = 1200;

export type FindInput = {
  files: Files;
  /** Where results are read from, the place written to first. */
  dirs: readonly string[];
  /** The conversation as the host hands it to a hook. */
  messages: readonly Message[];
  provider: Provider | null;
  http: Http;
  /** The host's clock, to give a request up by. */
  wait?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined;
  /** What the model asked for, in words. */
  question: unknown;
  /** Set when a subagent called, which this plugin moves nothing out of. */
  agentId?: string | undefined;
};

/**
 * A ticket of the conversation, or of a part of a conversation kept before a
 * summary, with what it stands for in words: the call that made the result, or
 * which messages the part holds.
 */
export type Stored = Ticket & { line: string; about: string };

/**
 * The phrases the question puts in double quotes, long enough to narrow by.
 * Backticks do not count: a model puts an identifier in them without meaning
 * "as written", and one stored text that happens to hold it is not an answer.
 */
export function phrasesOf(question: string): string[] {
  const phrases: string[] = [];
  for (const match of question.matchAll(/"([^"\n]+)"/g)) {
    const phrase = match[1] ?? '';
    if (phrase.length >= MIN_PHRASE) phrases.push(phrase);
  }
  return phrases;
}

/** The values of a question count only when one of them has at least this many digits: "step 17 of log 42" names no result. */
export const MIN_DIGITS = 3;
/** A run with fewer digits than this is no value at all: the 2 of "the 2 logs", the 7 of `log7.txt`. */
export const VALUE_DIGITS = 2;
/** At most this many results that hold the values are listed by name when Jev takes none of the results. */
export const VALUED_LISTED = 8;

const digitsOf = (value: string) => (value.match(/\d/g) ?? []).length;

/**
 * The values the question names: runs of letters and digits, with `-`, `.`,
 * `:` or `_` inside, that hold `VALUE_DIGITS` digits or more — a number, a
 * checksum, a record's code — in quotes or not. None unless one of them has
 * `MIN_DIGITS` digits. A number written with commas between its digits
 * ("9,821.50") is cut by them into runs none of which is the number: it
 * gives no value. Jev is shown the start of each result, so a value further
 * down is not in front of it: the result that holds the values is looked
 * for and told to it.
 */
export function valuesOf(question: string): string[] {
  const values = new Set<string>();
  for (const match of question.matchAll(/[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?/g)) {
    const [value, at] = [match[0], match.index];
    if (/\d,$/.test(question.slice(Math.max(0, at - 2), at)) || /^,\d/.test(question.slice(at + value.length, at + value.length + 2))) continue;
    if (digitsOf(value) >= VALUE_DIGITS) values.add(value);
  }
  const all = [...values];
  return all.some((value) => digitsOf(value) >= MIN_DIGITS) ? all : [];
}

/**
 * A value as a word of its own: no letter or digit right before or after it.
 * Joined to another word by `-`, `.`, `:` or `_` it is still one — the 4821
 * of `job-4821`, the 500 of `status:500` — since a value found too often is
 * told to Jev of no result, and one not found is said not to be there.
 */
const wordOf = (value: string) => new RegExp(`(?<![A-Za-z0-9])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`);

/** Whether one line of the text holds every value, each as a word of its own. */
export function lineHolds(text: string, values: readonly string[]): boolean {
  if (values.length === 0) return false;
  const words = values.map(wordOf);
  return text.split('\n').some((line) => words.every((word) => word.test(line)));
}

const quoted = (values: readonly string[]) => values.map((value) => `"${value}"`).join(' and ');

/** What of a stored text is blanked and digested: all of it, or the head of a large one cut at a line. */
export function shown(text: string): string {
  if (text.length <= WHOLE_UP_TO) return text;
  const cut = text.lastIndexOf('\n', HEAD_CHARS);
  return text.slice(0, cut > 0 ? cut : HEAD_CHARS);
}

/**
 * The tickets of the conversation, each id once, without those that stand for
 * a result of this plugin's own tools: such a result is a copy of a stored
 * text, which would sit in the choice twice. The tickets of parts of a kept
 * conversation are read from the lines of the messages that hold them.
 */
export function ticketsIn(messages: readonly Message[]): Stored[] {
  const uses = new Map(messages.flatMap((message) => message.toolUses).map((use) => [use.tool_use_id, use]));
  const seen = new Set<string>();
  const tickets: Stored[] = [];
  for (const message of messages) {
    for (const result of message.toolResults ?? []) {
      const ticket = readTicket(result.text);
      if (!ticket || isOwnTool(ticket.tool) || seen.has(ticket.id)) continue;
      seen.add(ticket.id);
      const input = uses.get(result.tool_use_id)?.input ?? {};
      tickets.push({ ...ticket, line: result.text, about: `${ticket.tool} called with ${inputLine(input)}` });
    }
    if (message.role === 'user' && (message.toolResults?.length ?? 0) === 0) tickets.push(...partsIn(message.text, seen));
  }
  return tickets;
}

function partsIn(text: string, seen: Set<string>): Stored[] {
  const out: Stored[] = [];
  for (const line of text.split('\n')) {
    const part = readPartTicket(line);
    if (!part || seen.has(part.id)) continue;
    seen.add(part.id);
    out.push({ ...part, line, about: `part ${part.part} of ${part.parts} of the kept conversation, messages ${part.first}-${part.last}` });
  }
  return out;
}

/**
 * The tickets written in a kept part: those of the results and the inputs it
 * holds, each described by the call it stands under, and those of parts kept
 * by an earlier summary, which a part holds when a summary was summarized.
 */
function ticketsInPart(text: string, seen: Set<string>): Stored[] {
  const out: Stored[] = [];
  for (const { line, call } of callsOfLines(text)) {
    const ticket = readTicket(line);
    if (!ticket || isOwnTool(ticket.tool) || seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    out.push({ ...ticket, line, about: call ?? `${ticket.tool} called` });
  }
  return [...out, ...partsIn(text, seen)];
}

/** Every ticket `find` offers: the conversation's, then, part by part up to MAX_PARTS, those in kept parts. */
async function everyTicket(files: Files, dirs: readonly string[], messages: readonly Message[]): Promise<Stored[]> {
  const tickets = ticketsIn(messages);
  const seen = new Set(tickets.map((ticket) => ticket.id));
  let read = 0;
  for (let index = 0; index < tickets.length && read < MAX_PARTS; index += 1) {
    const ticket = tickets[index] as Stored;
    if (ticket.tool !== PART) continue;
    read += 1;
    if (!(await isStored(files, dirs, ticket.line))) continue;
    const got = await recall(files, dirs, ticket.id);
    if ('error' in got) continue;
    // Parts are always followed: the limit is on the results offered, not on where they are read from.
    const inside = ticketsInPart(got.text, seen);
    tickets.push(...inside.filter((t) => t.tool === PART));
    tickets.push(...inside.filter((t) => t.tool !== PART).slice(0, Math.max(0, MAX_OFFERED - tickets.length)));
  }
  return tickets;
}

/** `valued`: one of its lines holds every value the question names. */
type Entry = { ticket: Stored; option: string; holds: boolean; valued: boolean };

const describe = (ticket: Stored) => `${ticket.about}; ${ticket.bytes} bytes`;

async function found(files: Files, dirs: readonly string[], ticket: Stored, why: string): Promise<string> {
  const got = await recall(files, dirs, ticket.id);
  if ('error' in got) return `[${PLUGIN}] ${got.error}`;
  const what = ticket.tool === PART ? ticket.about : `${ticket.tool} result`;
  return `[found] ${what}, ${ticket.bytes} bytes; id ${ticket.id}; ${why}\n\n${got.text}`;
}

function listed(entries: readonly [Entry, number][], none: number | undefined, values: readonly string[]): string {
  // Said of a result one of whose lines holds the values the question names.
  const holding = (entry: Entry) => (entry.valued ? `; one of its lines holds ${quoted(values)}` : '');
  const lines = entries.map(
    ([entry, p]) => `- ${describe(entry.ticket)}; probability ${p.toFixed(2)}${holding(entry)}; recall with ${RECALL_TOOL} id ${entry.ticket.id}`,
  );
  if (none !== undefined) lines.push(`- or none of them; probability ${none.toFixed(2)}`);
  return [`[not sure] The likeliest results, most likely first:`, ...lines].join('\n');
}

/** The text of the `find` tool's answer. Nothing is thrown. */
export async function find(input: FindInput): Promise<string> {
  if (input.agentId !== undefined) {
    return `[${PLUGIN}] Nothing to find: this plugin does not move a subagent's results out of its conversation.`;
  }
  if (input.provider === null) {
    return (
      `[${PLUGIN}] find needs a Jev key: set apiKey in the plugin's settings, and cloudflareAccountId as well for ` +
      'Cloudflare, or have TYPESAFE_API_KEY in the environment (CLOUDFLARE_API_TOKEN once Cloudflare is chosen). ' +
      'recall reads a result by its id without one.'
    );
  }
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  if (question === '') return `[${PLUGIN}] Ask in words what the result is about.`;

  const { files, dirs } = input;
  const phrases = phrasesOf(question);
  // The values are those of the question as it is sent — shapes of secrets blanked, cut where it is cut — so that what Jev
  // is told of a result's line is in the question it is asked, and a secret the question names is told of no result.
  const values = valuesOf(stateFor(question).task);
  const entries: Entry[] = [];
  // One stored text at a time: what is kept of each is a few hundred characters.
  for (const ticket of await everyTicket(files, dirs, input.messages)) {
    if (!(await isStored(files, dirs, ticket.line))) continue;
    const got = await recall(files, dirs, ticket.id);
    if ('error' in got) continue;
    // A result that holds an image is not offered: nothing of it is sent to Jev, its text included.
    if (got.parts !== undefined) continue;
    const holds = phrases.length > 0 && phrases.every((phrase) => got.text.includes(phrase));
    // A part of a kept conversation holds what was asked as well as what came back, and is not looked through for
    // the values; the numbers `Read` puts in front of lines are no part of what the file said.
    const valued = values.length > 0 && ticket.tool !== PART && lineHolds(ticket.tool === 'Read' ? (unnumbered(got.text) ?? got.text) : got.text, values);
    entries.push({ ticket, option: `${describe(ticket)}. It reads: ${digest(shown(got.text), DIGEST_CHARS)}`, holds, valued });
  }
  if (entries.length === 0) {
    return (
      `[${PLUGIN}] No ticket of a moved-out result is in this conversation: none was moved out, or a summary ` +
      'has run since that kept nothing, or they are older than what is shown. recall reads a result by its id.'
    );
  }

  const quoting = entries.filter((entry) => entry.holds);
  if (quoting.length === 1) {
    return found(files, dirs, (quoting[0] as Entry).ticket, `matched the quoted phrase "${phrases[0]}"`);
  }
  const pool = quoting.length > 1 ? quoting : entries;
  // Where one result alone has a line holding the values, Jev is told so beside its first lines: the values are in the
  // question already, so nothing more of the result is sent, and Jev still chooses — a line holding "sha256" does not
  // make a result what was asked for. Where several hold them nothing is said: told the same of each, Jev was measured
  // taking the first of them for the answer.
  const valued = pool.filter((entry) => entry.valued);
  const only = valued.length === 1 ? valued[0] : undefined;
  const optionOf = (entry: Entry) => (entry === only ? `${entry.option} One of its lines holds ${quoted(values)}.` : entry.option);
  const byKey = new Map(pool.map((entry, index): [string, Entry] => [`t${index + 1}`, entry]));
  const chosen = await choose(
    input.http,
    input.provider,
    question,
    [...byKey].map(([key, entry]) => ({ key, text: optionOf(entry) })),
    { always: { key: NONE, text: NONE_TEXT }, wait: input.wait },
  );
  if ('error' in chosen) return `[${PLUGIN}] Jev could not be asked: ${chosen.error}.`;

  const [first, second] = chosen.ranked;
  const decisive = first !== undefined && first[1] >= FOUND_AT && first[1] - (second?.[1] ?? 0) >= MARGIN;
  if (decisive && first[0] === NONE) {
    // More than one result holds the quoted phrase as written: Jev's "none" does not make that untrue, so they are listed.
    if (quoting.length > 1) {
      const holders = chosen.ranked.flatMap(([key, p]): [Entry, number][] => {
        const entry = key === NONE ? undefined : byKey.get(key);
        return entry ? [[entry, p]] : [];
      });
      return listed(holders.slice(0, LISTED), first[1], values);
    }
    // Jev took none of them to be what was asked, and some have a line holding the values: that stays true, so they are
    // named for the agent to read, the likeliest first. None of them is given as the answer. They are taken from the
    // options and not from the ranking: asked in several requests, the ranking holds the last round's options only.
    if (valued.length > 0) {
      const p = new Map(chosen.ranked);
      const ranked = [...byKey].filter(([, entry]) => entry.valued).sort(([a], [b]) => (p.get(b) ?? 0) - (p.get(a) ?? 0));
      const lines = ranked.slice(0, VALUED_LISTED).map(([, entry]) => `- ${describe(entry.ticket)}; recall with ${RECALL_TOOL} id ${entry.ticket.id}`);
      if (ranked.length > VALUED_LISTED) lines.push(`- and ${ranked.length - VALUED_LISTED} more: say more of what is asked for to tell them apart`);
      const count = ranked.length === 1 ? 'one has' : `${ranked.length} have`;
      return [`[not sure] None of the moved-out results seems to be about that from its call and first lines, but ${count} a line holding ${quoted(values)}:`, ...lines].join('\n');
    }
    // The quoted phrase was looked for in the whole of every result, and none holds it.
    if (phrases.length > 0) {
      return (
        `[not found] None of the moved-out results holds the quoted phrase as written, looked for in the whole of each, ` +
        'and none seems to be about that from its call and first lines. It may still be in the conversation, or was never moved out.'
      );
    }
    // The values were looked for in the whole of every result, and no line holds them, each as a word of its own.
    if (values.length > 0) {
      return (
        `[not found] None of the moved-out results has a line holding ${quoted(values)} as a word of its own, and none seems to be about that from its call and first lines. ` +
        `Not looked for this way: values on different lines, in another letter case, or that are only part of a longer word or number there; the number of a line; and what a kept part of the conversation says. ` +
        `To look further, quote twelve characters or more of a line as written, or read the results with ${RECALL_TOOL}. It may also still be in the conversation, or was never moved out.`
      );
    }
    // Jev is shown each result's call and first lines: a value further down is not in front of it, and an
    // agent told "none" without that stopped looking (#38: 0 of 9 such questions, against 3 of 9 with recall alone).
    return (
      `[not found] None of the moved-out results seems to be about that, from their calls and first lines, which are all Jev is shown of them: ` +
      `a value or a line further down can be missed. To look for one, quote twelve characters or more of it as written (a shorter phrase is not looked for), ` +
      `or read the results with ${RECALL_TOOL}. It may also still be in the conversation, or was never moved out.`
    );
  }
  if (decisive) {
    const entry = byKey.get(first[0]);
    if (entry) return found(files, dirs, entry.ticket, `probability ${first[1].toFixed(2)}${entry === only ? `; the one result with a line holding ${quoted(values)}` : ''}`);
  }
  const likeliest = chosen.ranked.slice(0, LISTED);
  const results = likeliest.flatMap(([key, p]): [Entry, number][] => {
    const entry = byKey.get(key);
    return entry ? [[entry, p]] : [];
  });
  const none = likeliest.find(([key, p]) => key === NONE && p > 0)?.[1];
  return listed(results, none, values);
}
