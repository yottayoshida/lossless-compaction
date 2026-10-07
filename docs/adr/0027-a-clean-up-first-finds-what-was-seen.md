# 0027. A clean-up first finds what was seen

- Status: Accepted
- Date: 2026-10-06
- Adds to [0006](0006-results-live-as-long-as-a-transcript-names-them.md) decision 1 (what
  a transcript names is kept).

## Context

A clean-up keeps what the transcripts under `<config>/projects/` name and
moves the rest to the trash, removing it a week later (ADR 0006). It reads
them with `grep`: every 64-character lowercase hexadecimal string in a
file named `*.jsonl`. A sentinel file holding one known id tells a search
that did not reach its end. Nothing told the search that reads every
file to the end and finds no ticket, because Claude Code writes its
transcripts otherwise: compressed, renamed, with ids spelled another way, or
inside the directory it keeps beside each (#100). Every result only those
conversations name would go to the trash and be removed two weeks later,
with nothing said.

Counted on one machine: 1,723 transcripts, each `<session>.jsonl` beside a
directory `<session>/` holding `subagents/`, `tool-results/` or `workflows/`;
one directory with no transcript beside it, holding `workflows/` alone; no
other file named after a session. After every compaction by the plugin, the
transcript held the new tickets' ids; after a built-in summary it held none.

## Decision

1. At each compaction of the main conversation, the plugin notes in
   `witness/<hash of the session id>.json` the newest ticket of the
   conversation it hands back, else of the one it was handed, that the store
   holds; with the session id and the time. Newest is one this compaction put
   in, where it put any, before the place in the conversation: a cut puts its
   parts' tickets in front of what stays. When a session starts with tickets
   in its conversation, it notes the newest of that, unless the one noted
   before is still in it. It is written under `tmp/` and moved into place, so
   that a clean-up reading it meanwhile reads it whole. A ticket of any kind: the one most lately written is the one that
   tells a transcript written otherwise from some point on. It is not looked
   for on disk: a transcript written otherwise from its start has none to be
   found in, and that is what is to be told.
2. A clean-up, once its search has read the transcripts and before anything
   goes back from the trash or moves to it, looks for each noted ticket in its
   conversation's own transcript, `<session>.jsonl`, under the places
   recorded, with `grep -F -q`: not in what the search read, where a copy in a
   subagent's or another conversation's transcript would pass it. Written
   there, it passes. Not written there; no such file but another beginning with
   the session id, or anything in its directory but `subagents/`,
   `tool-results/`, `workflows/` and hidden files; a place that cannot be
   listed, or no grep that can be run: the clean-up stops (kind `unread`, or
   `place`). Nothing of the conversation there, the noted ticket is removed:
   the conversation is gone, removed or past `cleanupPeriodDays`.
3. A noted ticket that does not read as one is removed, and stops nothing.
   A subagent's compaction notes nothing: its tickets are named in the
   session's own.

## Alternatives considered

- **The ticket a compaction puts in, looked for by the words of a ticket
  where its id is not found.** A transcript whose ids are spelled otherwise
  still holds the words: taken for a write that was not made, its results
  would go, as before. A transcript with no write of the compaction's would
  hold neither, and stop every clean-up until it is gone.
- **Only a ticket seen on disk, looked for in what the search read.** Tried
  first: a conversation written otherwise from its start never had one, its
  results went as before; a subagent's transcript holds copies of the main
  conversation's tickets, and passed a conversation whose own transcript the
  search no longer read; and a ticket written otherwise from some point on was
  passed over for an older one written as before.
- **The time a transcript was last written, against the time a ticket was
  noted.** A conversation that goes on after a write Claude Code could not
  make is written later still, and would stop every clean-up.
- **Noted tickets for a week only.** A transcript converted later than that
  would not be told.
- **Reading every file, not `*.jsonl` alone.** A compressed file or an id
  spelled otherwise would still not be read as an id.

## Consequences

- One small file per conversation compacted with tickets, holding its
  session id: named in `PRIVACY.md`, and gone at the clean-up after nothing
  of its conversation is left.
- A grep of one transcript per noted ticket at each clean-up, stopped at its
  first match.
- A ticket shown but never written to the transcript — a write Claude Code
  could not make — stops clean-ups until the conversation is resumed or
  compacted again, or its transcript is gone. Nothing is lost while they
  stop, and a session says so after 14 days.
- Not told apart from a conversation removed: transcripts moved whole out of
  the places recorded, or kept under names without the session id. A
  conversation compacted before this version has none noted until it is
  resumed or compacted again (`docs/limits.md`).
- A folder Claude Code comes to keep beside a transcript stops clean-ups
  until it is named here and in the code: kept, not lost.
