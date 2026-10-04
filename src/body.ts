// The middle of a long message (ADR 0024).
//
// A message a person pasted a document into, or one Claude wrote at length, can hold most of a conversation. Its
// first and last paragraphs stay: what was asked of it is there, before or after what was pasted. The middle leaves,
// kept with the whole message, and one line stands in its place.

import { head } from './ask.ts';
import { HOST_TEXT, saidByAPerson, type SelectOptions } from './select.ts';
import { PLUGIN, readBodyTicket, type BodyTicket } from './store.ts';
import type { Message } from './types.ts';

/** The most of a first or a last paragraph that stays, in characters. */
export const EDGE_CHARS = 500;

/** The least of a middle that is worth a line in its place, in characters: a few lines' worth. */
export const MIDDLE_CHARS = 400;

/** One long message whose middle may leave: where it stands, and the first and last of it that stay. */
export type BodyCandidate = { at: number; role: 'user' | 'assistant'; text: string; head: string; tail: string };

// A line that opens or closes a fenced block of code: three backticks or tildes or more, after any indent.
const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * The fence open after a line, given the one open before it, or null: a block opened with backticks closes only at a
 * line of as many backticks or more and nothing else, one opened with tildes only at tildes (as CommonMark has it).
 */
function fenceAfter(open: string | null, line: string): string | null {
  const found = FENCE.exec(line);
  const mark = found?.[1];
  if (found === null || mark === undefined) return open;
  // Backticks with a backtick after them on the line are code within a line (```npm install```), not a fence.
  if (open === null) return mark[0] === '`' && line.slice(found[0].length).includes('`') ? null : mark;
  return mark[0] === open[0] && mark.length >= open.length && line.trim() === mark ? null : open;
}

/** Whether lines leave a fenced block open. */
const leavesOpen = (text: string): boolean => text.split('\n').reduce<string | null>(fenceAfter, null) !== null;

/**
 * Where a text's first paragraph ends and its last begins: at blank lines, never inside a fenced block of code.
 * Null where it has fewer than three paragraphs, so that no middle is between them.
 */
function edgesOf(text: string): { headEnd: number; tailStart: number } | null {
  const breaks: { start: number; end: number }[] = [];
  let open: string | null = null;
  let at = 0;
  let blank: { start: number; end: number } | null = null;
  for (const line of text.split('\n')) {
    const end = at + line.length + 1;
    open = fenceAfter(open, line);
    if (open === null && line.trim() === '') blank = blank === null ? { start: at, end } : { start: blank.start, end };
    else {
      if (blank !== null && blank.start > 0) breaks.push(blank);
      blank = null;
    }
    at = end;
  }
  const first = breaks[0];
  const last = breaks[breaks.length - 1];
  if (first === undefined || last === undefined || first === last) return null;
  return { headEnd: first.start, tailStart: last.end };
}

/**
 * The first `EDGE_CHARS` of a paragraph at most: its first lines, up to the last line after which no fenced block is
 * open, else whole characters of its first line.
 */
function clipHead(text: string): string {
  if (text.length <= EDGE_CHARS) return text;
  const lines = text.split('\n');
  let open: string | null = null;
  let kept = 0;
  let length = -1;
  for (let at = 0; at < lines.length; at += 1) {
    length += (lines[at] as string).length + 1;
    if (length > EDGE_CHARS) break;
    open = fenceAfter(open, lines[at] as string);
    if (open === null) kept = at + 1;
  }
  const lead = lines.slice(0, kept).join('\n');
  return lead.trim() !== '' ? lead : head(text, EDGE_CHARS);
}

/**
 * The last `EDGE_CHARS` of a paragraph at most: its last lines, from the first line before which no fenced block is
 * open, else whole characters of its end.
 */
function clipTail(text: string): string {
  if (text.length <= EDGE_CHARS) return text;
  const lines = text.split('\n');
  // The fence open before each line.
  const before: (string | null)[] = [];
  lines.reduce<string | null>((open, line) => {
    before.push(open);
    return fenceAfter(open, line);
  }, null);
  let kept = lines.length;
  let length = -1;
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    length += (lines[at] as string).length + 1;
    if (length > EDGE_CHARS) break;
    if (before[at] === null) kept = at;
  }
  const end = lines.slice(kept).join('\n');
  if (end.trim() !== '') return end;
  const start = text.length - EDGE_CHARS;
  const low = text.charCodeAt(start);
  // Never the second half of a pair alone: UTF-8 cannot hold it (#70).
  return text.slice(low >= 0xdc00 && low <= 0xdfff ? start + 1 : start);
}

/**
 * A message's first and last paragraphs as they stay, or null where it has no middle worth a line, or where what
 * stays of a paragraph would end or begin inside a fenced block of code.
 */
export function splitOf(text: string): { head: string; tail: string } | null {
  const edges = edgesOf(text);
  if (edges === null) return null;
  // A prefix and a suffix of the text: what was said, as it was, around the line.
  const first = clipHead(text.slice(0, edges.headEnd).trimEnd());
  const last = clipTail(text.slice(edges.tailStart).trimStart());
  if (leavesOpen(first) || leavesOpen(text.slice(0, text.length - last.length)) || leavesOpen(last)) return null;
  if (text.length - first.length - last.length < MIDDLE_CHARS) return null;
  return { head: first, tail: last };
}

/** A message whose middle left: its first and last paragraphs and the line between them, as they stand. */
export function bodyText(head: string, line: string, tail: string): string {
  return `${head}\n${line}\n${tail}`;
}

/** A text that is a first paragraph, the line of a message's middle, and a last paragraph: what each is. */
export function readBody(text: string): { head: string; ticket: BodyTicket; tail: string } | null {
  const lines = text.split('\n');
  const at = lines.flatMap((line, index) => (readBodyTicket(line) === null ? [] : [index]));
  if (at.length !== 1) return null;
  const index = at[0] as number;
  return { head: lines.slice(0, index).join('\n'), ticket: readBodyTicket(lines[index] as string) as BodyTicket, tail: lines.slice(index + 1).join('\n') };
}

/**
 * The long messages whose middles may leave, oldest first: what the person said, and what Claude said. The first
 * message stays, a line of this plugin's, what Claude Code writes in a person's place (`saidByAPerson`), and one with no
 * middle worth a line: a message whose middle left has no blank line, so no middle, left. The newest stays whatever
 * its size, and those before it while they and it add up to `keepChars`: an allowance of their own, as long inputs have.
 */
export function selectBodies(messages: readonly Message[], options: SelectOptions): BodyCandidate[] {
  const could: BodyCandidate[] = [];
  messages.forEach((message, at) => {
    const text = message.text;
    if (at === 0 || text.length < options.minChars) return;
    if (text.replace(HOST_TEXT, '').trim().startsWith(`[${PLUGIN}]`)) return;
    if (message.role === 'user' && !saidByAPerson(message)) return;
    const split = splitOf(text);
    if (split !== null) could.push({ at, role: message.role, text, ...split });
  });
  const candidates: BodyCandidate[] = [];
  let kept = 0;
  let total = 0;
  let closed = false;
  for (let index = could.length - 1; index >= 0; index -= 1) {
    const candidate = could[index] as BodyCandidate;
    if (!closed && ((kept === 0 && options.keepNewest !== false) || total + candidate.text.length <= options.keepChars)) {
      kept += 1;
      total += candidate.text.length;
      continue;
    }
    closed = true;
    candidates.push(candidate);
  }
  return candidates.reverse();
}

/**
 * The whole message a text stands for, where it is a first paragraph, the line of a message's middle and a last
 * paragraph, and the message kept under the line's id begins and ends as they do: else null. What a rewind puts in
 * the box is the message as it stands in the conversation; sent as it is, the line would be what was said (ADR 0024).
 */
export async function wholeOf(text: string, recallText: (id: string) => Promise<string | null>): Promise<string | null> {
  const body = readBody(text);
  // A message whose middle left has a first and a last paragraph: a line alone is not one.
  if (body === null || body.head.trim() === '' || body.tail.trim() === '') return null;
  const got = await recallText(body.ticket.id);
  return got !== null && got.startsWith(body.head) && got.endsWith(body.tail) ? got : null;
}

/** What a whole message is stored as: a person's, or Claude's (`moveBodyOut`). */
const MESSAGE_KINDS: ReadonlySet<string> = new Set(['message.person', 'message.claude']);

/**
 * What a prompt goes in as where it is a message sent again from a rewind, its middle still this plugin's line: the
 * whole message, where the person sent it (typed at the terminal, in an editor or the desktop app through the SDK, or
 * from their phone or the web) and what is kept under the line's id is a message this plugin kept. Else null, and the
 * prompt goes in as it is: a peer's message, a notification or a plugin's prompt is not touched, nor a line whose id
 * names a tool's result or a part.
 */
export async function rewound(
  prompt: { text?: unknown; origin?: { kind?: unknown } },
  kept: { kindOf: (id: string) => Promise<string | null>; textOf: (id: string) => Promise<string | null> },
): Promise<string | null> {
  const origin = prompt.origin?.kind;
  if (typeof prompt.text !== 'string' || (origin !== 'composer' && origin !== 'bridge' && origin !== 'sdk')) return null;
  return wholeOf(prompt.text, async (id) => (MESSAGE_KINDS.has((await kept.kindOf(id)) ?? '') ? kept.textOf(id) : null));
}
