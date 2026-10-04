// Where moved-out tool results live, and the one line that stands in for each.
//
// A result is stored under the SHA-256 of its text. The same text always gets
// the same name and the same ticket, so compacting twice writes nothing new and
// changes nothing that an earlier compaction left in the conversation.

import { blobPath, blobsDir, entryPath, indexDir, tmpDir } from './layout.ts';
import { decodeMedia, textOf, type MediaPart } from './media.ts';
import type { Files, Message } from './types.ts';

export const PLUGIN = 'lossless-compaction';
/** The name the plugin carried up to 0.3.0. What was written under it is still read (ADR 0004). */
export const OLD_PLUGIN = 'jev-lossless-compaction';
export const RECALL = 'recall';
export const FIND = 'find';
/** The slash command that says what the store holds (ADR 0016). */
export const STORE_COMMAND = 'lossless-store';
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

/** The host refuses a read or write over 4 MiB; stay under it with room to spare. */
export const MAX_BYTES = 4 * 1024 * 1024 - 4096;

const ID = /^[0-9a-f]{64}$/;
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
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
// A part has a wording of its own, so that no tool named `conversation` is taken for one. The words
// "before the summary" are written where a summary followed and left out where none did; both are read.
const PART_TICKET = new RegExp(
  `^\\[moved out\\] conversation(?: before the summary)?, part (\\d{1,6}) of (\\d{1,6}), messages (\\d{1,6})-(\\d{1,6}), (\\d{1,9}) bytes; recall with ${RECALL_TOOL} id ([0-9a-f]{64})$`,
);

export type Ticket = { tool: string; bytes: number; id: string };

/** Which part of a kept conversation a line stands for, and which of its messages the part holds. */
export type PartTicket = Ticket & { part: number; parts: number; first: number; last: number };

/** The line that stands for one part. `summarized` is false where no summary took the conversation's place. */
export function partTicketText({ part, parts, first, last, bytes, id }: Omit<PartTicket, 'tool'>, summarized = true): string {
  return `[moved out] conversation${summarized ? ' before the summary' : ''}, part ${part} of ${parts}, messages ${first}-${last}, ${bytes} bytes; recall with ${RECALL_TOOL} id ${id}`;
}

/** Reads a line that has the shape of a part's ticket. The shape alone proves nothing: see `isStored`. */
export function readPartTicket(text: string): PartTicket | null {
  const match = PART_TICKET.exec(text);
  if (!match) return null;
  const [, part, parts, first, last, bytes, id] = match.map(String);
  return { tool: PART, part: Number(part), parts: Number(parts), first: Number(first), last: Number(last), bytes: Number(bytes), id: id as string };
}

export type Moved = Ticket & { text: string };

export type NotMoved = {
  reason: 'tool-name' | 'too-large' | 'symlink' | 'not-a-file' | 'differs' | 'write-failed';
  /** For a failed write, what the host said: an error code such as ENOSPC where it gave one. */
  code?: string;
};

const UTF8 = new TextEncoder();

export function bytesOf(text: string): number {
  return UTF8.encode(text).length;
}

export async function idOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', UTF8.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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

type Found = 'missing' | 'file' | 'symlink' | 'not-a-file';

async function look(files: Files, path: string): Promise<Found> {
  let stat;
  try {
    stat = await files.stat(path);
  } catch {
    return 'missing';
  }
  if (stat.isLink === true) return 'symlink';
  return stat.kind === 'file' ? 'file' : 'not-a-file';
}

/** A directory the store writes into: there as a plain directory, or not there yet. */
async function plainDirectory(files: Files, path: string): Promise<boolean> {
  let stat;
  try {
    stat = await files.stat(path);
  } catch {
    return true;
  }
  return stat.isLink !== true && stat.kind === 'dir';
}

/** What the host said when a write failed: its error code, or the first line of its message without paths. */
export function codeOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = /failed: (E[A-Z0-9]+)\s*$/.exec(message)?.[1] ?? /^(E[A-Z0-9]{2,})\b/.exec(message)?.[1];
  if (code !== undefined) return code;
  return (message.split('\n')[0] ?? '').replace(/(?:[A-Za-z]:)?[\\/][^\s'")]*/g, '<path>').slice(0, 120) || 'unknown';
}

const failed = (error: unknown): NotMoved => ({ reason: 'write-failed', code: codeOf(error) });

/**
 * Puts `text` at `path`. With a mover, it is written beside it under `tmp/`,
 * read back, and moved into place, so that what stands at `path` is always
 * whole: the host's write cuts a file short when it fails (ADR 0008). Without
 * one, it is written in place.
 */
async function put(files: Files, path: string, text: string, tmp: string): Promise<NotMoved | null> {
  const mover = files.move !== undefined && (await files.move.available()) ? files.move : null;
  if (mover === null) {
    try {
      await files.write(path, text);
      return null;
    } catch (error) {
      return failed(error);
    }
  }
  const name = path.slice(path.lastIndexOf('/') + 1);
  const part = `${tmp}/${name}.${crypto.randomUUID()}.part`;
  try {
    await files.write(part, text);
    if ((await files.read(part)) !== text) {
      await mover.remove(part);
      return { reason: 'differs' };
    }
  } catch (error) {
    await mover.remove(part);
    return failed(error);
  }
  if (await mover.rename(part, path)) return null;
  // A move makes no directory, and the host's write only made the one the part is in: make it, and move once more.
  await mover.makeDir(path.slice(0, path.lastIndexOf('/')));
  if (await mover.rename(part, path)) return null;
  await mover.remove(part);
  return { reason: 'write-failed', code: 'the move into place failed' };
}

/**
 * Writes `text` at `path` unless the same text is already there, then reads it
 * back. The host's write follows symbolic links, so a link is refused before
 * anything is written. A file there that `repair` says is broken is written
 * over: a blob is named by the hash of its text, so other text under that name
 * is what a write that failed partway left; an entry that is not JSON is the
 * same.
 */
async function writeOnce(files: Files, path: string, text: string, tmp: string, repair: (there: string) => boolean): Promise<NotMoved | null> {
  const found = await look(files, path);
  if (found === 'symlink') return { reason: 'symlink' };
  if (found === 'not-a-file') return { reason: 'not-a-file' };
  if (found === 'missing') {
    const notPut = await put(files, path, text, tmp);
    if (notPut) return notPut;
  }
  let back;
  try {
    back = await files.read(path);
  } catch (error) {
    return failed(error);
  }
  if (back === text) return null;
  if (found === 'missing' || !repair(back)) return { reason: 'differs' };
  // Looked at again: what is written over is a plain file, or nothing, not a link put there meanwhile.
  const again = await look(files, path);
  if (again === 'symlink' || again === 'not-a-file') return { reason: again };
  const notPut = await put(files, path, text, tmp);
  if (notPut) return notPut;
  try {
    return (await files.read(path)) === text ? null : { reason: 'differs' };
  } catch (error) {
    return failed(error);
  }
}

const notJson = (text: string): boolean => {
  try {
    JSON.parse(text);
    return false;
  } catch {
    return true;
  }
};

/**
 * Stores one tool result and returns the ticket that replaces it, or why the
 * result has to stay where it is. The result is replaced only after the stored
 * text has been read back and found equal.
 */
export async function moveOut(files: Files, dir: string, tool: string, text: string): Promise<Moved | NotMoved> {
  if (!TOOL_NAME.test(tool)) return { reason: 'tool-name' };
  const bytes = bytesOf(text);
  if (bytes > MAX_BYTES) return { reason: 'too-large' };
  for (const path of [dir, blobsDir(dir), indexDir(dir), tmpDir(dir)]) {
    if (!(await plainDirectory(files, path))) return { reason: 'symlink' };
  }
  const id = await idOf(text);
  const tmp = tmpDir(dir);
  const blob = await writeOnce(files, blobPath(dir, id), text, tmp, () => true);
  if (blob) return blob;
  const entry = await writeOnce(files, entryPath(dir, id), JSON.stringify({ bytes, tool }), tmp, notJson);
  // An entry written for another tool that returned the same text differs, and that is fine.
  if (entry && entry.reason !== 'differs') return entry;
  return { tool, bytes, id, text: ticketText({ tool, bytes, id }) };
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

const dirsOf = (dirs: string | readonly string[]): readonly string[] => (typeof dirs === 'string' ? [dirs] : dirs);

/** Whether anything is stored under `id` in any of `dirs`: its entry is there. Says nothing of the text. */
export async function holds(files: Files, dirs: string | readonly string[], id: string): Promise<boolean> {
  if (!ID.test(id)) return false;
  for (const dir of dirsOf(dirs)) {
    if ((await look(files, entryPath(dir, id))) === 'file') return true;
  }
  return false;
}

/** What the entry under `id` says was stored, in the first of `dirs` that holds one: null where none does or it cannot be read. */
export async function storedAs(files: Files, dirs: readonly string[], id: string): Promise<string | null> {
  for (const dir of dirs) {
    if ((await look(files, entryPath(dir, id))) !== 'file') continue;
    try {
      const entry: unknown = JSON.parse(await files.read(entryPath(dir, id)));
      const tool = typeof entry === 'object' && entry !== null ? (entry as { tool?: unknown }).tool : undefined;
      return typeof tool === 'string' ? tool : null;
    } catch {
      return null;
    }
  }
  return null;
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
      return typeof entry === 'object' && entry !== null && (entry as { tool?: unknown }).tool === PART;
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

/** What is stored under an id. For a result that held images, `text` is its text without their bytes, and `parts` is all of it in order. */
export type Recalled = { text: string; parts?: MediaPart[] } | { error: string };

/** The text behind an id, from the first of `dirs` that holds it, checked against the id before it is handed over. */
export async function recall(files: Files, dirs: string | readonly string[], id: unknown): Promise<Recalled> {
  if (typeof id !== 'string' || !ID.test(id)) {
    return { error: 'That id is not 64 hexadecimal characters. Copy it from the ticket in the conversation.' };
  }
  for (const dir of dirsOf(dirs)) {
    if ((await look(files, entryPath(dir, id))) !== 'file' || (await look(files, blobPath(dir, id))) !== 'file') continue;
    let text;
    try {
      text = await files.read(blobPath(dir, id));
    } catch {
      return { error: 'The stored result could not be read.' };
    }
    if ((await idOf(text)) !== id) return { error: 'The stored result has changed on disk and is not returned.' };
    // Told by how the stored text begins, never by its entry: the bytes of an image
    // are not handed on as text to anything that reads through here.
    const media = decodeMedia(text);
    return media === null ? { text } : { text: textOf(media), parts: media };
  }
  return { error: 'Nothing is stored under that id on this machine.' };
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
/** How many characters of an id, from its first, tell which one an agent meant. */
export const ID_HEAD = 16;

/** True when `given` begins with 16 hexadecimal characters: only then is the conversation read for the id that was meant. */
function mayBeMeant(given: unknown): given is string {
  return typeof given === 'string' && /^[0-9a-f]{16}/.test(given);
}

/**
 * The id an agent meant by one that `recall` refused: the one id written in
 * the conversation that begins with the first 16 characters of what it gave.
 * Null when none does, or more than one. An agent copying 64 characters gets
 * them wrong now and then: it gives the first half, drops a character further
 * on, or writes one that is no digit (#54).
 *
 * Read from the user messages, what tools returned and the tickets this plugin
 * put in calls, not from what the agent said or wrote in its calls: an id it
 * gave wrong before would stand
 * beside the one it was copied from. What the agent wrote can still reach
 * those, as Claude Code's summary or as a kept part `recall` returned; an id
 * copied wrong there in full makes two that begin alike, and it is refused.
 */
export function idMeant(given: unknown, messages: readonly Message[]): string | null {
  if (!mayBeMeant(given)) return null;
  const head = given.slice(0, ID_HEAD);
  let meant: string | null = null;
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
    for (const text of texts) {
      for (const [id] of text.matchAll(WRITTEN_ID)) {
        if (!id.startsWith(head) || id === meant) continue;
        if (meant !== null) return null;
        meant = id;
      }
    }
  }
  return meant;
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
  return 'error' in again ? found : again;
}
