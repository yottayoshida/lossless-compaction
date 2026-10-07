# 0038. Clean-ups at once remove only from settled days

- Status: Accepted
- Date: 2026-10-06
- Adds to [0006](0006-results-live-as-long-as-a-transcript-names-them.md) decision 1 (what
  a transcript names is kept).

## Context

Nothing keeps a second clean-up out while one runs: each session checks when
the last one was tried and notes its own try, and two sessions started
together both pass the check before either has noted (#119). Two clean-ups
that searched the transcripts a moment apart can disagree on what is named:
a compaction in between can name a result again.

`collect` moves a result to the trash in two steps, its entry and then its
text. One that names it puts back what the trash holds of it and, where the
text is in place once that is done, takes what the trash holds for a copy
and removes it. Between the two, the text could be in place for the one that
looked and in the trash by the time it removed: the one not naming it had
moved it there meanwhile. Built in a test, the text of a result one of them
named was removed and `recall` answered that nothing is stored. With three,
the one naming it could put everything back, see it all in place, and remove
what a third had moved into the trash again in between.

What a clean-up moves into the trash goes into the directory of the day it
moves, and what is past its grace is removed from directories over a week
old: that removal never meets a move.

## Decision

1. A copy the trash holds of a result in place is removed only from a day
   directory older than the day before the clean-up's own: two or more days
   past. No clean-up is moving into it any more.
2. The day a clean-up moves into is the day it moves, not the day it
   started: the hook hands `collect` the time it calls it, after the search.
3. A copy in a newer directory stays, beside the one in place, until a
   clean-up two or more days on removes it, or, once nothing names it, until it has
   been a week in the trash.
4. Clean-ups are not kept from running at once.

## Alternatives considered

- A lock between clean-ups. It has to give way after a time, so that one a
  stopped session left does not stop clean-ups for good, and the window opens
  again whenever a clean-up outlasts that time. It also leaves a compaction,
  which puts back from the trash without the lock, beside a clean-up as
  before.
- Removing only the files the clean-up saw in the trash when it listed it.
  This holds for two clean-ups, not three: the one naming the result sees in
  the trash what the first moved there, puts it back, and a third moves it
  there again before the removal.
- Leaving every copy to the week's grace. A copy of something named would
  stay as long as it is named, and every clean-up would try to put it back.

## Consequences

- A copy of a result put back beside one in place stays in the trash until a
  clean-up two or more days on: the next one, a week later as clean-ups
  usually run. Each clean-up in between that tries says it put it back.
- `collect` takes its time from its caller, after the search; a collection
  that spends more than a day from then to its last move, as on a machine
  asleep in the middle of it, can still meet another clean-up's removal.
  `docs/invariants.md` says so. A collection only moves and removes, at most
  2,000 paths a command.
- A copy of 0.7.1 or earlier cleaning up the same store at the same time
  removes a copy from any day, as before.
- A result's file time is the last time it was stored, not the first: the
  days `/lossless-store` gives and the oldest result its late line counts
  from move with it.
- Tests run three clean-ups, two that do not name a result and one that
  does, with their listings and commands dealt in random orders, and the two
  orders above by name.
