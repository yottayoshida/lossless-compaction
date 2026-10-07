// Finding, among the results moved out of a conversation, the one a question
// is about: what the `find` tool answers with.

import { choose, digest, head, inputLine, redact, stateFor, type Failed, type Provider } from './ask.ts';
import { unnumbered } from './changed.ts';
import { isFoldedList } from './fold.ts';
import { callsOfLines } from './keep.ts';
import { PART, PLUGIN, RECALL_TOOL, headOf, idsWritten, inputTicketsOf, isOwnTool, isStored, readBodyTicket, readInputTicket, readPartTicket, readTicket, recall, sharedHead, type Ticket } from './store.ts';
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
/** `attached`: a part of what Claude Code attached to the messages as it sent them, looked through here and never sent to Jev (#105). */
export type Stored = Ticket & { line: string; about: string; follow?: false; attached?: true };

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
  return cut > 0 ? text.slice(0, cut) : head(text, HEAD_CHARS);
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
    // A long value of a call's input that left (ADR 0020). It is told by the call it was handed to, as it stands now:
    // its other values, and the ticket where the value was, so that nothing of the value is in what Jev is shown.
    for (const use of message.toolUses) {
      for (const line of inputTicketsOf(use.input)) {
        const ticket = readInputTicket(line);
        if (!ticket || seen.has(ticket.id)) continue;
        seen.add(ticket.id);
        tickets.push({ ...ticket, line, about: `the ${ticket.field} handed to ${ticket.tool}, called with ${inputLine(use.input)}` });
      }
    }
    if (message.role === 'user' && (message.toolResults?.length ?? 0) === 0) {
      const parts = partsIn(message.text, seen);
      tickets.push(...(isFoldedList(message.text) ? parts.map((part) => ({ ...part, follow: false as const })) : parts));
    }
  }
  return tickets;
}

function partsIn(text: string, seen: Set<string>): Stored[] {
  const out: Stored[] = [];
  for (const line of text.split('\n')) {
    const part = readPartTicket(line);
    if (!part || seen.has(part.id)) continue;
    seen.add(part.id);
    out.push(
      part.kind === 'attached'
        ? { ...part, line, about: `part ${part.part} of ${part.parts} of what Claude Code attached as it sent the messages`, attached: true }
        : { ...part, line, about: `part ${part.part} of ${part.parts} of the kept conversation, messages ${part.first}-${part.last}` },
    );
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
    const input = readInputTicket(line);
    if (input !== null) {
      // A value that left a call's input stands on a line of its own in a part, after its field's name (src/keep.ts).
      if (seen.has(input.id)) continue;
      seen.add(input.id);
      out.push({ ...input, line, about: `the ${input.field} handed to ${input.tool}` });
      continue;
    }
    const ticket = readTicket(line);
    if (!ticket || isOwnTool(ticket.tool) || seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    out.push({ ...ticket, line, about: call ?? `${ticket.tool} called` });
  }
  return [...out, ...partsIn(text, seen)];
}

/**
 * Every ticket `find` offers: the conversation's, then, part by part up to MAX_PARTS, those in kept parts. With them,
 * the lines in place of the middles of long messages, in the conversation and in the parts read: a message that went
 * into a part kept its line there (ADR 0024).
 */
async function everyTicket(files: Files, dirs: readonly string[], messages: readonly Message[]): Promise<{ tickets: Stored[]; middles: Stored[]; own: number }> {
  const seenMiddles = new Set<string>();
  const middles = middlesOf(messages.flatMap((message) => message.text.split('\n').map((line) => ({ line, role: message.role }))), seenMiddles);
  // What Claude Code attached is looked through as a middle is, wherever its ticket stands, and not followed (#105): it
  // holds what Claude Code wrote about the machine, which is not sent to Jev.
  const aside = (found: readonly Stored[]): Stored[] => found.filter((ticket) => (ticket.attached === true ? (middles.push(ticket), false) : true));
  const all = ticketsIn(messages);
  const seen = new Set(all.map((ticket) => ticket.id));
  const tickets = aside(all);
  // The tickets written in the conversation come first, oldest first; those read out of parts follow.
  const own = tickets.length;
  let read = 0;
  for (let index = 0; index < tickets.length && read < MAX_PARTS; index += 1) {
    const ticket = tickets[index] as Stored;
    // A list of folded calls names a part with no ticket in it: offered as any part, not followed (ADR 0022).
    if (ticket.tool !== PART || ticket.follow === false) continue;
    read += 1;
    if (!(await isStored(files, dirs, ticket.line))) continue;
    const got = await recall(files, dirs, ticket.id);
    if ('error' in got) continue;
    middles.push(...middlesOf(linesOfPart(got.text), seenMiddles));
    // Parts are always followed: the limit is on the results offered, not on where they are read from.
    const inside = ticketsInPart(got.text, seen);
    tickets.push(...aside(inside.filter((t) => t.tool === PART)));
    tickets.push(...inside.filter((t) => t.tool !== PART).slice(0, Math.max(0, MAX_OFFERED - tickets.length)));
  }
  return { tickets, middles, own };
}

/** The lines in place of the middles of long messages, a person's or Claude's (ADR 0024), each with its message's role. */
function middlesOf(lines: readonly { line: string; role: string | undefined }[], seen: Set<string>): Stored[] {
  return lines.flatMap(({ line, role }): Stored[] => {
    const ticket = readBodyTicket(line);
    if (ticket === null || seen.has(ticket.id)) return [];
    seen.add(ticket.id);
    const whose = role === 'user' ? 'the person' : role === 'assistant' ? 'Claude' : 'the conversation';
    return [{ tool: 'message', ...ticket, line, about: `the middle of a message of ${whose}` }];
  });
}

/** A part's lines, each with the role of the message it stands in: a part heads each message `--- <role>` (src/keep.ts). */
function linesOfPart(text: string): { line: string; role: string | undefined }[] {
  let role: string | undefined;
  return text.split('\n').map((line) => {
    const heading = /^--- (user|assistant)$/.exec(line);
    if (heading !== null) role = heading[1];
    return { line, role };
  });
}

/** The middles that hold what was asked, looked through here and not sent to Jev. */
function middlesLine(middles: readonly Entry[], values: readonly string[]): string {
  const lines = middles.map(
    (entry) => `- ${describe(entry.ticket)}${entry.holds ? '; holds the quoted phrase' : `; one of its lines holds ${quoted(values)}`}; recall with ${RECALL_TOOL} id ${entry.ticket.id}`,
  );
  return [`[${PLUGIN}] Holding what was asked, looked through here and not sent to Jev:`, ...lines].join('\n');
}

/**
 * `valued`: one of its lines holds every value the question names. Kept for an answer given with no key: `first`, the
 * first line of what it holds; `line`, the line holding the values; `own`, whether its ticket is written in the
 * conversation rather than in a part, and where (`at`).
 */
type Entry = { ticket: Stored; option: string; holds: boolean; valued: boolean; first?: string; line?: string; own?: boolean; at?: number };

const describe = (ticket: Stored) => `${ticket.about}; ${ticket.bytes} bytes`;

/** Said after every answer `find` gives with no key: what it did, and that nothing was sent. */
export const NO_KEY = `[${PLUGIN}] no key: looked through on this machine; Jev was not asked.`;
/** The most an answer given with no key lists, in characters. */
export const LISTED_CHARS = 8000;
/** The most of a result's first line, or of the line holding the values, that such an answer shows. */
const FIRST_CHARS = 120;
const LINE_CHARS = 200;

/** At most `n` characters, never halving one. */
const upTo = (text: string, n: number) => (text.length <= n ? text : `${head(text, n)}…`);

/** The first line of a result that says anything, the numbers `Read` puts in front of lines left out. */
function firstLineOf(ticket: Stored, text: string): string {
  if (ticket.tool === PART) return '';
  const lines = (ticket.tool === 'Read' ? (unnumbered(text) ?? text) : text).split('\n');
  // Shapes of secrets blanked, as in what is digested for Jev: the list goes into the conversation, many lines at once.
  return upTo(redact(lines.find((line) => line.trim() !== '')?.trim() ?? ''), FIRST_CHARS);
}

/** The first line holding every value, its shapes of secrets blanked, cut to LINE_CHARS around where the first value stands in it. */
function valueLineOf(text: string, values: readonly string[]): string | undefined {
  const words = values.map(wordOf);
  const found = text.split('\n').find((one) => words.every((word) => word.test(one)));
  if (found === undefined) return undefined;
  const line = redact(found);
  const at = Math.max(0, (words[0]?.exec(line)?.index ?? 0) - LINE_CHARS / 2);
  return `${at > 0 ? '…' : ''}${upTo(line.slice(at).trim(), LINE_CHARS)}`;
}

/** Kept free under LISTED_CHARS for the line that says how many more there are. */
const MORE_CHARS = 80;

/**
 * The results as an answer given with no key lists them, for the agent to choose from: nothing is ranked. Those whose
 * tickets the conversation holds first, newest first, then those read out of parts, as they were read; at most `most`
 * of them, and within LISTED_CHARS, `head` included. The rest are counted.
 */
function catalogue(head: string, entries: readonly Entry[], lineOf: (entry: Entry) => string, most = Infinity): string {
  const ordered = [...entries.filter((entry) => entry.own === true).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)), ...entries.filter((entry) => entry.own !== true)];
  const lines = [head];
  let size = head.length;
  let shown = 0;
  for (const entry of ordered) {
    const line = lineOf(entry);
    if (shown >= most || size + line.length + 1 > LISTED_CHARS - MORE_CHARS) break;
    lines.push(line);
    size += line.length + 1;
    shown += 1;
  }
  if (shown < ordered.length) lines.push(`- and ${ordered.length - shown} more: quote a phrase or name a value to narrow`);
  return lines.join('\n');
}

const listedLine = (entry: Entry) => `- ${describe(entry.ticket)}${entry.first ? `: ${entry.first}` : ''}; recall with ${RECALL_TOOL} id ${entry.ticket.id}`;
const valuedLine = (entry: Entry) => `- ${describe(entry.ticket)}; the line: ${entry.line ?? ''}; recall with ${RECALL_TOOL} id ${entry.ticket.id}`;
const ALL_HEAD =
  '[not sure] The moved-out results, by their call and first line, those written in the conversation newest first, then those in kept parts: one of them may be what was asked, or none is. Recall one by its id to read it.';

/**
 * What `find` answers with no key, where no quoted phrase settled it: nothing is sent, and no result is chosen. Several
 * results holding the quoted phrase are listed; so are those with a line holding the values, with that line; and, where
 * neither is asked or none holds what was asked, every result by its first line.
 */
function noKeyAnswer(entries: readonly Entry[], quoting: readonly Entry[], phrases: readonly string[], values: readonly string[]): string {
  const everything = (before?: string) => catalogue(before === undefined ? ALL_HEAD : `${before}\n${ALL_HEAD}`, entries, listedLine);
  if (quoting.length > 1) return catalogue(`[not sure] ${quoting.length} moved-out results hold the quoted phrase as written:`, quoting, listedLine);
  const missed =
    phrases.length > 0 ? '[not found] No moved-out result read here holds the quoted phrase as written. It may still be in the conversation, or in a result that holds an image.' : undefined;
  const valued = entries.filter((entry) => entry.valued);
  if (values.length > 0 && valued.length > 0) {
    const count = valued.length === 1 ? 'One moved-out result has' : `${valued.length} moved-out results have`;
    const head = `[not sure] ${count} a line holding ${quoted(values)}, which does not make it what was asked:`;
    return catalogue(missed === undefined ? head : `${missed}\n${head}`, valued, valuedLine, VALUED_LISTED);
  }
  if (missed !== undefined) return everything(missed);
  if (values.length > 0) {
    return everything(
      `[not found] No moved-out result read here has a line holding ${quoted(values)} as a word of its own. Not looked for this way: values on different lines, in another letter case, or that are only part of a longer word or number there; the number of a line; and what a kept part of the conversation says.`,
    );
  }
  return everything();
}

/** At most this many tickets are named when `recall` refuses an id that may have been copied wrong. */
export const NAMED_ON_REFUSAL = 5;
/** A ticket is named for such an id when their first this many characters are the same. */
export const NEAR_HEAD = 4;

/**
 * What `recall` adds to its refusal of an id that may have been copied wrong (#107): the tickets of the conversation it
 * may stand for, at most NAMED_ON_REFUSAL, each with what it stands for where the conversation says, and its id. First
 * those whose ids begin as it does, the most characters first; then the parts kept from the conversation, newest
 * first, whose own tickets are not written in it. Where the id is itself one written in the conversation, the ids that
 * begin as it does are not named, since another result would be read in its place, and the parts still are: a copy
 * written whole, as in Claude Code's summary, can stand beside a ticket that only a part holds. Nothing stored is opened.
 */
export function mayStandFor(given: unknown, messages: readonly Message[]): string {
  const written = idsWritten(messages);
  if (written.length === 0) return '';
  const tickets = ticketsIn(messages);
  const middles = middlesOf(messages.flatMap((message) => message.text.split('\n').map((line) => ({ line, role: message.role }))), new Set());
  const about = new Map([...tickets, ...middles].map((ticket): [string, string] => [ticket.id, describe(ticket)]));
  const lineOf = (id: string) => `- ${about.get(id) ?? 'an id written in the conversation'}; recall with ${RECALL_TOOL} id ${id}`;
  const parts = tickets.filter((ticket) => ticket.tool === PART).map((ticket) => ticket.id).reverse();
  if (typeof given === 'string' && written.includes(given)) {
    const kept = parts.filter((id) => id !== given).slice(0, NAMED_ON_REFUSAL);
    const said = 'That id is written in this conversation, and nothing is stored under it here';
    return kept.length === 0 ? `\n${said}.` : ['', `${said}. The parts kept from the conversation hold tickets of their own:`, ...kept.map(lineOf)].join('\n');
  }
  const head = typeof given === 'string' ? headOf(given) : '';
  const near = written
    .map((id): [string, number] => [id, sharedHead(head, id)])
    .filter(([, shared]) => shared >= NEAR_HEAD)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const named = [...new Set([...near, ...parts])].slice(0, NAMED_ON_REFUSAL);
  if (named.length === 0) return "\nNo ticket of this conversation begins as that id does: copy the 64 characters at the end of the ticket's line.";
  return ['', 'The tickets of this conversation it may stand for:', ...named.map(lineOf)].join('\n');
}

async function found(files: Files, dirs: readonly string[], ticket: Stored, why: string): Promise<string> {
  const got = await recall(files, dirs, ticket.id);
  if ('error' in got) return `[${PLUGIN}] ${got.error}`;
  const what = ticket.tool === PART || ticket.tool === 'message' ? ticket.about : `${ticket.tool} result`;
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
  return (await findAnswer(input)).text;
}

/** `find`'s answer, and the line the person is told where only they can put right why Jev was not asked (#143). */
export type Found = { text: string; tell?: string };

export async function findAnswer(input: FindInput): Promise<Found> {
  if (input.agentId !== undefined) {
    return { text: `[${PLUGIN}] Nothing to find: find does not look in a subagent's conversation. What a summary replaced there is kept in parts named after the summary; recall reads one by its id.` };
  }
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  if (question === '') return { text: `[${PLUGIN}] Ask in words what the result is about.` };
  const told: { tell?: string } = {};
  // With no key nothing is sent: what is looked for here is, and the agent is given the rest to choose from (#110).
  const answer = await looked(input, question, told);
  return { text: input.provider === null ? `${answer}\n${NO_KEY}` : answer, ...(told.tell === undefined ? {} : { tell: told.tell }) };
}

/** Where the settings are set, as the agent and the person are told to set them. */
const CONFIGURE = '/plugin configure lossless-compaction@lossless-compaction';
/** The section on getting a key, by its address: the agent works in another repository, where docs/usage.md is another file. */
export const GETTING_A_KEY = 'https://github.com/yottayoshida/lossless-compaction/blob/main/docs/usage.md#getting-a-key';

/**
 * What the agent is told when Jev could not be asked, by what the provider answered, and what the person is told where it
 * may be theirs to put right: a key refused, access refused, an account to pay, requests limited (#143). A refusal is
 * put on the key or the account only where the answer is the provider's own, in JSON: one from something between, a
 * proxy say, is not. Cloudflare refuses access with 403 for the key's access, the account's plan or blocking, or terms not
 * agreed to, and limits with 429 for a day's free allocation used up as for its capacity (its table of errors). Nothing
 * asks the agent to call again: each call sends a digest of every result.
 */
export function unasked(failed: Failed, provider: Provider): Found {
  const { status } = failed;
  const account = provider.kind === 'cloudflare' ? ' and the account id' : '';
  const where = `/lossless-status says where the key came from, and ${GETTING_A_KEY} how to get one`;
  let what = failed.error;
  let next = '';
  let tell: string | undefined;
  if ((status === 401 || status === 402 || status === 403 || status === 429) && failed.json !== true) {
    what = `HTTP ${status}, in an answer not in JSON, as the provider's are: something between this machine and the provider may have refused it`;
  } else if (status === 401) {
    what = 'the provider refused the key (HTTP 401)';
    next = ` Check the key${account} with ${CONFIGURE}; ${where}.`;
    tell = `Jev refused the find tool's key${account === '' ? '' : ' or account id'} (HTTP 401): set it with ${CONFIGURE}; until then find cannot ask Jev; ${where}`;
  } else if (status === 403) {
    what = 'the provider refused access (HTTP 403)';
    next = ` The key, what it may reach or the account was refused: check the key${account} with ${CONFIGURE}, and the account with the provider; ${where}.`;
    tell = `Jev's provider refused access (HTTP 403), for the key, what it may reach or the account: check the key${account} with ${CONFIGURE}, and the account with the provider; until then find cannot ask Jev; ${where}`;
  } else if (status === 402) {
    what = 'the provider asks for payment (HTTP 402)';
    tell = "Jev's provider asks for payment (HTTP 402): until the account is paid, find cannot ask Jev";
  } else if (status === 429) {
    what = 'the provider is limiting requests (HTTP 429)';
    tell = "Jev's provider is limiting requests (HTTP 429): find cannot ask Jev until it takes more, which may be the next day where a free allocation ran out";
  } else if (status !== undefined && status >= 500 && status < 600) {
    what = `the provider failed (HTTP ${status})`;
  }
  return { text: `[${PLUGIN}] Jev could not be asked: ${what}.${next} recall still reads a result by its id.`, ...(tell === undefined ? {} : { tell }) };
}

async function looked(input: FindInput, question: string, told: { tell?: string }): Promise<string> {
  const { files, dirs, provider } = input;
  const phrases = phrasesOf(question);
  // The values are those of the question as it is sent — shapes of secrets blanked, cut where it is cut — so that what Jev
  // is told of a result's line is in the question it is asked, and a secret the question names is told of no result.
  const values = valuesOf(stateFor(question).task);
  const entries: Entry[] = [];
  // One stored text at a time: what is kept of each is a few hundred characters.
  const every = await everyTicket(files, dirs, input.messages);
  for (const [at, ticket] of every.tickets.entries()) {
    if (!(await isStored(files, dirs, ticket.line))) continue;
    const got = await recall(files, dirs, ticket.id);
    if ('error' in got) continue;
    // A result that holds an image is not offered to Jev: nothing of it is sent, its text included. With no key nothing
    // is sent, and it is listed by its call.
    if (got.parts !== undefined && provider !== null) continue;
    const text = got.parts === undefined ? got.text : '';
    const holds = phrases.length > 0 && phrases.every((phrase) => text.includes(phrase));
    // A part of a kept conversation holds what was asked as well as what came back, and is not looked through for
    // the values; the numbers `Read` puts in front of lines are no part of what the file said.
    const read = ticket.tool === 'Read' ? (unnumbered(text) ?? text) : text;
    const valued = values.length > 0 && ticket.tool !== PART && lineHolds(read, values);
    const entry: Entry = { ticket, option: `${describe(ticket)}. It reads: ${digest(shown(text), DIGEST_CHARS)}`, holds, valued };
    if (provider === null) {
      entry.first = firstLineOf(ticket, text);
      entry.own = at < every.own;
      entry.at = at;
      if (valued) entry.line = valueLineOf(read, values);
    }
    entries.push(entry);
  }
  // The middles of long messages, and what Claude Code attached (#105), are looked through here and never sent to Jev
  // (ADR 0024): one that holds the
  // quoted phrase, or a line holding the values, is named beside what Jev chose among the results.
  const middles: Entry[] = [];
  const lookedAt: Stored[] = [];
  for (const ticket of every.middles) {
    if (!(await isStored(files, dirs, ticket.line))) continue;
    const got = await recall(files, dirs, ticket.id);
    if ('error' in got) continue;
    lookedAt.push(ticket);
    const holds = phrases.length > 0 && phrases.every((phrase) => got.text.includes(phrase));
    const valued = values.length > 0 && lineHolds(got.text, values);
    if (holds || valued) middles.push({ ticket, option: '', holds, valued });
  }
  // The middles that hold what was asked, named after an answer: all of them, or all but the one given as the answer.
  // Asked in words alone, a middle is not looked for at all: the agent is told so, and given their ids to read them by.
  const unsought =
    phrases.length > 0 || values.length > 0 || lookedAt.length === 0
      ? ''
      : [
          `[${PLUGIN}] The middles of long messages that left, and what Claude Code attached as it sent the messages, are looked through only for a quoted phrase (twelve characters or more, as written) or the values a question names, and none was given; to read one, recall it:`,
          ...lookedAt.slice(0, VALUED_LISTED).map((ticket) => `- ${describe(ticket)}; recall with ${RECALL_TOOL} id ${ticket.id}`),
          ...(lookedAt.length > VALUED_LISTED ? [`- and ${lookedAt.length - VALUED_LISTED} more`] : []),
        ].join('\n');
  const besides = (given?: Entry): string => {
    const rest = middles.filter((entry) => entry !== given);
    return (rest.length === 0 ? '' : `\n${middlesLine(rest, values)}`) + (unsought === '' ? '' : `\n${unsought}`);
  };

  const quoting = entries.filter((entry) => entry.holds);
  const quotingMiddles = middles.filter((entry) => entry.holds);
  // One result holds the quoted phrase as written: it is the answer, whatever else holds it, and Jev is not asked.
  if (quoting.length === 1) {
    return (await found(files, dirs, (quoting[0] as Entry).ticket, `matched the quoted phrase "${phrases[0]}"`)) + besides();
  }
  // No result holds it, and the middle of one message does.
  if (quoting.length === 0 && quotingMiddles.length === 1) {
    const given = quotingMiddles[0] as Entry;
    return (await found(files, dirs, given.ticket, `matched the quoted phrase "${phrases[0]}"`)) + besides(given);
  }
  if (entries.length === 0) {
    if (middles.length > 0) return middlesLine(middles, values);
    if (unsought !== '') return `No moved-out result is in this conversation to choose from.\n${unsought}`;
    if (lookedAt.length > 0) {
      const what = phrases.length > 0 ? 'the quoted phrase as written' : `a line holding ${quoted(values)}`;
      const which =
        lookedAt.length === 1
          ? `${lookedAt[0]?.attached === true ? 'what Claude Code attached' : 'the middle of a long message'} looked through here does not hold`
          : `none of the ${lookedAt.length} middles of long messages and parts of what Claude Code attached looked through here holds`;
      return `[not found] No moved-out result is in this conversation to choose from, and ${which} ${what}. It may still be in the conversation.`;
    }
    return (
      `[${PLUGIN}] No ticket of a moved-out result is in this conversation: none was moved out, or a summary ` +
      'has run since that kept nothing, or they are older than what is shown. recall reads a result by its id.'
    );
  }
  const also = besides();
  if (provider === null) return noKeyAnswer(entries, quoting, phrases, values) + also;
  const answer = async (): Promise<string> => {
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
      provider,
      question,
      [...byKey].map(([key, entry]) => ({ key, text: optionOf(entry) })),
      { always: { key: NONE, text: NONE_TEXT }, wait: input.wait },
    );
    if ('error' in chosen) {
      const failed = unasked(chosen, provider);
      if (failed.tell !== undefined) told.tell = failed.tell;
      return failed.text;
    }

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
  };
  return (await answer()) + also;
}
