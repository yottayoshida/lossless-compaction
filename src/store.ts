// Where moved-out tool results live, and the one line that stands in for each.
//
// A result is stored under the SHA-256 of its text. The same text always gets
// the same name and the same ticket, so compacting twice writes nothing new and
// changes nothing that an earlier compaction left in the conversation.

import { dirsOf, idOf, look, store, type NotMoved, type Recalled } from './blobs.ts';
import { blobPath, entryPath } from './layout.ts';
import type { Files, Message } from './types.ts';

export { MAX_BYTES, NOT_AN_ID, NOT_STORED, bytesOf, codeOf, holds, idOf, recall, storedAs, type NotMoved, type Recalled } from './blobs.ts';

export const PLUGIN = 'lossless-compaction';
/** The name the plugin carried up to 0.3.0. What was written under it is still read (ADR 0004). */
export const OLD_PLUGIN = 'jev-lossless-compaction';
export const RECALL = 'recall';
export const FIND = 'find';
/** The slash command that says what the store holds (ADR 0016). */
export const STORE_COMMAND = 'lossless-store';
/** The slash command that says the plugin runs, its version, its settings in use and whether `find` is there (#108). */
export const STATUS_COMMAND = 'lossless-status';
/** The names the model calls this plugin's tools by. */
export const RECALL_TOOL = `mcp__${PLUGIN}__${RECALL}`;
export const FIND_TOOL = `mcp__${PLUGIN}__${FIND}`;
const OLD_RECALL_TOOL = `mcp__${OLD_PLUGIN}__${RECALL}`;
const OLD_FIND_TOOL = `mcp__${OLD_PLUGIN}__${FIND}`;

/** This plugin's own tools, under either name, whose results are named by the short name in a ticket. */
const OWN = new Map([
  [RECALL_TOOL, RECALL],
  [FIND_TOOL, FIND],
  [OLD_RECALL_TOOL, RECALL],
  [OLD_FIND_TOOL, FIND],
]);

/** True for the name of one of this plugin's own tools, as a call or as a ticket spells it. */
export function isOwnTool(tool: string): boolean {
  return OWN.has(tool) || tool === RECALL || tool === FIND;
}

const movedOut = (recallTool: string) =>
  new RegExp(`^\\[moved out\\] ([A-Za-z0-9_.-]{1,128}) result, (\\d{1,9}) bytes; recall with ${recallTool} id ([0-9a-f]{64})$`);
const TICKET = movedOut(RECALL_TOOL);
// The wordings of earlier versions. Conversations compacted then still carry them, so they are read, never written:
// 0.2.0 and 0.3.0 wrote the line above under the old name, 0.1.0 a longer one.
const TICKET_OLD_NAME = movedOut(OLD_RECALL_TOOL);
const TICKET_2026_09 = new RegExp(
  `^\\[${OLD_PLUGIN}\\] This ([A-Za-z0-9_.-]{1,128}) result \\((\\d{1,9}) bytes\\) was moved out of the conversation ` +
    `and is kept unchanged on disk\\. To read it, call the tool ${OLD_RECALL_TOOL} with id ([0-9a-f]{64})\\.$`,
);

/**
 * The name the index gives a part of a kept conversation: kept before the built-in
 * summary (ADR 0007), or in place of one (ADR 0019).
 */
export const PART = 'conversation';
/** How a part's ticket names what Claude Code attached to the messages as it sent them (#105). */
const ATTACHED_WORDS = 'what Claude Code attached as it sent the messages';
/**
 * The first line of the message at the end of a rebuilt conversation that names what Claude Code attached to its
 * messages as it sent them (#105): no summary, no place in the conversation, and nothing the person said.
 */
export const ATTACHED_KEPT = `[${PLUGIN}] What Claude Code attached to these messages as it sent them is kept`;
// A part has a wording of its own, so that no tool named `conversation` is taken for one. The words
// "before the summary" are written where a summary followed and left out where none did; both are read. A part of
// what Claude Code attached to the messages as it sent them names no messages (#105).
const PART_TICKET = new RegExp(
  `^\\[moved out\\] (?:conversation(?: before the summary)?, part (\\d{1,6}) of (\\d{1,6}), messages (\\d{1,6})-(\\d{1,6})|${ATTACHED_WORDS}, part (\\d{1,6}) of (\\d{1,6})), (\\d{1,9}) bytes; recall with ${RECALL_TOOL} id ([0-9a-f]{64})$`,
);

export type Ticket = { tool: string; bytes: number; id: string };

/**
 * Which part of a kept conversation a line stands for, and which of its messages the part holds; or, `attached`,
 * which part of what Claude Code attached to the messages as it sent them, which names none (`first` and `last` 0).
 */
export type PartTicket = Ticket & { part: number; parts: number; first: number; last: number; kind: 'conversation' | 'attached' };

/** The line that stands for one part. `summarized` is false where no summary took the conversation's place. */
export function partTicketText({ part, parts, first, last, bytes, id }: Omit<PartTicket, 'tool' | 'kind'>, summarized = true): string {
  return `[moved out] conversation${summarized ? ' before the summary' : ''}, part ${part} of ${parts}, messages ${first}-${last}, ${bytes} bytes; recall with ${RECALL_TOOL} id ${id}`;
}

/** The line that stands for one part of what Claude Code attached to the messages as it sent them (#105). */
export function attachedTicketText({ part, parts, bytes, id }: Pick<PartTicket, 'part' | 'parts' | 'bytes' | 'id'>): string {
  return `[moved out] ${ATTACHED_WORDS}, part ${part} of ${parts}, ${bytes} bytes; recall with ${RECALL_TOOL} id ${id}`;
}

/** Reads a line that has the shape of a part's ticket. The shape alone proves nothing: see `isStored`. */
export function readPartTicket(text: string): PartTicket | null {
  const match = PART_TICKET.exec(text);
  if (!match) return null;
  const [, part, parts, first, last, attachedPart, attachedParts, bytes, id] = match;
  if (part === undefined) {
    return { tool: PART, kind: 'attached', part: Number(attachedPart), parts: Number(attachedParts), first: 0, last: 0, bytes: Number(bytes), id: id as string };
  }
  return { tool: PART, kind: 'conversation', part: Number(part), parts: Number(parts), first: Number(first), last: Number(last), bytes: Number(bytes), id: id as string };
}

export type Moved = Ticket & { text: string };

/**
 * The line left in the conversation. Fixed wording, the tool's name, a size
 * and an id: nothing from the result itself, which is text from outside. The
 * tool's exact name is what the model loads the tool by, so it is spelled out;
 * this plugin's own tools, whose results leave too, are named `recall` and
 * `find`.
 */
export function ticketText({ tool, bytes, id }: Ticket): string {
  const name = OWN.get(tool) ?? tool;
  return `[moved out] ${name} result, ${bytes} bytes; recall with ${RECALL_TOOL} id ${id}`;
}

/** Reads a line that has the shape of a ticket, in any wording written so far. The shape alone proves nothing: see `isStored`. */
export function readTicket(text: string): Ticket | null {
  const match = TICKET.exec(text) ?? TICKET_OLD_NAME.exec(text) ?? TICKET_2026_09.exec(text);
  if (!match) return null;
  const [, tool, bytes, id] = match;
  if (tool === undefined || bytes === undefined || id === undefined) return null;
  return { tool, bytes: Number(bytes), id };
}

// The name of an input's field as a ticket spells it. A tool of anyone's names its fields as it likes; a name of
// any other shape is written `value`, so that nothing of another's wording stands in the line.
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
// An input has a wording of its own: it is not a result, and a line that says so is not taken for one.
const INPUT_TICKET = new RegExp(
  `^\\[moved out\\] the "([A-Za-z_][A-Za-z0-9_]{0,63})" ([A-Za-z0-9_.-]{1,128}) ran with, (\\d{1,9}) bytes; recall with ${RECALL_TOOL} id ([0-9a-f]{64})$`,
);

/** Which value of a tool call's input a line stands for: the tool, the field, a size and an id. */
export type InputTicket = Ticket & { field: string };

/** The line left where a long value of a tool call's input was. The call's other fields stay as they are. */
export function inputTicketText({ tool, field, bytes, id }: InputTicket): string {
  // Said as what the call ran with: worded as a value of the input, Sonnet 5.5 read such lines as calls that had
  // written the line itself, and said the files might hold it (ADR 0020).
  return `[moved out] the "${FIELD.test(field) ? field : 'value'}" ${tool} ran with, ${bytes} bytes; recall with ${RECALL_TOOL} id ${id}`;
}

/** Reads a line that has the shape of an input's ticket. The shape alone proves nothing: see `isStored`. */
export function readInputTicket(text: string): InputTicket | null {
  const match = INPUT_TICKET.exec(text);
  if (!match) return null;
  const [, field, tool, bytes, id] = match.map(String);
  return { tool: tool as string, field: field as string, bytes: Number(bytes), id: id as string };
}

const ABSOLUTE = /^(?:\/|[A-Za-z]:[\\/])/;
const withoutLastSlash = (path: string | undefined) => (path ?? '').trim().replace(/[\\/]+$/, '');

/** The variables the default place is read from. A repository's own settings can set them. */
export type Places = { CLAUDE_CONFIG_DIR?: string | undefined; HOME?: string | undefined; USERPROFILE?: string | undefined };

const absolute = (path: string) => (ABSOLUTE.test(path) ? path : null);

/**
 * Claude Code's own directory: `CLAUDE_CONFIG_DIR` when set, else `~/.claude`.
 * Null when what it would be built from is not an absolute path. The store and
 * the place transcripts are looked for in are both read from here, so they agree.
 */
export function configDirFrom(env: Places): string | null {
  const config = withoutLastSlash(env.CLAUDE_CONFIG_DIR);
  if (config !== '') return absolute(config);
  const home = withoutLastSlash(env.HOME) || withoutLastSlash(env.USERPROFILE);
  return absolute(home) && `${home}/.claude`;
}

/** The directory named `name` under Claude Code's own. */
function defaultDirFrom(name: string, env: Places): string | null {
  const config = configDirFrom(env);
  return config && `${config}/${name}`;
}

/**
 * Where results are kept: the setting, else a directory of this plugin's under
 * Claude Code's own. Null when what it would be built from is not an absolute
 * path: a relative one is taken from the working directory, and results would
 * be written into the repository at hand.
 */
export function storeDirFrom(setting: unknown, env: Places): string | null {
  if (typeof setting === 'string' && setting.trim() !== '') return absolute(withoutLastSlash(setting));
  return defaultDirFrom(PLUGIN, env);
}

/** Where results were kept up to 0.3.0, when nothing was set: the same place under the old name. */
export function oldStoreDirFrom(env: Places): string | null {
  return defaultDirFrom(OLD_PLUGIN, env);
}

/** The directory results are written to, and the directories they are read from, the first being the one written to. */
export type StoreDirs = { write: string; read: readonly string[] };

/**
 * Results are read from two places and written to one. With a setting, that
 * place alone. Without one, the default under the current name and the default
 * under the old name are both read; the old one is written to while it exists
 * (a link to it counts, a plain file in its place does not), since that is
 * where the results are and where a directory made readable to its owner
 * alone was made; else the current one.
 */
export async function placesOf(files: Files, setting: unknown, env: Places): Promise<StoreDirs | null> {
  const chosen = storeDirFrom(setting, env);
  if (chosen === null) return null;
  if (typeof setting === 'string' && setting.trim() !== '') return { write: chosen, read: [chosen] };
  const old = oldStoreDirFrom(env);
  if (old === null || old === chosen) return { write: chosen, read: [chosen] };
  const found = await look(files, old);
  return found === 'missing' || found === 'file' ? { write: chosen, read: [chosen, old] } : { write: old, read: [old, chosen] };
}

/**
 * Stores one tool result and returns the ticket that replaces it, or why the
 * result has to stay where it is. The result is replaced only after the stored
 * text has been read back and found equal (src/blobs.ts).
 */
export async function moveOut(files: Files, dir: string, tool: string, text: string): Promise<Moved | NotMoved> {
  const stored = await store(files, dir, tool, text);
  if ('reason' in stored) return stored;
  return { tool, ...stored, text: ticketText({ tool, ...stored }) };
}

/** A value of a tool call's input, stored: what its ticket says, and the line that replaces it. */
export type MovedInput = InputTicket & { text: string };

// The middle of a long message that left (ADR 0024): a line of its own between the message's first and last
// paragraphs. It says the whole message comes back, and its size, so that what is around it is not taken for all
// there was.
const BODY_TICKET = new RegExp(
  `^\\[moved out\\] the middle of this message; recall returns the whole message, (\\d{1,9}) bytes, head and tail included, with ${RECALL_TOOL} id ([0-9a-f]{64})$`,
);

/** What the line in place of a message's middle says: the size of the whole message, and its id. */
export type BodyTicket = { bytes: number; id: string };

export function bodyTicketText({ bytes, id }: BodyTicket): string {
  return `[moved out] the middle of this message; recall returns the whole message, ${bytes} bytes, head and tail included, with ${RECALL_TOOL} id ${id}`;
}

/** Reads a line that has the shape of a message's ticket. The shape alone proves nothing: see `isStored`. */
export function readBodyTicket(line: string): BodyTicket | null {
  const match = BODY_TICKET.exec(line);
  if (!match) return null;
  return { bytes: Number(match[1]), id: match[2] as string };
}

/** Stores a whole message, said by a person or by Claude, and returns the line for its middle. */
export async function moveBodyOut(files: Files, dir: string, role: 'user' | 'assistant', text: string): Promise<(BodyTicket & { text: string }) | NotMoved> {
  const moved = await moveOut(files, dir, role === 'user' ? 'message.person' : 'message.claude', text);
  if ('reason' in moved) return moved;
  return { bytes: moved.bytes, id: moved.id, text: bodyTicketText(moved) };
}

/**
 * Stores one long value of a tool call's input and returns the line that replaces it, or why the value has to
 * stay where it is. The entry names it `<tool>.<field>`, as a kept part names an input it holds (ADR 0007).
 */
export async function moveInputOut(files: Files, dir: string, tool: string, field: string, value: string): Promise<MovedInput | NotMoved> {
  const name = FIELD.test(field) ? field : 'value';
  const moved = await moveOut(files, dir, `${tool}.${name}`, value);
  if ('reason' in moved) return moved;
  const ticket = { tool, field: name, bytes: moved.bytes, id: moved.id };
  return { ...ticket, text: inputTicketText(ticket) };
}

/** Why a stored text is not read: none there, one that does not read, one whose hash is no longer its name. */
export type TextWhy = 'text-missing' | 'text-unreadable' | 'text-changed';

/**
 * The text stored under `id` in the first of `dirs` that holds an entry for it, readable or not, and its text, as
 * `recall` finds it; or why not. Its hash is checked: a text that is not what was stored is never read as it.
 */
export async function storedText(files: Files, dirs: readonly string[], id: string): Promise<{ ok: true; text: string } | { ok: false; why: TextWhy }> {
  for (const dir of dirs) {
    if ((await look(files, entryPath(dir, id))) !== 'file' || (await look(files, blobPath(dir, id))) !== 'file') continue;
    let text: string;
    try {
      text = await files.read(blobPath(dir, id));
    } catch {
      return { ok: false, why: 'text-unreadable' };
    }
    return (await idOf(text)) === id ? { ok: true, text } : { ok: false, why: 'text-changed' };
  }
  return { ok: false, why: 'text-missing' };
}

/**
 * Whether `id` is a part of a kept conversation, as its entry says, in any of
 * `dirs`; null when the entry is there and cannot be read.
 */
export async function isPart(files: Files, dirs: readonly string[], id: string): Promise<boolean | null> {
  for (const dir of dirs) {
    if ((await look(files, entryPath(dir, id))) !== 'file') continue;
    try {
      const entry: unknown = JSON.parse(await files.read(entryPath(dir, id)));
      // Every version writes `{bytes, tool}`: an entry of another shape is not read as saying "not a part" (#114).
      const tool = typeof entry === 'object' && entry !== null && !Array.isArray(entry) ? (entry as { tool?: unknown }).tool : undefined;
      return typeof tool === 'string' ? tool === PART : null;
    } catch {
      return null;
    }
  }
  return false;
}

/**
 * True when `text` is a ticket this store wrote, of a result or of a part of a
 * kept conversation: its shape, and an entry of that size under its id, in any of `dirs`.
 */
export async function isStored(files: Files, dirs: string | readonly string[], text: string): Promise<boolean> {
  const ticket = readTicket(text) ?? readPartTicket(text) ?? readInputTicket(text) ?? readBodyTicket(text);
  if (!ticket) return false;
  for (const dir of dirsOf(dirs)) {
    if ((await look(files, entryPath(dir, ticket.id))) !== 'file') continue;
    try {
      const entry: unknown = JSON.parse(await files.read(entryPath(dir, ticket.id)));
      if (typeof entry === 'object' && entry !== null && (entry as { bytes?: unknown }).bytes === ticket.bytes) return true;
    } catch {
      // An entry that cannot be read is not this store's; the next place may hold it.
    }
  }
  return false;
}

/** The strings of an input, however deep, that are a whole input ticket. */
export function inputTicketsOf(value: unknown, into: string[] = [], depth = 0): string[] {
  if (typeof value === 'string') {
    if (readInputTicket(value) !== null) into.push(value);
  } else if (typeof value === 'object' && value !== null && depth < 8) {
    for (const inner of Array.isArray(value) ? value : Object.values(value)) inputTicketsOf(inner, into, depth + 1);
  }
  return into;
}

// An id as it is written in a text: 64 hexadecimal characters, with none right before or after.
const WRITTEN_ID =/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/g;
/** The fewest characters of an id, from its first, that tell which one an agent meant. */
export const ID_LEAST = 8;

/** The hexadecimal characters `given` begins with: what of it can be told against an id. */
export const headOf = (given: string): string => /^[0-9a-f]{0,64}/.exec(given)?.[0] ?? '';

/** True when `given` begins with ID_LEAST hexadecimal characters: only then is the conversation read for the id that was meant. */
function mayBeMeant(given: unknown): given is string {
  return typeof given === 'string' && headOf(given).length >= ID_LEAST;
}

/** How many characters, from the first, `a` and `b` share. */
export function sharedHead(a: string, b: string): number {
  let at = 0;
  while (at < a.length && at < b.length && a[at] === b[at]) at += 1;
  return at;
}

/**
 * Every id written in the conversation, once each, oldest first. Read from the
 * user messages, what tools returned and the tickets this plugin put in calls,
 * not from what the agent said or wrote in its calls: an id it gave wrong
 * before would stand beside the one it was copied from.
 */
export function idsWritten(messages: readonly Message[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    const texts = [
      message.role === 'user' ? message.text : '',
      ...(message.toolResults ?? []).map((result) => result.text),
      ...message.toolUses.map((use) => use.text ?? ''),
      // A value of a call's input that is a whole ticket was put there by this plugin, not written by the agent (ADR 0020).
      ...message.toolUses.flatMap((use) => inputTicketsOf(use.input)),
      // So is the line in place of the middle of a message of Claude's (ADR 0024).
      ...(message.role === 'assistant' ? message.text.split('\n').filter((line) => readBodyTicket(line) !== null) : []),
    ];
    for (const text of texts) for (const [id] of text.matchAll(WRITTEN_ID)) ids.add(id);
  }
  return [...ids];
}

/**
 * The id an agent meant by one that `recall` refused: of the ids written in
 * the conversation, the one that shares the most characters from the first
 * with what it gave, ID_LEAST or more, where no other shares as many. Null
 * when none does, or two do. An agent copying 64 characters gets them wrong
 * now and then: it gives the first half, drops a character, or writes one that
 * is no digit (#54); it drops one of two characters written twice over, as
 * `406e6e8` copied as `406e8` ten characters in, or stops after a few (#107).
 *
 * An id written there that is what it gave, whole, is not the one it meant:
 * Claude Code's summary or a kept part `recall` returned can hold an id the
 * agent copied wrong in full, beside the one it was copied from. So is `past`, where it is given.
 */
export function idMeant(given: unknown, messages: readonly Message[], past?: string): string | null {
  if (!mayBeMeant(given)) return null;
  const head = headOf(given);
  let meant: string | null = null;
  let most = ID_LEAST - 1;
  let tied = false;
  for (const id of idsWritten(messages)) {
    if (id === given || id === past) continue;
    const shared = sharedHead(head, id);
    if (shared > most) [meant, most, tied] = [id, shared, false];
    else if (shared === most && meant !== null) tied = true;
  }
  return tied ? null : meant;
}

/**
 * What is stored under `id`, or, when `id` is refused, under the id the agent
 * meant by it (`idMeant`). `read` is `recall` with what the caller does around
 * it. Where that id is refused too, or the conversation cannot be read, the
 * answer is the refusal of the id as it was given: that is the one the agent
 * can copy again.
 */
export async function recallMeant(read: (id: unknown) => Promise<Recalled>, id: unknown, conversation: () => Promise<readonly Message[]>): Promise<Recalled> {
  const found = await read(id);
  // What could tell no id is refused without reading the conversation, as it was before.
  if (!('error' in found) || !mayBeMeant(id)) return found;
  let meant: string | null = null;
  try {
    meant = idMeant(id, await conversation());
  } catch {
    // The conversation could not be read: the id is refused as it was given.
  }
  if (meant === null || meant === id) return found;
  const again = await read(meant);
  if (!('error' in again)) return again;
  // What it gave begins with a whole id written in the conversation that is not stored, as a copy written wrong in full and
  // handed twice over (`W\nW`): the one it was copied from is looked for past it.
  if (meant !== headOf(id as string)) return found;
  let next: string | null = null;
  try {
    next = idMeant(id, await conversation(), meant);
  } catch {
    // Refused as it was given.
  }
  if (next === null) return found;
  const last = await read(next);
  return 'error' in last ? found : last;
}
