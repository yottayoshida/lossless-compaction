// A ticket handed to a tool as if it were what it stands for.
//
// A ticket is one line of the conversation: it stands where a result, a long input or the middle of a long
// message was. A model that takes the line for the thing writes the line into a file, runs it, or sends it on,
// and what the line stood for is not where it was put. So a call whose input holds a ticket this store or this
// conversation knows is refused. Which tools are looked at is told by what is let through, not by what is
// stopped: tools that write come and go faster than this plugin does, and one it has never heard of is looked at.
// A ticket nothing knows goes through, since a document about tickets holds examples of them.

import { MIDDLE_CHARS, readBody } from './body.ts';
import { readFoldedReadLine } from './changed.ts';
import { PLUGIN, RECALL_TOOL, inputTicketsOf, isOwnTool, readBodyTicket, readInputTicket, readPartTicket, readTicket } from './store.ts';
import type { Message } from './types.ts';

// The built-in tools known only to read. A ticket handed to one of them puts nothing anywhere, and refusing it
// would have the agent recall something large to search by, which undoes the compaction.
const READS: ReadonlySet<string> = new Set(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'ToolSearch']);

/** Whether a call to `tool` is looked at: every tool but this plugin's own, under either name, and those known only to read. */
export function guarded(tool: string): boolean {
  return !isOwnTool(tool) && !READS.has(tool);
}

/** The recall tool's name up to 0.3.0: a conversation compacted then still carries its tickets (ADR 0004). */
const OLD_RECALL_TOOL = `mcp__jev-${PLUGIN}__recall`;

// A ticket wherever it stands in a text, whatever is before it on its line: an indent, a comment mark, a quote.
// Every wording written so far opens with a bracket and closes with the recall tool's name and the id, within
// 400 characters, the longest of them being under 300.
const ANYWHERE = new RegExp(
  `\\[(?:moved out|jev-${PLUGIN})\\][^\\n]{0,400}?(?:${RECALL_TOOL}|${OLD_RECALL_TOOL}) (?:with )?id ([0-9a-f]{64})(?![0-9a-f])`,
  'g',
);

/** How deep an input is walked. What lies deeper is read as its JSON, so that nothing passes for being deep. */
const DEPTH = 8;

/** The ids of the tickets in one text, in any wording written so far. */
export function ticketIdsInText(text: string, into: Set<string> = new Set()): Set<string> {
  // Nearly every input holds none: the one character every wording opens with is looked for first.
  if (!text.includes('[')) return into;
  for (const match of text.matchAll(ANYWHERE)) into.add(String(match[1]));
  return into;
}

/** The ids of the tickets in a value: in every string of it, in lists and objects, their keys too. */
export function ticketIdsIn(value: unknown, into: Set<string> = new Set(), depth = 0): Set<string> {
  if (typeof value === 'string') return ticketIdsInText(value, into);
  if (typeof value !== 'object' || value === null) return into;
  if (depth >= DEPTH) {
    try {
      // A line break in a string is two characters here, so a ticket still reads as one line.
      return ticketIdsInText(JSON.stringify(value) ?? '', into);
    } catch {
      return into;
    }
  }
  if (Array.isArray(value)) {
    for (const inner of value) ticketIdsIn(inner, into, depth + 1);
    return into;
  }
  for (const [key, inner] of Object.entries(value)) {
    ticketIdsInText(key, into);
    ticketIdsIn(inner, into, depth + 1);
  }
  return into;
}

/**
 * The ids of the tickets this plugin put in a conversation: a whole result, a call's text, a whole value of an
 * input, a part's line in a message of the person's. Not a ticket's shape standing anywhere else: one in a file the
 * agent wrote is its own words, and so is the input of the call being looked at, which the conversation may hold
 * already. Narrower than what a clean-up keeps (src/lifetime.ts), which errs the other way.
 */
export function placedTicketIds(messages: readonly Message[], exceptCall?: string): Set<string> {
  const ids = new Set<string>();
  const add = (ticket: { id: string } | null) => {
    if (ticket !== null) ids.add(ticket.id);
  };
  for (const message of messages) {
    for (const result of message.toolResults ?? []) add(readTicket(result.text));
    for (const use of message.toolUses) {
      if (use.tool_use_id === exceptCall) continue;
      if (use.text !== undefined) add(readTicket(use.text));
      for (const line of inputTicketsOf(use.input)) add(readInputTicket(line));
    }
    for (const line of message.text.split('\n')) {
      if (message.role === 'user') add(readPartTicket(line) ?? readFoldedReadLine(line));
      // The middle of a long message stands in a person's message or in Claude's (ADR 0024).
      add(readBodyTicket(line));
    }
  }
  return ids;
}

/**
 * What the model is told when a call is refused: fixed wording and the id, which was looked up. Nothing of the
 * input is in it, and it does not say what would have gone through.
 */
export function refusal(id: string): string {
  return `[${PLUGIN}] Not run: the input holds the ticket of something moved out of this conversation, not what it stands for. Call ${RECALL_TOOL} with id ${id} and use what it returns.`;
}

/**
 * Why a call with this input is refused, or null when it goes through. `known` says whether an id is one of
 * this store's or of this conversation's, and is asked only for an id found in the shape of a ticket. When it
 * throws, the shape is enough: what could not be looked up is not passed for unknown.
 */
export async function refused(input: unknown, known: (id: string) => Promise<boolean>): Promise<string | null> {
  for (const id of ticketIdsIn(input)) {
    let is: boolean;
    try {
      is = await known(id);
    } catch {
      is = true;
    }
    if (is) return refusal(id);
  }
  return null;
}

/** Every string of a value, however deep, keys too. */
function stringsOf(value: unknown, into: string[] = [], depth = 0): string[] {
  if (typeof value === 'string') into.push(value);
  else if (typeof value === 'object' && value !== null && depth < DEPTH) {
    for (const [key, inner] of Array.isArray(value) ? value.entries() : Object.entries(value)) {
      if (typeof key === 'string') into.push(key);
      stringsOf(inner, into, depth + 1);
    }
  }
  return into;
}

/** The longest string an input holds: under 200 characters, nothing is looked up for `middleDropped`. */
export const longestIn = (input: unknown): number => Math.max(0, ...stringsOf(input).map((one) => one.length));

/**
 * The id of a message whose middle left, where an input holds its first and last paragraphs close together: written
 * with the line between them dropped, what lands is the message without its middle (ADR 0024). The middle of a
 * message is never shorter than `MIDDLE_CHARS`, so the whole message, recalled and written, holds them further apart.
 */
export function middleDropped(input: unknown, messages: readonly Message[]): string | null {
  const edges = messages.flatMap((message) => {
    const body = readBody(message.text);
    return body === null || body.head.trim() === '' || body.tail.trim() === '' ? [] : [body];
  });
  if (edges.length === 0) return null;
  for (const value of stringsOf(input)) {
    for (const { head, tail, ticket } of edges) {
      // A first and a last paragraph this short stand apart in writing of any kind ("Hi" and "Thanks"): only together,
      // nothing but blank space between them, are they the message without its middle (yotta, 2026-10-04).
      if (head.length + tail.length < SHORT_EDGES) {
        if (together(value, head, tail)) return ticket.id;
        continue;
      }
      const at = value.indexOf(head);
      if (at < 0) continue;
      // Where the tail stands last: in the whole message written as it was, a tail said more than once (a signature,
      // say) is first met in the middle.
      const after = value.lastIndexOf(tail);
      if (after >= at + head.length && after - (at + head.length) < MIDDLE_CHARS) return ticket.id;
    }
  }
  return null;
}

/** A first and a last paragraph shorter than this together are looked for only side by side (`middleDropped`). */
const SHORT_EDGES = 40;

/** Whether a value holds `head` and right after it, with nothing but blank space between, `tail`. */
function together(value: string, head: string, tail: string): boolean {
  for (let at = value.indexOf(head); at >= 0; at = value.indexOf(head, at + 1)) {
    if (value.slice(at + head.length).trimStart().startsWith(tail)) return true;
  }
  return false;
}

/** What the model is told when what it hands on is a message without its middle: fixed wording and the id. */
export function middleRefusal(id: string): string {
  return `[${PLUGIN}] Not run: the input holds the first and last paragraphs of a message whose middle was moved out, without the middle. Call ${RECALL_TOOL} with id ${id} and use the whole message it returns.`;
}
