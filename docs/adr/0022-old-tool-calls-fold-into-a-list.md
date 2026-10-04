# 0022. Old tool calls fold into a list

- Status: Accepted
- Date: 2026-10-04
- Amends [0001](0001-move-out-and-order.md) (decision 2, "the tool call itself
  always stays in the conversation"): an old call that is small, with what it
  returned, may leave the conversation, kept whole, a line of a list standing
  for it. What was said stays. The newest calls stay, as do the first message,
  calls of tools not named, calls that failed, and calls that hold a long value
  or a ticket.

## Context

The plugin moved out what was long: a tool result of `minChars` characters or
more, and since 0020 a long value handed to the tools that write and to Bash.
What fills a working conversation is mostly small. Over the automatic
compactions of working sessions on one machine, 103 of them as of 2026-10-04:
a median of 419 tool calls a conversation; inputs that are not long values
were 22 % of the characters and results under `minChars` 14 %, almost all of
both older than the newest 60,000 characters; Bash alone was 12.6 % and 10.3 %
of them. A ticket a call is no smaller than such a call. With every result and
long input out, a median 62 % of a conversation's characters stayed.

Claude Code's own summary keeps next to none of it: over 106 summaries in the
same records, 1.2 % of the short Bash commands before them stood in the
summary, and the work went on. What it keeps is what was said: what was asked,
what was found, what is next. A small call that is old is a step taken; the
conclusion drawn from it is in what Claude said after it.

## Decision

1. While what is in use is still over the target once results and long inputs
   are out, runs of old calls fold, oldest first. A run is the calls of one or
   more responses with their results, from where a person or Claude said
   something to where one of them next did, and no larger than a part may be.
   A response whose calls and results alone are larger than a part stays.
2. Each run is kept whole as one part, in the form of 0007 with no summary,
   and one message stands where it stood:
   `[lossless-compaction] 3 tool calls were moved out here, with what they returned; …`,
   the part's line, and a line a call naming the tool, what it was called on
   and how many lines came back. Nothing of what came back is on the list. The
   part's line numbers the messages as they stood before the fold.
3. A call folds only if every call of its response does: the tool is one of
   `Bash`, `Read`, `Grep`, `Glob`, `Edit`, `Write`, `MultiEdit`,
   `NotebookEdit`, `WebFetch`, `WebSearch`; none failed; every value it was
   handed and every result it gave is under `minChars` and holds no ticket;
   and what the call holds of its result is that result. So a call is never
   left without its result; a tool that hands back what a person answered
   (`AskUserQuestion`, `ExitPlanMode`), or whose input Claude Code reads back
   (`TodoWrite`), stays; and a ticket stays where it is, naming what it stands
   for to `find`, the clean-up and the guard of 0020.
4. The first message stays, and every message of the newest `keepTokens` of
   the conversation, counted over everything it holds; the newest message
   whatever its size, as the newest result (0002).
5. A run folds only where its list takes less room than the run did. The list
   is drawn up before anything is written, at its full length: a run of
   one-line outputs stays where it stood, and nothing is kept for it.
6. A `Read` of a whole file whose numbered lines are in the run has what it
   returned kept on its own as well, and its line names the id: the file is
   still set against that reading after a summary (0014). A `Read` whose result
   left at an earlier compaction holds a ticket and stays, its ticket the
   reading as before. A folded call that wrote a file is named as one, so that
   the file is not named as changed by someone else.
7. `recall` gives a list's part back as any part. `find` offers it as any
   part. The clean-up and the guard read the ids on a list as the
   conversation's.
8. A list stands in a message of the person's: what a line names is cut
   without halving a pair of UTF-16 units, and holds no character that would
   break the line or turn the text. A half of a pair in what is kept is kept as
   U+FFFD, as in a part of 0007.

## Alternatives Considered

- **A ticket a small call.** A call of a few hundred characters is no larger
  than its ticket: measured over the same records, it left more than half of a
  conversation in place.
- **Leave small calls in place.** What #47 cuts when a conversation is still
  too full then takes what was said along with them; folding keeps that.
- **Fold what was said too.** A summary does that; the plugin keeps what was
  said as it was said (0007).
- **Any tool's calls.** A tool of another's, and those whose input or result
  Claude Code or the person reads back, would lose what they stand for.
- **Fold calls that hold a ticket, their ids on the list.** The line would be
  near the length of the ticket it replaced, and every reader of tickets
  (`find`, the readings set against files, the clean-up, the guard) would
  have a second form to read. With them kept, and the other rules here, a
  median 39.6 % stays, where the first draft of this, which folded them, left
  35.5 %.
- **Fold whatever the size.** Measured in a real session: six `cat`s of a line
  each came to more characters folded than as they were.

## Consequences

- In the records above, folding as decided here leaves a median 39.6 % of a
  conversation's characters where every result and long input moved out left
  62 %; the median conversation has 99 lists. Counted offline over the
  records, by the rule; the size of a list estimated at 200 characters and 60
  a call.
- The agent knows an old step by its line: what was run, on what, how much
  came back. What came back is a `recall` away. A summary of what is left,
  where one runs (`/compact` with instructions, or a part that cannot be
  written), sees the same lines.
- A `/compact` with instructions that folding made room for is handed back
  without a summary, as one that moving results out made room for always was.
- A list is not folded again: a long session gathers lists, which #47's cut
  takes with the oldest messages when the conversation is too full.
