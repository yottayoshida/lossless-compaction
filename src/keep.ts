// What Claude Code's own summary replaces, kept before it runs (ADR 0007), and
// the oldest messages of a conversation too full to go on with, kept in place
// of a summary (ADR 0019, src/cut.ts decides which).
//
// The conversation is written as text, in parts small enough for `recall` to
// hand back whole, and a message holding a ticket for each part is put right
// after the summary, or where the messages it lists stood.

import { inputLine } from './ask.ts';
import { changedLines } from './changed.ts';
import type { Attached } from './attached.ts';
import { ATTACHED_KEPT, PART, PLUGIN, attachedTicketText, bytesOf, holds, isPart, moveOut, partTicketText, readTicket, storedText, whyNotStored, type NotMoved } from './store.ts';
import { UNREAD_MAX, type Stop, type Unread } from './lifetime.ts';
import type { Files, Message, ToolResult, ToolUse } from './types.ts';

/**
 * The largest part, in UTF-8 bytes. `recall` output over about 50 KB is saved
 * by Claude Code to a file that the agent reads, and lines are cut when read.
 */
export const PART_BYTES = 40_000;
/** A result or an input shorter than this stays in the part's text: its ticket would be about as long. */
export const INLINE_BYTES = 400;
/** The first line of the message put after the summary; `goalOf` does not count a message that starts with it. */
export const KEPT = `[${PLUGIN}] The conversation this summary replaces is kept`;
/**
 * The first line of the message that stands where the oldest messages stood, no summary having taken their place.
 * It names no place in the conversation: the first message may stay in front of it, and each part says which messages it holds.
 */
export const KEPT_UNSUMMARIZED = `[${PLUGIN}] Earlier messages of this conversation are kept as they were said, with no summary in their place`;

/**
 * The conversation as Claude Code hands it with its blocks, read into the
 * shape the plugin keeps: an image or a document leaves a line saying it was
 * not kept, thinking is left out, and a block of any other kind is written as
 * its JSON. Null when it is not a list of messages.
 */
export function messagesFromApi(api: unknown): Message[] | null {
  if (!Array.isArray(api)) return null;
  const out: Message[] = [];
  for (const raw of api) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { role, content } = raw as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return null;
    const message: Message = { role, text: '', toolUses: [] };
    const texts: string[] = [];
    const results: ToolResult[] = [];
    for (const block of typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []) {
      const b = (typeof block === 'object' && block !== null ? block : {}) as Record<string, unknown>;
      switch (b['type']) {
        case 'text':
          texts.push(String(b['text'] ?? ''));
          break;
        case 'thinking':
        case 'redacted_thinking':
          break;
        case 'image':
        case 'document':
          texts.push(`[${String(b['type'])} not kept]`);
          break;
        case 'tool_use':
          message.toolUses.push({
            tool_use_id: String(b['id'] ?? ''),
            tool: String(b['name'] ?? 'tool'),
            input: (typeof b['input'] === 'object' && b['input'] !== null ? b['input'] : {}) as Record<string, unknown>,
          });
          break;
        case 'tool_result':
          results.push({ tool_use_id: String(b['tool_use_id'] ?? ''), text: resultText(b['content']), isError: b['is_error'] === true });
          break;
        default:
          texts.push(JSON.stringify(block));
      }
    }
    message.text = texts.join('\n');
    if (results.length > 0) message.toolResults = results;
    out.push(message);
  }
  return out;
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content === undefined ? '' : JSON.stringify(content);
  return content
    .map((block) => {
      const b = (typeof block === 'object' && block !== null ? block : {}) as Record<string, unknown>;
      if (b['type'] === 'text') return String(b['text'] ?? '');
      if (b['type'] === 'image' || b['type'] === 'document') return `[${String(b['type'])} not kept]`;
      return JSON.stringify(block);
    })
    .join('\n');
}

const valueText = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

// The fixed lines of a kept message. `messageText` writes them and `callsOfLines`
// reads them back: both are here, so the one cannot change without the other.
const roleLine = (role: Message['role']) => `--- ${role}`;
const callLine = (use: ToolUse) => `[call ${use.tool} ${use.tool_use_id}] ${inputLine(use.input)}`;
const resultLine = (result: ToolResult) => `[result ${result.tool_use_id}${result.isError ? ' error' : ''}]`;
const ROLE_LINE = /^--- (?:user|assistant)$/;
const CALL_LINE = /^\[call (\S+) (\S+)\] (.*)$/;
const RESULT_LINE = /^\[result (\S+)(?: error)?\]$/;

/**
 * Whether what follows a cut inside a line starts as a fixed line would: the piece it begins may end before the
 * line does, so its start is all a reader may see of it. Every fixed line starts so, and nothing does with any
 * character in front of it.
 */
const STARTS_FIXED = /^(?:--- (?:user|assistant)|\[(?:call|result) )/;
/** As much of what follows a cut as STARTS_FIXED reads. */
const LONGEST_START = '--- assistant'.length;

/**
 * A line of what was said, handed or returned that reads as a fixed line: to a reader, or to a model, which a line
 * ending in a carriage return or a space, or led by spaces, takes for one as well. Read past any backslashes in
 * front, so that a line holding one more of them is the same answer: that is what makes a mark taken off give the
 * line back as it was (docs/limits.md, #104).
 */
const READS_FIXED = /^[\\\s]*(?:--- (?:user|assistant)\s*$|\[(?:call|result) )/;

/** Text from outside a part's fixed lines, each line of it that reads as one marked with a backslash in front. */
function marked(text: string): string {
  // Every line that reads as a fixed line holds one of these; nearly no text does, and it is left whole.
  if (!text.includes('--- ') && !text.includes('[call ') && !text.includes('[result ')) return text;
  return text
    .split('\n')
    .map((line) => (READS_FIXED.test(line) ? `\\${line}` : line))
    .join('\n');
}

/**
 * One message as it is kept: every text, input value and result as it was, between fixed lines; a line of them that
 * reads as a fixed line has a backslash in front, so that the fixed lines are the plugin's alone (#104).
 */
export function messageText(message: Message): string {
  const lines = [roleLine(message.role)];
  if (message.text !== '') lines.push(marked(message.text));
  for (const use of message.toolUses) {
    lines.push(callLine(use));
    // A value JSON has no text for (undefined) is written as nothing, as it was before values were marked.
    for (const [name, value] of Object.entries(use.input)) lines.push(marked(`${name}:`), marked(valueText(value) ?? ''));
  }
  for (const result of message.toolResults ?? []) {
    lines.push(resultLine(result), marked(result.text));
  }
  return lines.join('\n');
}

/**
 * Each line of a kept part, with the call it stands under as `T called with
 * <input>`: the lines of a result under the call that made it, the values of
 * an input under the call they are of, and the text of a message under none.
 * A result whose call was kept in an earlier part stands under none either.
 */
export function callsOfLines(text: string): { line: string; call: string | undefined }[] {
  const lines = text.split('\n');
  const calls = new Map<string, string>();
  for (const line of lines) {
    const match = CALL_LINE.exec(line);
    if (match) calls.set(match[2] as string, `${match[1]} called with ${match[3]}`);
  }
  let call: string | undefined;
  return lines.map((line) => {
    if (ROLE_LINE.test(line)) call = undefined;
    else {
      const id = CALL_LINE.exec(line)?.[2] ?? RESULT_LINE.exec(line)?.[1];
      if (id !== undefined) call = calls.get(id);
    }
    return { line, call };
  });
}

/** The UTF-8 length of one character, as a code point tells it. */
function utf8Bytes(character: string): number {
  const point = character.codePointAt(0) ?? 0;
  return point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
}

/**
 * Cuts `text` into pieces of at most `limit` bytes, at a line where it can and never inside a character. Where a
 * line is cut, what follows the cut never starts as a fixed line does, which a piece that begins a part would show
 * (#104): the cut goes one character earlier, and a fixed line with any character in front of it is none.
 */
export function cut(text: string, limit: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  let size = 0;
  const flush = () => {
    if (piece !== '') pieces.push(piece);
    piece = '';
    size = 0;
  };
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const withBreak = index < lines.length - 1 ? `${line}\n` : line;
    const bytes = bytesOf(withBreak);
    if (size + bytes <= limit) {
      piece += withBreak;
      size += bytes;
      return;
    }
    flush();
    if (bytes <= limit) {
      piece = withBreak;
      size = bytes;
      return;
    }
    // The last character of the piece, so that a cut can go back by one without halving a pair.
    let last = '';
    for (let at = 0; at < withBreak.length; ) {
      const character = String.fromCodePoint(withBreak.codePointAt(at) ?? 0);
      const b = utf8Bytes(character);
      if (size + b > limit) {
        let carried = '';
        // A limit too small to take the two characters is no part's: there the cut stays where it was.
        if (last !== '' && utf8Bytes(last) + b <= limit && STARTS_FIXED.test(line.slice(at, at + LONGEST_START))) {
          piece = piece.slice(0, -last.length);
          carried = last;
        }
        flush();
        piece = carried;
        size = bytesOf(carried);
      }
      piece += character;
      size += b;
      last = character;
      at += character.length;
    }
  });
  flush();
  return pieces;
}

const REPLACEMENT = String.fromCodePoint(0xfffd);

/**
 * `text` with each half of a character that has no other half as U+FFFD, what
 * a UTF-8 file makes of it: a part holding one would read back other than it
 * was written, and nothing would be kept (#70). Only a part is mended so; a
 * result moved out on its own is refused and stays in the conversation as it was.
 */
export const wholeCharacters = (text: string): string => text.replace(/\p{Surrogate}/gu, REPLACEMENT);

type Kept = { text: string; parts: number } | { failed: NotMoved['reason']; code?: string } | { nothing: true };

/**
 * Moves out, as a compaction does, every result and every long input of one
 * message that is still in it, and returns the message with tickets in their
 * place. What cannot be moved out stays as it was: it is kept in the part.
 */
async function withTickets(files: Files, dir: string, message: Message, tools: ReadonlyMap<string, string>, inputs: boolean): Promise<Message> {
  const toolResults = [];
  for (const result of message.toolResults ?? []) {
    if (readTicket(result.text) || bytesOf(result.text) < INLINE_BYTES) {
      toolResults.push(result);
      continue;
    }
    const moved = await moveOut(files, dir, tools.get(result.tool_use_id) ?? 'tool', result.text, true);
    toolResults.push('reason' in moved ? result : { ...result, text: moved.text });
  }
  const toolUses: ToolUse[] = [];
  for (const use of message.toolUses) {
    if (!inputs) {
      toolUses.push(use);
      continue;
    }
    const input: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(use.input)) {
      input[name] = value;
      if (typeof value !== 'string' || bytesOf(value) < INLINE_BYTES) continue;
      const moved = await moveOut(files, dir, `${use.tool}.${name}`, value);
      if (!('reason' in moved)) input[name] = moved.text;
    }
    toolUses.push({ ...use, input });
  }
  const out: Message = { ...message, toolUses };
  if (message.toolResults) out.toolResults = toolResults;
  return out;
}

/**
 * Keeps `messages` in parts of at most PART_BYTES and returns the text of the
 * message that stands after the summary, or why nothing was kept. A part that
 * cannot be written keeps nothing: a ticket would point at what is not there.
 *
 * Under the parts, that message names the files the conversation read that
 * are no longer on disk what the `Read` returned (src/changed.ts); `read` is
 * where a reading moved out earlier is read from.
 *
 * With `summarized` false the messages are the oldest of a conversation, kept
 * in place of a summary: the message says so, the tickets do not speak of a
 * summary, and no file is named. Claude Code shows no file again where no
 * summary ran, and the messages that follow, which may have written the file
 * since, are not among these. `after` is how many messages of the conversation
 * stand in front of them, so that a part names its messages by their place in
 * the whole.
 *
 * With `attached` the messages are what Claude Code attached to a conversation's
 * messages as it sent them (`keepAttached`): the message says so, its tickets
 * name no messages, and no file is named.
 */
export async function keepConversation(
  files: Files,
  dir: string,
  messages: readonly Message[],
  read: readonly string[] = [dir],
  { summarized = true, after = 0, attached = false }: { summarized?: boolean; after?: number; attached?: boolean } = {},
): Promise<Kept> {
  const tools = new Map(messages.flatMap((message) => message.toolUses).map((use) => [use.tool_use_id, use.tool]));
  // Pieces of text, each with the number of the message it comes from, one based.
  // Every message ends in a line break, so the parts read in order are the messages in order.
  const pieces: { text: string; at: number; bytes: number }[] = [];
  for (const [index, message] of messages.entries()) {
    const ticketed = await withTickets(files, dir, message, tools, false);
    let text = `${messageText(ticketed)}\n`;
    // Its results are tickets by now; only its inputs are left to move out.
    if (bytesOf(text) > PART_BYTES) text = `${messageText(await withTickets(files, dir, ticketed, tools, true))}\n`;
    for (const piece of cut(wholeCharacters(text), PART_BYTES)) pieces.push({ text: piece, at: after + index + 1, bytes: bytesOf(piece) });
  }

  const parts: { text: string; first: number; last: number; bytes: number }[] = [];
  for (const piece of pieces) {
    const last = parts.at(-1);
    if (last && last.bytes + piece.bytes <= PART_BYTES) {
      last.text += piece.text;
      last.last = piece.at;
      last.bytes += piece.bytes;
    } else {
      parts.push({ text: piece.text, first: piece.at, last: piece.at, bytes: piece.bytes });
    }
  }
  if (parts.length === 0) return { nothing: true };

  const lines = [`${attached ? ATTACHED_KEPT : summarized ? KEPT : KEPT_UNSUMMARIZED}, in ${parts.length} part${parts.length === 1 ? '' : 's'}; recall a part by its id.`];
  for (const [index, part] of parts.entries()) {
    const moved = await moveOut(files, dir, PART, part.text);
    if ('reason' in moved) return { failed: moved.reason, ...(moved.code === undefined ? {} : { code: moved.code }) };
    const ticket = { part: index + 1, parts: parts.length, bytes: moved.bytes, id: moved.id };
    lines.push(attached ? attachedTicketText(ticket) : partTicketText({ ...ticket, first: part.first, last: part.last }, summarized));
  }
  // It throws nothing: the parts stand whatever it meets.
  if (summarized && !attached) lines.push(...(await changedLines(files, dir, read, messages)));
  return { text: lines.join('\n'), parts: parts.length };
}

/**
 * Keeps what Claude Code attached to the messages as it sent them (src/attached.ts finds it, #105), in parts as a
 * conversation is kept, and returns the message that names them, or why nothing was kept. Each block stands under the
 * message it came with; one sent again, as a reminder is, is written once and named after that.
 */
export async function keepAttached(files: Files, dir: string, attached: readonly Attached[]): Promise<Kept> {
  const first = new Map<string, string>();
  const messages: Message[] = [];
  for (const { label, text } of attached) {
    const earlier = first.get(text);
    if (earlier === undefined) first.set(text, label);
    const line = earlier === undefined ? text : `(the same as attached ${earlier})`;
    // Headed as Claude Code's, so that what it attached is not read as what the person said.
    const heading = `What Claude Code attached ${label}:`;
    const last = messages.at(-1);
    if (last !== undefined && last.text.startsWith(`${heading}\n`)) last.text += `\n${line}`;
    else messages.push({ role: 'user', text: `${heading}\n${line}`, toolUses: [] });
  }
  return keepConversation(files, dir, messages, [dir], { attached: true });
}

/**
 * The conversation Claude Code's compaction handed back, with the message
 * that holds the tickets right after its first message, the summary. A
 * conversation with nothing in it is handed back as it is.
 */
export function afterSummary<T>(messages: readonly T[], text: string): (T | Message)[] {
  if (messages.length === 0) return [...messages];
  const [summary, ...rest] = messages;
  return [summary as T, { role: 'user', text, toolUses: [] }, ...rest];
}

const ID = /[0-9a-f]{64}/g;

/**
 * The ids a collection must keep: those the transcripts name, and every id
 * written in a kept part they name, through the parts of earlier summaries.
 * A part's results are named in the part alone, not in any transcript. A part
 * that cannot be read stops the collection, as a transcript that cannot be
 * read does.
 */
export async function namedThroughParts(files: Files, dirs: readonly string[], live: ReadonlySet<string>, inTrash: ReadonlySet<string> = new Set()): Promise<Set<string> | Stop> {
  const named = new Set(live);
  const queue = [...live];
  // Each one that cannot be followed is kept, and the rest are still followed: one try names all of them (#114).
  const unread: Unread[] = [];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    // Named, in the trash and not in place: it may be a part, and with its entry there it cannot be told. What it
    // names would go uncounted, so nothing is collected until it is back.
    if (inTrash.has(id) && !(await holds(files, dirs, id))) {
      unread.push({ id, why: 'in-trash' });
      continue;
    }
    const part = await isPart(files, dirs, id);
    if (part === false) continue;
    // An entry that does not read cannot say whether it is a part: its text, where it is the one stored under this
    // id, is followed all the same. That keeps more, never less (ADR 0033).
    const text = await storedText(files, dirs, id);
    if (!text.ok) {
      unread.push({ id, why: text.why });
      continue;
    }
    for (const inner of text.text.match(ID) ?? []) {
      if (named.has(inner)) continue;
      named.add(inner);
      queue.push(inner);
    }
  }
  return unread.length === 0 ? named : unreadStop(unread);
}

/** What makes a stored thing's text not to be followed, as a stop names it. */
const UNREAD_SAID: Record<Unread['why'], string> = {
  'text-missing': 'its text is not there',
  'text-changed': 'its text has changed on disk',
  'text-unreadable': 'its text could not be read',
  'in-trash': 'it is named and could not be put back from the trash',
};

/** The stop for what could not be followed: every one of them kept, up to `UNREAD_MAX`, the first named in the line. */
function unreadStop(unread: readonly Unread[]): Stop {
  const [first] = unread as [Unread];
  const what = unread.length === 1 ? `${first.id}: ${UNREAD_SAID[first.why]}` : `${unread.length} stored things it follows could not be read or put back, ${first.id} among them`;
  const kind = unread.some((one) => one.why !== 'in-trash') ? 'part' : 'move';
  const more = unread.length - UNREAD_MAX;
  return { stop: `${what}; /lossless-store says how to go on`, kind, unread: unread.slice(0, UNREAD_MAX), ...(more > 0 ? { more } : {}) };
}

/** What to keep before a summary, or why nothing can be. */
export type ToKeep = { dir: string; messages: readonly Message[]; read?: readonly string[] } | { unkept: string };

/**
 * Keeps what `keep` names, then runs `summarize` — the built-in compaction —
 * at most once, and puts the tickets of what was kept right after the summary
 * it hands back. When a write the host refused leaves nothing kept, the
 * summary does not run: `skip` says why, and the conversation stays as it is
 * (ADR 0008). Anything else that goes wrong in keeping is said, and the
 * summary is then handed back as the built-in compaction made it; so is a skip.
 *
 * With `refused` set to `summarize`, a refused write is said like any other
 * failure to keep and the summary runs: for a subagent's conversation, which
 * no one can compact again once room is made (ADR 0026).
 */
export async function keepThenSummarize<R extends { messages?: readonly unknown[] | undefined }>(
  files: Files,
  keep: ToKeep,
  say: (text: string) => void,
  summarize: () => Promise<R>,
  skip: (why: string) => R,
  refused: 'skip' | 'summarize' = 'skip',
): Promise<R> {
  const unkept = (why: string) => say(`nothing of the conversation is kept before the built-in summary: ${why}`);
  let kept: { text: string; parts: number } | null = null;
  if ('unkept' in keep) {
    unkept(keep.unkept);
  } else {
    try {
      const done = await keepConversation(files, keep.dir, keep.messages, keep.read);
      if ('failed' in done && done.failed === 'write-failed' && refused === 'summarize') {
        unkept(`could not write: ${done.code ?? 'unknown'}`);
      } else if ('failed' in done && done.failed === 'write-failed') {
        const code = done.code ?? 'unknown';
        // Only a full disk is helped by making room; any other refusal is named and left to the reader.
        const advice = code === 'ENOSPC' || code === 'EDQUOT' ? 'free some space and compact again' : 'compact again once the place results are kept in can be written to';
        const why = `nothing could be kept (could not write: ${code}), so the summary did not run; ${advice}`;
        // `say` names the plugin itself; the notice a skip shows does not.
        say(why);
        return skip(`${PLUGIN}: ${why}`);
      } else if ('failed' in done) unkept(`a part could not be kept: ${whyNotStored({ reason: done.failed })}`);
      else if ('nothing' in done) unkept('there is nothing to keep');
      else kept = done;
    } catch (error) {
      unkept(error instanceof Error ? error.message : String(error));
    }
  }
  const r = await summarize();
  if (kept === null) return r;
  const parts = `${kept.parts} part${kept.parts === 1 ? '' : 's'}`;
  if (r.messages === undefined) {
    say(`the conversation was kept in ${parts}, but no summary ran, so nothing was added to it`);
    return r;
  }
  try {
    const messages = afterSummary(r.messages, kept.text);
    say(`kept the conversation in ${parts} before the built-in summary`);
    return { ...r, messages };
  } catch {
    // Handing back what the built-in compaction made is better than a second summary.
    say(`the conversation was kept in ${parts}, but its tickets could not be put after the summary`);
    return r;
  }
}
