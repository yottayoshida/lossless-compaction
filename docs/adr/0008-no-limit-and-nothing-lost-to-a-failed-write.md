# 0008. No limit on what is kept, and nothing lost to a failed write

- Status: Accepted
- Date: 2026-10-01

## Context

Issue #12 asked for a bound on how much the store keeps. On the machine
this was measured on, two days of use left 157 files, 4.9 MB (before ADR
0007, which keeps the whole conversation at every summary). The clean-up
of ADR 0006 keeps only what a conversation Claude Code can resume names,
so how much is kept follows how long Claude Code keeps transcripts; the
trash is on the same disk, and space comes back only when it is emptied,
up to about fifteen days later.

A bound would stop the plugin at a size: past it nothing could be moved
out, the conversation would go to Claude Code's summary, and keeping it
first (ADR 0007) would stop at the same bound. A compaction that cannot be
undone, set off on purpose. A full disk does the same at a size no one set.

Measured on a 2 MB disk image (Claude Code 2.1.286): a `$.fs.write` that
fails throws `<plugin>: $.fs.write(<path>) failed: ENOSPC`; a new file it
fails on is left at 0 bytes; and a file already there is cut short and
partly overwritten (100,000 characters became 1,949,696 others). Two writes
of the same text, one of them failing, could so destroy a stored result
whose ticket had already been handed out. With the disk full, nothing could
be kept, and Claude Code's summary ran anyway.

## Decision

1. No bound on what is kept, by default or by setting.
2. Stored results and their entries are written to `tmp/` first, read back,
   and moved into place with `mv`, so the file at a result's name is always
   whole. Where `mv` cannot be started (Windows), they are written in place
   as before.
3. When a failed write leaves nothing kept before Claude Code's summary,
   the summary does not run: the compaction is skipped with the reason the
   system gave, and the conversation stays as it is until there is room.
   (Amended by ADR 0026: in a subagent's conversation the summary runs all
   the same, with nothing kept, and that is said; no one can compact a
   subagent again once room is made.)
4. A record of where transcripts are, or an entry, that does not read as
   JSON is written again rather than taken as done.

## Alternatives Considered

- A bound set by the user, or one by default: a compaction that cannot be
  undone at the bound.
- Running the summary when nothing could be kept, and saying it cannot be
  undone: the work goes on, the conversation is lost.
- Not writing the same text twice within one compaction: two sessions
  writing it at once, one failing, still destroy it.
- Measuring free space before writing: the host offers no way to.

## Consequences

- On a full disk, compaction waits for space; a conversation that reaches
  its limit cannot go on until space is freed.
- Each stored file costs one `mv` more; the time is measured with the
  change.
- On a host without `mv`, a failed write can still overwrite a stored
  result written at the same moment.
- A part of a kept conversation that failed halfway stays until the
  clean-up; a temporary file a crashed process left in `tmp/` stays until
  removed by hand. (Amended by #119: a clean-up that runs to its end removes
  one a day old or more, by the name a write gives it.)
