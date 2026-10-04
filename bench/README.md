# The benchmark

Compares the plugin's compaction with Claude Code's own on the same
conversations, asked the same questions afterwards. What it measured is in
[`docs/measurements.md`](../docs/measurements.md); this file is how it is
done and what it takes to do it again.

It is not run in CI: it needs Claude Code 2.1.287 or later, signed in, with
mods not turned off (`docs/limits.md`), and every session uses that account's
quota.

What a run measured is in `results/<date>/`: each unit with its answers
(`units/`), the grades (`grades.json`), what `find` picked (`picks.json`),
and every table (`report.md`). `publish` writes them from the box, with the
box's path and the home directory above it written `<box>` and `<home>`
wherever an answer names them, in the form of a path or in the dashed form
Claude Code files its records under. A user's name on its own is not
replaced: search what was written for it before it goes anywhere. `report --from results/<date>` makes the
tables again from what was published, and a test holds `report.md` to that.

`results/2026-10-02-changed/` holds the plugin's arm alone, measured with a
checkout that names, after a summary, the files that changed on disk since
they were read (#14): the five conversations that go to the summary, set
against the plugin's arm of `results/2026-10-02/`. Where every unit that
asked questions is of one variant other than the default, the tables are
of that variant and say so.

`results/2026-10-02-estimate/` holds probes alone (see "A unit"): the size
the plugin counts, with the count of ADR 0013 and with 0.6.0, set against
what was in use afterwards. `publish --variants a,b` writes only the units of
those variants out of a box that holds more.

`results/2026-10-02-v0.6.1/` is the whole benchmark run again on 0.6.1, of
conversations built again from the same traces. `bases/` there names each
building by its size and the SHA-256 of its record; the conversations
themselves are published once, in `bases/` here.

`results/2026-10-03/` is the plugin's arm measured again with a `/compact`
left undone where there is nothing to move out and room left (ADR 0015), on
those same conversations, beside the built-in arm of
`results/2026-10-02-v0.6.1/` as it was measured there; and probes of the
four conversations it leaves undone with `maxAfterPercent` at 1, where each
was handed to the summary, as the plugin did then: since ADR 0019 the oldest
messages of such a conversation are kept in place of a summary.

## What is fixed before anything is compared

- **The traces** (`traces.ts`): six made-up conversations of different
  shapes. Each is built by saying its steps, in order, to one session working
  on files `fixtures.ts` computes. The conversations as they were built are
  in `bases/`: what was said, the calls and their results, with the working
  directory's path taken out. Claude Code's own record of a session holds
  the account it ran under and is not published; its SHA-256 is.
  Two more, `mixed` and `japanese`, are built the same way and asked
  nothing: they are there to be compacted and probed, as conversations in
  which what stays and what leaves come to different tokens a character
  (pasted English prose with logs that can leave; Japanese with logs that
  can leave, and some thinking). They are no part of the questions, the
  grading or the comparison of the two arms.
  One more, `large`, is the shape of `results` in a window of 1,000,000
  tokens: thirty-two logs read, about 575,000 tokens. It is asked the nine
  questions and two about logs deleted before the compaction, one read
  early and one read last, and is run by name only: it costs more than the
  six together.
- **The questions, their answers and how each is graded**
  (`questions.json`, which is `traces.ts` written out; a test holds the two
  together). Nine per trace:
  - exact text of something no file of the work holds any more (two): a
    script was run once and is removed before the compaction;
  - exact text of a file that is still there, unchanged (one): reading it
    again is a right answer, and what differs is what it costs;
  - a file regenerated before the compaction, asked twice: what it said when
    it was read, and what it says now. An answer from the old reading is
    wrong for "now";
  - where the work stands (two) and a rule stated in the first message (two).
    A rule is in that message and nowhere else: a test holds that no file,
    later message or question carries the phrase that marks it.
- **The wording of a question** names no tool and says nothing of what to do
  when the answer is not at hand. "Without starting on it yet" is the one
  thing said about what to do, on the question that asks for the next step.
- **The grading.** Whether an exact answer is right is decided by the
  program alone: every part asked for is in the answer, spacing, case and
  Markdown's marks (emphasis, code, quote, table) aside. Everything else is graded by a model that gets a
  number, the question, the facts, a rubric written beforehand, and the
  answer, and nothing of the arm, the model or the run: whether an answer on
  the standing or a rule is right; and, of an exact answer the program found
  not to hold the text, only whether it gave something else (wrong) or
  nothing (it did not know). The grader cannot make an exact answer right;
  how many it would have is shown per arm, since that is how an answer the
  program's matching missed would show. Answers are graded twice in different orders; the tables use the first
  pass, and `report` says how many the second graded differently.
- **The grader is measured too.** Answers whose grade is known are mixed in:
  for each question a model grades, a right and a wrong answer, each also
  opening with words that tell an arm ("After calling the recall tool…",
  "According to the summary…"); for each trace's first exact question,
  another line and a plain "I cannot say", each with those openings too, and
  the other line behind "I cannot check, but it was…". `report` opens with how the grader did on them, and on how
  many pairs the telling words left its grade alone. A pair it did not grade
  both of counts for nothing.

A trace changed after results exist gets a higher `version`; `build` stops
at a trace that says something else than the conversation built from it. A
unit is the measure of one version of a trace, one building of it and, in
the plugin's arm, one state of the plugin's code: a hash of the trees `src`,
`hooks`, `.claude-plugin` and `package.json` are committed as, so that a
commit touching none of them leaves it the same. A checkout whose code
differs from its commit is not measured. `run` never takes a unit measured
against something else for the one asked for, and never writes over it: it
stops and names the file. `grade` and `report` leave out units of an older
version and say how many; `report` says so above a table whose units were
measured on more than one building of the trace or state of the code. A
verdict is filed under the answer it is on, so one measured again and
answered otherwise shows as ungraded until `grade` is run again.

## A unit

One trace, one model, one run, one arm. The arm is `plugin` (this checkout,
loaded with `--plugin-dir`) or `builtin` (no plugin). A unit forks the built
conversation, runs `/compact` on the copy, and asks each question of a fresh
fork of what the compaction left, so that what one question brought back is
not in front of the next.

What a run repeats: the trace is built once and shared. The plugin's
compaction is decided by rules and comes out the same every run; what varies
between runs is the built-in summary and the answers.

Where the model asked for refuses, its safeguards having stopped a response,
Claude Code goes on with another model, and what the session answers is that
model's. A unit names it at the question (`fellBackTo`), and the table of
`find` counts such answers. A compaction it happens at makes no unit.

Where the plugin leaves a `/compact` undone (ADR 0015), nothing was
compacted and Claude Code writes no boundary: the unit is read from what
Claude Code said of the skip, its questions are asked of the conversation as
it was, its time is the session's, and its tokens before and after are both
what was in use. The tables show such units in a row of their own, which is
there only where there is one. `--max-after 1` puts the line under any
conversation: up to 0.6.1 that measured what follows a hand-over, and since
ADR 0019 it measures a cut.

Where the plugin keeps the oldest messages in place of a summary (ADR 0019),
the unit's line reads `cut`, with which messages were kept and in how many
parts, and the summary did not run; `rebuilt` where the conversation fitted
once its messages were rebuilt and nothing was cut. `--target` sets the
share a compaction aims at (`targetPercent`), which is also how far a cut
goes. `bench/replay.ts` gives one compaction of a recorded session to the
same code offline (`docs/development.md`).

A probe is a unit of the plugin's arm that asks one thing which needs
nothing of the conversation ("Reply with the single word: ok"). What its
first request sent is what the compaction left, and is set against the size
the plugin's line named. Where the plugin moved nothing and handed over, the
size it named is of the conversation as it stood, less its thinking, which
no rebuilt message carries: the session that built the trace counted that
thinking, and the unit records it.

Within one trace and model the two arms take turns at going first from run
to run, and each unit says which it was set to be: the second arm of a run
forks a conversation the first has just read from the cache. (A run taken up
again measures the second one later; the tokens a compaction read from the
cache say what it found there.) Each attempt at a unit has a store of its
own, which nothing was moved into before.

## How a session is started

Every session is started the same way (`cc.ts`):

- `--setting-sources ""` and `--strict-mcp-config`: no user, project or
  local settings, so none of the machine's hooks, permissions, enabled
  plugins or MCP servers. Signing in is not a setting and works as usual.
- `--tools` names the built-in tools there are, and `--allowedTools` the ones
  allowed: at a question `Read`, `Grep`, `Glob`, `ToolSearch` and the plugin's
  `recall`. Nothing can be run or written at a question. That shuts out
  running a command again, which is a path the built-in arm could have used;
  it is said here because it cuts that way. The grader has no tool.
- `--no-session-persistence` at a question and for the grader: Claude Code
  keeps no record of a session nothing goes on from, so no later question
  can read what an earlier one was asked and answered.
- `--autocompact 200000`: the same window for every model (the plugin sees
  167,000). A trace that names a window of its own is built, compacted and
  asked in that one: `large` in 1,000,000, where the plugin sees 967,000, and
  `full` in 264,000, where it sees 231,000: Sonnet 5.5 counts its text as
  about 197,000 tokens, which fills 85 % of that as it filled 85 % of
  167,000 for Haiku 4.5.
- A model is named for each of building, answering and grading; where none
  is, it is Sonnet 5.5. `thinking` asks its puzzles at the highest effort:
  at high, Sonnet 5.5 thinks a few hundred tokens a puzzle.
- `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`: no memory shared between forks.
- The plugin's store is a directory in the box, never the store of the
  person running it.

Each session is checked against what it printed, and the run stops when it
is not the one meant: the plugin loaded in the built-in arm or from another
path, another plugin or MCP server, tools other than exactly those named,
automatic memory on, a hook that is not the plugin's own, another version of
Claude Code, a second compaction at a question, a session still going after
thirty minutes. A tool call that was refused stops the run while a trace is
built; at a question it is what the agent tried, and is counted and shown.

## What is measured, and from what

Everything comes from what a session printed (`--output-format stream-json`).

- Time and tokens of a compaction: the `compact_boundary` event. The plugin's
  line: the `ui_log` event.
- Cost and usage of a session: its figures less those of the session it was
  forked from. What a session prints at its end is cumulative, so a
  compaction that called no model prints the cost of the whole trace.
- What the built-in summary costs turns on whether the trace is still in the
  prompt cache, which lasts an hour: a run stopped and taken up later pays to
  write what an unbroken one reads. The plugin's compaction sends nothing
  and is not touched by it. The tables give a compaction's tokens read from
  the cache, written to it, and written out beside its cost, so that which
  it was can be read off.
- Tokens sent on the next request: fresh, read from cache and written to
  cache together, of the first request of a question.
- How a question went: the verdict on its answer with the tools it called —
  right from what was in the context, after `recall`, after `find`, or after
  reading a file again; wrong with nothing brought back, after bringing
  something back, or after reading again; or it said it did not know.
- Reading outside the working directory is its own way a question goes, right
  or wrong. Claude Code keeps its own record of a session under the home
  directory, and the built-in summary ends by naming it: an agent can read
  and search that record for what the summary dropped, with the same `Read`
  and `Grep` every question has. That is how the built-in compaction brings
  something back, so it is allowed, graded like any other answer, and shown
  apart from reading a file of the work again. What it costs is in the
  questions' seconds and tokens. (Reading the plugin's store by its path
  would count the same; the stub of a moved-out result does not give one.)
  What is there to be read: Claude Code files records by the directory a
  session ran in, each building of a trace has a directory no session ran
  in before, and of the sessions run there only the building of the trace
  and each unit's compaction are kept. Both hold the conversation as it
  was, and no answer to any question.

What is brought back into the context over many turns is measured by
`chain`: the same questions asked one after another, each going on from the
one before, in both arms. Its table gives what was in use before the
compaction, right after it, and once every question was asked, what came back
in between, and how much of the room the compaction made it took again:
`recall` in the plugin's arm, a file read again or Claude Code's own record
read in the built-in's. A summary makes more room than moving out does; what
is brought back is the other side of it. A chain's sessions have to be kept
for the next question to go on from; once the chain ends, or stops, they are
moved into the unit's records, so that no session of another unit can read
what they answered.

Not measured: a compaction on a store that already holds something (every
attempt at a unit starts with an empty one); an image pasted into a message,
and a document.

## `find`

`find` is the plugin's other way to bring a result back: asked in words, it
has Jev choose among the results moved out. It needs a key, sends Jev the
call that made each result and a few hundred characters of its text, and is
compared apart from everything above, which uses `recall` alone.

The questions (`finds` in `questions.json`) come in two kinds. By a value:
the question names a number or a checksum the result holds. By meaning: it
says what the result was in other words than the call that made it or the
text it holds, with no number and nothing quoted. The two logs every trace
reads are asked for by what was to become of each, so that a guess between
them is right for one and wrong for the other.

One conversation, `opaque`, is built for `find` alone and asked nothing
else: a script prints thirteen documents on unrelated subjects and seven
station logs by number (`sh show.sh 01` to `20`), so that no call says what
came back and a ticket's id does not tell which result a question is
about. The documents leave before the logs, all thirteen in every unit, and
the script is removed before any question. `run` refuses it, and `probe`
leaves it out unless it is named.

- **What it picks** (`pick`): no agent, no session of Claude Code. The
  results of a built conversation that are long enough for the plugin to
  move out (2,000 characters, its default) are stored as the plugin stores
  them, and the plugin's own `find` is called with each question. Beside it,
  a plain word match picks the option sharing the most words with the
  question, given the call and the whole text of each result; a tie goes to
  the earliest. `find` either gives one result, lists the likeliest few, or
  says it is none of them, and the table keeps those apart. One question
  asks for a result too short to be an option: there "none of them" is the
  right answer.
- **With an agent in between** (`find`): the same questions asked of the
  plugin's arm after a compaction, once with `recall` alone and once with
  `find` as well, each ending "Quote that line in full" (or "its first
  line"), which a program checks. What the agent asked `find` is kept in the
  unit (`findQuestions`), so that a test can put it to `find` again. The plugin is told which provider to ask
  in its settings and finds the key in the session's environment; no other
  session has it there, whatever the environment of whoever runs this.

The key is read from the file `BENCH_JEV_ENV` names, lines of `NAME=value`:
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, or `TYPESAFE_API_KEY`.
It is written to no file and is on no command line.

## Running it

```sh
export BENCH_BOX=~/somewhere/outside/the/repository
node bench/main.ts build                                   # every conversation but `large`, which is built by name
node bench/main.ts run --runs 3                            # every trace, Sonnet 5.5
node bench/main.ts run --traces results,writes,prose --models claude-opus-5-5 --runs 1
node bench/main.ts build --traces large --build-model claude-sonnet-5-5   # the conversation in a window of 1,000,000
node bench/main.ts run --traces large --models claude-opus-5-5 --build-model claude-sonnet-5-5   # asked by another model than built it
node bench/main.ts chain --models claude-sonnet-5-5 --build-model claude-sonnet-5-5   # the questions one after another: what came back into the context
node bench/main.ts probe --plugin-dirs current=.,v0.5.2=../v0.5.2   # estimate against the next request
node bench/main.ts probe --traces mixed --plugin-dirs v0.6.0=../v0.6.0 --max-after 100   # a checkout made to compact what it would hand over
node bench/main.ts grade                                   # every answer in the box, again when a unit was added: grade what is to be published in a box of its own
node bench/main.ts report
node bench/main.ts publish --to bench/results/2026-10-02   # the units, grades and tables, for the repository
node bench/main.ts publish --to bench/results/2026-10-02-estimate --variants adr-0013,v0.6.0   # only those variants' units
node bench/main.ts report --from bench/results/2026-10-02  # the tables again, from what was published: no box needed
BENCH_JEV_ENV=~/somewhere/jev.env node bench/main.ts pick     # asks Jev: no session of Claude Code
BENCH_JEV_ENV=~/somewhere/jev.env node bench/main.ts pick --questions test/fixtures/values/held-out.json   # the questions of a file
BENCH_JEV_ENV=~/somewhere/jev.env node bench/main.ts find     # results and short, with and without `find`
BENCH_JEV_ENV=~/somewhere/jev.env node bench/main.ts find --traces opaque --variants find   # only the arm with `find`
```

A run that is stopped goes on where it was: each unit is written once, when
all of it is done, and a unit that is there is not run again. `grade` keeps
a reply for the very prompt it answered, and asks again for a batch whose
reply did not grade every item: grading again with nothing new asks for
nothing, and one more unit reshuffles the batches and asks for all of them.
`--build-model` names the model a
trace is built with; a trace already built with another stops the run.
