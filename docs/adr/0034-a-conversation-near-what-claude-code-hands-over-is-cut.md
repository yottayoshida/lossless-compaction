# 0034. A conversation near what Claude Code hands over is cut

- Status: Accepted
- Date: 2026-10-06
- Extends [0019](0019-a-conversation-too-full-is-cut-not-summarized.md): a
  conversation is cut for its length as well as for its size. What 0019
  decided of where a cut falls, what is written and what stays in front
  stands, and so does
  [I8](../invariants.md): a conversation of 4096 messages or more is still
  not rebuilt.

## Context

Claude Code hands a plugin the newest 4096 entries of a conversation and no
more (`session.messages`). The plugin leaves
one of 4096 or more to Claude Code's summary, kept first, since older
messages may not have been shown; what is older than the 4096 is not kept
(docs/limits.md). Moving a result, a long input or a message's middle out
leaves the message where it was, and no summary starts the count over, so
under the plugin the count grows from one compaction to the next (#115).
With `targetPercent` at 1, the default since 0.7.1, what is in use goes
down to little at a compaction while the messages stay: the next
compaction comes once the window has filled again, and the count can have
grown by as much as one window holds.

Counted on one machine, from Claude Code's records of the sessions started
by hand from 2026-10-01 to 2026-10-06 (36 sessions, 56 compactions: 16 of
them Claude Code's summary, 40 rebuilt by the plugin; `claude -p` runs left
out, each compaction once; `bench/messages.ts`): the most a conversation
held before a compaction was 2,081 entries. From an empty start, a
session's first compaction or the first after a summary, to the next
compaction, a conversation gathered 1,510 entries at the median and 1,766
at most at the compactions Claude Code started in a window of 1,000,000,
and 2,045 at most at any. Where the plugin had rebuilt the compaction
before, the count rose by 10 to 1,228 where it rose. In a made-up session
of 3,400 messages, a row of the record each, Claude Code handed over 3,400
entries; whether it counts rows of other kinds was not measured.

## Decision

1. At a compaction without instructions, a conversation Claude Code handed
   over with 1,536 entries or more (`CUT_AT`, three eighths of 4096),
   counted as the larger of the messages the hook was given and the
   conversation as sent, is cut for its length where what was rebuilt still
   holds more than 1,024 messages (`CUT_TO`, a quarter of 4096). It is
   looked at before anything else is decided: where moving results out was
   enough, and where a `/compact` by hand would be left undone (0015).
2. It is cut down to 1,024 messages handed back, those in front of the list
   and the list among them, at the nearest place a cut may fall (0019
   decisions 4 and 5): the first message stays, and a call and its result
   are never parted. `keepTokens` does not hold it back, as it does not
   where a cut by size needs more (0019 decision 6): fewer of the newest
   messages as they were said is better than a summary of all of them.
3. Where the conversation is too full as well, the cut that goes further is
   taken.
4. With instructions, the summary that was asked for runs, as 0019 decision
   1 has it: the conversation is kept first and the summary starts the
   count over.
5. Where no place to cut is left, or a part cannot be written, the
   compaction goes as it would have gone: handed back as rebuilt, left
   undone, or to the summary as 0019 says.
6. The line says that the conversation was cut for its length, with the
   entries Claude Code handed over, and `/lossless-status` says how many of
   the 4096 the conversation holds.

The two figures are set so that what is not cut and what one window adds
to it stay short of 4096: 1,535 and 2,045, the most gathered, come to
3,580; 1,024 and 2,045 to 3,069. Past 1,536, each compaction without
instructions cuts it again.

## Alternatives Considered

- **Measure, and cut nothing.** The first draft of #115 closed it on the
  measurement alone, from counts that took in `claude -p` runs and
  compactions Claude Code summarized. Counted again as above, a session the
  plugin rebuilds compaction after compaction can gather up to a window's
  worth each time, and none stops it short of 4096; none counted reached it
  yet, the most being 2,081. Reaching it loses what is older. Rejected.
- **Cut at 3,072, down to 2,048.** The plan as first approved, from the
  steps between compactions rebuilt one after another at `targetPercent`
  40: 429 at most. At 1 a step can be what a window holds; 3,071 not cut
  and 1,510 gathered come to 4,581. Rejected on the counts above.
- **Cut at 2,048, down to 1,024.** Cuts no session at its first compaction
  that the counts above hold, but 2,047 and the 2,045 gathered come to
  4,092. Rejected for the margin.
- **Compact on the plugin's own at `CUT_AT`** (`$.session.compact()`). It
  would hold where a window holds more than the margin, but telling when
  means reading the conversation, up to 4096 entries, at each turn.
  Rejected for now; the case is a limit in docs/limits.md.
- **A setting for the two figures.** Nobody using the plugin has what they
  would be set from. Rejected.

## Consequences

- A long conversation loses sight of its oldest messages, as a list of
  parts, at a compaction where its size would have let them stay; past
  1,536 entries, at each compaction without instructions. They come back with `recall`,
  and `find` reads them with a key.
- What follows a cut for length is counted again at the next compaction,
  where the list stands for what was cut.
- The two figures rest on one machine's 36 sessions. A conversation that
  gathers more than 2,560 entries between two compactions, or 4096 before
  its first, still reaches 4096 and is summarized, kept first.
- Where Claude Code attached something to the messages as it sent them,
  the message naming it (0030) follows the 1,024: 1,025 are handed back.
