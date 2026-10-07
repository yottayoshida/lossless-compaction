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
- `an entry that does not read back as it was written is not relied on, and the result stays where it is: no ticket for what recall cannot find (I1)`
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
goes to the trash only when its file is over a day old — storing the same
text again renews its time — and neither a recorded transcript nor a kept
part names it, and is removed only after the trash has held it over a week,
still named by none. What is named and in the trash goes back before the
parts are read, so that a part there is read for what it names; where one
cannot be put back, the clean-up stops (I5). A copy the trash holds of what
is in place is removed only from a day two or more days past, which no
clean-up is still moving into: clean-ups that run at once remove nothing one
of them names (ADR 0038).

- `a result over a day old that no transcript names goes to the trash; a young one and a named one stay`
- `the trash is aged by the day of its directory, not by the file: a move keeps a file old`
- `a collection keeps what a kept part names: its results, and the parts of an earlier summary and theirs`
- `a part named again while it is in the trash keeps what only it names: both go back before a collection counts what is named`
- `clean-ups at once, one that names a result and others that do not, leave it to recall: a copy in the trash goes only from a day none still moves into (ADR 0038)`
- `a text stored again has its time renewed, so a clean-up within a day of the new use does not move it; where no command starts it is not`

**I5. A clean-up that cannot tell what is named moves nothing.** A search of
the transcripts that ends with an error, is cut short, or does not print the
id it is known to hold; a place that cannot be listed, or that is a link
whose end cannot be told; a project directory that is a link; every recorded
place gone; a kept part that cannot be read; a trash that is there and cannot
be listed; something named, by a transcript or by a part, that is in the
trash and cannot be put back; a conversation the plugin compacted with tickets that is
still there under its session id, whose own transcript does not hold the
newest ticket noted for it (ADR 0027); a store marked by a session of
another machine whose transcript this one cannot read, or whose marks
cannot be listed (ADR 0032): each stops the clean-up before anything moves
to the trash or is removed. A noted ticket whose conversation is no longer
there lets go of it. A stop by what it follows — a kept part, or something named
in the trash — names every one it reaches in that try, with why, and
`/lossless-store` says how the clean-up goes on for each (#114). An entry
that does not read, over a text that is the one stored under its id, does
not stop it: the text is read as a part's, which keeps more, never less
(ADR 0033). Nor does a recorded place that is itself a link: it is read
where it leads (ADR 0039).

- `the ids in transcripts are read per project; a place that is gone is dropped, one that cannot be read stops it all`
- `a trash that is there and cannot be listed stops a collection before anything moves; one not made yet is an empty one`
- `a recorded place that is there and leads nowhere the host can tell stops it all`
- `a recorded place that is a link is read where it leads, once where it is recorded both ways, and a clean-up keeps what only its transcripts name (ADR 0039)`
- `a place that is there but cannot be looked at or listed stops it all: its conversations may still be resumed`
- `a project directory that is a link stops it all: a search does not follow it`
- `with every recorded place gone, nothing is collected: an empty set would name nothing in use`
- `a collection stops when a kept part it is to follow cannot be read`
- `a clean-up stopped by what it follows names each of them and why, in one try: a text not there, one changed; an entry of another shape over a sound text is read (#114, ADR 0033)`
- `a kept part whose entry does not read, its text the one stored, is read as a part: what it names comes back from the trash and is counted as named (ADR 0033)`
- `a stop by what the clean-up follows is recorded with each id and why, read back as such, and /lossless-store says how to go on for each (#114)`
- `where what is named cannot be put back from the trash, the collection is stopped before it counts what is named`
- `a clean-up stops where a conversation compacted with tickets is still there and the search does not find the ticket noted for it: renamed, compressed, spelled otherwise, or moved inside its directory (ADR 0027)`
- `with a witness noted, a transcript renamed keeps every result; with the conversation gone, the clean-up goes on as before (ADR 0027)`
- `a conversation written otherwise from its start, or from some point on, stops the clean-up too: its newest ticket is its witness, wherever it was written (ADR 0027)`
- `the witness of a compaction is a ticket it put in, where it put any, before what stays behind a cut; at a start the one noted stays while the conversation shows it (ADR 0027)`
- `a mark none of whose sessions has a transcript here keeps a clean-up from running; this session's, and a container's made again over the same transcripts, do not (ADR 0032)`
- `a machine's id is made once and read after; two sessions making it together keep one, whichever linked first (ADR 0032)`

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
Claude Code shows a plugin at most, the plugin moves nothing out of it. One
is cut for its length well before that, where a compaction comes in time
([limits](limits.md#when-the-conversation-is-too-long), ADR 0034).

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
- **A reminder Claude Code sends as a turn of its own.** What it attaches to
  a message as it sends it is kept at a compaction that rebuilds the
  conversation (#105); one it sends as a system turn is in no message, and
  nothing of it is kept. Nor is the place in a message of what was attached
  kept: it stands apart, under a heading naming the message it came with
  as near as the conversation as sent tells it.
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
- **A crash of the machine.** The plugin does not ask the disk to keep what
  it writes: what is promised is what reads back. It could start `sync`,
  which returned in about 50 ms after a compaction's writes and does not
  have the drive write out its own cache; whether that would keep anything
  through a power cut was not measured ([measurements](measurements.md#what-one-sync-costs-after-a-compactions-writes)).
- **Transcripts the clean-up does not know of.** It counts those in the
  places recorded at a compaction. One copied from another machine, one of a
  configuration that has not compacted, one that is a link inside a project
  directory, and those on a disk not mounted at the time are not counted, and
  what only they name goes to the trash; from there it comes back within the
  week, and is gone after it
  ([how long results are kept](limits.md#how-long-results-are-kept)).
- **A machine that has not marked the store.** A session marks a store at
  its start and at each compaction, from this version on, by its machine's id
  or, with none, by its own. A machine that runs an earlier version, or has
  not started a session since, leaves no mark: until it does, a clean-up on
  another machine moves what only its transcripts name, as before. Two
  machines that hold one id, copied with a home directory, mark the store as
  one, and are not told apart; nor is a machine one of whose latest sessions'
  transcripts was copied here, which is taken for this one (ADR 0032).
- **A collection that takes more than a day.** A copy in the trash is
  removed only from a day no clean-up is still moving into, counted from the
  time a collection is handed, after its search. One that spends more than a
  day from then to its last move — a machine asleep in the middle of it —
  can meet another clean-up's removal (ADR 0038).
- **A result written again whose time is not renewed.** Storing the same
  text again renews its file's time with `touch`. Where no command can be
  started (Windows), where `touch` fails, and for a clean-up that listed the
  results before it ran, the day is counted from the time it was first
  stored: such a result can go to the trash before a transcript names it, and
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
