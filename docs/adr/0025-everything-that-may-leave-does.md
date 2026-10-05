# 0025. Everything that may leave does: `targetPercent` is 1 by default

- Status: Accepted
- Date: 2026-10-05
- Amends [0001](0001-move-out-and-order.md) (results leave until a target is
  reached, 40 % by default): the default target is 1 %, which is not
  reached in a window of 200,000.

## Context

A compaction moved results out until the conversation was estimated to be
under `targetPercent` of the size Claude Code compacts at, 40 by default, and
then stopped. The 40 was never set from what it costs over a session
(#53). What it leaves, 65,000 tokens in a window of 200,000, is the results
that share most with the goal, wherever they stand; they leave at the next
compaction, and the conversation has changed near its start again.

Measured before this was decided
([one session, several compactions](../measurements.md#one-session-that-compacts-several-times-under-each-setting)):
right after a compaction the next request reads from the prompt cache only
what stands before the conversation, about 4,000 tokens, at every setting,
and writes the rest anew. At 40 that was 60,000 tokens, five times in the
session; at 1, 22,000, three or four times.

## The rule

The first three conditions below were fixed in the plan before the sessions
were driven. The fourth, on the cost by the twenty-fourth and the thirtieth
log, was asked for by the review of the driver, which then recorded those
figures; it was written into the rule after the sessions were driven. It can
only keep 40, never choose 1.

The default becomes 1 only if, in the session driven twice at each setting
with Sonnet 5.5: each run at 1 cost less than every run at 40; the runs at 1
cost on average no more than 95 % of those at 40; they answered on average no
more than one question fewer; and by the twenty-fourth and by the thirtieth
log each run at 1 had cost less than every run at 40, so that where a session
happens to end between two compactions does not decide it. Otherwise it
stays 40.

It held: 4.23 and 4.03 USD at 1 against 5.02 and 5.13 at 40, 81 % on
average; 5 and 6 answers right of 6 against 6 and 5; 2.54 and 2.34 against
3.06 and 2.93 by the twenty-fourth log, 3.39 and 3.16 against 4.02 and 4.13
by the thirtieth. `bench/session.ts` holds the rule (`defaultFrom`), and a
test holds the manifest's default to what it gives of the published sessions.

## Decision

1. `targetPercent` is 1 by default. In a window of 200,000 the target is
   then 1,670 tokens, under what stands before the conversation, and is not
   reached: a compaction, automatic or typed, moves out everything that may
   leave: every result but the newest `keepTokens` of them, and what leaves
   after results as well, each time: long inputs and the middles of long
   messages, each but the newest `keepTokens` of its kind, and runs of old
   small calls, but those among the newest `keepTokens` of the conversation
   (ADR 0020, 0022, 0024). In a window of 1,000,000 it is 9,670 tokens,
   reached where what is left comes to less.
2. Where the oldest messages are cut in place of a summary (ADR 0019), the
   cut goes down to the same size: at 1, the first message and the newest
   `keepTokens` stay.
3. A higher value leaves more in place, as before. Nothing else of the
   setting changes, and a value someone set stays as they set it.

## What was not measured, and what it rests on instead

- **20 was not told from 1.** In a window of 200,000 both leave about 26,000
  tokens: the newest 20,000 tokens of results stay whatever the target. The
  sessions support 20 as much as 1. 1 was taken because what it leaves
  turns least on the window: at 20 a window of 1,000,000 leaves up to 193,000
  tokens of results in place, to be written to the cache again at each
  compaction, which is what made 40 cost more here; at 1, 9,670.
- **A window of 1,000,000 was not measured.** There 40 leaves up to 387,000
  tokens. That 1 costs less there follows from the cache being read no
  further than the start of the conversation after a compaction, which was
  measured in a window of 200,000 only.
- **The other stages running every time** was measured once, by hand, on the
  six conversations of the benchmark
  ([at 40 and at 1](../measurements.md#the-six-kinds-of-conversation-at-40-and-at-1)):
  52 answers right of 54 at 1 against 53 at 40, the next request 7,373 to
  17,641 tokens against 10,766 to 83,460. Not measured: a rule stated in the
  middle of a long message that left.
- Opus 5.5, and a session that writes files or runs commands instead of
  reading.

## Alternatives considered

- **Keep 40.** It cost a quarter more in the session measured and compacted
  five times where 1 compacted three or four.
- **20.** The same as 1 where it was measured, and a share of the window
  where it was not: see above.
- **Leave the default and say in the README to set 1.** A setting nobody is
  told to change is the default in all but name, and the README's figures
  would be of a setting few run.
- **A target that adapts to the conversation.** What to adapt to is what the
  measurements were to show; they show one direction so far, and a policy
  that switches is a change of its own.

## Consequences

- More is behind tickets after a compaction, and the agent calls `recall`
  more: for the exact text of something gone it called it 3 or 4 times in
  nine questions at 1.
- A long message older than the newest `keepTokens` of them stands as its
  first and last paragraphs after every compaction, automatic ones too, where
  at 40 that happened only when results were not enough; after a `/compact`
  typed without instructions, the newest ones as well.
- The README's table was measured at 40 and says so; a line under it gives
  what 1 leaves.
- Sessions of installed copies change with the version that carries this:
  their next compaction moves out more than their last did.
