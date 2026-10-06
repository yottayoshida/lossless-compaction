# What "lossless" holds to

The plugin is called lossless for these eight promises, and for nothing
beyond them. Each names the tests that keep it. `test/mutate.ts` lists lines
of the code that a promise rests on and breaks them one at a time, and the
test named beside each has to fail: `npm run mutate` runs that, by hand, and
`test/invariants.test.ts` holds this page, the tests and that list together.
The lines are those of `src/`; the order things are done in by
`hooks/move-out.ts` is held by `test/hooks.test.ts`, which reads its text.

A change that makes one of these false is a breaking change, whatever the
version it is made in.

## The promises

**I1. A ticket stands only for what is stored.** A result, a long input, a
long message, or a run of old calls folded into a list is replaced only after
its text was written, read back and found equal. Where it cannot be written,
or does not read back as it was written, it stays in the conversation as it
was.

- `a result that does not read back as it was written stays in the conversation`
- `a result that cannot be stored stays in the conversation and is counted`
- `a value that cannot be stored stays in its call, as it was, and is counted`
- `the second round of a /compact by hand tries no middle the first tried: one that could not be written is counted once`
- `a run that cannot be stored stays where it stood, and is counted`
- `where a whole-file reading cannot be written, its run stays where it stood, as a result that cannot be written does, and is counted`

**I2. `recall` returns what was stored, or nothing.** A stored text is named
by its SHA-256, and `recall` computes that again before handing it over: text
that changed on disk is refused, not returned.

- `recall answers only to an id it stored, and only with text that still has that hash`

**I3. What is stored is not written over, nor written through a link.** A
text is written beside its place, read back, and moved into place, so that a
write the disk refuses or garbles leaves what an earlier write stored whole;
a link where a result would go is refused.

- `a part a broken disk stored other text for is not moved over what an earlier write had stored`
- `with a move into place, a refused write of the same text leaves what an earlier write had stored whole`
- `a link to nothing is refused too`

**I4. The clean-up removes nothing a conversation can still reach.** A result
goes to the trash only when its file is over a day old and neither a recorded
transcript nor a kept part names it, and is removed only after the trash has
held it over a week, still named by none. What is named and in the trash goes
back before the parts are read, so that a part there is read for what it
names; where one cannot be put back, the clean-up stops (I5).

- `a result over a day old that no transcript names goes to the trash; a young one and a named one stay`
- `the trash is aged by the day of its directory, not by the file: a move keeps a file old`
- `a collection keeps what a kept part names: its results, and the parts of an earlier summary and theirs`
- `a part named again while it is in the trash keeps what only it names: both go back before a collection counts what is named`

**I5. A clean-up that cannot tell what is named moves nothing.** A search of
the transcripts that ends with an error, is cut short, or does not print the
id it is known to hold; a place that cannot be listed; a project directory
that is a link; every recorded place gone; a kept part that cannot be read;
something named, by a transcript or by a part, that is in the trash and
cannot be put back; a conversation the plugin compacted with tickets that is
still there under its session id, whose own transcript does not hold the
newest ticket noted for it (ADR 0027): each stops the clean-up before
anything moves to the trash or is removed. A noted ticket whose conversation
is no longer there lets go of it.

- `the ids in transcripts are read per project; a place that is gone is dropped, one that cannot be read stops it all`
- `a place that is there but cannot be looked at or listed stops it all: its conversations may still be resumed`
- `a project directory that is a link stops it all: a search does not follow it`
- `with every recorded place gone, nothing is collected: an empty set would name nothing in use`
- `a collection stops when a kept part it is to follow cannot be read`
- `where what is named cannot be put back from the trash, the collection is stopped before it counts what is named`
- `a clean-up stops where a conversation compacted with tickets is still there and the search does not find the ticket noted for it: renamed, compressed, spelled otherwise, or moved inside its directory (ADR 0027)`
- `with a witness noted, a transcript renamed keeps every result; with the conversation gone, the clean-up goes on as before (ADR 0027)`
- `a conversation written otherwise from its start, or from some point on, stops the clean-up too: its newest ticket is its witness, wherever it was written (ADR 0027)`
- `the witness of a compaction is a ticket it put in, where it put any, before what stays behind a cut; at a start the one noted stays while the conversation shows it (ADR 0027)`

**I6. What a cut takes out is kept first, and a summary does not run on a
refused write.** The messages a cut takes out are kept in parts before they
leave, and nothing is cut where one part cannot be written. A conversation
is said to be kept before Claude Code's summary only when every part of what
is kept of it was written; and where the disk refuses the write and nothing
is kept, the summary of the main conversation does not run (a subagent's
runs all the same, with nothing kept, ADR 0026).

- `a part that cannot be written keeps nothing`
- `when a refused write leaves nothing kept, the summary does not run and the compaction says why`
- `for a subagent's conversation a refused write is said and the summary runs all the same: no one can compact it again once room is made (ADR 0026)`
- `when a part cannot be written nothing is cut`

**I7. What went to the trash while still in use comes back when it is asked
for.** `recall`, `find` and a compaction put back from the trash what the
conversation names, and what the kept parts among it name, before reading
it.

- `recall puts back from the trash what it is asked for, even a result whose move stopped halfway`
- `a kept part the conversation names comes back from the trash, and with it what only that part names, through earlier parts (#73)`

**I8. A conversation holding what a rebuilt message cannot carry is not
rebuilt.** Where a conversation holds a block of a kind the plugin does not
know, an image or a document outside a tool result, or as many messages as
Claude Code shows a plugin at most, the plugin moves nothing out of it.

- `a conversation is rebuilt only when every block in it is of a kind a rebuilt message carries`
- `a conversation of as many messages as the host shows at most is not rebuilt: older ones may be missing`

## What is not promised

- **That the agent sees it.** What is moved out can be had back exact; it is
  not in front of the model until the agent calls `recall`
  ([what an agent does not fetch](limits.md#what-an-agent-does-not-fetch)).
- **Thinking.** A rebuilt message carries no thinking, so the thinking of
  the messages a compaction rebuilds is gone after it, and no part holds it.
  Nor is the order of blocks inside a turn promised: calls made side by side
  are regrouped with their results.
- **That Claude Code's summary never runs with nothing kept.** It does in a
  subagent's conversation where the disk refuses the write; where there is
  no place of your own to keep it in; where a part does not read back as
  written, or a link stands in its place;
  where keeping it fails on an error the plugin did not expect; and where
  the plugin's compaction failed and the second Claude Code then gives its
  handler was not enough to keep it in, which a compaction that outran its
  own time makes likelier. The compaction says so each time: why nothing
  was kept, or, past that second, that it stopped. A compaction that
  throws, or answers what Claude Code refuses, keeps the conversation
  before the summary runs
  ([when it fails](limits.md#when-the-built-in-compaction-runs-instead)).
  What is kept before a summary leaves out images, documents and
  thinking, and messages older than the 4096 Claude Code shows
  ([what a summary replaces](limits.md#what-a-summary-replaces)).
- **Half of a character.** A lone surrogate, which no file can hold, is kept
  as U+FFFD in a kept part, and keeps a result from being moved out at all.
- **A crash of the machine.** The host gives a plugin no way to force a write
  to the disk; what is promised is what reads back.
- **Transcripts the clean-up does not know of.** It counts those in the
  places recorded at a compaction. One copied from another machine, one of a
  configuration that has not compacted, one that is a link inside a project
  directory, and those on a disk not mounted at the time are not counted, and
  what only they name goes to the trash; from there it comes back within the
  week, and is gone after it
  ([how long results are kept](limits.md#how-long-results-are-kept)).
- **A result written again within its first day of a new use.** The day is
  counted from the file's time, which storing the same text again does not
  change: such a result can go to the trash before a transcript names it, and
  comes back when it is asked for (I7).
- **That putting back from the trash succeeds.** Where the move back fails,
  `recall` and `find` answer that nothing is stored under the id, and say so;
  the result stays in the trash for the week, and a clean-up does not remove
  it while it is named (I5).
- **The id as it was typed.** An id copied wrong is taken for the one id the
  conversation names that shares the most characters with it from the first,
  8 or more, where no other shares as many, and that one's text is returned;
  one still refused names up to five tickets of the conversation it may
  stand for
  ([what is not taken](limits.md#what-an-agent-does-not-fetch)).
- **A move into place where none can be started** (Windows): a text is then
  written in place, and a refused write can cut short what another write
  stored at the same moment ([the files](limits.md#the-files)).
- **Other users and other processes of yours.** The directory is closed to
  its owner; what your own processes do in it is outside these promises.
