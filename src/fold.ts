// Old tool calls folded into a list (ADR 0022).
//
// Most of a working conversation is small calls: commands and their short output, each too short to be worth a
// ticket of its own. What the person and Claude said stays as it was said; a run of old calls, with what they
// returned, is kept whole as a part (ADR 0007's form, with no summary) and one message listing them stands in its
// place: what was called, on what, and how much came back. `recall` gives the part back.

import { head } from './ask.ts';
import { fitForALine, foldedReadLine, foldedWriteLine, unnumbered } from './changed.ts';
import { ticketIdsInText } from './guard.ts';
import { PART_BYTES, messageText, wholeCharacters } from './keep.ts';
import { HOST_TEXT, fileOf } from './select.ts';
import { PART, PLUGIN, bytesOf, moveOut, partTicketText, type NotMoved } from './store.ts';
import type { Files, Message, ToolUse } from './types.ts';

/**
 * The tools whose calls may be folded: named, so that a tool of another's, one that hands back what a person
 * answered (`AskUserQuestion`, `ExitPlanMode`) and one whose input Claude Code reads back (`TodoWrite`) stay.
 */
export const FOLDABLE: ReadonlySet<string> = new Set(['Bash', 'Read', 'Grep', 'Glob', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch']);

/** The longest a call's line names what it was called on. */
const TARGET_CHARS = 80;

/** One run of calls that can be folded: where it starts and ends in the conversation, and its messages. */
export type Run = { first: number; last: number; messages: Message[] };

// A text that holds a ticket stays where it is: the ticket goes on naming what it stands for, to `find`, to the
// clean-up and, for a `Read`, to what is set against the file after a summary (ADR 0014).
const small = (text: string, minChars: number): boolean => text.length < minChars && ticketIdsInText(text).size === 0;

/** Every string of an input, however deep: what decides whether the input is short. */
function strings(value: unknown, into: string[] = [], depth = 0): string[] {
  if (typeof value === 'string') into.push(value);
  else if (typeof value === 'object' && value !== null && depth < 8) for (const inner of Array.isArray(value) ? value : Object.values(value)) strings(inner, into, depth + 1);
  return into;
}

/**
 * Whether the assistant message at `at` folds with the message of its results after it: every call is of a tool
 * named, the results answer exactly those calls and none failed, every input value and result is short and holds
 * no ticket, and what a call holds of its result is that result. A message is folded whole or not at all, so that
 * a call is never left without its result.
 */
function foldable(messages: readonly Message[], at: number, minChars: number): boolean {
  const call = messages[at];
  const answer = messages[at + 1];
  if (call?.role !== 'assistant' || call.toolUses.length === 0 || answer?.role !== 'user') return false;
  const results = answer.toolResults ?? [];
  if (answer.text.replace(HOST_TEXT, '').trim() !== '' || results.length !== call.toolUses.length) return false;
  const ids = new Set(call.toolUses.map((use) => use.tool_use_id));
  if (!results.every((result) => ids.has(result.tool_use_id) && !result.isError && small(result.text, minChars))) return false;
  const texts = new Map(results.map((result) => [result.tool_use_id, result.text]));
  return call.toolUses.every(
    (use) =>
      FOLDABLE.has(use.tool) &&
      use.isError !== true &&
      // A call that holds another text than its result stays, on both sides, as a result does (src/select.ts).
      (use.text === undefined || use.text === texts.get(use.tool_use_id)) &&
      strings(use.input).every((value) => small(value, minChars)),
  );
}

/**
 * The runs of old calls that can be folded, oldest first. The first message stays, and so does every message from
 * where the newest `keepChars` of the conversation begin, the newest whatever its size. A run ends at what a person
 * said, at a call that cannot be folded, and before it would hold more than a part may; calls and results too
 * large for a part on their own stay.
 */
export function runsIn(messages: readonly Message[], keepChars: number, minChars: number): Run[] {
  // Where the newest keepChars begin, counted over everything the messages hold. The newest message stays
  // whatever its size, as the newest result does (ADR 0002).
  let from = messages.length - 1;
  let newest = from >= 0 ? messageText(messages[from] as Message).length : 0;
  for (let at = from - 1; at >= 0; at -= 1) {
    newest += messageText(messages[at] as Message).length;
    if (newest > keepChars) break;
    from = at;
  }
  const runs: Run[] = [];
  let run: Run | null = null;
  let bytes = 0;
  const close = () => {
    if (run !== null) runs.push(run);
    run = null;
    bytes = 0;
  };
  for (let at = 1; at < from - 1; at += 1) {
    const message = messages[at] as Message;
    if (!foldable(messages, at, minChars)) {
      // Results that answer calls of a message that was folded are part of it; anything else ends a run.
      close();
      continue;
    }
    // What Claude said with the calls stays, and the list comes after it: a run cannot go on through it.
    if (message.text !== '') close();
    const pair = [{ role: 'assistant' as const, text: '', toolUses: message.toolUses }, messages[at + 1] as Message];
    const size = pair.reduce((sum, one) => sum + bytesOf(`${messageText(one)}\n`), 0);
    if (size > PART_BYTES) {
      close();
      continue;
    }
    if (run !== null && bytes + size > PART_BYTES) close();
    run ??= { first: at, last: at + 1, messages: [] };
    (run as Run).messages.push(...pair);
    (run as Run).last = at + 1;
    bytes += size;
    at += 1;
  }
  close();
  return runs;
}

/** What a call was called on, as its line names it: nothing of what it returned, and no ticket of this store's. */
function targetOf(use: ToolUse): string {
  const input = use.input;
  const named = use.tool === 'Bash' ? (input['description'] ?? input['command']) : (fileOf(input) ?? input['pattern'] ?? input['url'] ?? input['query'] ?? '');
  // It stands in a message of the person's: nothing that would break its line or turn the text, and no half of a pair.
  const text = fitForALine(String(named ?? '')).replace(/\s+/g, ' ').trim();
  if (ticketIdsInText(text).size > 0) return '';
  return text.length > TARGET_CHARS ? `${head(text, TARGET_CHARS - 1)}…` : text;
}

const linesOf = (text: string): number => (text === '' ? 0 : text.split('\n').length);

/** What a folded run left in the conversation, and the part that holds it. */
export type Folded = { list: Message; part: { id: string; bytes: number }; calls: number; notStored: NotMoved[] };

/** A run whose list would take as much room as the calls it lists, or more: left where it stands, nothing written. */
export type NotWorth = { notWorth: true };

/** Whether a call read a whole file and got its numbered lines: such a reading is kept apart (ADR 0014). */
const wholeRead = (use: ToolUse, returned: string): boolean =>
  use.tool === 'Read' && fileOf(use.input) !== null && !('offset' in use.input) && !('limit' in use.input) && !('pages' in use.input) && unnumbered(returned) !== null;

/** The list of a run: the part it is kept in, and a line a call, a whole-file reading's line naming the id it came under. */
function listFor(run: Run, part: { id: string; bytes: number }, readings: ReadonlyMap<string, string>): Message {
  const results = new Map(run.messages.flatMap((message) => (message.toolResults ?? []).map((result) => [result.tool_use_id, result.text] as const)));
  const lines = run.messages.flatMap((message) => message.toolUses).map((use) => {
    const returned = results.get(use.tool_use_id) ?? '';
    const path = fileOf(use.input);
    const reading = readings.get(use.tool_use_id);
    const line = reading !== undefined && path !== null ? foldedReadLine(path, linesOf(returned), reading) : path !== null ? foldedWriteLine(use.tool, path) : null;
    return line ?? `${use.tool}: ${targetOf(use)} -> ${linesOf(returned)} lines`;
  });
  const calls = lines.length;
  const head = `[${PLUGIN}] ${calls} tool ${calls === 1 ? 'call was' : 'calls were'} moved out here, with what ${calls === 1 ? 'it' : 'they'} returned; recall the part for all of it.`;
  const ticket = partTicketText({ part: 1, parts: 1, first: run.first + 1, last: run.last + 1, bytes: part.bytes, id: part.id }, false);
  return { role: 'user', text: [head, ticket, ...lines].join('\n'), toolUses: [] };
}

const NO_ID = '0'.repeat(64);

/**
 * Keeps a run as one part and returns the message that lists it, or why it stays as it was. A whole-file `Read`
 * has what it returned stored apart and named on its line, so that the file is set against it after a summary
 * (ADR 0014); a call that wrote a file is named as one, so that the file is not taken for changed by another.
 *
 * The list is drawn up first with ids of the same length, which makes it as long as it will be: where `worth` says
 * it is not, nothing is written. Small calls cost less than a list of them, and a fold that grows the conversation
 * is no compaction (measured: six `cat`s of a line each came to more once folded).
 */
export async function fold(files: Files, dir: string, run: Run, worth: (list: Message) => boolean = () => true): Promise<Folded | NotMoved | NotWorth> {
  // A half of a pair alone is not text a file can hold: it is kept as U+FFFD, as a part's is (#70).
  const text = wholeCharacters(`${run.messages.map(messageText).join('\n')}\n`);
  const results = new Map(run.messages.flatMap((message) => (message.toolResults ?? []).map((result) => [result.tool_use_id, result.text] as const)));
  const reads = run.messages.flatMap((message) => message.toolUses).filter((use) => wholeRead(use, results.get(use.tool_use_id) ?? ''));
  const draft = listFor(run, { id: NO_ID, bytes: bytesOf(text) }, new Map(reads.map((use) => [use.tool_use_id, NO_ID])));
  if (!worth(draft)) return { notWorth: true };
  const kept = await moveOut(files, dir, PART, text);
  if ('reason' in kept) return kept;
  const readings = new Map<string, string>();
  const notStored: NotMoved[] = [];
  for (const use of reads) {
    // A reading that cannot be stored is listed as any call is, and said: it is in the part all the same.
    const stored = await moveOut(files, dir, 'Read', results.get(use.tool_use_id) ?? '');
    if ('reason' in stored) notStored.push(stored);
    else readings.set(use.tool_use_id, stored.id);
  }
  return { list: listFor(run, { id: kept.id, bytes: kept.bytes }, readings), part: { id: kept.id, bytes: kept.bytes }, calls: run.messages.flatMap((message) => message.toolUses).length, notStored };
}
