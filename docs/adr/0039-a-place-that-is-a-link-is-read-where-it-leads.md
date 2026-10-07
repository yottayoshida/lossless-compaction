# 0039. A place that is a link is read where it leads

- Status: Accepted
- Date: 2026-10-07
- Adds to [0006](0006-results-live-as-long-as-a-transcript-names-them.md) decision 1 (what
  a transcript names is kept).

## Context

A compaction records where its session's transcript is kept,
`<config>/projects`, as a path in `roots/`, and a clean-up reads the
transcripts under each recorded place. A recorded place that was itself a
link stopped every clean-up: Claude Code's `$.fs.stat` follows the link and
answers a directory, and says the path is a link, and the clean-up stopped
on any place that is a link, saying "is not a directory" (#119). Moving
`~/.claude/projects` to another disk and linking it back left a store that
was never cleaned up, from the first clean-up on, with only the line at the
start of a session to say so after two weeks.

Why a place that is a link stopped it is not on record; the stop was in the
first clean-up. The search is handed each project directory under the
place, `<place>/<project>`, which the system resolves through the link
whatever the search does with links it meets, so it reads all of them. A
project directory that is a link is another matter: the search does not
follow a link it meets inside what it reads, and that one still stops it.

Claude Code tells where a path lands, every link followed:
`$.fs.stat(path, { resolve: true })` answers `realPath` (2.1.277 and later
have it), absent where the path leads nowhere.

## Decision

1. A clean-up reads a recorded place where it lands then: it looks at it,
   takes a link to a directory for one, and lists and searches where it
   leads. Places that land in the same directory are read once. The places
   it hands on, to look for noted tickets (ADR 0027), are where they land.
2. A compaction records `<config>/projects` as it is named, a link
   included, and looks for its session's transcript where it lands. So a
   link turned to another place is followed at the next clean-up.
3. A recorded place that is not there is skipped, as before; one that is
   there and whose end the host cannot tell stops the collection.

## Alternatives considered

- Recording where the place lands (what #119 asked). A place recorded under
  the link by an earlier version would go on stopping every clean-up, since
  records are never rewritten; and a link turned to another place would not
  be followed until a compaction there recorded it, while what only its
  conversations name went to the trash.
- Leaving the stop and saying how to replace the link. It leaves the plugin
  never cleaning up for whoever keeps their projects on another disk.

## Consequences

- A link turned to another directory is read where it leads then: the
  conversations of the first are no longer read, as where transcripts are
  moved out of the recorded places, and what only they name goes to the
  trash and, a week later, is removed.
- A link that leads nowhere is not read. The check of other machines' marks
  (ADR 0032), which runs before, cannot read it and stops the clean-up; were
  it not to, the place would be skipped where Claude Code answers that it is
  not there, and stop the clean-up where it answers that it is there and
  cannot tell where it leads.
- A link to a mount point of a disk not mounted at the time can lead to an
  empty directory: that place is read as one holding no conversation, as a
  place on a disk not mounted looks gone (docs/limits.md).
