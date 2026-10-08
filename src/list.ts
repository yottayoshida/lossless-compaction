// What `/lossless-list` and `/lossless-show <id>` say (#138, ADR 0044): what left this conversation, a line each, and
// the file one of them is kept in, for a person to read with a tool of their own. The lines are said for the person
// alone (`$.ui.log`, which Claude Code does not send to the model); what the command answers, which the model reads
// with the next request, is one line that names no result. The tickets are those `find` gathers, so that every id the
// list shows is one `/lossless-show` takes.

import { decodeMedia, textOf } from './encoded.ts';
import { everyTicket, firstLineOf, type Stored } from './find.ts';
import { blobPath } from './layout.ts';
import { PART, bytesOf, inputTicketsOf, linesOf, readBodyTicket, readInputTicket, readPartTicket, readTicket, storedText, type TextWhy } from './store.ts';
import type { Files, Message } from './types.ts';

/** How many of the newest are listed when neither `all` nor a word is asked for. */
export const LISTED = 50;

/** How much of a line Claude Code's own marks take: the dot it draws and the plugin's name it puts in front. */
const DRAWN = 24;

/** Anything that would move the cursor, colour the screen or hide a character, each made a space, and runs of spaces one. */
export const plain = (text: string): string =>
  text
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}]/gu, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();

// The characters a terminal draws two cells wide: Hangul, the East Asian scripts and their punctuation, the full-width
// forms, the emoji and the symbols shown as emoji, and the planes of rarer ideographs. Where a block mixes narrow and
// wide characters it is counted wide: a line cut shorter than it might be, never one wider than the screen.
const WIDE =
  /[ᄀ-ᅟ⌚-⏿■-➿⬀-⯿⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;

/** How many cells a line takes on a terminal. */
export const cellsOf = (text: string): number => [...text].reduce((cells, char) => cells + (WIDE.test(char) ? 2 : 1), 0);

/** A line cut to `cells` cells, an ellipsis where it was cut. */
export function cut(text: string, cells: number): string {
  if (cellsOf(text) <= cells) return text;
  let out = '';
  let used = 0;
  for (const char of text) {
    const width = WIDE.test(char) ? 2 : 1;
    if (used + width > cells - 1) break;
    out += char;
    used += width;
  }
  return `${out}…`;
}

/** A size as a person compares sizes at a glance. */
export function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const WHY: Record<TextWhy, string> = {
  'text-missing': 'its file is not there',
  'text-unreadable': 'its file cannot be read',
  'text-changed': 'its file is not what was stored, and recall refuses it',
};

/** What a stored text holds, read once and checked: its text without the bytes of its images, how many images, and where. */
async function readOf(files: Files, dirs: readonly string[], id: string): Promise<{ text: string; images: number; bytes: number; dir: string } | { why: TextWhy }> {
  const got = await storedText(files, dirs, id);
  if (!got.ok) return { why: got.why };
  const parts = decodeMedia(got.text);
  const images = parts === null ? 0 : parts.filter((part) => part.type === 'image').length;
  return { text: parts === null ? got.text : textOf(parts), images, bytes: bytesOf(got.text), dir: got.dir };
}

/**
 * By id, the message of the conversation its ticket stands in: a result's, a call's input value, the middle of a
 * message or a kept part. An id written anywhere else, as in a recall's input or what a recall or find gave back,
 * is no ticket standing there.
 */
function positionsIn(messages: readonly Message[]): Map<string, number> {
  const at = new Map<string, number>();
  const note = (id: string | undefined, index: number) => {
    if (id !== undefined && !at.has(id)) at.set(id, index);
  };
  messages.forEach((message, index) => {
    for (const result of message.toolResults ?? []) note(readTicket(result.text)?.id, index);
    for (const use of message.toolUses) for (const line of inputTicketsOf(use.input)) note(readInputTicket(line)?.id, index);
    for (const line of message.text.split('\n')) note((readBodyTicket(line) ?? readPartTicket(line))?.id, index);
  });
  return at;
}

/**
 * The tickets the conversation names: those read out of kept parts first, in the order they are read, all older
 * than any message the conversation still holds; then the conversation's own by the message each stands in.
 */
async function ticketsOf(files: Files, dirs: readonly string[], messages: readonly Message[]): Promise<Stored[]> {
  const { tickets, middles } = await everyTicket(files, dirs, messages);
  const at = positionsIn(messages);
  const all = [...tickets, ...middles];
  const kept = all.filter((ticket) => !at.has(ticket.id));
  const own = all.filter((ticket) => at.has(ticket.id)).map((ticket, order) => ({ ticket, order, index: at.get(ticket.id) as number }));
  own.sort((a, b) => a.index - b.index || a.order - b.order);
  return [...kept, ...own.map((one) => one.ticket)];
}

type Row = { line: string; said: string; read: boolean };

/** One line of the list: the id's first 12 characters, the size, the lines, the call and the first line, cut to the screen. */
function rowOf(ticket: Stored, read: Awaited<ReturnType<typeof readOf>> | null, columns: number): Row {
  // A call a part names whose input does not read gives its tool alone: its words may be a ticket's.
  const call = plain(ticket.brief ?? (ticket.about.includes('[moved out]') ? ticket.tool : ticket.about));
  let size = sizeOf(ticket.bytes);
  let lines = '';
  let first = '';
  let note = '';
  if (read === null) note = 'not read: the time for this ran out';
  else if ('why' in read) note = WHY[read.why];
  else {
    size = sizeOf(read.bytes);
    const count = linesOf(read.text);
    lines = `${count} ${count === 1 ? 'line' : 'lines'}${read.images > 0 ? `, ${read.images} ${read.images === 1 ? 'image' : 'images'}` : ''}`;
    first = ticket.tool === PART ? '' : plain(firstLineOf(ticket, read.text));
  }
  const after = first !== '' ? first : note;
  const line = `${ticket.id.slice(0, 12)}  ${size.padStart(7)}  ${lines.padEnd(11)}  ${call}${after === '' ? '' : ` — ${after}`}`;
  // A word is looked for in what the result is, not in why it could not be read.
  return { line: cut(line, Math.max(16, columns - DRAWN)), said: `${call} ${first}`.toLowerCase(), read: read !== null };
}

export type Listed = { lines: string[]; text: string };

/**
 * `/lossless-list`: the last LISTED, the newest of the conversation's own at the bottom, or every one (`all`), or
 * those whose call or first line holds a word, in the order `ticketsOf` gives. `more` says whether there is time to
 * read one more stored text; a row not read says so.
 */
export async function listedOf(files: Files, dirs: readonly string[], messages: readonly Message[], asked: string, columns: number, more: () => boolean): Promise<Listed> {
  const tickets = await ticketsOf(files, dirs, messages);
  if (tickets.length === 0) return { lines: [], text: 'nothing has left this conversation yet: a compaction moves results out' };
  const wanted = asked.trim();
  const all = wanted === 'all';
  const word = all ? '' : wanted.toLowerCase();
  const read = word !== '' || all ? tickets : tickets.slice(-LISTED);
  const rows: Row[] = [];
  for (const ticket of read) rows.push(rowOf(ticket, more() ? await readOf(files, dirs, ticket.id) : null, columns));
  const shown = word === '' ? rows : rows.filter((row) => row.said.includes(word));
  const older = tickets.length - read.length;
  const unread = rows.filter((row) => !row.read).length;
  const head =
    (word === ''
      ? `${shown.length} of ${tickets.length} results moved out of this conversation, those inside kept parts first, the newest last${older > 0 ? `; ${older} before them: /lossless-list all` : ''}`
      : `${shown.length} of ${tickets.length} results moved out of this conversation hold "${plain(wanted)}", in the same order`) +
    (unread > 0 ? `; ${unread} not read, as the time for this ran out` : '');
  const text = `${shown.length} ${shown.length === 1 ? 'result' : 'results'} listed for you alone; nothing of them is sent to the model`;
  return { lines: [head, ...shown.map((row) => row.line)], text };
}

/** What a person is told of opening the file: to read it only, and how what is read goes into the conversation. */
export const READ_ONLY =
  'open it to read only: saved, it stops recall giving it back. Typed with !, pasted, handed over with @ or opened by the agent, it goes into the conversation';

/**
 * `/lossless-show <id>`: the file the result is kept in, on a line of its own, what it holds, and how to open it. The
 * id is one the list shows: whole, its first 12 characters, or 8 or more that begin one id alone.
 */
export async function showOf(files: Files, dirs: readonly string[], messages: readonly Message[], given: string): Promise<Listed> {
  const asked = given.trim().toLowerCase();
  if (!/^[0-9a-f]{8,64}$/.test(asked)) return { lines: [], text: 'give an id /lossless-list shows, or 8 or more of its first characters: /lossless-show <id>' };
  const ids = [...new Set((await ticketsOf(files, dirs, messages)).map((ticket) => ticket.id))];
  const matching = ids.filter((id) => id.startsWith(asked));
  if (matching.length === 0) return { lines: [], text: `nothing /lossless-list can show begins ${asked}` };
  if (matching.length > 1) return { lines: [], text: `${matching.length} results begin ${asked}: give more of the id` };
  const id = matching[0] as string;
  const got = await readOf(files, dirs, id);
  if ('why' in got) return { lines: [`${id}: ${WHY[got.why]}`], text: 'the file could not be named, and why is said for you alone; nothing of it is sent to the model' };
  const count = linesOf(got.text);
  const holds = got.images === 0 ? '' : ` · ${got.images} ${got.images === 1 ? 'image' : 'images'}: the file is a line of the plugin's, then JSON with each image's bytes in base64`;
  return {
    lines: [blobPath(got.dir, id), `${id} · ${count} ${count === 1 ? 'line' : 'lines'} · ${got.bytes} bytes${holds}`, READ_ONLY],
    text: 'the file is named for you alone; nothing of it is sent to the model',
  };
}
