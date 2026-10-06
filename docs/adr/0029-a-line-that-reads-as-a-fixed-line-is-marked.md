# 0029. A line that reads as a fixed line is marked

- Status: Accepted
- Date: 2026-10-06
- Amends how [0007](0007-keep-what-the-summary-replaces.md),
  [0019](0019-a-conversation-too-full-is-cut-not-summarized.md) and
  [0022](0022-old-tool-calls-fold-into-a-list.md) write a part; what goes
  into one stays as they decide

## Context

A kept part writes each message under a fixed line, `--- user` or
`--- assistant`, each call under `[call <tool> <id>] …` and each result
under `[result <id>]`, and what was said, handed or returned as it was
(`src/keep.ts`). Nothing told those lines from the same lines inside a
result. A fetched page or a log holding `--- user` came back from `recall`
reading as something the person had said, with no other copy to check
against once the messages were cut (#104). The plugin's own readers were
taken in too: `callsOfLines` put the lines after a `[call …]` of a result
under that call, and `find` took a `--- user` in a message of Claude's for
the person's, and named a middle after it as theirs. With `targetPercent` at
1 (ADR 0025) parts are written more often.

## Decision

1. A line of what was said, handed or returned, or of a field's name, that
   reads as a fixed line is written with one backslash more in front. It
   reads as one when, the backslashes and whitespace (spaces, tabs, a
   carriage return, as JavaScript's `\s` takes them) it starts with read
   past and the whitespace it ends with not counted, it is
   `--- user` or `--- assistant`, or starts `[call ` or `[result `. That is
   wider than what the readers take for a fixed line, so that a line a model
   would take for one is marked as well; and because the backslashes in
   front are read past, a line with one more of them reads the same, so
   taking one off a line that starts with one and reads so gives the text
   back exactly.
2. The readers are not changed. A marked line is no fixed line to them, and
   a part written before reads as it did.
3. Where a line longer than a part is cut at a character, and what follows
   the cut starts as a fixed line does (`--- user`, `--- assistant`,
   `[call `, `[result `), the cut goes one character earlier. Only the start
   is read: what follows may be cut again before its line ends, and then a
   piece's first line ends where the piece does. Every fixed line starts with
   `-` or `[`, and none starts so with a character in front of it, so one is
   always enough. A fixed line led by whitespace or backslashes is not moved this
   way: one character more in front of it would read the same, and the cut
   would not end.
4. How a part is read is said once, in `recall`'s description, which is in
   front of the agent wherever a part is fetched from: a list after a
   summary, a list of folded calls, or `find`.

## Alternatives Considered

- **A line in front of every part, saying how it is read**, which issue #104
  proposed. `find` shows Jev the first 400 characters of each part it offers
  (`src/find.ts`, `src/ask.ts`), and a line of 263 characters would have
  left 193 of them for the part itself; a quoted phrase would have matched
  that line in every part. Every limit on a part's size would have had to
  leave room for it.
- **The same line in the list after a summary, and in `find`'s answer.** A
  part fetched from a list of folded calls, or from `find`'s list of the
  likeliest, would not have met it, and the first line of the list a cut
  leaves is held to a width a cut is measured by (`src/cut.ts`).
- **A length in front of each result.** A program reads it exactly; a model
  does not count bytes, and is taken in by the `--- user` inside all the same.
- **Parts written as JSON.** Hard for a model to read, and every reader would
  have had to read two forms.
- **Marking only what a reader takes for a fixed line.** `--- user` with a
  carriage return or a space at its end is no fixed line to a reader, and is
  one to a model; one space would have been enough to get one through.

## Consequences

- A part's fixed lines are the plugin's alone; in parts written before,
  they need not be. Old parts are not written again (I3).
- A line of a result that only starts like a fixed line, such as
  `[call me later]`, gains a backslash in the part. The result moved out on
  its own, which is what `recall` returns for a ticket, has none.
- What a model would take for a fixed line is marked where a line starts,
  and kept from the start of a piece where a line is cut, but for one led
  by whitespace or backslashes (decision 3), which a cut can also leave by
  carrying a space along with what follows it. A zero-width space in front, or a
  carriage return or a line separator inside a line, is not looked for.
- The same conversation stored before and after this change makes parts of
  other ids where one of its lines is marked. Nothing stores the same
  conversation again across versions: a fold replaces what it folds, a cut
  takes what it keeps out, and a summary keeps a conversation that holds the
  list of what was kept before.
- `recall`'s description is longer by a sentence, sent with every request.
