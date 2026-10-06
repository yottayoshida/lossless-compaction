# 0007. Keep what Claude Code's summary replaces

- Status: Accepted
- Date: 2026-10-01

## Context

The plugin hands a conversation to Claude Code's own summary when moving
results out is not enough, when nothing can be moved out, and when the
conversation cannot be rebuilt (an image, a document, a block of another
kind, 4096 messages or more; since ADR 0012 an image in a tool result no
longer is a reason). Each time, the summary replaces the
conversation, and the tickets in it may go with it: the one compaction that
loses what the plugin exists to keep. In a real session (sideeye, Opus 4.6,
a 200k window, 2026-09-30) one of twenty-one compactions went that way, with
82% of the window still in use after moving out; a manual `/compact` in
another session had nothing to move out.

Issue #13 proposed that the plugin write a summary of its own, a keyframe
of the task, over paged-out turns. Published measurements do not favour a
summary in place of moving out: on SWE-bench Verified, replacing old
observations matched or beat an LLM summary at about half the cost, and the
summary made agents take 13–15% more turns ("The Complexity Trap", arXiv
2508.21433); in Factory's probe evaluation every summarizer scored lowest on
which files were created or changed. The same paper found the best
arrangement to be moving out first and summarizing only when that is not
enough — which is where the built-in summary already runs.

Moving out long `Write` and `Edit` inputs as well was estimated on 79 local
segments at a median 7% less than 0.4.0 leaves (12% with `Bash` commands,
which `find` needs to tell results apart). (Measured again on 2026-10-01,
counted in hand-overs: see Alternatives Considered.)

A `session.compact` hook's `next(e)` resolves to the built-in compaction's
messages, and a message without Claude Code's handle may be added to them.

## Decision

1. Before the plugin hands the main conversation to the built-in summary,
   it keeps the conversation: every tool result left in it is moved out as
   usual, and the conversation is written, in a fixed text form, as parts of
   at most 40,000 bytes, each stored like a result.
2. The built-in summary runs on the same conversation it ran on before.
3. One message is added right after the summary, holding a ticket for each
   part. When a part cannot be written, nothing is added and the compaction
   says so.
4. `find` reads those tickets, and the tickets inside the parts.
5. The plugin writes no summary of its own.
6. A long input moved out of an oversized message keeps the ticket wording
   "`<tool>.<field>` result": the wording is what `readTicket` reads, and
   one wording is one pattern fewer to recognise.

## Alternatives Considered

- A keyframe written by the plugin through `$.model.fork`: the same model
  summarizing the same conversation again, without the built-in summary's
  rereading of files afterwards.
- A keyframe at every compaction (#13 as written): a summary in place of
  moving out, which the measurements above do not favour.
- Moving out `Write` and `Edit` inputs at every compaction: 7% by the
  estimate, and it does not change what is lost when the summary runs.
  Counted in hand-overs on 2026-10-01 (#25, `docs/measurements.md`), it
  stays set aside: of 102 automatic compactions put together from local
  transcripts, none would have been handed to the built-in summary for
  being too full, so there was none to save; 15 were handed over for a
  block that is not rebuilt, and 2 for having nothing to move out, and
  those 2 held no long input. The one compaction that was handed over for
  being too full (the 82 % above; not among the 102) held no long input
  either. It would have left less in use, in the one project whose
  conversations held long inputs (a median 41 % of the window where it was
  49 %, the fullest conversation 68 % where it was 73 %). To be taken up
  again when a compaction says "too much is still in use" on a
  conversation holding long inputs, or when compactions by the plugin in a
  row are measured on one that holds them: the one such run in those
  transcripts, 19 compactions, held none.
- One text of the whole conversation: `recall` output over about 50 KB is
  saved to a file the agent reads, and lines over 2,000 characters are cut
  when read.

## Consequences

- A compaction that goes to the built-in summary keeps what it summarizes,
  except images, documents, thinking, and messages older than the 4096
  Claude Code shows; subagents and an unset or unwritable store keep nothing.
  (Amended by ADR 0026: a subagent's conversation is kept as well.)
- Every such compaction stores the whole conversation, so the store grows
  faster; bounding it is #12.
- The results a part holds are named in the part, not in any transcript, so
  the clean-up of ADR 0006 keeps every id written in a part a transcript
  names, through the parts of earlier summaries, and stops when a part cannot
  be read. A conversation is kept only in a place made readable by its owner
  alone, and the place this session's transcript is in is noted
  before any summary runs.
- Whether the agent goes back to what was kept, rather than trusting the
  summary, is not promised here; #14 takes it up with measurements.
