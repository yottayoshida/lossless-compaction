# 0036. A `/compact` given instructions is summarized

- Status: Accepted
- Date: 2026-10-06
- Amends [0001](0001-move-out-and-order.md), decision 6, and
  [0019](0019-a-conversation-too-full-is-cut-not-summarized.md), decision 1

## Context

Instructions given to `/compact` tell Claude Code's summary what to keep or
stress. The plugin handed what it rebuilt back as soon as moving out made
room: then the instructions only ordered which results left first, and at
`targetPercent` 1, the default since 0.7.1 (ADR 0025), everything that may
leave does, so they did nothing at all. A summary ran with them only where
nothing could be moved out or too much was still in use (0001, decision 6;
0019, decision 1). With the plugin running, there was no way to have
Claude Code's summary once but to turn the plugin off (#111), while the
plugin's own line for a `/compact` left undone said "/compact with
instructions runs Claude Code's summary".

## Decision

1. A `/compact` given instructions that are more than spaces moves out what
   it can, then hands what is left to Claude Code's summary with the
   instructions, whatever room moving out made. The conversation is kept
   first, as before any summary (0007); where the disk refuses that write,
   the summary does not run (0008), and on any other failure to keep it the
   summary runs as before (docs/invariants.md, I6).
2. This holds for a `/compact` typed by hand (`manual`) and for a compaction
   a plugin asks for with instructions (`plugin`, `$.session.compact`). Not
   for an automatic one: it comes on its own and often, and a hook above
   this one can add instructions to every compaction, each of which would
   then be summarized. An automatic compaction handed instructions is handed
   back rebuilt where moving out made room, as one without them, and goes to
   the summary where too much is still in use, as before (0019). Every
   judgment reads the instructions this hook is handed, `leftUndone` (0015)
   and the reach into the newest calls (0023) too: a hook above that adds
   instructions to a `/compact` typed by hand makes it one given them.
3. What is summarized is what is left once moved out (`rebuilt`): each
   result that left keeps its ticket, which the summary can name, and the
   summary reads less. A compaction that moved out nothing summarizes the
   conversation as it was handed, as before.
4. The line says why: `built-in compaction on what is left, as it was asked
   for with instructions: …`. Where too much is still in use it says so, as
   before.

## Alternatives Considered

- **Summarize the conversation as it was handed, moving nothing out.** The
  summary would see every result whole and could follow instructions about
  what is in them. It drops the tickets of what could have left, which a
  summary of what is left can name, and the setting `maxAfterPercent`
  promised the summary of what is left. `hybrid` in the benchmark, moved out
  to 1 % and summarized, left the least and answered every question
  (docs/measurements.md). Not measured against it.
- **Keep today's step and say in the line that the instructions were not
  used.** The way to a summary would still be to turn the plugin off.
- **A command such as `/lossless-summary` that asks for the summary once.**
  A `/compact` given instructions does it.
- **Read from the instructions what to keep at this compaction.** That
  reading is the summary's.

## Consequences

- A `/compact` given instructions waits for a summary, 24 to 44 seconds in
  the benchmark, and pays for it, where it used to be handed back at once
  when moving out made room.
- To have a summary, give `/compact` any instructions; they are sent to the
  summary as typed.
- Where the disk refuses the parts, a `/compact` given instructions now
  leaves the conversation as it is (0008), where it used to be handed back
  rebuilt. Moving out writes first, so this is a store that took the results
  and not the parts.
- Where what Claude Code attached cannot be kept, the conversation is not
  rebuilt (0030): the summary then runs on the conversation as it was sent,
  not on what is left.
- An automatic compaction handed instructions by another hook is handed back
  rebuilt where moving out made room, and summarized where too much is still
  in use, as before.
