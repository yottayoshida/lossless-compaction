# 0042. Transcripts are read a set at a time, and nothing read is kept

- Status: Accepted
- Date: 2026-10-07
- Amends [0006](0006-results-live-as-long-as-a-transcript-names-them.md) decisions 3 (one search per project
  directory) and 4 (a search whose output was cut stops the collection).

## Context

A clean-up reads every 64-hex string out of the transcripts under the recorded places (0006). It did so with one
`grep -r` per project directory, given five minutes (#118). A project directory only grows: a session's transcript
stays for Claude Code's `cleanupPeriodDays`, and one directory holds every session of a working directory. On one
machine on 2026-10-07, the largest was 3.26 GB of 4.31 GB; reading all of them took 131 s. A directory read more
slowly than that, or larger, reaches the five minutes, and from then on every clean-up stops there, each day, for
good. Claude Code also keeps only the first 4,194,304 bytes of what a command prints (2.1.291's declarations); a
directory whose ids passed that stopped every clean-up the same way.

## Decision

1. A project directory's transcripts are listed — every plain file whose name ends in `.jsonl`, in it and in the
   directories below, hidden ones too, none through a link — and read a set at a time: at most 400 files and
   256 MiB a search, about ten seconds where 4,116 MiB took 131 s. How large a directory grows no longer decides
   whether a search ends in its time; one transcript alone that takes more than five minutes to read still stops it.
2. What was read is as `grep -r --include=*.jsonl` read: measured with BSD grep 2.6.0, it does not read a file that
   is a link (the same file named directly is read), it goes into hidden directories, and `--include` matches a name
   that begins with a dot. So a name is taken by how it ends, not by a pattern that leaves such names out.
3. A search whose output Claude Code cut is read again in halves; one transcript alone whose ids are cut stops the
   collection (an id written about 64,000 times, at 65 bytes a line).
4. A search that cannot read every file (2) is read again once without the transcripts no longer listed in their
   directories — Claude Code removes old ones, and a collection takes minutes — and stops where any other is left.
   Whether one is gone is told by listing its directory again, not by asking whether the path exists: that asks the
   host about a path it may not resolve as listed (a name that is not UTF-8), and a network place may refuse it.
   Where its directory cannot be listed, the one above is: a session's directory removed with its transcripts is
   gone; one listed there that cannot be listed itself stops it.
5. Nothing of what was read is kept between collections: every collection reads every transcript.

## Alternatives considered

- **Keep, per transcript, its size, its time and the ids it held, and read only those that changed** (#118's own
  proposal, and its condition "a second clean-up with no transcript changed reads none"). Not taken (the owner's
  decision, 2026-10-07). Between weekly collections on the machine above, 2,101 of 3,577 transcripts, 1,829 of
  4,116 MiB, changed: it would read a little under half as much, in the background, where nothing waits on it. Its
  cost falls on the promise that matters: a file changed with its size and time left as they were (a copy that keeps
  times, `touch -d`) would have its old ids counted, and a result it now names could go; the record of every
  transcript's path would sit in the store; one file of it would pass the 4 MiB the host reads and writes at once.
- **One search per project directory with a longer time.** The host allows ten minutes at most, and a directory
  only grows: it moves the wall, and doubles what a stopped clean-up costs first.

## Consequences

- The wall of #118 is gone: no project directory stops a clean-up for its size. A transcript of about 9 GB on that
  machine, or one in which an id is written about 64,000 times, still stops it, and its line names it.
- A collection starts more searches: one a set, where a project of few transcripts is one as before.
- A transcript removed while a collection reads is passed over, not a stop. What only it named is counted as named
  by none, as it would be had it been removed a moment before.
- A clean-up still reads everything each week; on the machine above, 131 s in the background after a session starts.
- What is read is what Claude Code's `$.fs.list` lists, where `grep -r` read the directories itself. Its
  declarations name no limit to how many entries it lists; that was not measured past the 3,633 transcripts of the
  machine above. A transcript whose name is not UTF-8, which `grep -r` read by its bytes, is not found under the
  name the host lists, and stops a collection each time; Claude Code names none so.
