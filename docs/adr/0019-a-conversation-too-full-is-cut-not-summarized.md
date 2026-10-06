# 0019. A conversation too full is cut, not summarized

- Status: Accepted
- Date: 2026-10-03
- Narrows [0007](0007-keep-what-the-summary-replaces.md): where 0007 keeps
  the conversation and hands it to Claude Code's summary because of its
  size, and `/compact` was given no instructions, the oldest messages are
  kept and no summary runs. What 0007 decided for every other hand-over
  stands, and so does
  [0015](0015-a-compact-with-nothing-to-move-and-room-left-is-not-summarized.md).

## Context

The plugin hands the main conversation to Claude Code's summary, kept first
(0007), in two cases that are about its size: results were moved out and
more than `maxAfterPercent` of the window is still in use; or nothing could
be moved out, and the compaction is automatic or what is in use is over
that line (0015 left the rest of that case undone). The summary takes 20 to
40 seconds, costs what a summary costs, and puts its own words where the
conversation was. Nothing is lost by it, since the conversation is kept
first. But the plugin then compacts in two ways, and which of them a
conversation gets is nothing its user chose.

How often (`docs/measurements.md`, "The oldest messages kept in place of a
summary"): on one machine ten such hand-overs in four days, every one of a
session that ran 0.5.x to its end; replayed on the current code, the eight
that said "too much is still in use" all fit. No session started since
0.6.0 has shown one. What the current code still hands over is rarer and of
a clear shape: of 99 automatic compactions replayed, two stay over the line
after results are moved out, at 75.3 % and 80.4 %; and a conversation with
nothing to move out, such as text pasted into messages, which is `full` in
the benchmark, summarized three runs of three.

A `session.compact` hook may hand back messages of its own making. Measured
on Claude Code 2.1.288 with Haiku 4.5: a user message put into the
conversation is taken; two user messages in a row are taken, the model
seeing them as one and the next hook being handed them apart; and what was
handed back is what the next request carries.

The conversation can already be written out in parts and read back
(`keepConversation`, 0007). That is what runs before a summary.

## Decision

On `session.compact`, on the main conversation, when results were moved out
and too much is still in use, or nothing was moved out and 0015 does not
leave the `/compact` undone:

1. With instructions given to `/compact`, as before: kept, then summarized.
   A summary that was asked for is given. (Amended by ADR 0031: also where
   moving out made room, on what is left.)
2. Otherwise the oldest messages are kept in parts, as 0007 keeps a
   conversation, and one message that lists the parts stands where they
   stood. Claude Code's summary is not called, and the plugin writes none.
3. What is cut is what the compaction rebuilt: results already moved out,
   and no handle of Claude Code's on any message.
4. The first message stays, as it does when results are moved out (0001):
   it is what was asked for, and the rules given with it. Where the
   conversation does not fit with it in front, it is cut with the rest.
5. A cut ends where the person starts to speak, or right after the results
   of a call were returned, with no call still waiting for its result. A
   call and its result stay on one side.
6. The newest messages stay while they add up to `keepTokens`, counted as a
   compaction counts a size (0013). The setting has two meanings from here
   on: the newest results left alone when results are moved out, as before,
   and the least of the conversation left when it is cut. Fewer stay only
   where leaving that many keeps the conversation over `maxAfterPercent`
   and more of it could go: the oldest place past `keepTokens` that brings
   it under the line is then taken. A summary would leave none of the
   newest messages as they were said.
7. How far: down to the size results were moved out to reach, which is
   `targetPercent` of the window and never more than half of what was in
   use, and never above `maxAfterPercent`. The oldest place that brings the
   conversation down to it is taken. Where none does, the newest place that
   still leaves `keepTokens` is.
8. Whether to cut is decided before anything is written. Cut as far as it
   may be, the conversation is handed back when it is under
   `maxAfterPercent`. It is handed back as well when it is still over that
   line but all of it fits the window and what is left of the conversation
   is smaller than what is over: what is not the conversation is too large,
   and a summary would not change that, which is how `compact()` already
   reasons after moving results out. Otherwise — what is behind the last
   place a cut could end is over the line by itself, as one very long
   message said last is, or there is no place to cut — it goes to the
   summary as before, kept once, and nothing is written for a cut.
9. A conversation that fits once it is rebuilt, with nothing moved out, is
   handed back as rebuilt, where sizes are counted from what stays (0013).
   Where they are not, the plugin cannot tell that it fits: what is in use
   is then Claude Code's figure with the thinking in it, or made up from
   characters. The compaction was asked for all the same, by Claude Code
   where the conversation is full, so it is cut down to the same size. The
   newest `keepTokens` always stay there, since no count says that the
   conversation is over the line: with no place to cut, or with less than
   `keepTokens` behind the first message, it goes to the summary as before.
10. When a part cannot be written, nothing is cut, and the hand-over of 0007
    and 0008 follows: a write the system refused stops the compaction, any
    other failure is said and the summary runs.
11. The list says that no summary took the messages' place, and a part's
    ticket leaves out "before the summary". Both wordings are read.
12. The files changed on disk (0014) are not named where no summary named
    any: Claude Code shows no file again where no summary ran. Where a
    summary before the cut did name some, in a message that is now among
    those kept, the files the whole conversation read are set against the
    disk again, as the next summary would, and the list names those that
    still differ. The note that stands for a changed file shown again
    ([0018](0018-a-changed-file-shown-again-gives-way-to-a-line.md)) reads
    the plugin's last message, which the list then is.

The decision is one function under `src/` (`decide`), called by the hook
with what the compaction rebuilt, estimated and aimed at; a test holds that
call.

## Alternatives Considered

How far to cut was measured before it was decided, on `full` with Haiku
4.5, nine questions, three runs each, the first message cut with the rest
(`docs/measurements.md`):

|                                             | Summarized | Cut to the newest `keepTokens` | Cut to `maxAfterPercent` |
| ------------------------------------------- | ---------: | -----------------------------: | -----------------------: |
| The next request, tokens                    |   12,604 to 13,022 |                 39,122 |                  116,655 |
| Right, of 27                                |         20 |                             14 |                       12 |
| A rule stated in the first message, of 6    |          6 |                              0 |                        0 |
| Output of a script since removed, of 6      |          2 |                              2 |                        0 |
| Compaction and nine questions, cache cold   |   0.43 USD |                           0.66 |                     2.05 |

- **Stop the cut at `maxAfterPercent`**, so that as much as may stay does.
  It left three times as much to send, a third of the room before the next
  compaction, and no more right answers: with much of the conversation still
  there, the agent did not look at the list.
- **Always cut down to `keepTokens`.** What was measured as the better of
  the two, but whatever its user set: most of a conversation would become a
  list for someone who left the settings alone.
- **A setting of its own for how far.** `targetPercent` already says how
  small a compaction should make the conversation.
- **Cut the first message with the rest.** A rule stated in it was then
  answered none of six times, in either column above, where the summary
  writes such a rule out.
- **Move tool inputs out first** (the first stage of #47 as it was
  written). On the current code nothing counted shows it is needed here:
  the conversations it was proposed for fit. A ticket in place of what a
  `Write` wrote can be imitated by a model into writing one line over a
  file, which needs a guard of its own. Another decision.
- **Keep the conversation and summarize it too**: what 0007 does, and what
  this record changes.
- **A summary written by the plugin**: 0007, the first alternative there.
- **Carry the lines of the list before into the new list.** The list would
  grow with every cut. Kept in a part, the earlier list is followed by
  `find` and by the clean-up as the parts of an earlier summary are (0007).
- **Cut inside a message**, so that one very long message can be made
  smaller. What the person just said would be gone from the conversation. A
  summary still makes it smaller, and that case goes to it.
- **Skip an automatic compaction that has nothing to move out**: 0015
  already. The conversation overflows.
- **Name the changed files in every list** (0014). The line speaks of a
  summary and of files shown again after one, neither of which is so where
  no summary ran.
- **Never name them.** After a summary that named some, a cut takes the
  plugin's message that names them out of the conversation, and the note of
  0018 would stop standing for a changed file shown again. So they are
  named where a summary named some, and counted over the whole
  conversation: over the messages that were cut alone, a file written again
  in the messages that stayed would be named as changed.

## Consequences

- Still summarized, the conversation kept first: `/compact` with
  instructions; a conversation no cut between messages brings under the
  line, or with no place to cut; one that cannot be rebuilt (0007, 0012);
  and when a part cannot be written. A subagent's conversation goes straight on, as before.
  (Amended by ADR 0026: it is kept first, then summarized; it is still never cut.)
- A conversation over the line for what is not the conversation alone is
  handed back in two ways, both without a summary: as it is once results
  were moved out, which is how it was, and cut down to `keepTokens` where
  nothing was moved out.
- `targetPercent` now decides two things. A change to its default (#53)
  changes how far a cut goes as well.
- More is sent with each request after a cut than after a summary, and the
  next compaction comes sooner. On `full` with Sonnet 5.5 and the default
  settings, set against the plugin as it was, which kept the conversation
  and handed it to the summary: 75,188 tokens a request against about
  11,500. The compaction and nine questions cost 2.79 USD with the prompt
  cache cold and 0.36 with the conversation in it, against 0.88 and 0.41 to
  0.43. (With Haiku 4.5 the next compaction Claude Code started came after
  seven more documents of 16,000 tokens.)
- What the agent has of the messages that were cut is a list of parts by
  their numbers, with no word of what each held. `find`, with a key, reads
  the parts; without one, `recall` takes an id from the list. A summary
  writes out what was decided on the way; a cut does not, and only what the
  first message says is sure to stay. Whether that costs answers went with
  the model. Sonnet 5.5 answered all nine questions of `full` in each of
  three runs, as it did where the conversation was kept and summarized: for
  what a script since removed had printed, which is in a part, it called
  `recall`. Haiku 4.5 answered six where it had answered eight: after a cut
  it said that it did not have the output, and did not fetch it.
- The store grows by what is cut, not by the whole conversation.
- `find` reads at most 64 parts, parts of earlier cuts included, and a
  part's ticket in the text of a message is not put back from the trash
  before a compaction. Neither is new; cuts in a row reach the first sooner.
