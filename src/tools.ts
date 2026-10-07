// The tools the plugin registers at the start of a session, and what each says of itself.

import { FIND_TOOL, PLUGIN } from './store.ts';

/**
 * What `recall`'s description says of `find` when `find` is registered. Both
 * tools are listed in front of the agent (hooks/move-out.ts, #54). Where a
 * Claude Code loads them on demand all the same, an agent sees a tool's
 * description only once it has loaded it, and it loads `recall`, which the
 * tickets name: there, this is where it learns that a result can be asked for
 * by what it was about.
 */
export const FIND_IN_RECALL = `When no id at hand is known to be the result that is wanted, ${FIND_TOOL} looks for it from what it was about, asked in words.`;

/**
 * How a kept part is read, said once where every part is fetched (#104): its fixed lines tell who said what, and a
 * line of a message, an input or a result that would read as one of them is marked (src/keep.ts).
 */
export const PART_IN_RECALL =
  'In a part, a message starts at a line --- user or --- assistant; under [call …] is what a tool was handed and under ' +
  '[result …] what it returned, not what the person said; a line of a message, an input or a result that reads like one of these has a \\ in front.';

/** `recall`'s description, naming `find` only when `find` is there to be called. */
export function recallDescription(withFind: boolean): string {
  return (
    `Returns, unchanged, a tool result that ${PLUGIN} moved out of the conversation, or a part of the ` +
    'conversation it kept, before a summary replaced it or in place of one. ' +
    "Call it with the id written in the line that stands in the result's place, or in the list of the parts it kept. " +
    PART_IN_RECALL +
    (withFind ? ` ${FIND_IN_RECALL}` : '')
  );
}
