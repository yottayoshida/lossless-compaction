// When a conversation is too full to go on with and moving results out was not
// enough, or there was none to move, its oldest messages are kept in parts and
// one message listing them stands where they stood (ADR 0019). Nothing is
// summarized: what was cut comes back, as it was said, with `recall`.

import { MAX_PATH_CHARS, NAMED, changedLines, readChangedLine } from './changed.ts';
import { mayStay, reportLine, tokensOf, type Count, type Report } from './compact.ts';
import { PART_BYTES, keepConversation, messageText } from './keep.ts';
import { HOST_SHOWS, HOST_TEXT } from './select.ts';
import { PLUGIN, bytesOf, partTicketText, type NotMoved, type StoreDirs } from './store.ts';
import type { Files, Message } from './types.ts';

/** What a cut is decided from. */
export type Asked = {
  /** The conversation as the compaction rebuilt it: results moved out, no handle on any message. */
  messages: readonly Message[];
  /** What is in use once it is handed back, as the compaction estimated it. */
  tokens: number;
  /** How sizes are counted, see `tokensOf`; absent when the breakdown could not be relied on. */
  count: Count | undefined;
  /** The size at which Claude Code compacts on its own. */
  window: number;
  maxAfterPercent: number;
  /**
   * The size a cut goes down to once one is made, in tokens: what moving results
   * out aimed at (`Outcome.target`). Never above what may stay.
   */
  cutTo: number;
  /** The newest messages stay while they add up to at least this many tokens, counted as `tokensOf` counts. */
  keepTokens: number;
  /** What `/compact` was given to summarize by. */
  instructions: string | undefined;
  /**
   * How many entries Claude Code handed over: the larger of the messages the hook was given and the conversation as it
   * is sent, counted before anything was rebuilt. A conversation of CUT_AT or more is cut for its length (ADR 0034).
   */
  entries?: number | undefined;
  /**
   * False where the compaction comes here for the conversation's length alone: moving results out was enough, or a
   * `/compact` by hand would be left undone. No cut by size is then looked for.
   */
  bySize?: boolean;
};

/**
 * Claude Code hands a plugin the newest HOST_SHOWS entries of a conversation, and one that reaches them is left to its
 * summary with what is older not kept (src/select.ts). Under the plugin no summary starts the count over, so it grows
 * from one compaction to the next by about what one window holds, since what is in use goes down and the messages stay:
 * one that holds CUT_AT entries is cut down to CUT_TO messages, whatever its size, so that what is not cut and what a
 * window adds to it stay short of HOST_SHOWS (ADR 0034). Measured on one machine, a conversation gathered up to 2,045
 * entries from an empty start to its next compaction.
 */
export const CUT_AT = (HOST_SHOWS * 3) / 8;
export const CUT_TO = HOST_SHOWS / 4;

/** Whether a conversation is cut for its length: CUT_AT entries handed over or more, and more than CUT_TO messages rebuilt. */
export const isLong = (entries: number | undefined, messages: number): boolean => (entries ?? 0) >= CUT_AT && messages > CUT_TO;

export type Decision =
  /**
   * Hand the conversation back with the messages from `after` up to `at` kept in parts: `after` is
   * 1 where the first message stays in front of them, else 0. With `at` 0 nothing is cut, and it is
   * handed back as it was rebuilt. `over` when it is still over what may stay and a summary would
   * not change that. `length` when it is cut as far as it is for its length, not its size.
   */
  | { hand: 'back'; after: 0 | 1; at: number; tokensAfter: number; over: boolean; length?: true }
  /** Leave it to the built-in summary, the conversation kept first, as before. */
  | { hand: 'summary' };

// The longest a part's line can be, digits and all, which weigh double: what the list comes to is counted
// before anything is written, from how many lines it can have.
const WIDEST_LINE = partTicketText({ part: 999_999, parts: 999_999, first: 999_999, last: 999_999, bytes: 999_999_999, id: '9'.repeat(64) }, false);
// The most the lines that name changed files can come to: NAMED of them and one that counts the rest, each a path and the words around it.
const WIDEST_NAMED = 'p'.repeat((NAMED + 1) * (MAX_PATH_CHARS + 300));

const said = (message: Message): boolean => message.role === 'user' && (message.toolResults?.length ?? 0) === 0;
const answers = (message: Message): boolean => message.role === 'user' && (message.toolResults?.length ?? 0) > 0;

/** True for a message of the plugin's that names files changed on disk: the one put after a summary (ADR 0014), or a list that carried them on. */
function namesChanged(message: Message): boolean {
  if (!said(message)) return false;
  const text = message.text.replace(HOST_TEXT, '').trim();
  return text.startsWith(`[${PLUGIN}] `) && text.split('\n').some((line) => readChangedLine(line) !== null);
}

/**
 * Whether a conversation that is too full, or has nothing to move out, is cut
 * instead of summarized, and where. Decided before anything is written, so
 * that a conversation left to the summary is kept once, as before.
 *
 * The first message stays, as it does when results are moved out: it is what
 * was asked for, and the rules given with it. Where the conversation does not
 * fit with it, it is cut with the rest.
 *
 * A cut ends where the person starts to speak or right after the results of a
 * call were returned, with no call still waiting for its result: a call and
 * its result stay on one side. The newest messages stay while they add up to
 * `keepTokens`. Of the places left, the oldest that brings the conversation
 * down to `cutTo` is taken, else the newest of them. Where that still leaves
 * the conversation over what may stay and more of it could go, less than
 * `keepTokens` is left: the oldest place past it that brings the
 * conversation under the line. Fewer of the newest messages as they were
 * said is better than a summary of all of them.
 *
 * Handed back: under what may stay; or still over it where all of it fits the
 * window and the conversation left is smaller than what is over, since a
 * summary takes away no more than that (as `compact()` decides after moving
 * out). Left to the summary: `/compact` with instructions, which asks for
 * one; a conversation with no place to cut; and one that is over the line
 * behind the last place a cut could end, which a summary can still make
 * smaller.
 */
export function decide(asked: Asked): Decision {
  if ((asked.instructions ?? '').trim() !== '') return { hand: 'summary' };
  const { messages, count } = asked;
  const line = mayStay(asked.window, asked.maxAfterPercent);
  const tooFull = asked.tokens > line;
  const long = isLong(asked.entries, messages.length);
  // Rebuilt, it is under the line with nothing cut: the thinking is gone, and what Claude Code added. That can be
  // told only where sizes are counted from what stays. Where they are not, `tokens` is what was in use before, or
  // made up from characters, and the compaction was still asked for: it is cut down to `cutTo` all the same.
  const fits = !tooFull && count !== undefined;
  const asIs: Decision = { hand: 'back', after: 0, at: 0, tokensAfter: Math.round(asked.tokens), over: false };
  if (fits && !long) return asIs;
  const sizeAsked = asked.bySize !== false && !fits;

  const sizes = messages.map((message) => tokensOf([message], count));
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const lineTokens = tokensOf([{ role: 'user', text: WIDEST_LINE, toolUses: [] }], count);
  const namedTokens = tokensOf([{ role: 'user', text: WIDEST_NAMED, toolUses: [] }], count);
  const answered = new Set(messages.flatMap((message) => (message.toolResults ?? []).map((result) => result.tool_use_id)));
  const goal = Math.min(line, asked.cutTo);

  /**
   * Each message after the first `after`, as a place a cut may end in front of: what the messages cut there come to,
   * whether a cut may fall there (where the person starts to speak, or right after results came back, with no call
   * still waiting for its result), and what the list standing for them comes to.
   */
  function* placesFrom(after: 0 | 1): Generator<{ at: number; gone: number; may: boolean; list: number }> {
    // Calls whose result is further on. A call that never got one is waited for by nothing.
    const open = new Set<string>();
    let gone = 0;
    let bytes = 0;
    // Whether a message that names changed files is among those cut: the list then names them again (`keepOldest`).
    let named = false;
    for (let at = after + 1; at < messages.length; at += 1) {
      const before = messages[at - 1] as Message;
      gone += sizes[at - 1] as number;
      bytes += bytesOf(messageText(before)) + 1;
      named ||= namesChanged(before);
      for (const use of before.toolUses) if (answered.has(use.tool_use_id)) open.add(use.tool_use_id);
      for (const result of before.toolResults ?? []) open.delete(result.tool_use_id);
      const may = open.size === 0 && (said(messages[at] as Message) || answers(before));
      // Two parts in a row hold more than PART_BYTES between them, so there are at most this many, and a first line.
      yield { at, gone, may, list: lineTokens * (2 + Math.floor((2 * bytes) / PART_BYTES)) + (named ? namedTokens : 0) };
    }
  }

  /** The cut that leaves the first `after` messages in front, or null when none can be handed back. */
  const cutAfter = (after: 0 | 1): Decision | null => {
    // What stays in front is not among the newest messages that `keepTokens` leaves alone.
    const front = sizes.slice(0, after).reduce((sum, size) => sum + size, 0);
    type Place = { at: number; size: number; left: number };
    // The cut that leaves `keepTokens`, and one past it, taken only where the first leaves the conversation over the line.
    let found: Place | null = null;
    let beyond: Place | null = null;
    for (const { at, gone, may, list } of placesFrom(after)) {
      // What stays only gets smaller from here on. Past `keepTokens`, a place is looked for only where the conversation is over the line.
      const past = total - front - gone < asked.keepTokens;
      if (past && !tooFull) break;
      if (!may) continue;
      const here = { at, size: asked.tokens - gone + list, left: total - gone + list };
      if (past) {
        if (here.size > line) continue;
        beyond = here;
        break;
      }
      found = here;
      if (found.size <= goal) break;
    }
    const back = (place: Place, over: boolean): Decision => ({ hand: 'back', after, at: place.at, tokensAfter: Math.round(place.size), over });
    if (found !== null) {
      const over = found.size - line;
      if (over <= 0) return back(found, false);
      if (found.size <= asked.window && found.left < over) return back(found, true);
    }
    return beyond === null ? null : back(beyond, false);
  };

  /**
   * The nearest place a cut may fall at that hands back CUT_TO messages or fewer, those in front and the list among
   * them: keepTokens does not hold it back, since fewer of the newest messages as they were said is better than a
   * summary of all of them (as above). Null where none is left, as when one turn holds more than CUT_TO messages.
   */
  const lengthAfter = (after: 0 | 1): { at: number; size: number } | null => {
    const least = messages.length - (CUT_TO - after - 1);
    for (const { at, gone, may, list } of placesFrom(after)) if (at >= least && may) return { at, size: asked.tokens - gone + list };
    return null;
  };

  /**
   * The cut by size where one is asked for, by length where the conversation is long: the one that goes further. Too
   * full, with no cut by size from `after`, there is none by length either: what it hands back is over the line, with
   * the first message in front or with nothing that a cut can take (0019 decisions 4 and 8).
   */
  const cutAt = (after: 0 | 1): Decision | null => {
    const bySize = sizeAsked ? cutAfter(after) : null;
    if (sizeAsked && tooFull && bySize === null) return null;
    const byLength = long ? lengthAfter(after) : null;
    if (byLength === null) return bySize;
    if (bySize !== null && bySize.hand === 'back' && bySize.at >= byLength.at) return bySize;
    return { hand: 'back', after, at: byLength.at, tokensAfter: Math.round(byLength.size), over: byLength.size > line, length: true };
  };

  const first = messages[0];
  // Long, fitting, and with no place to cut at: handed back as it was rebuilt, as a conversation that fits is.
  return (first !== undefined && said(first) ? cutAt(1) : null) ?? cutAt(0) ?? (fits ? asIs : { hand: 'summary' });
}

/** A conversation with its oldest messages kept, and what it is estimated to come to. */
export type Cut = { messages: Message[]; parts: number; tokensAfter: number };
/** Why nothing was cut: no part is listed that was not written. */
export type NotCut = { failed: NotMoved['reason'] | 'nothing'; code?: string };

/**
 * Keeps the messages from `after` up to `at` in parts (src/keep.ts) and
 * returns the conversation with one message, listing the parts, where they
 * stood. When a part cannot be written nothing is cut, and the caller hands
 * over as before.
 *
 * Where a summary before this named files changed on disk, in a message that
 * is now among those kept, the files the whole conversation read are set
 * against the disk again, as the next summary would, and the list names
 * those that still differ: a file Claude Code shows again is then still told
 * from its reading (ADR 0014, 0018). Where no summary named any, none is.
 */
export async function keepOldest(
  files: Files,
  store: StoreDirs,
  asked: Pick<Asked, 'messages' | 'tokens' | 'count'>,
  after: number,
  at: number,
): Promise<Cut | NotCut> {
  const oldest = asked.messages.slice(after, at);
  const done = await keepConversation(files, store.write, oldest, store.read, { summarized: false, after });
  if ('failed' in done) return { failed: done.failed, ...(done.code === undefined ? {} : { code: done.code }) };
  if ('nothing' in done) return { failed: 'nothing' };
  // It throws nothing: the parts stand whatever it meets.
  const named = oldest.some(namesChanged) ? await changedLines(files, store.write, store.read, asked.messages) : [];
  const list: Message = { role: 'user', text: [done.text, ...named].join('\n'), toolUses: [] };
  return {
    messages: [...asked.messages.slice(0, after), list, ...asked.messages.slice(at)],
    parts: done.parts,
    tokensAfter: Math.round(asked.tokens - tokensOf(oldest, asked.count) + tokensOf([list], asked.count)),
  };
}

/**
 * The line a compaction shows when no summary ran in place of one. `report` is the compaction's own, with
 * the sizes of what was handed back; `cut` names the messages kept, by their place in the conversation, and
 * is absent when the conversation fitted as it was rebuilt. `held` is how many entries Claude Code handed over, where
 * the conversation was cut as far as it was for its length (ADR 0034).
 */
export function cutLine(report: Report, cut: { first: number; last: number; of: number; parts: number; over: boolean; held?: number } | null): string {
  if (cut === null) return `no summary, nothing to cut: ${reportLine(report)}`;
  const long = cut.held === undefined ? '' : ` for its length, ${cut.held} of the ${HOST_SHOWS} entries Claude Code hands a plugin`;
  return (
    `no summary, messages ${cut.first}-${cut.last} of ${cut.of} kept in ${cut.parts} part${cut.parts === 1 ? '' : 's'}${long}: ${reportLine(report)}` +
    (cut.over ? '; still over what may stay in use, which a summary would not change' : '')
  );
}
