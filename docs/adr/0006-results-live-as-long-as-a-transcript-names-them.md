# 0006. Results live as long as a transcript names them

- Status: Accepted
- Date: 2026-10-01

## Context

Up to 0.4.0 a moved-out result was kept forever. On the machine this was
measured on, two days of use left 157 files, 4.9 MB, and the store would only
grow. A result may only go once no conversation that Claude Code can resume
holds its ticket: `/resume` returns to an older conversation, `--fork-session`
starts a new session id from it, and a rewind goes back within one. A
conversation compacted by an earlier version holds tickets this version never
recorded.

Measured on Claude Code 2.1.286 (`claude -p`):

- `--resume` keeps the session id; `--fork-session` gives a new one, and the
  forked transcript holds the parent's ids (the line around them was written
  differently, the ids were the same).
- A conversation this plugin compacted is written to its transcript with the
  tickets in it: 114 transcript files held them.
- `classic.SessionStart` never reached the plugin, in a new, a resumed or a
  forked session. `$.session.id()` is the transcript file's name.
- After a hook returns, its `$` still works for a task it started.
- Reading every 64-hex string out of 2.9 GB of transcripts with one
  `grep -rahoE` took 81 s and printed 16,113 lines (1 MB, 1,836 distinct).
  The same search with the 5,000 candidate ids as fixed strings
  (`grep -F -f`) had not finished after ten minutes.
- Counted that way, 154 of the 157 files were named by some transcript;
  counted by the ticket's own wording, 54 were.

## Decision

1. The transcripts are the list of what is in use. Claude Code keeps them,
   removes them when a conversation can no longer be resumed, and they
   already hold every id of a fork, a rewound branch and an earlier version.
   The plugin keeps no list of its own. (Added to by ADR 0027: one ticket per
   compacted conversation is noted, so that a search that no longer reads a
   conversation as it is written stops the clean-up.)
2. Where transcripts are is recorded at a compaction, one file per place
   under the store's `roots/`, written once and never rewritten, so that
   sessions writing at once lose nothing and every configuration sharing a
   `storeDir` sees the others' places. A place is recorded only when a
   directory under `<config>/projects/` holds this session's transcript, and
   only from variables no repository set (ADR 0005).
3. At most once a week, after a session starts, without holding it up, every
   64-hex string in the recorded places is read, one search per project
   directory. A result over a day old (by the time its file was written, not
   last used) that none of them names moves to `trash/<day>/`, its entry
   first. A result the trash has held over seven days by its directory's day
   — a move keeps a file's own time — and still named by none is removed;
   one named again goes back. Nothing is collected for a week after the
   first place is recorded.
4. `recall`, `find` and a compaction put back from the trash what they are
   about to read. A collection that cannot read every recorded place to the
   end stops before anything moves, and says why: a place that is there but
   cannot be looked at, a project directory that is a link, all places gone,
   a search whose output was cut, or one that did not print the id of a file
   of the plugin's own that every search also reads (a grep ended by a
   signal exits 1, as one that found nothing does). Only a place that is not
   there is skipped. What a collection reports is counted on disk afterwards;
   one stopped while moving leaves what it moved in the trash, to be put
   back. One cut off before its end is tried again a day later.
5. The commands (`grep`, `mkdir`, `mv`, `rm`) are run by absolute path, from
   `/usr/bin` or `/bin`, with `--` before every path.

## Alternatives considered

- **A manifest per session** (`sessions/<id>/…`, the shape issue #9 drew).
  A fork would have needed `classic.SessionStart` to record it, which never
  arrives; a read-modify-write of a session's list loses ids when two
  writers meet; the list at session start covers only the newest 4096
  messages; and transcripts already hold all of it.
- **Keep the newest state only.** A resume, a fork or a rewind reaches an
  older one.
- **Searching for the candidate ids as fixed strings.** Under ten minutes was
  not reached.
- **Running daily.** The search reads every transcript; a week is enough for
  a store that grew 4.9 MB in two days.
- **Removing at once, no trash.** A collection and a session reusing an old
  result at the same moment could leave a ticket with nothing behind it; the
  trash, and putting back before reading, make that recoverable.
- **The plugin's own key-value store for the state.** It lives under one
  Claude Code configuration; two sharing a `storeDir` would each collect
  without the other's places.

## Consequences

- The first collection on a machine with results from before this version
  trashes those no transcript names (3 of 157 here), a week after the first
  compaction records a place, and removes them a week later.
- A transcript outside every recorded place is not counted: one copied from
  another machine, or of a configuration that shares a `storeDir` and has not
  compacted since. Resuming it can find a result gone.
- Any 64-hex string in a transcript keeps a result, a hash that only looks
  like an id as well: more is kept, never less.
- A guard placed in `PATH` (a shim) does not see the commands, which act only
  on files under the store's `blobs/`, `index/` and `trash/`.
- Once a week, a session reads every transcript in the background, for about
  a minute and a half per 3 GB.
