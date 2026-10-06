# 0026. A subagent's conversation is kept before its summary

- Status: Accepted
- Date: 2026-10-06
- Amends [0007](0007-keep-what-the-summary-replaces.md) (subagents keep
  nothing), [0019](0019-a-conversation-too-full-is-cut-not-summarized.md)
  ("A subagent's conversation goes straight on, as before") and, for a
  subagent alone, [0008](0008-no-limit-and-nothing-lost-to-a-failed-write.md)
  decision 3 (a summary does not run on a refused write).

## Context

A compaction of a subagent's conversation was handed straight to Claude
Code's summary: nothing was kept, and nothing was said, where
`docs/invariants.md` says the compaction says so each time (#101). The
reason given was that a subagent may have no tool to read a result back
with, so nothing of its conversation is moved out (ADR 0003, decision 3).

Counted in one machine's records of working sessions: 69 compactions of a
subagent's conversation, every one Claude Code's summary; 27 subagent
transcripts called `recall`, 54 times. A subagent given no list of tools has
every tool its parent has. After each of the 69 the transcript held three
attachments, then the summary: the order the main conversation's summaries
take in 37 of the counted cases, where the tickets the plugin puts after a
summary are measured to stand.

## Decision

1. A subagent's conversation is not moved out of or rebuilt, as before
   (ADR 0003, decision 3). What Claude Code's summary replaces in it is kept
   first, in parts, and their tickets are put right after the summary, as
   for the main conversation where it cannot be rebuilt (ADR 0007). The
   conversation is read as the session holds it for that subagent, with its
   blocks, so that an image is named where it stood.
2. Where the disk refuses the write, the summary runs all the same, with
   nothing kept, and that is said. In the main conversation it does not run
   (ADR 0008, decision 3): there the person makes room and compacts again.
   No one can compact a subagent again; held back, its conversation runs
   over its window.
3. What is said goes to the transcript alone, starting `subagent <its id>:`, with no
   notice over it: subagents run side by side.
4. `recall` called in a subagent takes an id copied wrong for the one its
   own conversation names. `find` does not look in a subagent's
   conversation, and says so.

## Alternatives considered

- **Move a subagent's results out, as the main conversation's.** A subagent
  given a list of tools that leaves `recall` out could not read them back,
  and nothing tells the plugin which tools a subagent has. Kept, then
  summarized, the conversation is what it would have been, and more is kept.
- **A line alone.** It makes the promise to say so true, and keeps nothing.
- **Hold the summary back on a refused write, as in the main conversation.**
  The subagent could not go on.

## Consequences

- Each subagent compaction writes its conversation to the store, after
  recording the place the session's transcript is in, as the main
  conversation's does. The parts should be named by the subagent's
  transcript, under the session's, which the clean-up reads, and go when it
  does: that the tickets after its summary stand there was not seen in a
  running session either.
- A subagent given a list of tools without `recall` has tickets it cannot
  read: harmless text, said in `docs/limits.md`.
- Where the line and the tickets show in a subagent's view was not seen in a
  running session: a subagent compaction was not brought about for this.
