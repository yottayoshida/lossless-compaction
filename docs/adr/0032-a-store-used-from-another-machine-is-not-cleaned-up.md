# 0032. A store used from another machine is not cleaned up

- Status: Accepted
- Date: 2026-10-06
- Adds to [0006](0006-results-live-as-long-as-a-transcript-names-them.md):
  the transcripts a clean-up reads are this machine's

## Context

A clean-up keeps the results the transcripts in the recorded places name,
and moves the rest to the trash. The record of a place is its path alone
(`roots/`). Where one store is used from two machines — `storeDir` on a
synced folder or a network drive, or `~/.claude` synced with its
transcripts left out — the same path on each machine holds that machine's
transcripts only. A clean-up on one moves to the trash, and a week later
removes, what only the other's conversations name; resumed there, they find
their results gone, and nothing says why (#113).

The plugin cannot read the other machine's transcripts. What it can tell is
whether a session that used the store left a transcript this machine reads.

## Decision

1. Each session marks the store, in `machines/<name>.json`, with the ids of
   its machine's latest three sessions and when the machine first and last
   marked it. It does so at its start, once the store is made private, and
   at each compaction, before anything is kept.
2. The name is the machine's id, 32 random hexadecimal characters made the
   first time it is needed and kept in
   `~/.local/state/lossless-compaction/machine.json`: under the home directory,
   read as the store's default place is read, a repository's settings not
   deciding it. Not under `~/.claude`, which some synchronise with the
   transcripts left out; not under `XDG_STATE_HOME`, which a terminal and an
   application started otherwise may see differently. It is made by writing
   a file beside it and linking it into place with `ln`, which fails where a
   file is there, then reading back what is there: two sessions starting
   together keep one id. Where no id can be kept there, the mark is named by
   the session, so that the machine is still seen by the others.
3. A clean-up, once its try is noted and before the sentinel, the witnesses
   or anything else of this machine's transcripts, reads the marks in every
   place results are read from, and looks for each mark's sessions as
   `<session>.jsonl` in the project directories of the places transcripts are
   recorded in. It takes off the marks of other names any of whose sessions
   it finds: a container made again over the same transcripts, a session's
   own mark where no id could be kept. Of the marks left, one that is not
   this machine's own name, none of whose sessions is the session at hand or
   is found there, stops it (`shared`); so do marks, or such a place, that
   cannot be listed. Nothing moves.
4. `/lossless-store` lists the marks, this machine's first, and says whose
   transcripts are not read here. A mark is taken off by removing its file.

## Alternatives considered

- Stopping on any mark of another id: a container made again over the same
  transcripts, a devcontainer that keeps `~/.claude`, has a new id each
  time, and would stop on its own earlier self; and a machine that cannot
  keep an id would leave no mark.
- Telling machines apart by host name: many share the default one.
- Recording the machine with each place in `roots/`: a record written before
  this version names no machine, and how the first clean-up after would
  treat it decides whether it removes what it should keep.
- Taking a mark off once it has not been renewed for some weeks: the time
  would be the time after which the protection lapses on its own.
- Saying in the documentation that a store is not to be shared, and nothing
  else: results would still go without a word.

## Consequences

- A store shared between machines keeps everything, and its clean-up stays
  stopped until the marks of those that no longer use it are removed; the
  line at the start of a session says so after 14 days.
- A machine that runs an earlier version leaves no mark. Third-party
  marketplaces do not update on their own, so until every machine runs this
  version, one that cleans up can move what only another names, as before.
- A container made again over the same transcripts reads its earlier self's
  sessions, and its old mark is taken off at the clean-up while their
  transcripts last; where Claude Code removed them first, the mark stops the
  clean-up until removed by hand. A container over other transcripts is
  another machine.
- Two machines holding one id, copied with a home directory, mark the store
  as one, and are not told apart.
- A machine that cannot keep an id writes a mark for each session, taken off
  at the clean-up like a container's.
- A machine one of whose latest sessions' transcripts was copied here is
  taken for this machine, and its mark taken off: what only its other
  conversations name can go.
- The plugin writes outside the store and Claude Code's directory for the
  first time, one small file; PRIVACY.md names it.
