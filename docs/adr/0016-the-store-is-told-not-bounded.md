# 0016. The store is told, not bounded

- Status: Accepted
- Date: 2026-10-03
- Follows [0008](0008-no-limit-and-nothing-lost-to-a-failed-write.md): there
  is still no limit; what is kept is now said.

## Context

The plugin keeps every result it moves out, and every conversation it keeps
before a summary, as plain files under one directory. 0006 removes what no
conversation Claude Code can resume names, and 0008 set no limit on what is
kept, since a limit would make the plugin lose what it promised to keep.

Nothing tells someone how large that directory is or whether the clean-up
works (#42). Measured on 2026-10-03 on one machine (`docs/measurements.md`):
21.0 MB in 1,760 results after five days, up to 9.8 MB a day; the clean-up
had never run, its first week not being over; reading the transcripts as
the clean-up does took 104 s for 3.5 GB, 75 s in the largest project
directory, where a search is given up after five minutes. A clean-up that
stops says why once, on the screen of the session it stopped in, in words
that name directories of other repositories; its record (`gc.json`) holds
when one was tried and when one ended, and is written over at every try.

## Decision

- A slash command says how much is kept, by what it was kept from, in the
  trash and left in `tmp/`, and when the clean-up last ended and last tried,
  how often it has been tried since and when and how it last stopped. Its answer
  is the command's output, not text the model writes, and it is not a tool,
  so it is not among the tools the agent is offered. It counts from
  what the host lists of the directories, with sizes and times, from the
  index entries (`{bytes, tool}`), and from `gc.json` and `roots/`, in every
  place results are read from. It reads no stored result, and names no path
  but the places results are kept in. (Amended by #117: `/lossless-store
  check` reads each stored text to hash it, shows none of it, and names
  each id whose files are not whole, with what that does, by the first 16
  characters of the id.)
- The clean-up counts its tries since the last one that ended, and a try
  that stops records the kind of stop, from a closed list, and when. A try
  that a short session cut off is counted. No path and no text a command
  printed is recorded: what stops a clean-up returns its kind beside its
  words. An end clears both. Failing to write them changes nothing else.
- No limit, no threshold and no command that deletes are added. A line at
  the start of a session when the clean-up has not ended for long is a
  separate decision, taken with its own change.

## Alternatives Considered

- **A tool the agent calls.** Its definition would be in every request; its
  answer would be in the conversation the model reads, and with a key, in
  excerpts, sent to the provider `find` asks; and it would change the tools
  the agent is offered, which #38 measures.
- **Recording why a clean-up stopped as it is said.** The words name
  directories of other repositories.
- **Counting stops.** A try a short session cut off never says it stopped.
  Tries since the last end, and how the last one stopped, can be said of
  every try.
- **Telling the kind from the words.** A change of wording would drop it to
  "other" without a sign.
- **A limit, a warning threshold, an eviction.** A limit loses what a
  conversation still names (0008); a threshold needs a figure no
  measurement gives yet. To be taken up, if at all, from what the command
  shows.
- **Counting images apart.** The index holds `{bytes, tool}` only; telling
  them apart means reading the start of every result.

## Consequences

- Someone who asks sees the store. Someone who does not is told at the start
  of a session when no clean-up has ended for 14 days (added with #42's
  second change): since the last that ended, the first place recorded, or
  the oldest result, whichever there is first. It is said whether that
  session then tries or not — "not since" is true when it is said — and
  once a process. Fourteen days is two of the clean-up's weeks, so that one
  missed is not said; it is not a threshold on how much is kept, which the
  alternatives above set aside.
- The command's answer stays in the conversation as any command's output
  does, and the model reads it with the next request (measured). It holds
  the places results are read from, counts, times and a kind of stop.
