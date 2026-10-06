// The files a conversation read whose text on disk is no longer what the
// `Read` returned, named right after a summary (ADR 0014).
//
// After a summary Claude Code shows the files read most recently again, as
// they are on disk then and in the words of a `Read` result. A file that
// changed since the conversation read it is taken for the earlier reading.
// The plugin holds that reading, so it says which files these are and the
// id each reading comes back by.

import { HOST_TEXT, WRITES, fileOf } from './select.ts';
import { ATTACHED_KEPT, PLUGIN, RECALL_TOOL, moveOut, readTicket, recall } from './store.ts';
import type { Files, Message, ToolResult } from './types.ts';

/** How many files are set against their reading at one summary, newest first. */
export const COMPARED = 20;
/** How many of them are named; the rest are counted. */
export const NAMED = 10;
/** A larger file is not read: Claude Code shows none this large again. */
export const MAX_FILE_BYTES = 256 * 1024;
/** A longer path is not named: the line is the plugin's own, in a message of the person's, and holds no more of another's words than a path. */
export const MAX_PATH_CHARS = 512;

// A `Read` result is its file's lines, each after its number and a tab.
const NUMBERED = /^\d+\t/;
const ID = /^[0-9a-f]{64}$/;
// The line that names one file, around its path and its id. Measured: a line
// that does not say the file changed, or gives no id, moved no answer.
const BEFORE_PATH = 'Changed on disk since it was read in the conversation, as of this summary: ';
const BEFORE_ID = `. If it is shown again after the summary, that is the file as it is now; what the Read returned then comes back with ${RECALL_TOOL} id `;

const char = String.fromCharCode;
// A path holding one of these would break its line, could not be read back from it, or would not show as it is:
// the control characters, the line and paragraph separators, and the marks that turn the direction of text.
const UNFIT = new RegExp(`[${char(0)}-${char(0x1f)}${char(0x7f)}-${char(0x9f)}${char(0x2028)}${char(0x2029)}${char(0x202a)}-${char(0x202e)}${char(0x2066)}-${char(0x2069)}]`);

/** `text` with every character a line cannot hold as it shows (see UNFIT) made a space. */
export const fitForALine = (text: string): string => text.replace(new RegExp(UNFIT.source, 'g'), ' ');
// What a file that is not UTF-8 reads as: it cannot be set against what `Read` made of it.
const NOT_TEXT = new RegExp(`[${char(0)}${char(0xfffd)}]`);

// The line a list of folded calls gives a file read whole (src/fold.ts): what the Read returned is stored apart, so
// that the file can still be set against it after a summary, as a reading in the conversation is.
const FOLDED_READ = 'Read: ';
const FOLDED_READ_ID = ` lines; what it returned then comes back with ${RECALL_TOOL} id `;

/** The line of a folded `Read` of a whole file, or null when its path is unfit for a line: that one is listed without its reading. */
export function foldedReadLine(path: string, lines: number, id: string): string | null {
  if (path.length > MAX_PATH_CHARS || UNFIT.test(path)) return null;
  return `${FOLDED_READ}${path} -> ${lines}${FOLDED_READ_ID}${id}`;
}

/** What a line written by `foldedReadLine` names, or null for any other line. */
export function readFoldedReadLine(line: string): { path: string; id: string } | null {
  if (!line.startsWith(FOLDED_READ)) return null;
  const id = line.slice(-64);
  const at = line.lastIndexOf(FOLDED_READ_ID);
  if (!ID.test(id) || at < 0 || at + FOLDED_READ_ID.length !== line.length - 64) return null;
  const upTo = line.slice(FOLDED_READ.length, at);
  const arrow = upTo.lastIndexOf(' -> ');
  if (arrow <= 0 || !/^\d{1,9}$/.test(upTo.slice(arrow + 4))) return null;
  return { path: upTo.slice(0, arrow), id };
}

/** The line of a folded call that wrote a file, or null when its path is unfit for a line. */
export function foldedWriteLine(tool: string, path: string): string | null {
  if (!WRITES.has(tool) || path.length > MAX_PATH_CHARS || UNFIT.test(path)) return null;
  return `${tool}: ${path} -> written`;
}

/** The file a line written by `foldedWriteLine` names, or null for any other line. */
export function readFoldedWriteLine(line: string): string | null {
  const colon = line.indexOf(': ');
  if (colon < 0 || !WRITES.has(line.slice(0, colon)) || !line.endsWith(' -> written')) return null;
  const path = line.slice(colon + 2, -' -> written'.length);
  return path === '' ? null : path;
}

export function changedLine(path: string, id: string): string {
  return `${BEFORE_PATH}${path}${BEFORE_ID}${id}.`;
}

/** What a line written by `changedLine` names, or null for any other line. */
export function readChangedLine(line: string): { path: string; id: string } | null {
  if (!line.startsWith(BEFORE_PATH) || !line.endsWith('.')) return null;
  const id = line.slice(-65, -1);
  const upToId = line.slice(BEFORE_PATH.length, -65);
  if (!ID.test(id) || !upToId.endsWith(BEFORE_ID) || upToId.length === BEFORE_ID.length) return null;
  return { path: upToId.slice(0, -BEFORE_ID.length), id };
}

/** The lines of a `Read` result without their numbers, or null when it is not numbered lines throughout. */
export function unnumbered(result: string): string | null {
  const lines = result.split('\n');
  if (!lines.every((line) => NUMBERED.test(line))) return null;
  return lines.map((line) => line.slice(line.indexOf('\t') + 1)).join('\n');
}

// `Read` drops a carriage return at the end of a line, and a byte order mark
// at the head of the file (measured on Claude Code 2.1.287): left in on one
// side, a file that did not change would be named as changed.
const BYTE_ORDER_MARK = char(0xfeff);
const bare = (text: string): string =>
  (text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text)
    .split('\n')
    .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
    .join('\n');

/** Whether a file's text is what a `Read` of it returned, its numbers taken off. */
export function sameText(file: string, read: string): boolean {
  return bare(file) === bare(read);
}

/** One reading of a file: the result's text while it is in the conversation, else the id it was moved out under. */
export type Reading = { path: string } & ({ text: string } | { id: string });

/**
 * The last reading of each file the conversation read whole, newest first.
 *
 * A `Read` counts when it has no `offset`, `limit` or `pages`, did not fail,
 * and returned numbered lines or a ticket: a second `Read` of a file Claude
 * Code answers with "unchanged since last read" is no reading. A file the
 * conversation wrote to afterwards is left out, the agent having changed it
 * itself; a write that failed changed nothing and leaves the reading. A line
 * this plugin wrote after an earlier summary is a reading again, read from
 * the plugin's own message (what the host puts into a turn taken off first,
 * as `goalOf` takes it off) and from no other: what anyone else wrote in
 * that form names no file the plugin will look at.
 */
export function readingsIn(messages: readonly Message[]): Reading[] {
  const results = new Map<string, ToolResult>();
  for (const message of messages) for (const result of message.toolResults ?? []) results.set(result.tool_use_id, result);

  const latest = new Map<string, Reading>();
  const put = (reading: Reading): void => {
    latest.delete(reading.path);
    latest.set(reading.path, reading);
  };
  for (const message of messages) {
    if (message.role === 'user' && (message.toolResults?.length ?? 0) === 0) {
      const said = message.text.replace(HOST_TEXT, '').trim();
      if (said.startsWith(`[${PLUGIN}] `)) {
        for (const line of said.split('\n')) {
          const named = readChangedLine(line) ?? readFoldedReadLine(line);
          if (named !== null) put(named);
          // A folded call that wrote a file: the agent changed it itself, as a write in the conversation says.
          const written = readFoldedWriteLine(line);
          if (written !== null) latest.delete(written);
        }
      }
    }
    for (const use of message.toolUses) {
      const path = fileOf(use.input);
      if (path === null) continue;
      const result = results.get(use.tool_use_id);
      if (WRITES.has(use.tool)) {
        if (result?.isError !== true) latest.delete(path);
        continue;
      }
      if (use.tool !== 'Read' || 'offset' in use.input || 'limit' in use.input || 'pages' in use.input) continue;
      if (result === undefined || result.isError) continue;
      const ticket = readTicket(result.text);
      if (ticket !== null) put({ path, id: ticket.id });
      else if (unnumbered(result.text) !== null) put({ path, text: result.text });
    }
  }
  return [...latest.values()].reverse();
}

/**
 * The lines that name the files read in `messages` whose text on disk is no
 * longer what the last reading returned. `dir` is where a reading not yet
 * stored is written, `read` where stored ones are read from.
 *
 * A file that is missing, a link, not a regular file, over MAX_FILE_BYTES,
 * not text or unreadable says nothing, as does a reading that cannot be had
 * or is not numbered lines, and a path too long or unfit for a line: nothing
 * is named that was not set against its reading. Whatever goes wrong, what
 * was named by then is returned and nothing is thrown.
 */
export async function changedLines(files: Files, dir: string, read: readonly string[], messages: readonly Message[]): Promise<string[]> {
  const lines: string[] = [];
  let more = 0;
  try {
    for (const reading of readingsIn(messages).slice(0, COMPARED)) {
      if (reading.path.length > MAX_PATH_CHARS || UNFIT.test(reading.path)) continue;
      try {
        let text: string;
        if ('id' in reading) {
          const stored = await recall(files, read, reading.id);
          if ('error' in stored) continue;
          text = stored.text;
        } else {
          text = reading.text;
        }
        const then = unnumbered(text);
        if (then === null) continue;
        const stat = await files.stat(reading.path);
        if (stat.kind !== 'file' || stat.isLink === true || stat.size > MAX_FILE_BYTES) continue;
        const now = await files.read(reading.path);
        if (NOT_TEXT.test(now) || sameText(now, then)) continue;
        if (lines.length >= NAMED) {
          more += 1;
          continue;
        }
        let id: string;
        if ('id' in reading) {
          id = reading.id;
        } else {
          // Stored whatever its size, so that the id on the line has something behind it.
          const moved = await moveOut(files, dir, 'Read', text);
          if ('reason' in moved) continue;
          id = moved.id;
        }
        lines.push(changedLine(reading.path, id));
      } catch {
        // A file that cannot be looked at is not named.
      }
    }
  } catch {
    // A conversation that cannot be read for its readings names nothing more.
  }
  if (more > 0) lines.push(`${more} more of the files read in the conversation ${more === 1 ? 'has' : 'have'} changed on disk as well.`);
  return lines;
}

// How Claude Code frames a file it shows the model, before the file's text: the call that would have read it.
const SHOWN = 'Called the Read tool with the following input: ';
// What the host put into a turn that nobody typed. A command's own tags are not among them: its arguments are what the person typed after it.
const NOT_TYPED = /<(system-reminder|task-notification|local-command-[a-z]+)>[\s\S]*?<\/\1>/g;
// What follows an `@`: in double quotes, or up to the next space, a space after a backslash being part of it.
const MENTION = /@(?:"([^"]+)"|((?:\\ |\S)+))/g;

/**
 * True when `typed` hands a file of `path`'s name over with an `@`. How Claude
 * Code reads an `@` is its own, so this errs on the side of showing: the name
 * anywhere in what follows the `@` counts. `@log.txt`, `@src/log.txt#L3-9`,
 * `@../x/log.txt` and `@log.txtを見て` all hand `log.txt` over, and so does
 * `@catalog.txt`.
 */
function mentions(typed: string, path: string): boolean {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  if (name === '') return false;
  for (const match of typed.matchAll(MENTION)) {
    if ((match[1] ?? match[2] ?? '').replaceAll('\\ ', ' ').includes(name)) return true;
  }
  return false;
}

/** What stands in place of a changed file as Claude Code shows it again: that it changed, the id its reading comes back by, and how it is read as it is now. */
export function shownAgainLine(path: string, id: string): string {
  return (
    `[${PLUGIN}] Not shown again here: ${path} changed on disk since the conversation read it. ` +
    `What the Read returned then comes back with ${RECALL_TOOL} id ${id}; the file as it is now, by reading it again.`
  );
}

/**
 * What stands in place of a file Claude Code shows the model, or null to
 * leave it as shown. After a summary Claude Code shows the files read last
 * again, as they are on disk then and in the words of a `Read` result, and an
 * agent takes a file that changed for what it read (ADR 0014). So where the
 * plugin's own message after the last summary names the file as changed, a
 * line with the id of its reading stands in its place.
 *
 * Not once a file of that name has been handed over with an `@`, in anything
 * typed that stands behind the plugin's message, a command's arguments
 * included: a file shown again and a file handed over reach the plugin
 * alike, and the one handed over is shown as it was asked for. What stands
 * behind that message is what was typed since the summary and the last
 * messages Claude Code kept from before it, so whether the summary was just
 * now is not told. The answer rests on the conversation alone: asked again
 * of the same file, as when a session is resumed, it is the same while the
 * conversation is, and a file handed over since is then shown as it is.
 */
export function shownAgainNote(messages: readonly Message[], shown: string): string | null {
  const first = shown.split('\n', 1)[0] ?? '';
  if (!first.startsWith(SHOWN)) return null;
  let path: unknown;
  try {
    path = (JSON.parse(first.slice(SHOWN.length)) as { file_path?: unknown } | null)?.file_path;
  } catch {
    return null;
  }
  if (typeof path !== 'string') return null;
  let handedOver = false;
  for (let at = messages.length - 1; at >= 0; at--) {
    const message = messages[at]!;
    // What the agent said, and a message that holds results, is neither the plugin's message nor typed by the person.
    if (message.role !== 'user' || (message.toolResults?.length ?? 0) > 0) continue;
    const said = message.text.replace(HOST_TEXT, '').trim();
    // The message naming what Claude Code attached as it sent the messages stands at the end of what a compaction
    // handed back, after the one this looks for, and names no file read (#105).
    if (said.startsWith(ATTACHED_KEPT)) continue;
    if (said.startsWith(`[${PLUGIN}] `)) {
      // The plugin's message after the last summary: what it names, and no older one.
      if (handedOver) return null;
      const reading = said
        .split('\n')
        .map(readChangedLine)
        .find((one) => one !== null && one.path === path);
      return reading ? shownAgainLine(reading.path, reading.id) : null;
    }
    handedOver ||= mentions(message.text.replace(NOT_TYPED, ''), path);
  }
  return null;
}
