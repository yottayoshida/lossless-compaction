# Measurements

Every figure the README compares the plugin and the built-in compaction by
comes from one protocol, run on the same traces; `bench/` holds the traces,
the questions, the grading and what it takes to run it again. Its latest run
is the first section, and its first run the second.

The sections after it are single measurements, taken while the plugin was
built and kept for what each was taken to decide. The README's demo quotes
lines from them; it no longer compares the two compactions by them. The
first four were recorded when the plugin was named `jev-lossless-compaction`,
and the lines quoted are as they appeared then: one run each unless said
otherwise, all on 2026-09-30, Claude Code 2.1.285 with Claude Haiku 4.5. The
later ones say when they were taken. Function hooks were early access then,
and are on by default from Claude Code 2.1.287; another version of Claude
Code may have changed them.

## Every kind of conversation, with Sonnet 5.5

On 2026-10-04, once the plugin moved out results, long inputs, old calls and
the middles of long messages, and at a `/compact` typed by hand the newest of
them too (#79, #83, #84, #85). Claude Code 2.1.289. The six conversations
were built again with Sonnet 5.5, and each was compacted by the plugin and by
Claude Code itself; Sonnet 5.5 answered the nine questions and graded what a
program cannot. The plugin's code is `214978c94372`, that of `main` at
`65c4ec2`. The units, their grades and the tables are in
`bench/results/2026-10-04-every-kind/`, and the conversations as they were
built in its `bases/`.

Sonnet 5.5 counts the same text as more tokens than Haiku 4.5 does, and
thinks less over the benchmark's puzzles, so two conversations were given the
shape they had for Haiku (version 2 of each, `bench/traces.ts`). `full` is
built, compacted and asked in a window of 264,000 tokens: its 197,389 tokens
fill 85 % of the 231,000 the plugin sees there, as `full` filled 167,000 for
Haiku. `thinking` asks twenty puzzles at the highest effort: 12,135 of its
37,741 tokens were thinking when it was built, and out of what is sent once a
turn has gone by.

The questions were asked two ways: each of a fresh copy of what the
compaction left, once, as in the runs before; and one after another in one
session, each going on from the one before, as work goes on, twice. Before
such a compaction the conversation was sent once, as the turn before a
`/compact` sends it: its tokens before are those of that turn. A first try
without that turn had the plugin's first question read what the plugin's arm
asked of a fresh copy had written to the prompt cache minutes before, the
compaction leaving the same text both times; it is not published. In the
second run that turn said what it said in the first, and the plugin's first
questions read what the first run's had written within the hour: the
second run's cost is not compared, and the turn now names the run.

The first run, one after another, as the README gives it. In every cell the
plugin's figure is first and the built-in compaction's second:

| The conversation is mostly      | Tokens before     | `/compact` took, s | The next request, tokens | After the nine, tokens | Right, of 9 | Cost, USD   |
| ------------------------------- | ----------------: | -----------------: | -----------------------: | ---------------------: | ----------: | ----------: |
| Large tool results              | 103,811 · 103,450 |        0.13 · 23.0 |           43,606 · 9,242 |        53,512 · 12,010 |       9 · 6 | 0.35 · 0.36 |
| Files the agent wrote           |   78,004 · 77,643 |        0.18 · 16.9 |          35,230 · 30,735 |        44,970 · 34,629 |       8 · 9 | 0.28 · 0.47 |
| Text pasted into messages       |   76,559 · 76,198 |        0.09 · 15.1 |          34,512 · 13,883 |        35,762 · 16,283 |       9 · 8 | 0.20 · 0.31 |
| Many short calls                |   27,702 · 27,341 |        0.15 · 21.2 |          12,283 · 14,081 |        22,645 · 17,082 |       9 · 7 | 0.14 · 0.20 |
| Text filling most of the window | 199,947 · 199,586 |        0.10 · 22.6 |          83,475 · 14,251 |        84,889 · 16,684 |       9 · 8 | 1.69 · 0.63 |
| Thinking                        |   28,144 · 27,783 |        0.09 · 23.3 |          17,656 · 14,859 |        27,032 · 17,597 |       9 · 8 | 0.16 · 0.21 |

The second run:

| The conversation is mostly      | Tokens before     | `/compact` took, s | The next request, tokens | After the nine, tokens | Right, of 9 |
| ------------------------------- | ----------------: | -----------------: | -----------------------: | ---------------------: | ----------: |
| Large tool results              | 103,811 · 103,450 |        0.15 · 17.9 |           43,606 · 9,044 |        53,422 · 12,214 |       9 · 9 |
| Files the agent wrote           |   78,004 · 77,643 |        0.35 · 17.7 |          35,230 · 30,631 |        44,973 · 40,921 |       9 · 9 |
| Text pasted into messages       |   76,559 · 76,198 |        0.12 · 16.5 |          34,512 · 13,959 |        35,621 · 15,955 |       9 · 8 |
| Many short calls                |   27,702 · 27,341 |        0.13 · 21.6 |          12,283 · 14,086 |        21,647 · 16,225 |       8 · 7 |
| Text filling most of the window | 199,947 · 199,586 |        0.12 · 19.7 |          83,475 · 13,938 |        84,610 · 17,205 |       9 · 9 |
| Thinking                        |   28,144 · 27,783 |        0.07 · 26.7 |          17,656 · 14,280 |        27,030 · 16,676 |       9 · 8 |

- **No summary was written by the plugin**, in any of its eighteen
  compactions; Claude Code wrote one in each of its eighteen. The next
  request was larger with the plugin in five kinds of six, smaller in the one
  of many short calls, in both runs.
- **What the questions added.** One after another, the plugin's context grew
  by 1,109 to 10,362 tokens over the nine questions, the built-in's by 1,996
  to 10,290: the questions and answers, and what they read. In the two runs,
  with the plugin the agent called `recall` 25 times and read or searched
  files 12 times; after a summary it read or searched files 56 times, and 29
  of its questions did so outside the working directory, in Claude Code's own
  record of the session. In `short` and in `thinking` the growth took three
  fifths and more of the room the plugin had made.
- **The cost, of the first run.** 2.82 USD in all for the plugin, against
  2.17, of which the summaries were 1.41 and the questions after them 0.76.
  The plugin cost less in five kinds and more in `full`, 1.69 against 0.63:
  at four of its questions in a row Claude Code sent messages the prompt
  cache had not seen (the API's `cache_miss_reason`, `messages_changed`), and
  each wrote the 79,500 tokens it left to the cache again; the same came in
  `prose` in the second run. The summary read nothing of the turn sent just
  before it from the cache but the tools and the system prompt: in `full` it
  wrote 193,244 tokens afresh. Each of a fresh copy, where no question reads
  what another wrote to the cache: 7.68 against 4.02.
- **The answers.** 106 of 108 right against 96 one after another, 53 of 54
  against 52 each of a fresh copy. The grader graded 5 answers differently in
  its two passes, the tables using the first, all to questions a program
  cannot grade; graded again with more answers in its batches, its first
  verdicts on such answers moved, and the fresh copies came to 54 and 53, 53
  and 50, then 53 and 52. Of 217 answers of known grade mixed in, it graded
  every one as expected.

In a window of 1,000,000: `large`, the shape of `results` with thirty-two
logs read, built again with Sonnet 5.5 (575,506 tokens), each compacted once
by the plugin and once by Claude Code for each way of asking its eleven
questions. Its units, grades and tables are in
`bench/results/2026-10-04-large/`, graded apart from the six so that no
verdict published with them moved. In every cell the plugin's figure is
first:

|                          | Each of a fresh copy | One after another |
| ------------------------ | -------------------: | ----------------: |
| Tokens before            |    576,136 · 576,136 | 578,124 · 577,763 |
| `/compact` took, s       |          0.27 · 39.8 |       0.26 · 51.8 |
| The next request, tokens |      272,134 · 7,042 |   272,163 · 9,669 |
| After the eleven, tokens |                      |  300,460 · 13,853 |
| Right, of 11             |               10 · 8 |            11 · 6 |
| Cost, USD                |         12.28 · 1.67 |       2.05 · 1.58 |

One after another, the plugin's first question wrote the 270,870 tokens the
compaction left to the prompt cache and every question after it read them;
each of a fresh copy, every question wrote them again, which is most of its
12.28 USD. With the plugin the agent called `recall` 5 and 4 times; after a
summary, 5 of its answers each way came after reading outside the working
directory.

Not shown here: two runs of one model; made-up conversations, each of one
kind; and, one after another, an answer that leans on the one before it.

## The benchmark

Six made-up conversations, each compacted once by the plugin and once by
Claude Code itself, and nine questions asked of each afterwards, every
question of a fresh copy of what the compaction left. Run on 2026-10-02 with
Claude Code 2.1.287: Haiku 4.5 three times on every conversation, Sonnet 5.5
once on three of them. The window is 200,000 tokens for both models, of which
the plugin sees 167,000.

What is fixed before anything is compared, how a session is started and what
is checked of it are in [`bench/README.md`](../bench/README.md). The
conversations as they were built are in `bench/bases/`. Every unit, its
answers and their grades are in `bench/results/2026-10-02/`, and `report.md`
there holds every table in full; a test makes it again from the units and
fails if it differs. The tables below are taken from it. The plugin measured
is the code on `main` at `89c965b`: a unit names it by a hash of that code
(`bfe9c5b1d1d4`), and beside it the commit of the branch the run was made
on, which was rebased since and is not in the history.

It was run again the same day on 0.6.1, which moves fewer results out where
they are dense:
[the benchmark, run again on 0.6.1](#the-benchmark-run-again-on-061). The
README's figures are of that run; the tables of this section are of the
first.

The six conversations, and what was in use when each was compacted:

| Trace      | What it is mostly                                                        | Tokens  |
| ---------- | ------------------------------------------------------------------------ | ------: |
| `results`  | Twelve files of about 17,000 characters read, nothing written            | 102,276 |
| `writes`   | Eight source files written from dictation and two edited: tool inputs    |  68,349 |
| `prose`    | Six documents of about 21,000 characters pasted into messages            |  58,936 |
| `short`    | Thirty small command outputs, and a status file read five times          |  27,728 |
| `full`     | About 440,000 characters pasted into messages                            | 143,024 |
| `thinking` | Ten puzzles worked out at high effort; a third of it is thinking         |  34,489 |

Each also runs a script once, which is removed before the compaction, and
reads two logs, one of which is regenerated before the compaction.

### What the compaction did

Haiku 4.5, three runs; a range where the runs differ. "Next request" is what
the first question was sent, the median of the runs.

| Trace      | The summary ran: plugin | built-in | Seconds: plugin | built-in  | USD: plugin | built-in  | Next request: plugin | built-in |
| ---------- | ----------------------: | -------: | --------------: | --------: | ----------: | --------: | -------------------: | -------: |
| `results`  |                  0 of 3 |   3 of 3 |             0.1 | 23.3–30.4 |        0.00 | 0.11–0.14 |               37,139 |    8,313 |
| `writes`   |                  3 of 3 |   3 of 3 |       27.2–30.0 | 26.6–35.7 |   0.03–0.09 | 0.02–0.09 |               27,218 |   26,327 |
| `prose`    |                  3 of 3 |   3 of 3 |       25.8–32.3 | 22.4–28.6 |   0.07–0.08 | 0.02–0.08 |               13,823 |   12,634 |
| `short`    |                  3 of 3 |   3 of 3 |       25.5–28.7 | 24.3–28.7 |   0.02–0.04 | 0.03–0.05 |               13,608 |   13,091 |
| `full`     |                  3 of 3 |   3 of 3 |       33.7–40.1 | 31.0–43.4 |   0.15–0.19 | 0.03–0.16 |               14,512 |   12,613 |
| `thinking` |                  3 of 3 |   3 of 3 |       30.2–38.0 | 25.4–29.4 |   0.02–0.05 | 0.04–0.05 |               14,213 |   12,829 |

The plugin compacted one conversation of the six by itself: the one that is
mostly large tool results. There it took a tenth of a second, called no
model, and left 37,139 tokens where the summary left 8,313: the newest
results and a line for each one moved out stay.

In the other five it had nothing to move out that would have made room: what
fills them is what the agent wrote, what was pasted in, thinking, or results
too short to move. It kept the conversation and handed over to Claude Code's
summary. The compaction then took about as long in both arms, the ranges
overlapping in four of the five; in `thinking` the plugin's arm took 30 to
38 s against 25 to 29 s. After a hand-over the next request was larger in
the plugin's arm in all five, by 500 to 1,900 tokens. What a summary costs
turns on whether the conversation is still in the prompt cache, which is
where the low ends of the ranges come from (`report.md` gives the tokens
read from the cache and written to it).

### What could be answered afterwards

Right answers over the three runs, the plugin's arm first: `30 · 9 of 36` is
thirty right for the plugin and nine for the built-in compaction, of
thirty-six asked of each. Exact answers are checked by a program; the last
two columns were graded by Haiku 4.5, which was not told the arm.

| Trace      | A script's output, the script gone | A file that is unchanged | What a file said before it changed | What that file says now | Where the work stands | A rule stated once |
| ---------- | ---------------------------------: | -----------------------: | ---------------------------------: | ----------------------: | --------------------: | -----------------: |
| `results`  |                         4 · 1 of 6 |               3 · 3 of 3 |                         2 · 0 of 3 |              3 · 3 of 3 |            5 · 6 of 6 |         6 · 6 of 6 |
| `writes`   |                         4 · 2 of 6 |               3 · 3 of 3 |                         3 · 0 of 3 |              3 · 3 of 3 |            6 · 5 of 6 |         6 · 6 of 6 |
| `prose`    |                         5 · 2 of 6 |               3 · 3 of 3 |                         0 · 0 of 3 |              3 · 3 of 3 |            6 · 6 of 6 |         6 · 6 of 6 |
| `short`    |                         6 · 1 of 6 |               3 · 3 of 3 |                         0 · 0 of 3 |              3 · 3 of 3 |            6 · 6 of 6 |         6 · 6 of 6 |
| `full`     |                         5 · 2 of 6 |               3 · 3 of 3 |                         0 · 0 of 3 |              3 · 3 of 3 |            6 · 6 of 6 |         6 · 6 of 6 |
| `thinking` |                         6 · 1 of 6 |               3 · 3 of 3 |                         0 · 0 of 3 |              3 · 3 of 3 |            3 · 4 of 6 |         6 · 6 of 6 |
| All six    |                      30 · 9 of 36  |            18 · 18 of 18 |                       5 · 0 of 18  |           18 · 18 of 18 |        32 · 33 of 36  |     36 · 36 of 36  |

- **Output that no file holds any more.** The plugin's thirty right answers
  all came after `recall`: of the result itself in `results`, and in the
  other five of the conversation kept before the summary. Its six misses were
  three wrong after a `recall` and three that said they could not tell. The
  built-in arm's nine right answers all came from reading outside the working
  directory: Claude Code keeps its own record of a session, the summary ends
  by naming it, and the agent searched it. Twenty-six times it said it could
  not tell, and once it searched and was wrong.
- **What a file said when it was read, the file having changed since.** Both
  arms mostly answer with what the file says now: twelve of eighteen in each
  arm were wrong without anything being brought back. The plugin's five right
  answers came after `recall`: the plugin's arm fetched the old reading six
  times of eighteen (five right, and once it still could not tell), and the
  built-in arm never. The twelve were not answered from memory. After a
  summary Claude Code shows the file again as it is now, in the words of a
  `Read` result, and the agent took that for what it had read:
  [A file shown again after a summary](#a-file-shown-again-after-a-summary).
- **A file that is still there** was answered right by both arms every
  time: with no call at all in twelve of eighteen in each arm, and in the
  rest after reading the file again (three in the plugin's arm, six in the
  other) or after `recall` (three).
- **Where the work stands, and a rule stated in the first message**: no
  difference. The misses on the standing are in `thinking` in both arms, and
  one each elsewhere.

The grader graded all 186 answers of known grade mixed in as expected, and
graded all 120 pairs of one answer with and without words that tell an arm
alike. Its two passes disagreed on 4 of the 232 answers it graded; the tables
use the first pass.

### What the questions cost

The nine questions of a run together: seconds, input tokens over all their
requests, and cost. Ranges over the three runs.

| Trace      | Seconds: plugin | built-in | Input tokens, thousands: plugin | built-in | USD: plugin | built-in  | `Read` and `Grep` calls: plugin | built-in |
| ---------- | --------------: | -------: | ------------------------------: | -------: | ----------: | --------: | ------------------------------: | -------: |
| `results`  |           40–47 |   58–116 |                         682–685 |  180–433 |   0.11–0.64 | 0.10–0.19 |                               1 |     4–26 |
| `writes`   |           61–80 |    47–68 |                         583–656 |  389–693 |   0.52–0.56 | 0.43–0.48 |                             2–3 |     5–13 |
| `prose`    |           52–63 |   35–108 |                         262–297 |  196–556 |   0.22–0.23 | 0.16–0.26 |                             1–2 |     3–19 |
| `short`    |           45–48 |    46–80 |                         252–271 |  255–459 |   0.21–0.22 | 0.18–0.24 |                             1–2 |     5–20 |
| `full`     |           69–72 |    32–89 |                         450–484 |  140–626 |   0.28–0.29 | 0.15–0.30 |                             1–4 |     1–23 |
| `thinking` |           51–55 |    38–53 |                         265–284 |  163–276 |   0.22–0.23 | 0.17–0.19 |                             1–2 |      1–7 |

The plugin's arm made four to seven `recall` calls a run. Its questions take
about the same time from run to run; the built-in arm's vary with how far the
agent goes looking, from one `Read` or `Grep` call in a run to twenty-six.
In `writes` and in `thinking` the plugin's arm cost more to ask in every run
than the other arm did in any.
After the plugin's own compaction every later request carries the 37,139
tokens it left, which is why `results` sends more input for the plugin's arm
than for the other; the high end of its cost is the run that wrote that
context to the cache, and the low end the runs that read it.

### Sonnet 5.5, one run

`results`, `writes` and `prose`, once each. The compaction went as with
Haiku: the plugin compacted `results` by itself in 0.1 s and handed the other
two over.

| Trace     | Exact answers right, of 5: plugin | built-in | Standing and rules, of 4: plugin | built-in | Nine questions, USD: plugin | built-in |
| --------- | --------------------------------: | -------: | -------------------------------: | -------: | --------------------------: | -------: |
| `results` |                                 5 |        5 |                                4 |        4 |                        1.29 |     0.17 |
| `writes`  |                                 5 |        5 |                                4 |        3 |                        1.25 |     0.96 |
| `prose`   |                                 5 |        5 |                                4 |        4 |                        0.50 |     0.33 |

Both arms answered every exact question. The built-in arm's nine answers
about what was gone or had changed all came from reading Claude Code's
record of the session, which Sonnet did every time where Haiku mostly did
not. The plugin's arm cost more to ask in all three, most in `results`, where
its questions carry the larger context. This is one run: it shows that the
difference in answers seen with Haiku was not there, not how often.

### The plugin's estimate of what is left

The line a compaction shows says how much the plugin takes to be in use
afterwards. One more unit per trace asked a question that needs nothing of
the conversation, with the code that became 0.6.0 ("this code" below) and
with v0.5.2, the release before the estimate was changed to count what stays
(ADR 0011).

| Trace      | What happened  | Measured                | This code: estimate | off by  | v0.5.2: estimate | off by |
| ---------- | -------------- | ----------------------- | ------------------: | ------: | ---------------: | -----: |
| `results`  | results moved  | 37,130 sent next        |              36,926 |  −0.5 % |           49,157 | +32.4 % |
| `writes`   | nothing moved  | 68,349 in use before    |              64,406 |  −5.8 % |           68,204 | −0.2 % |
| `prose`    | nothing moved  | 58,936 in use before    |              79,233 | +34.4 % |           58,821 | −0.2 % |
| `short`    | nothing moved  | 27,728 in use before    |              20,462 | −26.2 % |           27,620 | −0.4 % |
| `full`     | nothing moved  | 143,024 in use before   |             211,577 | +47.9 % |          142,915 | −0.1 % |
| `thinking` | nothing moved  | 34,489 in use before    |              20,185 | −41.5 % |           34,364 | −0.4 % |

Where results were moved out, which is what the change was for, the estimate
went from 32 % over to within 1 % (with Sonnet, in the one run, 2.1 % over).
Where nothing was moved, nothing had changed, so the estimate can be set
against what Claude Code counted before the compaction: v0.5.2 hands that
count back, and this code counts again and is off by up to 48 %.

Why it is off was not measured.
[Limits](limits.md#when-the-built-in-compaction-runs-instead) names two
things about the count that would push it the way the largest errors go. It
takes no less than one token to three characters, which counts too much
where text runs to more characters a token, as the pasted prose of `prose`
and `full` may. And it leaves thinking out, which is a third of `thinking`.
Neither accounts for the 26 % under in `short`. With Sonnet, the three
conversations run came within two points of Haiku's figures.

In none of these six did either version hand over because of its estimate:
the five hand-overs were for want of anything to move out. A conversation
that is mostly prose and also holds results large enough to move is where an
estimate this far over could hand over when it need not; none of the six is
that conversation, and it was not measured.

It was measured afterwards, with such a conversation, and the way of
counting was replaced:
[The size after a compaction, counted again](#the-size-after-a-compaction-counted-again).

### `find`

`find` needs a key and was compared apart, with Haiku 4.5 and Jev on
Cloudflare Workers AI. Its questions ask which earlier result something was
in, in two ways: by a value the result holds (a number, a checksum), or by
what the result was, in other words than the call that made it or its text.

**What it picks, with no agent in between.** The plugin's own `find` was
called with each question over the results of a conversation that are long
enough to be moved out: fifteen in `results`, three in each other. Beside
it, a word match picked the result sharing the most words with the question,
reading each result in full, a tie going to the earliest.

| Conversations  | Options | Asked by | Asked | Word match: right | `find`: gave the right one | listed it first | listed it further down | did not list it | said it was none of them |
| -------------- | ------: | -------- | ----: | ----------------: | -------------------------: | --------------: | ---------------------: | --------------: | -----------------------: |
| `results`      |      15 | A value  |     4 |                 3 |                          1 |               0 |                      0 |               0 |                        3 |
| `results`      |      15 | Meaning  |     4 |                 2 |                          1 |               1 |                      1 |               1 |                        0 |
| The other five |  3 each | A value  |    10 |                10 |                          0 |               0 |                      0 |               0 |                       10 |
| The other five |  3 each | Meaning  |    15 |                10 |                         10 |               4 |                      1 |               0 |                        0 |

The other five conversations ask the same five questions of the same three
options, the script's output and the two logs, with other numbers in them:
their rows are one situation met five times, not twenty-five askings that
stand apart. Counted once, there are six questions by a value and seven by
meaning. That is few, and the table says what happened on them, not how
often it would.

- Asked by a value, `find` said thirteen times of fourteen that no result
  was about that. What Jev is shown of a result is the call that made it and
  a digest of 400 characters, which for results like these is their first
  lines; a value further down is not in front of it. A phrase in double
  quotes is looked for in the whole text first, but only from twelve
  characters on, and the checksum the questions quote is eight. The one it
  gave is a record whose number begins with its log's, and the call names
  the log. The word match reads everything and found thirteen.
- Asked by meaning, `find` gave or listed first the right result sixteen
  times of nineteen: in `results` it gave one of four and listed one first,
  and in the other five it gave the script's output and the log that was to
  stay every time, and listed the log that was to change first four times
  of five. The word match was right on the first two of those everywhere
  and wrong on the third everywhere: where the words tie it takes the
  earliest, and it was right by where the right result stood.
- `find` never gave a wrong result as the answer: where it was not sure it
  listed, or said none. The one question that asks for a result too short to
  be an option, it answered with none, which is right.
- A call took 0.24 to 1.7 seconds, 0.28 the median.

**With an agent in between.** The same questions asked of the plugin's arm
after a compaction, each ending "Quote that line in full" (by a value) or
"Quote its first line in full" (by meaning), one run: with `recall` alone,
and with `find` registered as well.

| Trace     | Tools               | Right  | `find` calls | `recall` calls | Seconds | USD  |
| --------- | ------------------- | -----: | -----------: | -------------: | ------: | ---: |
| `results` | `recall` only       | 5 of 8 |            0 |              3 |      59 | 0.59 |
| `results` | `recall` and `find` | 6 of 8 |            0 |             11 |     169 | 0.75 |
| `short`   | `recall` only       | 3 of 5 |            0 |              3 |      38 | 0.14 |
| `short`   | `recall` and `find` | 4 of 5 |            0 |              4 |      41 | 0.15 |

With `find` registered, the agent did not call it once in thirteen
questions. The line that stands in a result's place names `recall`, and the
agent loaded `recall` by that name each time; nothing in the conversation
names `find`. The two rows of a trace therefore differ by what one run
differs from the next, not by `find`. In the earlier measurement
[below](#find-1), where the agent called `find` thirteen times of thirteen,
the calls that made the results said nothing of their content; here each
names its file.
Where they say nothing, and with `recall`'s description naming `find`, it
was called for about half the questions by meaning: [`find` where the calls say
nothing](#find-where-the-calls-say-nothing).

### What this does not show

- The conversations are made up, and each is one shape. A working session
  mixes them.
- Three runs, and one for Sonnet: enough to see a difference of thirty
  against nine, not to put a rate on anything. Opus 5.5 was asked once,
  [later](#with-opus-55-and-in-a-window-of-1000000), and that difference was
  not there.
- Every question is asked of a fresh copy, so what `recall` brings back does
  not stay in the context for the next question, and what that adds up to
  over a long session is not here.
- Each compaction is a `/compact` typed once. A conversation that compacts
  several times, and automatic compaction, are not here.
- A question may read and search but not run anything, which shuts out
  running a command again.
- `find` with an agent is one run of thirteen questions on Haiku.
- One window, 200,000 tokens; one conversation was measured since in a
  window of 1,000,000.

## The benchmark, run again on 0.6.1

On 2026-10-02, after 0.6.1 was released, with Claude Code 2.1.287: the same
traces, questions and grading, Haiku 4.5 three times on every conversation
and Sonnet 5.5 once on three. The six conversations were built again from
the traces, so both arms were measured anew. Each building is named in
`bench/results/2026-10-02-v0.6.1/bases/` by its size and the SHA-256 of its
record; what was said in it and the files it worked on are those of
`bench/bases/`, and the conversations themselves are not published a second
time. The plugin is 0.6.1 (`66f2eb2b181e`). The units, their grades and
every table are in `bench/results/2026-10-02-v0.6.1/`, and a test holds the
tables to the units and the figures below to the tables.

What 0.6.1 changed is how a size is counted (ADR 0013), and with it when
moving out stops: what a result saves by leaving is counted at the
conversation's own tokens a character, where 0.6.0 took a third of a token a
character and moved more out than the target asked for.

### What the compaction did

Haiku 4.5, three runs. "Next request" is the median of the runs.

| Trace      | The summary ran: plugin | built-in | Seconds: plugin | built-in  | Next request: plugin | built-in |
| ---------- | ----------------------: | -------: | --------------: | --------: | -------------------: | -------: |
| `results`  |                  0 of 3 |   3 of 3 |         0.1–0.3 | 20.4–26.4 |               43,995 |    8,313 |
| `writes`   |                  3 of 3 |   3 of 3 |       30.1–31.3 | 27.5–30.5 |               27,152 |   26,034 |
| `prose`    |                  3 of 3 |   3 of 3 |       28.4–34.1 | 20.3–26.5 |               13,810 |   12,573 |
| `short`    |                  3 of 3 |   3 of 3 |       33.1–46.4 | 24.8–29.8 |               13,800 |   13,157 |
| `full`     |                  3 of 3 |   3 of 3 |       31.0–48.8 | 22.1–26.4 |               14,484 |   12,557 |
| `thinking` |                  3 of 3 |   3 of 3 |       31.4–39.8 | 28.6–34.4 |               14,191 |   12,781 |

Each conversation went the way it had gone: the plugin compacted `results`
by itself and handed the other five to Claude Code's summary.

In `results` it moved 10 of the 15 results out, where the first run moved
11, as 0.6.0 and 0.6.1 did of one building probed with both
([counted again](#the-size-after-a-compaction-counted-again)), and the next
request was 43,995 tokens where it had been 37,139: 26 % of the 167,000
against 22 %, both under the 40 % it aims for. The nine questions were sent
18 % more tokens for it, and with Sonnet they cost 1.57 USD where they had
cost 1.29 (0.18 after the built-in compaction).

In the other five the summary took longer in the plugin's arm in 14 of the
15 pairs of runs, by a median 7.7 s; the first time it was 10 of 15 and
1.4 s. The time went with what the summary wrote out, about 10 ms a token in
both arms, and the summaries in the plugin's arm were longer: by a median
793 tokens, 268 the first time. Looking for what to move took the plugin
6 ms or less; what keeping the conversation took was not measured apart. Why
the summary writes more in the plugin's arm was not measured.

### What could be answered afterwards

Haiku 4.5, right answers over the six conversations and three runs, beside
those of the first run:

| Kind of question                    | Asked | Plugin | first run | Built-in | first run |
| ----------------------------------- | ----: | -----: | --------: | -------: | --------: |
| Exact, source gone                  |    36 |     32 |        30 |       12 |         9 |
| Exact, file unchanged               |    18 |     18 |        18 |       18 |        18 |
| Exact, file changed: what it said   |    18 |      5 |         5 |        0 |         0 |
| Exact, file changed: what it says   |    18 |     18 |        18 |       18 |        18 |
| Where the work stands               |    36 |     34 |        32 |       34 |        33 |
| A rule stated early                 |    36 |     36 |        36 |       36 |        36 |
| All                                 |   162 |    143 |       139 |      118 |       114 |

Both arms answered four more than the first time. The built-in arm runs
none of the plugin's code, so four is what building the conversations again
and three more runs come to: nothing here says that 0.6.1 answers more, or
fewer.

After a hand-over, a script's output that no file held any more was
answered 26 times of 30 against 10 of 30 (26 against 8 the first time). What
a file said before it changed was answered 5 times of 18 against none, as
before. With Sonnet, on three of the conversations, both arms answered all
27.

## With Opus 5.5, and in a window of 1,000,000

On 2026-10-03, Opus 5.5 was asked once what Haiku 4.5 was asked three times
(#57): the questions of `results` and `prose`, after a `/compact` by the
plugin and by Claude Code, and on `opaque` the questions `find` is for, with
a key and without. One conversation was added and asked the same way,
`large`: the shape of `results` in a window of 1,000,000 tokens, thirty-two
logs of 700 lines read, 575,632 tokens when it was compacted. It has two
questions more than the nine, each about a log deleted before the
compaction: one read early, which the plugin moved out, and the last one
read, which it kept. `large` was built with Sonnet 5.5; the others are the
conversations Haiku built. The plugin is `b6736911384a` at its default
settings then (`targetPercent` 40), on Claude Code 2.1.287 for `results` and `prose` and 2.1.288 for
`opaque` and `large`, the versions they were built with. The units, their
grades and every table are in `bench/results/2026-10-03-opus/`, and a test
holds every figure here to them.

**The compaction.** The plugin's figure is first, the built-in compaction's
second.

|                           |      `results` |         `prose` |         `large` |
| ------------------------- | -------------: | --------------: | --------------: |
| The summary ran           |       no · yes |        no · yes |        no · yes |
| `/compact` took, s        |    0.10 · 23.2 |     0.05 · 22.6 |     0.35 · 51.4 |
| The compaction cost, USD  |       0 · 0.51 |        0 · 0.35 |        0 · 2.93 |
| The next request, tokens  | 43,884 · 6,952 | 84,720 · 11,848 | 272,428 · 6,538 |
| Its questions cost, USD   |    0.62 · 0.18 |     0.99 · 0.52 |     3.58 · 0.20 |

In `results` the plugin moved 10 of 15 results out, and in `large` 20 of 35,
in a window it read as 967,000 tokens: it estimated 272,303 tokens in use
afterwards, and 272,428 were sent next. `prose` holds nothing to move out
and had room, and was left as it was.

**The answers**, right of those asked, the plugin's first:

|                                                    | `results` | `prose` | `large` |
| -------------------------------------------------- | --------: | ------: | ------: |
| A script's output, the script gone, of 2           |     2 · 2 |   2 · 2 |   2 · 2 |
| A line of a deleted log read early, moved out      |         — |       — |   0 · 1 |
| A line of a deleted log read last, kept            |         — |       — |   1 · 0 |
| A file that is unchanged                           |     0 · 1 |   1 · 1 |   1 · 1 |
| What a file said before it changed                 |     1 · 0 |   1 · 1 |   0 · 1 |
| What that file says now                            |     0 · 1 |   1 · 1 |   1 · 1 |
| Where the work stands, of 2                        |     2 · 2 |   2 · 2 |   2 · 2 |
| A rule stated once, of 2                           |     2 · 2 |   2 · 2 |   2 · 2 |

- **Six answers are counted wrong for how they write a station.** The first
  message of `results` and of `large` states a rule, that a station's id is
  written with a prefix (ST-1325, SN-2044), and Opus gave the line it was
  asked for that way: `station ST-6303 reported 985 units`. The program looks for the line as the log has it,
  which was fixed before any answer was seen, and a grader cannot make such
  an answer right: 4 in the plugin's arm and 2 in the built-in arm are
  counted wrong, which leaves 13 of 17 questions about an exact text right
  in the plugin's arm and 15 in the built-in arm. With the prefix taken off,
  a count made after the answers were seen, all 17 are right in both.
- **After the built-in compaction Opus searched Claude Code's own record of
  the session**, which the summary names: 11 of its answers came after
  reading outside the working directory (3, 3 and 5), all of them holding
  the right line, 2 with the prefix. Of the questions about a script's
  output it read that record for all 6 and was right on all 6, where Haiku
  read it for 22 of 36 and was right on 9. In the plugin's arm
  nothing outside was read: `recall` was called 3 times in `results` and 4
  in `large`, and the line of the log read last was given with no tool.
- **The plugin's compaction cost nothing, and what came after it cost more.**
  It took 0.35 s or less and called no model, where the summary of `large`
  took 51.4 s and cost 2.93 USD. Then every request carried what the plugin
  had left, 272,428 tokens in `large` against 6,538 after a summary, and the
  eleven questions cost 3.58 USD against 0.20: with the compaction, 3.58
  against 3.13. Those questions took 82.4 s against 53.9; with the
  compaction, 82.8 s against 105.3, and in `results` 42.5 s against 72.0.

**`find`, on `opaque`**, ten questions with `recall` alone and ten with
`find` as well:

|                                                         | `recall` only | `recall` and `find` |
| ------------------------------------------------------- | ------------: | ------------------: |
| Right, of 10                                            |             4 |                   8 |
| Answered by another model after Opus 5.5 was stopped    |             3 |                   2 |
| Right, of those Opus 5.5 answered                       |        4 of 7 |              8 of 8 |
| `find` calls                                            |             0 |                   8 |
| `recall` calls                                          |            63 |                   0 |
| The ten questions cost, USD                             |          2.52 |                0.52 |

In 5 of the 20 sessions Opus 5.5's safeguards stopped the response and
Claude Code went on with Opus 4.8, which said that no result was about that,
or declined. `opaque` is thirteen made-up notes of an operations team, one
of them on replacing the key software is signed with. None of the 5 answers
was right, and they are not Opus 5.5's: each unit names the model that
answered (`fellBackTo`), written in after the measurement from the record of
each session, and a unit measured from here on records it by itself. What
the ten questions cost includes those sessions, and the two columns were not
stopped at the same questions: `find-code-6` was stopped with `recall`
alone and answered with `find`. In `results`, `prose` and `large` it
happened in no session.

**Not shown by this.** One run, so no rate, and the differences of one or
two answers between the arms above are within it. The plugin at its default
settings then (`targetPercent` 40); the default now moves out more, and leaves
less to send (ADR 0025).
`large` is one shape, logs read and nothing written, built with another
model than the one asked. A conversation that compacts several times, and
automatic compaction, are not here either.

## A compaction, and a result read back

A conversation of sixteen `Read` results, 179,353 tokens, compacted by the
plugin. What the compaction reported, and the line that stands in a result's
place:

```text
jev-lossless-compaction: moved 14 of 16 tool results out (408174 -> 30293 chars, about 51909 of 167000 tokens in use) in 44 ms

[moved out] Read result, 36925 bytes; recall with mcp__jev-lossless-compaction__recall id a55c9850d2e336adcaf429cc720b2d070c2452bce2023e886c648b546ff96944
```

Asked on the next turn for the first heading of one of the moved-out files,
without rereading it, the agent called `recall` with the id from the ticket
and quoted the heading exactly.

## Against the built-in compaction

One conversation, one run, and of the kind the plugin does best on: the
README compared by these figures until [the benchmark](#the-benchmark)
replaced them.

Another conversation, 76,490 tokens, compacted once by the plugin (no key
set) and once by Claude Code itself. The file the question asks about had
been deleted in between.

|                                     | This plugin, no key         | Built-in compaction |
| ----------------------------------- | --------------------------- | ------------------- |
| Time the compaction took            | 43 ms                       | 69.6 s              |
| Tokens sent on the next turn        | 55,449                      | 70,259              |
| "What was on line 5 of that file?"  | Quoted the line, via recall | Could not answer    |

The sixteen-read conversation above, compacted both ways, then asked twenty
questions of the form "what was on line N of that file", one fresh turn per
question: the built-in compaction answered none of the twenty; the plugin's
answered sixteen through `recall`, the four misses being the agent
misreading a line it had recalled. The next turn was about 7,000 tokens
larger after the plugin's compaction (66,000 against 59,000): that is the
tickets and the newest results kept.

## Jev at compaction time

Over twenty automatic compactions of a real session (a 200k window, Opus
4.6) and four more of the conversation above, the order Jev gave the
candidates never changed which results left: the size target was far enough
below the conversation that every candidate left every time. Jev's "still
needed" scores moved as a block from one compaction to the next (0.83–1.38
at one, 2.19–2.38 at the next) with a spread of 0.2–0.5 within a compaction.
A `choice` question at compaction time, "which of these does the rest of the
task most need", ranked the two results the session read again afterwards
seventh and tenth of thirteen. This is why a compaction asks Jev nothing
(ADR 0003).

## `find`

An earlier measurement than [the benchmark's](#find), with results chosen so
that only their content tells them apart.

Thirteen results whose calls say nothing of their content — `git show
<hash>`, `gh issue view <number>`, `git cat-file -p <blob>` — moved out of a
conversation of eighteen, and thirteen questions about them in other words
("which result reports a refusal on an unsupported kernel call for event
polling before the thread rule applies?"), one fresh turn per question.

| Arm                                                  | Right | Results pulled back into the context |
| ---------------------------------------------------- | ----- | ------------------------------------ |
| The agent with `recall` alone                        | 6/13  | 41 recalls, 388,301 characters       |
| Jev's `choice` over the digests, asked from a script | 13/13 | —                                    |
| Word overlap between question and digest, no Jev     | 10/13 | —                                    |
| The agent with the registered `find` tool            | 13/13 | 13 `find` calls, no `recall`         |

The agent's misses were three answers given without recalling anything and
one wrong after twelve recalls. The `find` run was made twice, before and
after "none of these" was added to the choices, 13/13 both times; what the
agent saw for one of them:

```text
[found] Bash result, 2271 bytes; id 968e6cdd8a21069b3907388db507c061ce28cac950b7a63eae5a0967adf39edc; probability 0.99
```

Asked about a result that had *not* been moved out, `find` answered
`[not sure]` with the two likeliest at 0.24 and below and "or none of them;
probability 0.36". On twenty questions that quote a line of a `Read` result
whose path is in the call, the agent with `recall` alone answered 18 of 20
(2.5 recalls a question); Jev's choice over the digests 14 of 20, 19 of 20
among its three likeliest. That is why a quoted phrase is looked for as
written before Jev is asked.

With a hundred stored results of 60 KB and three of 4 MB, `find`'s own work
took 96 ms. A `choice` with 95 options of 750 characters, 71,219 characters
in all, went through the Cloudflare route in 1.5 seconds.

## `find` where the calls say nothing

The benchmark's questions for `find` could all be answered from a ticket's
id, since each call named the file it read; there, with 0.6.0, the agent
never called `find`. #38 asked whether it calls `find` where that is not so. The
conversation `opaque` (`bench/traces.ts`) runs `sh show.sh 01` to `20`:
thirteen documents of about 7,000 characters on unrelated subjects (a
runbook for rotating a signing key, an incident report, the holiday rota of
a support desk…), then seven station logs. The plugin moves all thirteen
documents out (sixteen results of twenty in every unit; the logs share more
words with what was said last, so they leave last), the script is removed,
and nothing the agent said holds what any document is about: it replied
"shown" and nothing else. Seven questions ask by what a document was about
in other words than its first lines ("which earlier result set out who
answers customers while most people are away in December?"), three by a
reference code in the middle of one. Haiku 4.5 built it and was asked, three
runs of each; a question counts as calling `find` when the agent called it
at least once for it. The rule was set before measuring: the plugin is left
as it is if the agent calls `find` for 11 or more of the 21 questions by
meaning, and `recall`'s description names `find` otherwise.

| Plugin                                   | Key | Calls `find`, by meaning | Right, by meaning | Right, by a code |
| ---------------------------------------- | --- | -----------------------: | ----------------: | ---------------: |
| Before this change                       | no  |                  0 of 21 |           2 of 21 |           4 of 9 |
| Before this change                       | yes |                  8 of 21 |          10 of 21 |           2 of 9 |
| `recall`'s description names `find`     | no  |                  0 of 21 |           3 of 21 |           3 of 9 |
| `recall`'s description names `find`     | yes |                 13 of 21 |          13 of 21 |           0 of 9 |
| and `find`'s "none" says what Jev saw    | no  |                  0 of 21 |           1 of 21 |           2 of 9 |
| and `find`'s "none" says what Jev saw    | yes |                 11 of 21 |          11 of 21 |           1 of 9 |

The plugin before this change (main at `e792fad`, 0.6.1 with #14) fell short of the rule, 8 of 21 (4, 1 and 3 in the three
runs). Where Claude Code loads tools on demand an agent sees the
description of a tool it has loaded and no other, and it loads `recall`,
which the tickets name: `find`'s own description is not read. With a
sentence in `recall`'s description that `find` finds a result from what it
was about, the agent called it for 13 of 21; but asked for a code, it called
`find` too, `find` answered that no result was about that, and the agent
said the code was not there: 0 of 9. What Jev is shown of a result is its
call and its first lines, and a code further down is not among them (asked
with no agent in between, `find` said none for all three codes, and gave
the right document for all seven questions by meaning; a word match gave
two). `find`'s answer now says so, and that a phrase of twelve characters
or more is looked for as written and `recall` reads the results; with that,
11 of 21 (4, 4 and 3), and 1 of 9 codes, one fewer than before this change.
The arm with no key does not change between the three: its codes went from
2 to 4 of 9, which is how far one set of three runs lies from the next.

The same plugin on the benchmark's conversations, where the calls name what
they read (three runs; the one run of 0.6.0 [above](#find) beside it):
`results` 6, 8 and 5 of 8 with a key and 5, 5 and 5 without (0.6.0: 6 and
5), calling `find` 1, 2 and 1 times in eight questions; `short` 4, 4 and 4
of 5 with a key and 4, 3 and 4 without (0.6.0: 4 and 3), calling it never. Sonnet 5.5 on
`opaque`, one run: with a key it called `find` for 6 of the 7 questions by meaning and was right on 6, and on 1 of the 3 codes; with no key, right on 4 and on 1.

Not measured: Opus (it was since, once: [below](#with-opus-55-and-in-a-window-of-1000000)); a working
session; a conversation where the results that are asked about were never
moved out. The units are in
`bench/results/2026-10-03-find/`, one directory for each plugin above. They
were measured on `e792fad`, with this change for the last two. #48, merged
since, changes only a `/compact` that moves nothing out: `opaque` and
`results` move results out and are not such a compaction; `short` is, and
since #48 it is left as it was where there is room, which was not measured.

## `find` asked for a value

Asked for a value in the middle of a result, `find` said that none of the
results was about it: Jev is shown the call that made each result and its
first 400 characters (#55). `find` now looks in the whole text of each result
for the values the question names — runs of letters and digits that hold two
digits or more, used when one of them has three — a line at a time, each as
a word of its own, with the number `Read` puts in front of a line left out.
Where one result alone has a line holding them all, Jev is told so beside
that result's first lines. Jev still chooses; where it takes none of the
results, those with such a line are named, and none is given as the answer.

**With no agent in between** (`pick`, the seven conversations, Jev on
Cloudflare Workers AI). "Before" is what `bench/results/2026-10-02/` and
`bench/results/2026-10-03-find/` hold of the same questions.

| Asked by                              | Asked | Before: gave the right one | Now: gave the right one |
| ------------------------------------- | ----: | -------------------------: | ----------------------: |
| A value, its result among the options |    17 |                          1 |                      17 |
| Meaning                               |    26 |           18, and listed 8 |        18, and listed 8 |

Each of the 17 was Jev's choice, told of the one result with a line holding
the value. The one question whose answer is too short to be an option was
answered with none, as before. The questions by meaning name no value, so
nothing sent for them changed, and Jev asked again does not always answer
the same. Of those listed, the right result was first for 5 before and 6
now, further down for 2 and 1, and not among them for 1 and 1.

**Other questions.** A line at a time and three digits were settled on the
questions above, so twenty-one more were written before any rule was built,
on `results`, `mixed` and `japanese`, seven kinds on each
(`test/fixtures/values/`). They are not unseen by the rule as it is: one
kind of them, two values on two lines, is what showed the rule before it
giving a wrong result (below). Three were written after the first review,
and six after the rule was settled and before they were put to Jev, to see
whether being told misleads it: questions by meaning that name a value
another result holds than the one asked for. Asked of Jev
(`picks-held-out.json`, `picks-after-review.json` and
`picks-misleading.json`, beside the units):

| The question names | Jev is told | What `find` did on the three |
| --- | --- | --- |
| A record's number (`2-0077`) | of the one result | Gave the right result |
| One number no other result holds (a station) | of the one result | Gave the right result |
| Two values that stand on two lines | nothing | Said none |
| The first five characters of a checksum | nothing | Said none |
| A checksum in capitals | nothing | Said none |
| A number many results hold, meant as the number of a line (`250`) | nothing | Listed other results, giving none as the answer |
| A count in a question by meaning ("the 2 log files") | nothing: it names no value | Listed the right result first |
| A number in a question by meaning ("all 120 batches of it") | nothing | Gave the right result |
| A value another result holds, in a question by meaning ("run before record 2-0077 was looked at") | of another result | Gave the right result |
| A value of a result said not to be it ("Not the output with checksum 9e3817e8") | of another result | Gave the right result on two; listed the right result first on one |

No answer gave a wrong result. On the last two kinds Jev was told of a result
that was not the one asked for. It gave the result asked for 5 times of 6
and listed it first the other time. What comes back there is Jev's choice:
six questions asked once do not show that it never takes the result it is
told of.

A test holds the thirty questions, with two stand-ins for Jev — one that
says none whatever it is shown, one that takes the result it is told of — to
this: Jev is asked once each time; the first is given no wrong result; the
second is given the first two kinds, and on the last two the other result,
which is what it took.

**Telling Jev of every result that holds a value gave wrong results.** The
rule as it was first rebuilt told Jev of each result a line of which held
the values of three digits or more, however many results did. Asked for two
values that stand on two lines ("395 units at step 78"), four results of
`results` had a line holding 395, and Jev, told so of each, gave the first
of them as the answer at probability 0.55; in `japanese`, told of two, it
gave the first at 0.57; in `mixed`, told of three, it listed results without
the one asked for (`told-of-each/picks-held-out.json`; that rule is in no
commit). As it is, Jev is told of a result only where it alone has a line
holding every value, and on those three questions `find` said none.

**With an agent in between** (Haiku 4.5 with a key, three runs,
`bench/results/2026-10-03-values/`). The arm with no key was not run again:
it has no `find`, and nothing it meets changed. A unit names the code it was
measured with by `plugin`, the hash of the tree of that code; its
`pluginCommit` is a commit made to measure, which was not pushed.

| | With #51 | Now |
| --- | ---: | ---: |
| `opaque`, a code in the middle of a document: right | 1 of 9 (2 of 9 with no key) | 8 of 9 |
| `opaque`, by meaning: called `find` | 11 of 21 | 12 of 21 |
| `opaque`, by meaning: right | 11 of 21 | 11 of 21 |
| `results`, eight questions: right | 6, 8 and 5 | 8, 8 and 7 |

In `opaque` the agent called `find` for 8 of the 9 codes, each time with the
code alone as its question, and was right on all 8; for the other it called
no tool, and was not right. In `results` it called `find` 2, 3 and 3 times
in the three runs, where there were 1, 2 and 1: for 6 of the 12 questions by
a value, right on all 6, and 2 times for a question by meaning; of the 6 by
a value it did not call `find` for, it was right on 6. The units record what
the agent asked `find` (`findQuestions`), and a test puts each of the 15
that name a value to `find` again, with a stand-in for Jev that takes the
result it is told of: the right result comes back each time. Jev, asked for
14 of them, is told of one result each time, the right one; the other one is
settled by a phrase the agent quoted.

The change is in the first row. The rows by meaning and of `results` are
there to show that nothing fell: three runs do not tell 12 of 21 from 11.

Not measured: Sonnet with an agent in between, and Opus but once
([with Opus 5.5](#with-opus-55-and-in-a-window-of-1000000)); a working session; values as people ask for
them, which may come in another letter case or in part.

## The tools in front of the agent

On 2026-10-03, Claude Code 2.1.288, for #54: what makes Haiku 4.5 fetch a
result that was moved out, where it had answered that it saw none. Each of
three steps was to be measured before it was built, by a rule set before
measuring, and built only if it reached the rule. `opaque`, `results` and
`full` were built again from the same traces, and every plugin below was
asked the questions `find` is for on those same buildings, one after
another: main at `44f410f` (the baseline) and checkouts of it with one
change each. Three runs of each with Haiku 4.5, with a key (`find`
registered) and without. An answer is right when it holds the line asked
for, which the program decides; of the questions `find` is for, no model
graded any. `44f410f` is from before
[`find` looked for a value](#find-asked-for-a-value) (#55); what is merged
has both, and was measured afterwards ([below](#as-it-is-merged)).

### Answers with no call

In [`opaque`](#find-where-the-calls-say-nothing) the baseline called neither
`recall` nor `find` for 9 of the 21 questions by meaning with a key, and for
13 of 21 without. Where Claude Code loads tools on demand, `recall` and `find` wait
behind its tool search, and their descriptions are read only once one is
loaded. Two changes were set against that:

- **Listed.** A `tool.describe` hook answers `isDeferred: false` for
  `recall` and for `find`: both stand in the list of tools the agent is
  given, with their descriptions as they were.
- **A line.** The tools are left where they wait, and a message is put last
  in a conversation the plugin compacted: how many results were moved out,
  that what they held is not in the conversation, and that `recall` brings
  one back by its id, or `find`, with a key, by what it was about.

The rule: a change is built if, of the 21 questions by meaning with a key,
the agent calls `recall` or `find` for at least 7 more than the baseline
and is right on at least 7 more, and the right answers in `results` and in
`full` fall by no more than 2. Two sums of 21 answers, each right about
half the time, lie about 3.2 apart at one standard deviation; the calls and
the right answers move together, so the second condition adds little to
the first. If both changes reach it, the smaller one is built.

| Plugin   | Key | Calls `recall` or `find`, by meaning | Right, by meaning | Right, by a code |
| -------- | --- | -----------------------------------: | ----------------: | ---------------: |
| Baseline | no  |                              8 of 21 |           4 of 21 |           3 of 9 |
| Baseline | yes |                             12 of 21 |          11 of 21 |           1 of 9 |
| Listed   | no  |                              4 of 21 |           3 of 21 |           3 of 9 |
| Listed   | yes |                             19 of 21 |          19 of 21 |           0 of 9 |
| A line   | no  |                              3 of 21 |           3 of 21 |           2 of 9 |
| A line   | yes |                             18 of 21 |          17 of 21 |           0 of 9 |

Right answers in the two other conversations, of 24 in `results` and of 15
in `full`:

| Plugin   | `results`, no key | `results`, key | `full`, no key | `full`, key |
| -------- | ----------------: | -------------: | -------------: | ----------: |
| Baseline |                15 |             19 |             12 |          12 |
| Listed   |                20 |             24 |             10 |          13 |
| A line   |                15 |             18 |             11 |          10 |

Listed reached the rule, with 7 more questions that had a call and 8 more
right, and is what was built. A line fell one short of it on both, 6 and 6.

- With a key, every question counted as having a call had one to `find`,
  and with the tools listed each of those 19 was answered right.
- With the tools listed the agent searched for no tool: none of the 138
  questions had a call to Claude Code's tool search, where 85 of the
  baseline's 138 had one.
- With no key there is no `find`, and listing `recall` did not make the
  agent fetch more: by meaning it called for 4 questions where the baseline
  called for 8, and was right on 3 where the baseline was on 4, which is no
  further apart than one set of three runs lies from the next. Its answers
  with no call say that the result would be recalled given its id: nothing
  in front of the agent says which of thirteen tickets is the one asked
  about.
- Asked with a key for a code further down a document, the agent with the
  tools listed calls `find` for 9 of 9 and is right on 0, where the baseline
  called it for 7 and was right on 1: in this code, from before #55, `find`
  answers that no result is about it.
- A question's first request was no larger with the tools listed: a median
  32,768 tokens against 32,801, in `opaque` with a key. The 30 questions
  there took 197 seconds and 0.95 USD, where the baseline took 520 and
  1.48; `recall` was called 7 times in them, where the baseline called it
  32 times.
- With a key, calling `find` more often is sending more often: each call
  sends the provider the question and, of every result moved out, its call
  and a digest of it. Over the three conversations `find` was called in 51
  of 69 questions with the tools listed, where the baseline called it in
  27, and in 18 of 24 in `results`, where every call names the file it
  read and the baseline called it in 5.

Sonnet 5.5 on `opaque`, one run of the baseline and one with the tools
listed, came out the same either way: with a key it called `find` for 6 of
the 7 questions by meaning and was right on 6, and on 1 of the 3 codes; with
no key, right on 5 and on 1. It searched for a tool in each of the
baseline's 20 questions and in none with the tools listed.

### As it is merged

While this was measured `find` came to look for a value in the whole of
each result ([above](#find-asked-for-a-value), #55), so the code that is
merged was measured once more: main at `d43ffeb` with the two hooks, on the
same buildings, with a key, three runs with Haiku 4.5.

| Asked                | Calls `find` |    Right |
| -------------------- | -----------: | -------: |
| `opaque`, by meaning |     20 of 21 | 19 of 21 |
| `opaque`, by a code  |       9 of 9 |   9 of 9 |
| `results`            |     19 of 24 | 23 of 24 |
| `full`               |      7 of 15 | 12 of 15 |

None of the 69 questions had a call to the tool search, and 55 had one to
`find` (56 calls, where the baseline made 33), 19 of the 24 in `results`.
The codes, 0 of 9
right with the tools listed and `find` as it was, are 9 of 9 with the tools
listed and `find` as it now is. Sonnet 5.5, one run: `find` for 6 of the 7
questions by meaning and 6 right, and 3 of the 3 codes. With no key there is
no `find` and #55 changes nothing, so that arm was not measured again.

### A note in place of a file shown again

Since ADR 0015 a `/compact` typed by hand leaves four of the benchmark's
conversations as they were, and a question about a file that changed is
answered from the reading still in the conversation. The summary still runs
on a compaction Claude Code starts and on a conversation that is too full.
So `writes`, `prose`, `short` and `thinking` were built again and sent to
the summary with `maxAfterPercent` at 1, three runs with Haiku 4.5, and
asked the benchmark's questions: by the baseline (`44f410f`), and by a
checkout of it with a `prompt.attachment` hook on attachments of the kind
`file`. Where the plugin's line after the summary names a file as changed,
the hook puts a note in place of that file as Claude Code shows it again:
that it changed on disk since the conversation read it, the id its reading
comes back by, and that the file as it is now is read by reading it again.

The rule: built if what the file said when it was read is right at least 4
more times of 12 than the baseline and at least 10 times, what it says now
and an unchanged file come out no worse, and Sonnet 5.5 is no worse on one
run of `short`.

| Asked                                             | Baseline | With the note | As merged |
| ------------------------------------------------- | -------: | ------------: | --------: |
| What the file said when it was read, of 12        |        7 |            12 |         9 |
| What it says now, of 12                           |       12 |            12 |        12 |
| A file that is unchanged, of 12                   |       12 |            12 |        12 |
| The script's output no file holds any more, of 24 |       24 |            23 |        23 |

"As merged" is main at `d43ffeb` with the tools listed and no note, measured
on the same buildings afterwards; the note was not measured on it.

The note reached the rule. In `writes`, where the changed file is not shown
again, all three were right 3 times of 3; in the other three the baseline was
right 4 times of 9 and the code as merged 6 times of 9, each miss an answer
with no call that gave another text, and with the note each of the 12 answers
came after one `recall` and no reading of the file. That a miss gave another
text, and did not say it could not tell, is the grading model's reading of
it; right or not is the program's. By the sessions' records, which are
not published, the note stood in the changed file's place once in each of
the 81 sessions that asked a question of those three conversations, and in
place of no other file. Sonnet 5.5 on `short`, one run: right on all three
with the note, without it and as merged, with one `recall` for the reading
each time.

As measured there it was not built. A file Claude Code shows again after a
summary and a file the person hands over later reach the hook alike, as an
attachment of the kind `file` whose origin is the engine. And the
conversation does not say whether the summary was just now: Claude Code
keeps the last messages from before a summary behind the plugin's line, so
an answer after that line may be older than it. A first form of the hook
took such an answer for a later turn, and put the note in place of nothing
in 12 units. As measured, the note stands in place of a changed file
whenever it is attached, until the next summary.

### The note, narrowed

It is built narrowed (ADR 0018): the note does not stand in the file's place
once a file of its name has been handed over with an `@`, in anything typed
that stands behind the plugin's message, a command's arguments included.
The rule was set again before it was measured, since 4
more than the 9 of 12 of the code as merged cannot be reached: 11 of 12 or
more for what the file said when it was read, the two other questions about
files at 12 of 12, Sonnet 5.5 no worse on one run of `short`, and a file
handed over shown as it is. Main at `1d8dec8` with the hook, on the same
buildings, three runs with Haiku 4.5, against "As merged" above, which is
that code without the hook:

| Asked                                             | As merged | The note, narrowed |
| ------------------------------------------------- | --------: | -----------------: |
| What the file said when it was read, of 12        |         9 |                 12 |
| What it says now, of 12                           |        12 |                 12 |
| A file that is unchanged, of 12                   |        12 |                 12 |
| The script's output no file holds any more, of 24 |        23 |                 22 |

It reached the rule. Each of the 12 readings came after one `recall` and no
reading of the file, and each of the 12 answers on what the file says now
after one reading of it, which the note says how to get. The script's
output was missed twice, both times in `writes`, where no file is shown
again and no note stood; the code as merged missed it once there the same
way, looking through the files for it. Sonnet 5.5 on
`short`, one run: right on all three, with one `recall` for the reading and
one reading of the file for what it says now.

A file handed over was tried in sessions, on a copy of `short` after its
summary, with a checkout that also says what the hook answered, which is not
published. Asked with no `@` what the changed file said when it was read,
the hook put the note in place of that file and left the two other files
shown again as they were; the agent recalled the reading and answered right.
With `@changing-4.log` and a space at the head of a question on what the
file says now, the hook was asked of four files, the three shown again and
the one handed over, and left all four as they were; the agent answered
right, and recalled the reading as well. With the `@` run into Japanese text
(`@changing-4.logを見て。`, `@changing-4.log、`), Claude Code attached no
file for it: the hook was asked of the three shown again and left them as
they were, and the agent read the file and answered right. With
`@Changing-4.log`, the name in another letter case, Claude Code attached the
file under the name as typed: the hook left that one as it was and put the
note in place of the file shown again, and the agent answered right. One
session each: it shows what the hook does, and tells no rate. An `@` in a
command's arguments, and one typed while the agent was at work, were not
tried in a session.

The hook's own part, on a conversation of 4096 messages and 5.8 million
characters with the plugin's message at its head, takes 1.8 ms for a file,
timed with a script that is not published; what Claude Code takes to hand
the conversation over was not measured.

### An id copied wrong

Over every unit above `recall` was called 990 times. By the sessions'
records, which are not published, it refused the id 15 times, in 10
questions, all with Haiku 4.5: 12 times for an id that is not 64 hexadecimal
characters (twice the result's size in bytes was given in its place) and 3
times for 64 characters nothing is stored under. The rule: `recall` takes an
id it can match to one ticket of the conversation by its first 16 characters
or more, if 3 calls or more are refused and more than half of them match so.
10 of the 15 do; 3 go wrong at the thirteenth character, and 2 are no id.
That reaches the rule. Five of the ten are of two questions, where the agent
gave the first half of an id two and three times over. It is built
([below](#the-id-that-was-meant)).

What it would bring in these units is small. In 8 of the 10 questions a
later `recall` went through, and the two others were answered right without
it. 8 of the 10 were answered right, and in the 2 that were not a `recall`
had gone through: no answer was lost to a refused id here.

### The id that was meant

As measured here, `recall` takes an id it would refuse for the one id written in the
conversation that begins with its first 16 characters; since #107 it takes
the one that shares the most characters with it from the first, 8 or more
([ids copied wrong in one session](#ids-copied-wrong-in-one-session-that-compacts-several-times)). The id is looked for
in the user messages and in what tools returned, not in what the agent said
or put in its calls: an id the agent gave wrong before stands there, and
would be a second one to match. What the agent wrote can still reach the
user messages and the results, as Claude Code's summary or as a kept part
`recall` returned; an id copied wrong there in full, 64 characters, makes
two, and the id is refused. Where no id begins so, or more than one, the id is refused as
before; so was every such id in a subagent's conversation, which then held no
tickets (since ADR 0026 its own conversation is read). What comes back is the result as it was stored, checked against its
id as any other.

The 10 above were counted against every id stored for the units. Counted
again as the plugin does it, each of the 15 refusals against the
conversation as it stood at that call (the transcript of the session the
question went on from, and what tools had returned in the question's own
session before the call; neither is published): 10 are told by one id, each
the stored id nearest to what was given, and none by two. Nine of the ten
ids were written in the conversation the question went on from, and one in
what `recall` had returned earlier in the question.

In a session, on a copy of `prose` after its summary: the 32 characters an
agent had given there, the first half of the id of the kept part, were
handed to `recall` again. With this change the 34,059 characters stored came
back, the same character for character; the code before it answered that
the id is not 64 hexadecimal characters.

The code as merged (main at `5f65834` with this change; since, an id that
could tell no id is refused without the conversation being read, with the
same refusal as before; by the records none of the calls measured here was
such an id) was measured on the
same buildings, three runs with Haiku 4.5. The four conversations sent to
the summary, as for the note above:

| Asked                                             | The note, narrowed | And the id that was meant |
| ------------------------------------------------- | -----------------: | ------------------------: |
| What the file said when it was read, of 12        |                 12 |                        12 |
| What it says now, of 12                           |                 12 |                        12 |
| A file that is unchanged, of 12                   |                 12 |                        12 |
| The script's output no file holds any more, of 24 |                 22 |                        22 |

And the questions `find` is for, with no key, where `recall` is called most.
Right answers, against "Listed" above, which is the tools listed and
`recall` as it was:

| Asked                       | Listed | And the id that was meant |
| --------------------------- | -----: | ------------------------: |
| `opaque`, by meaning, of 21 |      3 |                         3 |
| `opaque`, by a code, of 9   |      3 |                         0 |
| `results`, of 24            |     20 |                        19 |
| `full`, of 15               |     10 |                        15 |

37 of 69 where it was 36. By the records, in `opaque` no id was copied
wrong in either, so nothing of this change stood between the 3 codes and the
0: five of the nine were answered with no call to `recall`, where three were
with the tools listed, and three after twelve calls each.

In these units `recall` was called 171 times. By their records, which are
not published, two of the calls gave an id copied wrong: 64 characters that
differ from the stored id from the thirty-first on, and 63 with one dropped
after the fiftieth. Both were taken, each for the one stored id that begins
as it does, and the result came back as it was stored, 34,059 and 17,937
characters; both questions were answered right. None was refused.

Sonnet 5.5, one run each on the same code, came out as it had before this
change: on `short` sent to the summary, right on all three questions about
files, with one `recall` for the reading and one reading of the file for
what it says now; on `opaque` with no key, right on 5 of the 7 questions by
meaning and on 1 of the 3 codes. It called `recall` 104 times in the two,
and by the records gave no id copied wrong.

### Where the units are, and what this does not show

The units are in `bench/results/2026-10-03-listed/` (`baseline`, `listed`,
`line`, `merged`, `meant`) and `bench/results/2026-10-03-shown-again/`
(`baseline`, `note`, `merged`, `narrowed`, `meant`), and a test holds the
tables and the figures above to them. How often `recall` refused an id or
took one copied wrong and what became of those questions, and how often the
note stood in a file's place, are of the sessions' records.
`listed`, `line` and `note` were measured on checkouts of `44f410f` made for
measuring, whose commits are in no branch; the code of `merged` is the code
the change that listed the tools merged, the code of `narrowed` the code the
change that built the note merged, and the code of `meant` the change to
`recall` before what could tell no id was refused without the conversation
being read (above). On each `npm run check:host` passed on Claude
Code 2.1.288, and `claude plugin validate` took the hooks on 2.1.285 to
2.1.288.

Not measured: Opus; a working session; a compaction Claude Code starts on
its own; a question asked many turns after the compaction, where each of
these was asked right after it; a Claude Code older than 2.1.285.

## The README's demo, after the rename

A fresh conversation under 0.4.0, on a machine holding
`~/.claude/jev-lossless-compaction/` with 153 results from earlier
versions: the agent made thirty-seven `Read` calls over sixteen Zig source
files and was then asked to `/compact`. What the compaction reported, and
the line that stands in a result's place:

```text
lossless-compaction: moved 6 of 21 tool results out (844544 -> 548237 chars, about 52357 of 167000 tokens in use) in 61 ms

[moved out] Read result, 83261 bytes; recall with mcp__lossless-compaction__recall id ed8701f23087852c07ee8eb0b91b9335cc94cc8b21e42826c6b684299e8008e3
```

Six left because six reached the target. A compaction had already run on
its own while the files were being read (`moved 2 of 16 tool results out
(708754 -> 612172 chars, about 23251 of 167000 tokens in use) in 23 ms`),
so eight results in all left this conversation: 83,261 bytes (contract.zig),
77,743 (boundary.zig), 65,420 (oracle.zig), 50,064, 47,963, 42,670, 13,974
and 13,896. Four of the eight had the text of results that earlier sessions
had stored, so the old directory's index grew from 153 to 157 entries, and
no `~/.claude/lossless-compaction/` was made. The README's header image
draws the three largest.
In the same setting, a conversation compacted by 0.3.0 was compacted again:
its thirteen old tickets were rewritten to the current wording, none left
out, and three more results left; `find`, asked about one of the thirteen in
a copy of that conversation not compacted again, returned it at probability
0.99; and with an empty `~/.claude/lossless-compaction/` made by hand,
`recall` of an old ticket's id returned the result, and the new directory
stayed empty.

## The size after a compaction

On 2026-10-01, Claude Code 2.1.286 with Claude Opus 5.5 at medium effort, a
967,000-token window. Three new sessions each read source files or Markdown
with `Read`, one at a time, then ran `/compact`, then sent one line asking
for a one-word answer. The size estimated at the compaction is set against
the input tokens of that answer, cache reads and writes included. The
estimate counted from what stays is what Claude Code's breakdown put outside
the conversation (42,495 tokens in each: the rows in use other than
`Messages`, and the tokens in use less `Messages` came within 3 of it) plus
the rebuilt conversation, at three characters a token and at the session's
own tokens a character (the `Messages` row over the characters of the
conversation as sent: 0.375 and 0.450).

| Session | Next request | Before (`tokens` less moved out) | At 3 characters a token | At the session's figure |
| ------- | -----------: | -------------------------------: | ----------------------: | ----------------------: |
| Eight source files, one word on each | 53,305 | 91,829 (+72 %) | 60,088 (+12.7 %) | 62,278 (+16.8 %) |
| Twelve Markdown files, a summary in Japanese of each | 67,682 | 103,021 (+52 %) | 60,003 (−11.3 %) | 66,102 (−2.3 %) |
| Eight source files, a sentence on each | 53,513 | 97,740 (+83 %) | 60,207 (+12.5 %) | — |

The third session's breakdown was not recorded; its figure at three
characters a token takes the 42,495 of the other two. The sessions held little thinking (908 and 27,834
characters, signatures included, in the two recorded). The figure before
was off with almost none: three characters a token underestimates what
source code that was moved out took. The session of #24, which held
228,230 characters of thinking, was 72 % over; its breakdown was not
recorded.

## A file shown again after a summary

On 2026-10-02, Claude Code 2.1.287. [The benchmark](#what-could-be-answered-afterwards)
asked what a file said when it was read, the file having been regenerated
since, and in four of its conversations Haiku 4.5 answered with what the
file says now twelve times of twelve in each arm. This is why, what was
tried against it, and what the line the plugin now puts after a summary
changes (#14, ADR 0014).

### What Claude Code shows again

A copy of the plugin that says what Claude Code injects for the model was
run on `short`, which goes to the summary. In the first request after the
summary came three attachments of the kind `file`, for the three files read
last, each beginning

```text
Called the Read tool with the following input: {"file_path":"…/changing-4.log"}
Result of calling the Read tool:
1	record 84-0001: …
```

and holding the file as it was on disk then: for the file that had been
regenerated, the new text. Which files and how many is Claude Code's to
choose; three is what was seen in `short`. Asked what its line said when it was read, the
agent called no tool and answered with the new line, in one answer "looking
at the results shown in the system reminder from when I read" the file. The
twelve wrong answers of the benchmark are these: `full`, `prose`, `short`
and `thinking`, three runs each, no call in any. In `writes`, which goes to
the summary too, the answers show no sign of the log being shown again: the
agent had written eight files after reading it, the plugin's arm fetched
the reading and was right three times of three, and the built-in arm said
it could not tell.
In `results`, which the plugin compacts by itself, nothing is shown again.

### What was tried before anything was built

In copies of the plugin, `short`, the same question asked five times of
forks of one summary (once where the table says so). These units are not
published.

| What was done | Haiku 4.5: right | Sonnet 5.5: right |
| --- | ---: | ---: |
| Nothing | 0 of 5 | 5 of 5, and 5 of 5 in `prose` |
| A line after the summary: files shown again are as they are now | 0 of 1 | |
| A line after the summary listing the files read and the ids of their results | 0 of 1 | |
| A line in front of the file as it is shown again, saying it is not the text that was read, with no id | 0 of 1 | |
| A line after the summary naming the file as changed, with the id of its reading, in five wordings | 2, 3, 2, 2 and 2 of 5 | 5 of 5 |
| The same line in front of the file as it is shown again | 2 of 5 | |
| The line after the summary, and the changed file not shown again | 5 of 5 | 5 of 5 |

Sonnet fetched the reading unprompted every time, with two calls to
`recall` (the part, then the result named in it); with the line, one. With
the changed file left out, both models also answered what the file says now
five times of five, reading it again, and what an unchanged file says five
times of five. Leaving it out needs a hook on what Claude Code injects, and
was not built then (ADR 0014). A line in the file's place is built since
([the note, narrowed](#the-note-narrowed), ADR 0018).

In one of the five wordings the agent called `recall` all five times and
was refused three: it had copied the 64 characters of the id wrong, was
told the id was not 64 hexadecimal characters, and gave up saying the id
had been cut short. In the records of the sessions of 2026-10-02 kept
beside the benchmark's box, which are not published, that happened in 4 of
the 103 calls to `recall` found there. `recall` takes such an id since,
where its first 16 characters tell which one was meant, and since #107 its
first 8 ([the id that was meant](#the-id-that-was-meant)).

### With the line

`bench/results/2026-10-02-changed/`: the five conversations that go to the
summary, three runs each with Haiku 4.5 and `prose` and `writes` once with
Sonnet 5.5, the plugin's arm, with the line (the plugin's code
`5a66b262b91e`; its commit, `d3003af230fe`, is of a checkout made for
measuring and is in no branch). They are set against the plugin's arm of
[the benchmark](#the-benchmark), measured on the same buildings of the
conversations with code that differs in how a size is counted, which moves
nothing in these five either way. Right answers of three, without the line
and with it:

| Conversation | What the file said when it was read | What it says now | A file that is unchanged |
| --- | ---: | ---: | ---: |
| `full` | 0 · 3 | 3 · 3 | 3 · 3 |
| `prose` | 0 · 0 | 3 · 3 | 3 · 3 |
| `short` | 0 · 2 | 3 · 3 | 3 · 3 |
| `thinking` | 0 · 1 | 3 · 3 | 3 · 3 |
| `writes`, where the file is not shown again | 3 · 3 | 3 · 3 | 3 · 3 |

- Where the file is shown again, six right of twelve where there were
  none. The six came after one `recall` each by the id on the line; the
  six misses called nothing and gave the file as it is now. It is three of
  three in one conversation and none of three in another, and what tells
  them apart was not found.
- In `writes` the agent was right as before, with one `recall` an answer
  where it had needed two.
- A file that did not change is not named: the twelve questions about one
  were answered with no call, as before.
- Of the ninety-two calls to `recall` in these units none was refused for
  its id, by the sessions' records, which are not published.
- The questions the line has nothing to do with did not get worse: the
  script's output that no file holds any more was right 29 times of 30,
  where it was 26.
- Sonnet answered all three questions right in both conversations, as it
  had. For what the file said when it was read it called `recall` once in
  each; without the line it had searched Claude Code's own record of the
  session twice in `prose`, and called `recall` twice in `writes`.

A test holds the table, the first three points, the count of calls to
`recall` and Sonnet's answers to the units.

The units were measured before review changed what the plugin does with a
write that failed, with such a line outside its own message, with a path
too long to name and with a file that is not UTF-8. None of those occurs
in these conversations: with the code as it is, the message after the
summary names the same file under the same id in each of the five as with
the code that was measured (checked by compacting each once more with both,
in sessions that are not published).

In an interactive session, with `/compact` typed by hand, the plugin's
message stood after the summary with the line in it and Claude Code's three
files were shown under it; no question was asked there. And `short`
compacted twice in a row named `changing-4.log` under the same id after
both summaries: the second took it up from the first one's message.

### What this does not show

The question says the file has been regenerated; one that does not was not
asked. One log of a hundred lines and one question about it, in five
conversations: the same situation several times. Haiku and Sonnet only. A
compaction Claude Code starts on its own. A conversation whose `Read`
results had been moved out before it went to the summary, which the tests
cover and no session did. A working session.

## The size after a compaction, counted again

On 2026-10-02, Claude Code 2.1.287.
[The benchmark](#the-plugins-estimate-of-what-is-left) left the size 0.6.0
counts up to 48 % over and 41 % under where nothing could be moved, without
measuring why, and named a conversation in which that could do harm without
having one. This is what was measured for #37, and what the count that
replaced it (ADR 0013) came to.

The probes are in `bench/results/2026-10-02-estimate/`: the six
conversations of the benchmark and two made for this, `mixed` and
`japanese`, each compacted by the model that built it (Haiku 4.5, and for
`japanese` Opus 5.5 as well, in a building of its own); and `results` and
`mixed` as Haiku built them, compacted by Sonnet 5.5. Each was compacted
with the count of ADR 0013 (the plugin's code `eab2b3d9205e`; its commit,
`df7c325027f2`, is of a checkout made for measuring and is in no branch)
and with 0.6.0 (`583c90b50929`). A test holds what is said here of those
units to the units.

### Why 0.6.0 was off

A copy of 0.6.0 that also says what it counted with was run on the same
conversations with Haiku (its units are not published). What is not the
conversation came to 8,506 tokens in every one, and the `Messages` row to
what was in use less that, within 2. The size was off in the conversation's
part alone, in three ways.

- **The floor.** 0.6.0 counts no less than a token to three characters. The
  `Messages` row over the characters sent came to 0.22 in `prose` and
  `full` and 0.25 in `mixed`, which are mostly pasted English prose. They
  were counted at a third: 37 %, 49 % and 39 % over.
- **Signatures and ids in what the row was divided by.** The row was spread
  over the characters of the conversation as it was sent, and the figure
  then applied to the characters of the messages the hook is handed, which
  hold neither signatures nor the ids of calls. In `short` those were
  53,661 and 33,561 characters: 22 % under. In `thinking`, 67,818 and
  30,628: 13 % under what was in use less its thinking.
- **One figure for every character.** In `japanese` six English logs leave
  and 57,000 characters of notes in Japanese stay, which come to about three times
  the tokens a character: 20 % under with Haiku, 18 % with Opus.

### The conversation it did harm in

`mixed` is 350,000 characters of pasted English prose and six logs of
17,000 characters that can leave. 0.6.0 moved the six out and counted
144,466 tokens in use: 86.5 % of the 167,000 it measured against, over the
75 % that may stay, so it handed the conversation to Claude Code's summary.
Made to compact it all the same (`maxAfterPercent` 100), what it had left
came to 103,634 tokens in the next request, 62 %. The count was 39.4 % over
and the summary need not have run. The count of ADR 0013 put the same
conversation at 110,755 and compacted it. Compacted by Sonnet it went the
same way: 0.6.0 handed over at 145,338, and the count of ADR 0013 compacted.

### What the count of ADR 0013 came to

| Conversation | Compacted by | 0.6.0 | its size | off by | ADR 0013 | its size | off by | Measured against |
| ------------ | ------------ | ----- | -------: | -----: | -------- | -------: | -----: | ---------------- |
| `results`  | Haiku  | moved 11 of 15 |  36,926 |  −0.5 % | moved 10 of 15 |  45,354 |  +3.5 % | 37,130 and 43,833 sent next |
| `mixed`    | Haiku  | handed over    | 144,466 | +39.4 % | moved 6 of 9   | 110,755 |  +7.0 % | 103,634 and 103,497 sent next |
| `japanese` | Haiku  | moved 6 of 9   |  70,495 | −19.8 % | moved 6 of 9   |  87,128 |  −0.7 % | 87,913 and 87,776 sent next |
| `japanese` | Opus   | moved 6 of 9   |  71,146 | −17.9 % | moved 6 of 9   |  85,030 |  −1.3 % | 86,687 and 86,113 sent next |
| `writes`   | Haiku  | nothing moved  |  64,406 |  −3.9 % | nothing moved  |  65,654 |  −2.0 % | 67,017 in use, less thinking |
| `prose`    | Haiku  | nothing moved  |  79,233 | +36.5 % | nothing moved  |  57,074 |  −1.7 % | 58,055 in use, less thinking |
| `short`    | Haiku  | nothing moved  |  20,462 | −21.9 % | nothing moved  |  24,448 |  −6.7 % | 26,204 in use, less thinking |
| `full`     | Haiku  | nothing moved  | 211,577 | +48.9 % | nothing moved  | 141,469 |  −0.5 % | 142,128 in use, less thinking |
| `thinking` | Haiku  | nothing moved  |  20,185 | −13.3 % | nothing moved  |  22,764 |  −2.3 % | 23,294 in use, less thinking |
| `results`  | Sonnet | moved 11 of 15 |  37,533 |  +2.1 % | moved 10 of 15 |  45,879 |  +5.0 % | 36,760 and 43,690 sent next |
| `mixed`    | Sonnet | handed over    | 145,338 |  +5.4 % | moved 6 of 9   | 110,911 | −19.4 % | 137,834 and 137,646 sent next |

Where results were moved out, the measure is what the next request sent;
for `mixed` under 0.6.0 that is the unit made to compact it. Where nothing
could be moved, nothing the plugin would have rebuilt was sent, and the size
is set against what was in use before less the thinking, which the session
that built the conversation counted. The count of ADR 0013 runs a little
under that, 0.5 % to 6.7 %: it also leaves out what Claude Code added to
the conversation as it sent it, which a rebuilt conversation would not hold
either. `short`, 38 results each sent with a reminder after it, has the
most of that.

The two do not move the same results out of `results`. 0.6.0 took a result
to save a third of a token a character whatever the size was counted at,
and moved eleven out for a goal ten were enough for.

The last two rows are another case, [below](#compacted-by-another-model).

### What a signature says of the thinking

A plugin cannot read how many tokens the thinking in a conversation is. Per
response of the sessions that built a trace, the length of the thinking
block's signature was set against the thinking tokens the response used
(the session's cumulative usage, one step less the one before):

| Built with | Blocks | Thinking tokens | Characters of signature | Fitted: a block | a token |
| ---------- | -----: | --------------: | ----------------------: | --------------: | ------: |
| Haiku 4.5, `thinking` | 16 | 11,195 | 33,876 | 560 | 2.22 |
| Haiku 4.5, `japanese` | 22 | 6,191 | 26,164 | 477 | 2.39 |
| Opus 5.5, `thinking` at high effort | 10 | 2,231 | 14,644 | 1,029 | 1.95 |
| Opus 5.5, Japanese with eight puzzles at the highest effort | 11 | 4,743 | 22,052 | 1,091 | 2.12 |

The two on Opus were built for this and are not published; Opus used little
thinking at any effort. The plugin does not know what a block carries
whatever it thought, which differs by model, and takes the shortest
signature of the conversation for it, at 2.3 characters a token. Set
against what the session counted:

| Conversation | Blocks | Shortest signature | Estimated | Counted | Estimated / counted |
| ------------ | -----: | -----------------: | --------: | ------: | ------------------: |
| `results`, Haiku | 21 | 476 | 998 | 873 | 1.14 |
| `writes`, Haiku | 26 | 512 | 1,483 | 1,332 | 1.11 |
| `prose`, Haiku | 12 | 548 | 1,240 | 881 | 1.41 |
| `short`, Haiku | 16 | 552 | 2,162 | 1,524 | 1.42 |
| `full`, Haiku | 14 | 564 | 925 | 896 | 1.03 |
| `thinking`, Haiku | 16 | 592 | 10,610 | 11,195 | 0.95 |
| `mixed`, Haiku | 21 | 456 | 1,497 | 1,001 | 1.50 |
| `japanese`, Haiku | 22 | 492 | 6,670 | 6,191 | 1.08 |
| `japanese`, Opus | 4 | 1,016 | 624 | 647 | 0.96 |
| Working session A, Opus | 235 | 944 | 83,346 | 82,935 | 1.00 |
| Working session B, Opus | 172 | 872 | 54,017 | 83,980 | 0.64 |
| Working session C, Opus | 217 | 1,044 | 82,797 | 100,234 | 0.83 |
| Working session D, Opus | 212 | 1,080 | 49,880 | 53,396 | 0.93 |
| Working session E, Opus | 220 | 1,004 | 63,282 | 54,650 | 1.16 |

### Five long working sessions

The benchmark's conversations are started without the user's settings and
hold little that Claude Code adds. Five long sessions of real work on Opus
5.5, in a window of 1,000,000 tokens (967,000 to the plugin), were forked
with the plugin loaded as the benchmark loads it, asked for one word so
that the breakdown was the fork's own, compacted with `/compact`, and asked
for one word again. Nothing of them is published but these counts.

|                                                        |                 A |                 B |                 C |                 D |                 E |
| ------------------------------------------------------ | ----------------: | ----------------: | ----------------: | ----------------: | ----------------: |
| Thinking blocks                                        |               235 |               172 |               217 |               212 |               220 |
| Tool results                                           |               223 |               192 |               226 |               281 |               294 |
| Images in results                                      |                 0 |                 0 |                 0 |                29 |                11 |
| In use before                                          |           513,041 |           431,509 |           472,859 |           451,987 |           483,258 |
| Not the conversation                                   |             7,807 |             7,641 |             7,807 |             7,807 |             7,805 |
| `Messages` row                                         |           505,234 |           423,868 |           465,052 |           444,180 |           475,453 |
| Characters of the messages handed to the hook          |           442,639 |           465,659 |           511,590 |           421,048 |           483,064 |
| Characters sent: what was said, inputs and results     |           774,766 |           694,573 |           749,266 |           662,184 |           745,261 |
| Characters of signatures                               |           413,536 |           274,224 |           416,980 |           343,684 |           363,788 |
| Thinking, estimated                                    |            83,346 |            54,017 |            82,797 |            49,880 |            63,282 |
| Results moved out                                      |                10 |                27 |                27 |                43 |                24 |
| Characters of the messages afterwards                  |           399,712 |           351,748 |           349,161 |           357,754 |           422,011 |
| Sent in the next request                               |           234,380 |           196,190 |           199,524 |           209,616 |           242,532 |
| Size, the row spread over the messages handed over     | 394,510 (+68.3 %) | 293,994 (+49.9 %) | 282,957 (+41.8 %) | 311,251 (+48.5 %) | 356,461 (+47.0 %) |
| Size, what was added counted as the messages are       |  216,247 (−7.7 %) |  187,885 (−4.2 %) |  183,115 (−8.2 %) |  188,976 (−9.8 %) |  222,661 (−8.2 %) |
| Size, the count of ADR 0013: what was added at 4/5     |  237,416 (+1.3 %) |  202,312 (+3.1 %) |  196,833 (−1.3 %) |  204,856 (−2.3 %) |  240,523 (−0.8 %) |
| Size, 0.6.0's way of counting                          | 173,850 (−25.8 %) | 158,077 (−19.4 %) | 143,582 (−28.0 %) | 145,499 (−30.6 %) | 177,361 (−26.9 %) |

What was sent held half to four fifths as much again as the messages
handed to the hook (0.57 to 0.86 of them): reminders after results and
after what was said, the text of commands and of what was attached. Spread
over the messages alone, as ADR 0013 first decided, the row counted all of
that as staying: 42 % to 68 % over. That was the count the benchmark had
put within 8 % wherever the model that built a conversation compacted it,
since little is added to its conversations.

Counted as the messages are, what was added leaves the sizes 4 % to 10 %
under. It comes to fewer tokens than the same weight of the messages would:
the share of the messages' tokens a character at which each session comes
out exact is 0.83, 0.88, 0.76, 0.75 and 0.78. It is plain English for the
most part, and the messages are code and JSON. At four fifths, chosen on
the first four, the sizes are within 3 %; the fifth, measured with that,
came 0.8 % under.

Each of the first four was measured with the count as it stood, and its
line said 394,512 (A, the row over the messages), 186,074 (B), 183,115 (C)
and 188,976 (D); the other figures for them are the counts applied to what
the plugin was handed and gave back. E was measured with the count as it
is, and its line said what the table says. A and B's characters are from a
second fork compacted at once, which sends nothing, and their rows from
the first fork after its one request, which the second did not hold: the
difference is one request of a few dozen characters, and the sizes differ
by a few hundred tokens from the lines that were shown (213,657 and
186,074). The figures for 0.6.0 are its way of counting applied to the
conversation the count left, not runs of 0.6.0.

### Compacted by another model

`results` and `mixed`, built with Haiku, were compacted by Sonnet 5.5
before Sonnet had answered: the first thing the fork is sent is the
`/compact`. The breakdown a plugin reads is reconciled to the last
response, which Haiku gave, so the size is in Haiku's tokens: 45,879 and
110,911, against 45,354 and 110,755 when Haiku compacted. What Sonnet was
then sent was 43,690 and 137,646. The logs of `results` come to the same
tokens for both models, and the prose of `mixed` to a third more for
Sonnet: 5.0 % over and 19.4 % under. 0.6.0 came 5.4 % over on `mixed` here
because its floor of a third is near what Sonnet counts for prose; it
handed the conversation over all the same.

### Not measured

A conversation that is mostly images. A conversation built with Sonnet. A
conversation on Opus that is mostly thinking: in the five working sessions
thinking was 11 % to 21 % of what was in use. 0.6.0 itself on the working
sessions. And the count of hand-overs in
[Moving out tool inputs](#moving-out-tool-inputs-counted-in-hand-overs) was
made with 0.6.0's way of counting, and was not made again with this one.

## An image in a tool result

On 2026-10-01, Claude Code 2.1.286 with Claude Haiku 4.5, in throwaway
sessions with the installed copy of the plugin disabled.

What a `session.compact` hook is handed for a `Read` of a PNG: the result's
`text` is empty, and the tool's record holds the bytes on both sides of the
call (`result.file.base64`, with `type` and the dimensions). Read with its
blocks, the same result is a `tool_result` whose `content` is an `image`
block with a `base64` source, and after it, where the host added one, a
text block beginning `<system-reminder>`. Of the 621 images in the local
transcripts of #25, every one stands in a tool result (618 results, 109 of
them with text as well); none was pasted into a message, and there was no
document.

What a plugin's tool may return: an array holding
`{ type: 'image', source: { type: 'base64', media_type, data } }` reached
the model as an image (it named the colour of a plain blue one). The same
bytes as an MCP result (`{ content: [...], isError }`) were refused as not
a string, and as `{ type: 'image', data, mimeType }` in an array made the
request fail with "an image in the conversation could not be processed".

With this change loaded as the plugin (`claude --plugin-dir`):

- A conversation of one image and one text file, compacted with `/compact`:
  `moved 1 of 2 tool results out, 1 image with them`, where 0.5.2 said
  `built-in compaction: … cannot carry: image`. The next turn was answered;
  `recall` with the id in the line returned the image and the model said
  what it showed; the session closed and resumed answered from the line.
  Of the rows written after the compaction and before that `recall`, none
  held the image's bytes. Compacted again after the `recall`, the recalled
  result left under the same id (`moved 1 of 4 tool results out, 1 image
  with them`), and the store held as many files as before.
- Five PNG files of 1,000 by 700 pixels, which Claude Code held as JPEG
  (131,028 characters in base64 for the one read back), between four text
  files of 48,643 characters: `moved 8 of 9 tool
  results out, 5 images with them (209371 -> 54171 chars, about 72046 of
  167000 tokens in use)` in 68 ms, from 134,981 tokens. The next request
  sent 55,699: the estimate was 29 % over. No row after the compaction held
  an image's bytes. `recall` of the first returned it as an image, and the
  model described it.

Not measured: an image pasted into a message, and a document.

## Moving out tool inputs, counted in hand-overs

On 2026-10-01, offline: no model was called and nothing was sent. The
transcripts Claude Code keeps on one machine held 492 compactions, 227 of
them distinct (a forked session copies the ones before it). For 84 of
those, 81 of them run by hand in forks made for other measurements, the
message before the compaction is in no file, and the conversation cannot be
put together. That leaves 143: 102 automatic ones from 56 sessions in 5
projects, 75 of them in one project, and 41 run by hand.

This count did not tell a session run in a directory made for measuring from
a working one. Counted again with those set apart:
[a `/compact` with nothing to move out](#a-compact-with-nothing-to-move-out).
The same 102 on the current code:
[the automatic compactions of 2026-10-01, on the current code](#the-automatic-compactions-of-2026-10-01-on-the-current-code).

Each conversation was put together as it stood before the compaction: the
messages back to the compaction before it, with what that one left in
place put after its summary. (In the 42 conversations where that applies,
the first request plus the characters over three comes to a median 79 % of
the tokens Claude Code recorded with them and 78 % without; left out, two
more of the 102 have nothing to move out.) It was then given to `compact()`
as it is at the default settings then (`targetPercent` 40), with the tokens Claude Code recorded
before the compaction. The window is the one the plugin stated where it ran
(29 conversations), 967,000 where the session went over 200,000 tokens, and
167,000 otherwise. For 7 automatic ones (and 12 run by hand) the window is
not known; those 7 were compacted at 67,000 to 77,000 tokens. What is not the conversation is taken as the session's
first request, which was 6 to 10 % over the breakdown's figure in the three
sessions where both are known; the tokens a character are the rest over the
conversation's characters, at no less than one in three (21 of the 102 are
at that floor). Where the plugin itself ran, its line gave the same number
of results and characters before as this reconstruction in 17 of 29
conversations: 13 of one session with the small window and 4 short ones
made for measuring. In the other 12 the characters were off by 0.2 to
8.4 % in ten, and by 30 % and 41 % in two; six of the 12 were run by hand,
all with the large window, and six are of the session with the small one.
How many results were moved out is not compared: the versions that ran then
moved fewer.

What the 102 automatic compactions come to:

| | Conversations |
| --- | ---: |
| Compacted by moving results out | 85 |
| Handed over: holds an image, a document or another block that is not rebuilt | 15 |
| Handed over: nothing could be moved out | 2 |
| Handed over: still too full afterwards | 0 |

No conversation was handed over for being too full, so moving inputs out
had none to save. The two with nothing to move out held no input of
`minChars` or more either. Measuring against the tokens before each
compaction as the window instead changes no row.

Three automatic compactions are not among the 102, the message before them
being in no file. Put together from the order of the rows instead, two held
a block that is not rebuilt. The third is the one compaction where the
plugin itself said "too much is still in use" (2026-09-30: 3 of 39 results
moved out, about 136,867 of 167,000 tokens by the estimate of that
version, the 82 % in ADR 0007). Its 39 results and 238,392 characters
agree with the line (39 and 236,225), and it held no input of `minChars`
or more: the one hand-over for being too full that there is, moving inputs
out would not have changed. Whether `compact()` as it is would hand it over
is not told: Claude Code recorded fewer tokens for it than the session's
first request, so the size afterwards cannot be counted the way it is
above.

Of the 41 run by hand, 28
were compacted, 3 held a block that is not rebuilt, and 10 had nothing to
move out, 9 of them with no tool result at all; none of those 10 held a
long input.

How near the 85 came to 75 % of the window, and what moving inputs out
would leave: `Write`, `Edit`, `MultiEdit` and `NotebookEdit` inputs of
`minChars` or more, older than the newest `keepTokens` of the conversation,
each counted as a ticket's length.

| | As it is | `Write`, `Edit` moved | and `Bash` |
| --- | ---: | ---: | ---: |
| Fullest afterwards, share of the window | 72.8 % | 68.0 % | 66.9 % |
| Median, share of the window | 50.0 % | 43.3 % | 39.7 % |
| Conversations over half the window | 43 | 27 | 23 |
| 967,000-token window (61): median share | 48.4 % | 41.4 % | 38.1 % |
| 167,000-token window (24): median share | 58.3 % | 58.3 % | 58.3 % |

In the 61 with the large window, inputs were a median 57.5 % of the
characters left; in the 24 with the small one, 6.8 %, and no input was long
enough to move. All 60 conversations in which an input would have been
moved are of one project (40 sessions), as are 60 of the 61 with the large
window: what the two right-hand columns take off comes from that project
alone (a median 41.4 % over its 60 conversations, where it was 48.5 %).

Nineteen of the 24 with the small window are one session that the plugin
itself compacted again and again, each starting from what its last
compaction left. Over them the results in the conversation went from 6 to
117, the share of the window in use afterwards from 53 % to as much as
67 %, and inputs from 1 % to 12 % of what was left, none of them long.

Why results stay, over the 34,631 results of the 102 conversations: 29,617
are under `minChars`, 1,155 are among the newest `keepTokens`, 804 failed,
and all 3,055 others were candidates. A ticket an earlier compaction left
is counted with the short ones here, since the store was empty.

What this does not show. Of the 61 conversations with the large window, 34
start at the beginning of a session and 27 from what the built-in summary
left: none comes after compactions by the plugin in a row, where inputs
that are never moved out add up, and the one run of those there is held no
long input. And the size afterwards is an
estimate: with what is not the conversation taken from the first request,
as here, a conversation near the line can fall on either side of it.

## When Claude Code's summary runs

On 2026-10-01, Claude Code 2.1.286 with Claude Haiku 4.5, before the
clean-up (ADR 0006) and the private directory were merged. A conversation of
four turns: a first message giving seven details (a codename, a reviewer's
name, a deadline, a build number, a port, a dependency not to add, a
colour), then four `Read`s of 2,200-line data files, two runs of a script
printing 401 lines, and an answer giving three numbered reasons. It was
copied twice and compacted with `/compact`, once by 0.4.0 and once by this
change, both set so that nothing could be moved out (`minChars` at its
largest), so that Claude Code's own summary ran each time. Before the
questions, the data files and the script were taken out of the working
directory, and `Bash`, `Glob` and `Grep` were refused; `Read` was allowed,
since a `recall` result over about 50 KB comes back as a file to read.
Twenty questions, one fresh copy of the compacted conversation each.

|                                                         | 0.4.0 | This change |
| ------------------------------------------------------- | ----- | ----------- |
| A row of a data file or a line of the script's output, 10 asked | 1 | 8 |
| What was said in the conversation, 10 asked             | 10    | 10          |

Every one of the eight came back through `recall`: three in what `recall`
returned, five in the file Claude Code saved a large `recall` result to.
The one 0.4.0 answered, the agent found by reading Claude Code's own
transcript of the session from disk. The ten about what was said were
mostly in the summary itself (seven were answered with no tool at all, by
both); one answer in Japanese is counted right by hand. The summary ran in
21.5 s after 0.4.0 and in 27.5 s after this change.

A conversation holding an image (`Read` of a PNG and of a text file),
compacted by this change: the kept part held `[image not kept]` and the
text file's ticket, and asked for a line of the text file after it was
taken away, the agent recalled the part, then the result, and answered.
In both conversations the message holding the tickets stood right after
the summary, and a further turn and a resumed session read it; the
conversation handed back was no larger than the summary and what Claude
Code kept.

## A `/compact` with nothing to move out

On 2026-10-02 and 03, for #44 and ADR 0015: how often a compaction finds
nothing to move out in working sessions, what a compaction left undone comes
to, and the benchmark with it.

### How often, in working sessions

Offline, as in
[Moving out tool inputs, counted in hand-overs](#moving-out-tool-inputs-counted-in-hand-overs)
and with `compact()` as it is at 0.6.1: no model was called and nothing was
sent. The transcripts held 819 boundaries, 501 of them distinct. 169 held a
conversation already counted, and for 91 the message before the compaction
is in no file. Of the 241 left, 117 were of sessions run in a directory made
for measuring — a benchmark's box, a probe — and are set apart. That leaves
124 compactions of working sessions, from 2026-09-03 to 10-02, of 63
sessions in 3 projects:

|               | Compacted by moving results out | Nothing to move out | Still too full afterwards | Not rebuilt |
| ------------- | ------------------------------: | ------------------: | ------------------------: | ----------: |
| Automatic, 94 |                              86 |                   2 |                         5 |           1 |
| By hand, 30   |                              23 |                   6 |                         1 |           0 |

The six still too full are all of the large window and were estimated at
75.0 to 81.2 % of it, where 75 % may stay. Offline, what is not the
conversation is taken as the session's first request and the thinking from
the signatures in the transcript: so near the line, each could fall on
either side, and they are not what was looked at here.

The eight with nothing to move out, in none of which the size of the window
is recorded:

- Five are all the compactions of one project, used to try the plugin out
  on 09-29 and 09-30: two automatic ones, at 76,606 and 68,602 tokens, and
  three by hand right after a summary, of two messages each.
- One by hand right after a summary, of three messages and no tool result.
- One by hand with 105,156 tokens in use, about 90,000 of them not the
  conversation, which was 400 characters.
- One by hand with 199,462 tokens in use and 78,000 characters pasted into
  messages: full if its window was 200,000, at 21 % if it was 967,000.

In none of the eight does the transcript hold a line of the plugin's: it was
not installed yet, or the line was not recorded. So of thirty compactions by
hand, two had room and nothing to move out for certain, and a third if its
window was the large one.

Moving out the text pasted into messages and the inputs of `Write` and
`Edit` would have changed none of the eight. One held any such text, 15,607
characters of it older than the newest `keepTokens`, a tenth of that
conversation. Over the 124, text of `minChars` or more in a message after
the first is 8.6 % of the characters, and such inputs are 11.6 %.

### What a compaction left undone comes to

In a terminal and with `-p`, on Claude Code 2.1.288 with Haiku 4.5, one run
each, on conversations of the benchmark:

| What was run                                                | What happened                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `/compact`, 28,425 of 167,000 tokens in use                 | Not compacted, in 40 ms; the line names the two figures              |
| `/compact` with instructions                                | The conversation kept in one part, then summarized, in 49.9 s        |
| `/compact` with `maxAfterPercent` at 1                      | Kept, then summarized, in 35.3 s                                     |
| `/compact` right after that summary                         | Not compacted, in 34 ms; Claude Code gave no figure, the line none   |
| An automatic compaction, 143,259 tokens where it runs at 117,000 | `trigger` was `auto`: kept in 17 parts, then summarized, in 30.6 s |

In a terminal the skipped `/compact` shows one line under the command,
`Not compacted · lossless-compaction: nothing to move out, …`, and the
session goes on. With `-p` the session ends without an error and prints that
line as its result. A classic `PreCompact` hook does not run.

### The benchmark with it

On 2026-10-03 the plugin's arm of
[the run on 0.6.1](#the-benchmark-run-again-on-061) was measured again with
this change, on the same conversations and with the same Claude Code,
2.1.287: Haiku 4.5 three times on the six, Sonnet 5.5 once on `results` and
`writes`. The built-in arm is that of the run on 0.6.1, unchanged. The code
measured (`cd125deb5b55`) is this change before it was put on top of #46,
which adds a line after a summary and changes nothing of a compaction left
undone. Sonnet on `prose` is left out: on the conversation left as it was,
its question about what a file said before it changed was refused twice by
Sonnet 5.5's safeguards (`reasoning_extraction`), and a refused question is
not one the benchmark can measure. Then, with `maxAfterPercent` at 1, each
of the four left undone was compacted three times more and asked one thing:
all twelve were handed to the summary. The units, their grades and every
table are in `bench/results/2026-10-03/`, and a test holds the tables to the
units and the figures below to the tables.

Haiku 4.5, three runs; "Next request" is the median of the runs.

| Trace      | The summary ran: plugin | built-in | Seconds: plugin | built-in  | Next request: plugin | built-in |
| ---------- | ----------------------: | -------: | --------------: | --------: | -------------------: | -------: |
| `results`  |                  0 of 3 |   3 of 3 |            0.09 | 20.4–26.4 |               43,995 |    8,313 |
| `writes`   |                  0 of 3 |   3 of 3 |       0.04–0.05 | 27.5–30.5 |               69,039 |   26,034 |
| `prose`    |                  0 of 3 |   3 of 3 |       0.04–0.05 | 20.3–26.5 |               59,893 |   12,573 |
| `short`    |                  0 of 3 |   3 of 3 |       0.04–0.05 | 24.8–29.8 |               29,343 |   13,157 |
| `full`     |                  3 of 3 |   3 of 3 |       25.0–31.0 | 22.1–26.4 |               14,671 |   12,557 |
| `thinking` |                  0 of 3 |   3 of 3 |            0.04 | 28.6–34.4 |               33,098 |   12,781 |

`writes`, `prose`, `short` and `thinking` were left as they were in all
three runs, `results` was compacted by moving results out and `full` handed
over, as before.

| Kind of question                    | Asked | Plugin | on 0.6.1 | Built-in |
| ----------------------------------- | ----: | -----: | -------: | -------: |
| Exact, source gone                  |    36 |     33 |       32 |       12 |
| Exact, file unchanged               |    18 |     18 |       18 |       18 |
| Exact, file changed: what it said   |    18 |     15 |        5 |        0 |
| Exact, file changed: what it says   |    18 |     18 |       18 |       18 |
| Where the work stands               |    36 |     34 |       34 |       34 |
| A rule stated early                 |    36 |     34 |       36 |       36 |
| All                                 |   162 |    152 |      143 |      118 |

- What a file said before it changed was answered in all 12 questions on
  the four left as they were, each from the conversation that was still
  there and with no tool. On 0.6.1, after a summary, 2 of those 12 were.
- A rule stated early was missed twice, both in `thinking`: left as it was,
  the agent asked whether to keep the format instead of stating it. After a
  summary of the same conversation it had stated it every time, the summary
  having written the rule out. Asked six times more of that conversation
  never compacted ("How do we write the answers?", Haiku 4.5, Claude Code
  2.1.287, 2026-10-03), the agent stated it three times, asked back twice
  and went on about the puzzles once: a conversation left as it was answers
  as that conversation does.
- Every later request carries the whole conversation, where a summary left
  12,522 to 26,318 tokens; what that costs turns on the prompt cache. The
  three runs of the plugin's arm were run one after another, so the first
  wrote the conversation to the cache and the two after it read it. Warm,
  the nine questions cost 0.04 to 0.08 USD on the four left as they were;
  cold, 0.40 to 1.12. A summary and its nine questions came to 0.18 to
  0.61: a summary starts a new cache, written at its first question, and
  the agent read files again 1 to 22 times a unit where it read them once
  on a conversation left as it was. In the run on 0.6.1 the arms took
  turns. With Sonnet on `writes`, one run, cold: 86,799 tokens and 2.81 USD
  against 28,400 and 1.00.
- Whether the cache is warm at a `/compact` by hand: of 42 in working
  sessions on one machine, 40 came within an hour of the reply before them,
  28 within five minutes; the median was 2.2 minutes. Claude Code keeps the
  conversation in the cache for an hour.
- How often a `/compact` with room and nothing to move out happens in use is
  [above](#how-often-in-working-sessions): two of thirty by hand, on one
  machine.

## The automatic compactions of 2026-10-01, on the current code

On 2026-10-03, for #41: the 102 automatic compactions of
[Moving out tool inputs, counted in hand-overs](#moving-out-tool-inputs-counted-in-hand-overs),
given to `compact()` as it is on `main` at `d764006`. Offline: no model was
called and nothing was sent.

The 99 whose transcripts are still on the machine were found again by their
transcript, their trigger and the tokens Claude Code recorded before the
compaction, and each was put together as it was on 2026-10-01: the same
messages and the same characters, all 99. The other three, each compacted by
moving results out on 2026-10-01, are of transcripts no longer there.

The size is counted the way the plugin counts it (ADR 0013), from a
breakdown made up of what the transcript holds: what is not the
conversation taken as the session's first request, and what is in use as
the usage of the last response before the compaction, as #47 replayed a
session. That counted 98 of the 99; the other was measured at three
characters a token. On 2026-10-01 the size was the tokens Claude Code
recorded at the compaction, counted the way 0.5.x did.

|                                                  | 2026-10-01, of 102 | Now, of the same 99 |
| ------------------------------------------------ | -----------------: | ------------------: |
| Compacted by moving results out                  |                 85 |                  94 |
| Handed over: holds a block that is not rebuilt   |                 15 |                   1 |
| Handed over: nothing could be moved out          |                  2 |                   2 |
| Handed over: still too full afterwards           |                  0 |                   2 |

- Fourteen of the fifteen handed over for a block that was not rebuilt are
  compacted now. What stopped each was an image in a tool result, which now
  moves out with its result (ADR 0012): they moved 580 results out, 253 of
  them holding images, from 1 to 68 images in a conversation.
- The one still handed over holds a `fallback` block in a reply, with `from`
  and `to`: Claude Code's record that a response went on with another model.
  The plugin knows no such block and hands the conversation over, kept
  first, as [Limits](limits.md#when-the-built-in-compaction-runs-instead)
  says of any block of a kind it does not know.
- The two with nothing to move out are the two of 2026-10-01, of the project
  used to try the plugin out
  ([How often, in working sessions](#how-often-in-working-sessions)).
- The two still too full are of one session on 2026-09-04, with a window of
  967,000: 31 of 698 and 23 of 612 results moved out, and about 729,378 and
  777,069 tokens counted afterwards, 75.4 % and 80.4 % against the 75 % that
  may stay. The count of 2026-10-01 put both under the line. So near it, how
  the size is counted decides the side they fall on: counted as the
  measurement for #44 did — what was in use taken as the tokens Claude Code
  recorded at the compaction, and a density of its own instead of the
  plugin's count — five of the 99 came out too full; which of the two made
  the difference was not told apart.
  Both hold long inputs that nothing moves out: `Write` inputs of 2,000
  characters or more older than the newest `keepTokens`, 142,190 and 99,878
  characters, and other long inputs of 226,566 and 321,177. That is near
  what ADR 0007 set as the reason to look again at moving inputs out: a
  conversation handed over for being too full that holds long inputs. These
  two are a replay, not a compaction that said so; #47 is where that is
  followed.
- Five of the 99 are of sessions run on 2026-10-01 in a directory made for
  measuring, each moving one result out; the count of 2026-10-01 did not
  tell them apart.

What the 99 are: from 2026-09-03 to 10-01, 53 sessions in 5 projects, 72 of
the 99 in one project. The window is the one the plugin stated in 19, 967,000
where the session went over 200,000 tokens in 73, and not known in 7, taken
as 167,000.

## The store, counted

On 2026-10-03, for #42 and ADR 0016: what the store of one machine held and
how its clean-up stood, counted without opening a result (the start of each
was read only to count those holding images, which `/lossless-store` does
not do).

| What                                   | Measured                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| The place written to                   | `~/.claude/jev-lossless-compaction/`, the old name, since it was there first (`docs/limits.md`); mode 700        |
| Results                                | 1,760, 21.0 MB, each with its entry; the newest from 2026-10-03, the oldest from 09-29                           |
| By what each was kept from             | tool results 1,558 (about 14.3 MB), conversations before a summary 201 (6.7 MB), the plugin's own tools 1 (2.2 KB) |
| Holding images                         | 6, 2.4 MB: told apart by the start of the result, which the index does not record                                |
| Added a day, by a file's time          | 0.1, 3.9, 9.8, 5.7 and 1.5 MB, 09-29 to 10-03                                                                    |
| The trash and `tmp/`                   | both empty                                                                                                       |
| The clean-up                           | never run: the first place transcripts are in was recorded on 10-01, and the first week is waited out            |

Of the ten results whose tool's name starts with `mcp__`, one is the
plugin's own `recall`, under the old name; the other nine are of other MCP
servers, and count as tool results.

Reading the transcripts as the clean-up does — the same `grep`, one search
per project directory — took 104 s over 3.5 GB in 103 directories, 75 s in
the largest of them. A search is given up after five minutes, and then the
clean-up stops. How long that leaves before the largest directory reaches it
depends on how fast its transcripts grow, which was not measured.

Had the clean-up run then, it would have moved 119 results, 1.3 MB, to the
trash: put to the plan the clean-up makes (`planGc`), with the ids in use
found as it finds them, nothing moved. Of the 1,820 results by then, 1,066
were under a day old and stay regardless; the rest are named by a
transcript or by a part kept before a summary.

`/lossless-store` itself, on Claude Code 2.1.288 with Haiku 4.5: on a store
made up for it — results of each kind and one with no entry, a trash of two
days, a write left in `tmp/`, a record of two tries and a stop, a secret's
shape in a result and a directory of another repository in the record — it
answered in 31 ms with every count, day and kind as placed, and neither the
secret nor the directory in it. In a terminal it is offered as you type
`/lossless-st`, and its answer is printed under the command. In the session
after it, asked for the answer's third line, the model quoted it: the answer
is in the conversation. With a place recorded for transcripts that is gone,
a session's clean-up stopped and `gc.json` held `{"tries":1,"stopped":{"kind":"place"}}`
and the times, no path.

## The oldest messages kept in place of a summary

On 2026-10-03, for #47 and ADR 0019. Until then a conversation still too
full once results were moved out, or with none to move out, was kept and
handed to Claude Code's summary.

### How often the summary ran for the size

Counted from the lines the plugin showed in the transcripts of one machine,
subagents left out: ten hand-overs for the size from 2026-09-30 to 10-03,
eight saying "too much is still in use" (three sessions) and two "nothing
could be moved out" (two sessions made to try the plugin out). Every one of
them is of a session started before v0.6.0 was tagged, which ran 0.5.x to
its end: a plugin is loaded when a session starts. No session started since
has shown either line.

The eight "too much is still in use" were replayed offline on `main` at
`f470d2c` (`bench/replay.ts`: no model called, nothing sent). All eight come
out under the line of 75 %, at 41 % to 73 % of the window, with the same
results moved out: what handed them over was how 0.5.x counted (#37).

What the code at `f470d2c` still handed over for the size is what
[the 99 automatic compactions](#the-automatic-compactions-of-2026-10-01-on-the-current-code)
showed, two of 2026-09-04 that stay over the line after results are moved
out; and a conversation with nothing to move out when the compaction is
automatic or what is in use is over the line. In the benchmark that is
`full`, three runs of three.

### Replayed

The two of 2026-09-04, replayed with the change, in a window of 967,000 with
75 % allowed to stay. (Put together by `bench/replay.ts`, the first comes to
32 of 707 results moved out and 727,893 tokens, where the section above has
31 of 698 and 729,378.) The first message stays in each.

| After results are moved out | `targetPercent` | Messages kept in parts | Parts | Handed back |
| --------------------------: | --------------- | ---------------------: | ----: | ----------: |
|            727,893 (75.3 %) | 40, the default then |           812 of 1,465 |    26 |     381,650 |
|                             | 1               |                  1,400 |    42 |     119,807 |
|            777,069 (80.4 %) | 40, the default then |           733 of 1,306 |    27 |     381,391 |
|                             | 1               |                  1,261 |    44 |     123,758 |

With `targetPercent` at 1 the cut cannot reach the target, and stops where
the newest 20,000 tokens (`keepTokens`) are left. Where the cut falls is
decided before anything is written, from an estimate of what the list of
parts will come to; written, the conversation came 3,600 to 6,700 tokens
under that estimate. The eight compactions above that moving results out is
enough for are not asked whether to cut.

### With Sonnet 5.5, against what the cut replaces

On 2026-10-03, on the change as it stood after its two reviews. Claude Code
2.1.288; Sonnet 5.5 built the conversation, answered and graded. `full` is
said word for word as the benchmark says it: eight documents of about 74,000
characters pasted into messages and three short results. Sonnet 5.5 counts
the same text as more tokens than Haiku 4.5 does, 197,401 against 142,930,
so in the benchmark's window the conversation overflows while it is built.
It was built and measured with `--autocompact 264000`, which the plugin sees
as 231,000: the conversation then fills 85 % of the window, as it does for
Haiku. The benchmark's definition was not changed; a copy of it with that
window was handed to `build` and `unit`, and the units are not published.

A `/compact` by hand and the nine questions, three runs of each: the change;
the plugin as it is on `main` at `c014b0d`, which keeps the conversation and
hands it to Claude Code's summary; and the built-in compaction alone.

|                         |               Cut, the change | Kept, then summarized (`main`) |     The built-in alone |
| ----------------------- | ----------------------------: | -----------------------------: | ---------------------: |
| The summary ran         |                        0 of 3 |                         3 of 3 |                 3 of 3 |
| `/compact` took         |              297, 233, 225 ms |             22.2, 15.6, 26.2 s |     22.2, 20.1, 17.7 s |
| Kept in parts           | messages 2 to 22 of 30, in 11 |        the conversation, in 17 |                      — |
| The plugin's estimate   |                        75,804 |                              — |                      — |
| The next request        |                        75,188 |         11,669, 11,345, 11,570 | 11,754, 11,885, 11,716 |
| Right, of 9             |                       9, 9, 9 |                        9, 9, 9 |                9, 9, 9 |
| `recall` calls          |                       6, 6, 6 |                        5, 5, 5 |                0, 0, 0 |
| The compaction, USD     |                             0 |            0.526, 0.066, 0.073 |    0.524, 0.073, 0.524 |
| The nine questions, USD |           2.792, 0.357, 0.361 |            0.356, 0.345, 0.359 |    0.358, 0.348, 0.343 |

- No summary ran after the cut, and the compaction sent nothing. It is the
  cut Haiku's window gives too, messages 2 to 22. The estimate came 0.8 %
  over what the next request sent.
- Every question was answered in every run, whichever way the conversation
  was compacted. What a script printed before it was removed is in a part
  after the cut: asked for it, the agent called `recall` and gave it, 6
  times of 6. It did the same where the conversation was kept before a
  summary. After the built-in compaction alone it read Claude Code's own
  record of the session, for 9 answers of 27.
- The cut sends six times as much with each request, 75,188 tokens against
  about 11,500. In the first run the nine questions each wrote the
  conversation to the prompt cache anew, and came to 2.79 USD against 0.88
  for a summary and its nine questions. In the later runs they read it from
  the cache: 0.36, against 0.41 and 0.43 kept and summarized.
- Every part the lists name was read back from the store with the id and
  the size the list gives, 11 of 11 in each run, and each of the eight
  documents is whole in the parts or in the messages that stayed.
- Sonnet 5.5 graded in two passes. Of 217 answers mixed in whose grade was
  known it graded 217 as expected, and the passes graded no answer
  differently.

With Sonnet 5.5 only this was measured. A second cut, the compactions Claude
Code starts by itself and `targetPercent` at 1 are with Haiku 4.5, below.

### How far to cut, measured before it was decided

With Haiku 4.5, which is what the benchmark asked then.
`full` as the benchmark builds it, in a box of its own: Claude Code 2.1.288,
Haiku 4.5, `--autocompact 200000` (the plugin sees 167,000), 142,930 tokens
in use, eight documents of about 74,000 characters pasted into messages and
three short results. A `/compact` by hand, then the nine questions, three
runs each. Here the first message was cut with the rest, and how far the cut
went was set directly: as far as `keepTokens` allows, or down to
`maxAfterPercent` and no further.

|                                          | Summarized by Claude Code | Cut to the newest `keepTokens` | Cut to `maxAfterPercent` |
| ---------------------------------------- | ------------------------: | -----------------------------: | -----------------------: |
| `/compact` took                          |        26.0, 26.1, 37.5 s |               289, 302, 364 ms |         146, 141, 141 ms |
| Messages kept in parts, of 30            |                         — |                24, in 13 parts |           14, in 3 parts |
| The plugin's estimate                    |                         — |                         41,513 |                  120,966 |
| The next request                         |    12,604, 12,881, 13,022 |                         39,122 |                  116,655 |
| Right, of 9                              |                   7, 6, 7 |                        5, 4, 5 |                  4, 4, 4 |
| A rule stated in the first message, of 2 |                   2, 2, 2 |                        0, 0, 0 |                  0, 0, 0 |
| Output of a script since removed, of 2   |                   1, 0, 1 |                        1, 0, 1 |                  0, 0, 0 |
| The compaction, USD                      |       0.193, 0.029, 0.038 |                              0 |                        0 |
| The nine questions, USD                  |       0.240, 0.176, 0.254 |            0.663, 0.101, 0.084 |      2.051, 0.250, 0.229 |

- The other five questions of a run came out alike in every column: a file
  unchanged and what a changed file says now were answered, what it said
  then was not, and both about where the work stands were.
- Cut to `maxAfterPercent`, three times as much is sent with each request
  as cut to `keepTokens`, and a third of the room is left before the next
  compaction. No more was answered for it: with most of the conversation
  still there, the agent did not look at the list, and never called
  `recall`. Cut to `keepTokens`, it called `recall` for two of the six
  questions about the script's output, and was right.
- In the first run of each column the nine questions each wrote the
  conversation to the prompt cache anew, and in the later runs read it:
  what a run costs is the size of what is sent, and whether it is cached.
- A rule stated in the first message was answered none of twelve times once
  that message was cut, where the summary writes such a rule out.

Decided from this (ADR 0019): a cut goes down to the size results are moved
out to reach, `targetPercent`, and the first message stays.

### As decided, with Haiku 4.5

The same conversation in the same box, the code as decided and before its
reviews, which changed the first line of the list and two cases this
conversation does not reach; the built-in arm is the column above.

|                                          | `targetPercent` 40, the default then |    `targetPercent` 1 |
| ---------------------------------------- | ------------------------------: | -------------------: |
| `/compact` took                          |                260, 235, 248 ms |     265, 339, 268 ms |
| Kept in parts, of 30 messages            |             2 to 22, in 11 parts | 2 to 24, in 13 parts |
| The plugin's estimate                    |                          57,466 |               41,570 |
| The next request                         |                          54,705 |               39,187 |
| The estimate is off by                   |                          +5.0 % |               +6.1 % |
| Right, of 9                              |                         6, 6, 6 |              6, 7, 6 |
| A rule stated in the first message, of 2 |                         2, 2, 2 |              2, 2, 2 |
| Output of a script since removed, of 2   |                         0, 0, 0 |              0, 1, 0 |
| The nine questions, USD                  |             0.935, 0.106, 0.134 |  0.648, 0.084, 0.100 |

No summary ran, and the compaction sent nothing. With the first message in
front, the rule stated in it was answered every time. What a script printed
before it was removed is in a part: the agent said the conversation had been
compacted and that it did not have the output, and called `recall` for one
of the twelve questions. After the summary the agent found it twice in six,
by searching Claude Code's own record of the session. No answer after a cut
was counted wrong, the agent saying where it did not know; three after the
summary were.

Against what the cut replaces, Haiku 4.5 answers less. Kept and then
summarized, as the plugin did until then, the same conversation had 8 of 9
answered in each of three runs, and the script's output 6 times of 6 through
`recall` (`bench/results/2026-10-03/`): after a summary Haiku fetches what
was kept, and after a cut it mostly does not. Sonnet 5.5 fetches it either
way (above).

Every part the lists name was read back from the store with the id and the
size the list gives: 11 of 11 in each run at 40, 13 of 13 at 1. Each of the
eight documents is whole either in the parts, in the order it was pasted, or
in the messages that stayed.

Cut once more, the line set at 20 % so that the 39,187 are over it: 72 ms,
messages 2 to 4 of 10 kept in 3 parts. The first message stayed again. The
hook was handed the list of the first cut as a message of its own, not
joined to what the person said next, and it stands in the first new part as
it was written. Right after a compaction Claude Code gives no breakdown to
count from, and the line names no size.

Compactions Claude Code started by itself, with the default settings then
(`targetPercent` 40): ten
more documents pasted one after another into `full`.

| Document |              Sent | Compaction                                                                          |
| -------: | ----------------: | ----------------------------------------------------------------------------------- |
|        1 |           159,328 | none                                                                                |
|        2 |                 — | automatic at 177,871: 291 ms, messages 2 to 26 of 33 in 15 parts, 55,331 estimated |
|   3 to 8 | 70,609 to 149,499 | none                                                                                |
|        9 |                 — | automatic at 168,081: 275 ms, messages 2 to 18 of 23 in 15 parts, 56,627 estimated |
|       10 |            70,459 | none                                                                                |

The third request less the document it added is about 54,800, against the
55,331 estimated. No compaction follows another at once, and the next comes
after seven documents of about 16,000 tokens. (Cut to `maxAfterPercent`,
before the decision, it came after three.)

A conversation that fits once it is rebuilt, with nothing to move out:
`thinking` as the benchmark builds it, 36,459 tokens in use of which 13,070
are thinking, with the line set at 18 % so that what is in use is over it.
It took 33 ms and nothing was cut:

```text
lossless-compaction: no summary, nothing to cut: moved 0 of 3 tool results out (30863 -> 30863 chars, about 22887 of 167000 tokens in use) in 1 ms
```

The next request sent 20,523, 11.5 % under the estimate.

Not measured: a cut in a window of 1,000,000 in Claude Code, where the two
replays above are all there is; Opus 5.5 after a cut; and, with Sonnet 5.5,
anything but the one `/compact` by hand above.

## Where the answer went, and whether the agent fetched it

Whether an answer is right says nothing of why it is wrong when it is. What
the plugin moves out is still there; what can fail is the agent fetching it.
So for each question whose answer no file of the work holds any more (the
output of a script since removed, and what a file said before it was written
again), a unit now records where the answer went in the compaction and how
far the agent got: whether the answer still stood in the conversation;
whether something moved out holds it; whether the agent called `recall` or
`find`; whether it chose a piece that holds the answer; whether what came
back held it. Whether it then answered right is the question's verdict. A
failure to fetch is thereby told from a failure after fetching (#90).

Measured on 2026-10-05, with Sonnet 5.5 and no key for Jev, so with `recall`
alone, on the plugin as it is on `main` at 0.7.0 (code `23ff90df6625`) and
Claude Code 2.1.289; each question asked of a fresh copy, three runs
(`bench/results/2026-10-05-fetched/`). The conversations are those of
`bench/results/2026-10-04-every-kind/`, and `opaque` built again.

| Conversation | What the compaction did | Had to be fetched | `recall` called | A piece holding it chosen | It came back | Right |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `results` | moved 10 of 15 results out | 9 | 9 | 9 | 9 | 9 |
| `short` | moved 3 results out, folded 26 calls | 9 | 9 | 9 | 9 | 9 |
| `thinking` | moved 3 of 3 results out | 9 | 9 | 9 | 9 | 9 |
| `writes` | moved 3 results, 7 inputs, 2 messages' middles out | 9 | 9 | 9 | 9 | 9 |
| `results`, cut | moved 10 out, then kept messages 2 to 39 of 44 in 1 part | 9 | 9 | 9 | 9 | 9 |
| `writes`, cut | moved out as above, then kept messages 2 to 39 of 54 in 2 parts | 9 | 9 | 9 | 9 | 9 |
| `opaque`, the questions `find` is for | moved 16 of 20 results out | 30 | 27 | 27 | 27 | 27 |

- In every one of the 84 questions the answer had left the conversation and
  something moved out held it: none was answered from what stayed.
- In the six that ask the benchmark's questions, the agent fetched the answer
  54 times of 54, and answered right each time: after a cut as after moving
  out. The cut is what `maxAfterPercent` at 10 gives: the conversation is
  still over that line once its results are out, and its oldest messages are
  kept in parts, with no summary. After it the next request carried 12,567
  and 13,673 tokens, against 43,586 and 35,215.
- In `opaque` nothing in a call says what it returned, and with no key there
  is no `find`: the agent recalled the tickets a batch at a time, the one
  asked about among them, 8 to 16 calls a question. It reached the answer 27
  times of 30. The other three are one question in each run, which Sonnet
  5.5's safeguards stopped; Claude Code went on with another model, which
  called nothing and said there was no such result. Of the questions Sonnet
  5.5 answered itself, 27 of 27.
- No answer that came back was then answered wrong.

Before the measurement, the line for calling `recall` alone useful without a
key was set at 90 % of the answers that had to be fetched, in the
conversations that ask the benchmark's questions: there it was 54 of 54. With
`opaque` counted in, which was to be shown apart, 81 of 84 answers that had to be fetched were, 96 %.
Without `find` the agent makes many more calls there: a run of `opaque`'s ten
questions made 97 to 113 calls to `recall` and cost 1.59 to 3.20 USD, where a
run of nine elsewhere made 3 to 9 and cost 0.08 to 1.55; the first run of
each paid to write the conversation to the prompt cache, the later ones read
it.

Not in these figures: `full` and `prose`, where no result leaves and the
answers stay in the conversation (`full` was cut this way once: the agent
recalled eight parts for a question, and Sonnet 5.5's safeguards stopped a
question of that run, which was not measured again); the questions asked one after
another, where an earlier answer puts back what a later one needs; a cut
where the answer is only in a kept part (in the two cut here the results had
left first, and the answer was in a result); what a
model grades (where the work stands, a rule), which is not fetched; and the
middle of a long message that left, which no question here asks for.

## One session that compacts several times, under each setting

Every measure above compacts once and asks right after. What a setting costs
over a session that compacts again and again is in none of them, and
`targetPercent`, how far a compaction goes, was never set from it (#53).
`bench/session.ts` drives one session a turn at a time: thirty-six station
logs of about 12,000 tokens read one after another, three of them removed and
one written again right after it is read, a long message near the start with
a rule in its middle paragraph, and six questions on the way that a program
grades. Five ways of compacting it, each driven twice with Sonnet 5.5, in the
benchmark's window (the plugin sees 167,000), on the plugin at 0.7.0 (code
`23ff90df6625`) and Claude Code 2.1.289, on 2026-10-05
(`bench/results/2026-10-05-session/`):

- `builtin`: Claude Code's own compaction, no plugin;
- `target-40`, `target-20`, `target-1`: the plugin, with `targetPercent` at
  40 (the default then), 20 and 1;
- `hybrid`: the plugin moves results out down to 1 % and, with
  `maxAfterPercent` at 10, hands what is left to Claude Code's summary, the
  conversation kept first. The plugin hands over only at a `/compact` given
  instructions, so the driver types `/compact Summarize the conversation so
  far.` before the turn that could take the session past 167,000, where the
  others are compacted by Claude Code on its own.

Each cell gives the two runs in turn; the sizes are means over a run's
compactions.

| Setting | Runs | Compactions | In use before each | Right after each | Read from the cache right after | Written to it right after | Sent per request | Right | Right after reading outside the work | `recall` calls | Cost by log 24, USD | Cost by log 30, USD | Cost, USD | Time, s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| builtin | 2 | 3, 3 | 169123, 167826 | 21930, 21624 | 3937, 3937 | 17991, 17685 | 87690, 85402 | 5/6, 5/6 | 3, 3 | 0, 0 | 2.45, 2.41 | 3.30, 3.13 | 4.03, 3.85 | 314, 275 |
| target-40 | 2 | 5, 5 | 169730, 171652 | 64500, 65273 | 4128, 4128 | 60370, 61143 | 101599, 101951 | 6/6, 5/6 | 0, 0 | 5, 6 | 3.06, 2.93 | 4.02, 4.13 | 5.02, 5.13 | 299, 436 |
| target-20 | 2 | 4, 4 | 170150, 170094 | 26108, 26080 | 4128, 4128 | 21978, 21950 | 87690, 87663 | 6/6, 6/6 | 0, 0 | 5, 5 | 2.34, 2.33 | 3.16, 3.16 | 4.04, 4.03 | 319, 227 |
| target-1 | 2 | 3, 4 | 171472, 170140 | 25974, 26131 | 4128, 4128 | 21844, 22001 | 93807, 87700 | 5/6, 6/6 | 0, 0 | 9, 5 | 2.54, 2.34 | 3.39, 3.16 | 4.23, 4.03 | 344, 229 |
| hybrid | 2 | 4, 4 | 159389, 160403 | 9046, 8785 | 4128, 4128 | 4916, 4655 | 78507, 79028 | 6/6, 6/6 | 0, 0 | 7, 11 | 2.42, 2.49 | 3.28, 3.35 | 4.25, 4.38 | 537, 416 |

- **At 40 the session compacted five times and cost a quarter more.** Each
  compaction moved 7 or 8 results out and left about 65,000 tokens in use, so
  the next came five to seven logs later; at 20 and at 1 it moved 10 out, left
  about 26,000, and the next came eight to ten logs later. Right after a compaction every setting
  read from the prompt cache only what stands before the conversation (about
  4,000 tokens) and wrote the rest again: 60,000 tokens five times at 40,
  22,000 three or four times at 20 and at 1. That is the difference: 5.02 and 5.13 USD
  at 40 against 4.03 to 4.23 at 20 and at 1, and so it was by the
  twenty-fourth log and by the thirtieth, not only at the end.
- **20 and 1 did the same here.** In this window 20 % is 33,400 tokens, and
  the newest 20,000 tokens of results stay whatever the target, with what
  stands before the conversation: neither could go further than about 26,000.
  In a larger window they differ, and that was not measured: in a window of
  1,000,000 a compaction at 20 leaves up to 193,000 tokens of results where
  one at 1 leaves the newest 20,000.
- **The built-in compaction cost least, 3.85 and 4.03 USD, and answered
  least from what it kept.** It compacted three times and left 22,000 tokens.
  Of its five right answers a run, three came from reading Claude Code's own
  record of the session, which its summary names; the one it missed each run,
  a line of the log written again in one and of a removed log in the other,
  it said was no longer in what it had. The
  plugin's settings read nothing outside the work.
- **`hybrid` left least, about 9,000 tokens, and answered every question, for
  4.25 and 4.38 USD**: each of its four compactions waited for a summary, 24
  to 44 seconds, where the plugin's own take a fraction of one. The driver
  types its `/compact` before the turn that would pass 167,000, so it is
  compacted a log earlier than the others. (In the table its size before a
  compaction is what the last request sent; for the others it is Claude Code's
  count when it compacted, the log just read with it.)
- **The two answers the plugin's settings missed were ids copied wrong.**
  Asked for a line of the first log removed, fourteen logs after it was read,
  the agent called `recall` and was refused the id it gave, at 40 in one run
  and at 1 in one run. Every other answer about a removed or rewritten log came back through
  `recall`, 5 to 11 calls a run.
- **The rule tells the plugin's targets apart in nothing.** At 40, 20 and 1
  the long message kept its middle in every run: moving results out reached
  the target each time, and a message's middle leaves only after that. The
  built-in summary wrote the rule out, and under `hybrid` the agent fetched
  it from the conversation kept before the summary, with 2 and 4 calls to
  `recall`. The question was answered right in all ten runs.

What this does not show: a window of 1,000,000, where what 40 leaves is
larger still and 20 and 1 differ; Opus 5.5; a session that writes files or
runs commands instead of reading; more than two runs a setting, though the
two are within 5 % of each other in cost in every setting. The first run at 1
did not get the first removed log back, went on a log's worth smaller, and
compacted three times where the second compacted four: how often a session
compacts turns on what it fetches, which is why the cost by the
twenty-fourth and the thirtieth log is given beside the total.
The times are of five sessions run side by side, and are not compared.

## Ids copied wrong in one session that compacts several times

In the session above, the two answers the plugin's settings missed were ids
`recall` refused. By the sessions' records, which are not published, it
refused 8 ids in three of the ten runs, all of them the ticket of the first
log removed, `6c7cc4406e6e8fb6…`, with `406e6e8` copied as `406e8`, ten
characters in: that id cut short at 11 characters (twice), those 11 twice
over on two lines (twice), the 62 characters left (three times), and 64
characters made up past the tenth (once). `recall` then took an id by its
first 16 characters; it now takes the one written in the conversation that
shares the most characters with it from the first, 8 or more (#107). Put to
it, each with the ids written in the conversation before it
(`test/fixtures/copied-ids.json`), 7 of the 8 are taken for the id they were
copied from, and none under the rule before. The eighth, under `hybrid`, was
copied from Claude Code's summary while the id it stood for was only in a
part kept from the conversation, which the agent read back by itself: a
refusal now names the parts kept, the newest five.

The session was driven again at 1 and at 40, three runs each, with Sonnet 5.5,
on the plugin as changed (code `e1d108539619`) and Claude Code 2.1.291, on
2026-10-06 (`bench/results/2026-10-06-session-ids/`). The benchmark now
records each call to `recall`, the id it was handed and whether it was
refused; the second table is of those calls.

| Setting | Runs | Compactions | In use before each | Right after each | Read from the cache right after | Written to it right after | Sent per request | Right | Right after reading outside the work | `recall` calls | Cost by log 24, USD | Cost by log 30, USD | Cost, USD | Time, s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| target-40 | 3 | 5, 5, 5 | 170056, 170170, 170037 | 64634, 64708, 64617 | 4128, 4128, 4128 | 60504, 60578, 60487 | 101979, 101925, 101941 | 6/6, 6/6, 6/6 | 0, 0, 0 | 5, 5, 6 | 3.16, 3.02, 3.16 | 4.13, 4.00, 4.13 | 5.13, 5.01, 5.13 | 277, 489, 292 |
| target-1 | 3 | 4, 4, 4 | 170405, 170631, 170349 | 26245, 26277, 26208 | 4128, 4128, 4128 | 22115, 22147, 22078 | 87936, 86384, 87667 | 6/6, 6/6, 6/6 | 0, 0, 0 | 5, 6, 6 | 2.36, 2.36, 2.45 | 3.19, 3.26, 3.27 | 4.06, 4.13, 4.13 | 251, 314, 282 |

| Setting | Runs | `recall` calls | Refused | Refused, not 64 hexadecimal characters |
| --- | --- | --- | --- | --- |
| target-40 | 3 | 5, 5, 6 | 0, 0, 0 | 0, 0, 0 |
| target-1 | 3 | 5, 6, 6 | 0, 0, 0 | 0, 0, 0 |

- **The same copy came again, twice, and was taken both times.** Of the 33
  calls to `recall`, 31 handed an id the session's store held (by the stores,
  which are not published; each of the 31 is 64 hexadecimal characters). The other 2,
  in the second run at 1 and the second run at 40, handed the same 62
  characters as on 2026-10-05, `6c7cc4406e8fb60c…`; both were taken for the
  id they were copied from, and the question was answered right in both.
  None was refused, so no refusal named tickets here.
- **Every question was answered right**, 36 of 36.
- **The costs and the compactions are of this code**, which moves more out
  at 1 than the 0.7.0 of the session above (`targetPercent` at 1 is the
  default since, ADR 0025), and are not set beside its table.

What this does not show: `hybrid`, where a copy came from the summary; a
refusal and the tickets it names, which a real session showed once (`recall`
handed six characters of an id answered with the one ticket of the
conversation, its call and its id, and handed ten characters, gave the
result back); the plugin before this change driven again the same day, so
that the six runs say how often the copy came, not that it came less often;
and Opus 5.5.

## The six kinds of conversation, at 40 and at 1

The session above reads logs and little else: at 1 as at 40, moving results
out was all a compaction did. In other conversations 1 does more. The target
is then not reached in this window, so after the results every other kind leaves as well,
each time: long inputs, the middles of long messages, runs of old small
calls, each but the newest `keepTokens` of its kind (of calls, those among the
newest `keepTokens` of the conversation). A `/compact` typed
without instructions reaches into those too (ADR 0023). So before the default
was changed, the six conversations the benchmark asks its questions of were
compacted once by hand at 40 and at 1 on the same code and asked the nine
questions, each of a fresh copy: Sonnet 5.5, one run, on `main` as it stood
at `c25855a` (code `8b7ba0e05d26`), Claude Code 2.1.289, graded by Sonnet 5.5
(`bench/results/2026-10-05-targets/`). The conversations are those of
`bench/results/2026-10-04-every-kind/`, whose built-in arm gives the first
column.

| Conversation | Next request after the built-in summary | At 40 | At 1 | What left at 40 | What left at 1 | Right of 9, at 40 | At 1 |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| `results` | 6,955 | 43,586 | 7,989 | 10 of 15 results | 15 of 15 results | 8 | 8 |
| `writes` | 28,060 | 35,215 | 10,501 | 3 results, 7 inputs, 2 middles | 3 results, 8 inputs, 8 middles | 9 | 9 |
| `prose` | 11,647 | 34,497 | 7,373 | 4 middles | 3 results, 6 middles | 9 | 9 |
| `short` | 12,774 | 10,766 | 9,098 | 3 results, 26 calls folded | 3 results, 35 calls folded | 9 | 8 |
| `thinking` | 12,413 | 17,641 | 17,641 | 3 of 3 results | 3 of 3 results | 9 | 9 |
| `full` | 11,935 | 83,460 | 7,853 | 5 middles | 3 results, 8 middles | 9 | 9 |

- **At 1 the next request is smaller than at 40 in five kinds of six, and
  than after a summary in four.** It
  carried 7,373 to 17,641 tokens, against 10,766 to 83,460 at 40 and 6,955 to
  28,060 after the built-in summary: less than at 40 in five kinds, the same
  in `thinking`, where there is nothing more to move, and less than after the
  summary in four kinds of six. The compaction took 144 to 448 ms and called
  no model, as at 40 (104 to 419 ms).
- **The answers held: 52 of 54 at 1, 53 of 54 at 40.** The five questions a
  run that a program grades, the exact text of what a removed script printed
  or a file said, were right in every kind at both, 30 of 30: at 1 the agent
  called `recall` for them, 3 or 4 times a run, where at 40 `prose` and `full`
  still had the text in the conversation. The one answer apart is in `short`:
  asked what was decided and what was still open, the agent at 1 gave the
  decision right, recalled a result, and said the open question was settled
  by what it read. Both missed the same question in `results`.
- **What it costs in sight.** At 1 a long message of yours stands as its
  first and last paragraphs after a `/compact` by hand, whatever else there
  was to move: in `prose` and `full` six and eight messages did. The rules
  the benchmark states are in the first message, which stays, and were
  answered right at both; a rule in the middle of a later long message would
  be out of sight until the agent recalls it, which was not measured here.

The costs of these questions are not compared: each is asked of a fresh copy,
and what it costs turns on whether another unit wrote the same conversation
to the prompt cache first. One run of each, graded by a model for four
questions of nine: of 217 answers whose grade was known the grader gave 213
as expected.

## Working sessions in a window of 1,000,000

The session above was driven in a window of 200,000. Where the default
matters most is a window of 1,000,000, where 40 % is 386,800 tokens. Before
the default was changed it was to be looked at in the sessions of the
machine this was written on, with Opus 5.5 and Fable 5.1, offline and as
numbers only: nothing they said is here.

### Replayed at 1, 20 and 40

The first compaction of each of eight working sessions of 2026-10-01 to
2026-10-04, given to `compact()` at `targetPercent` 1, 20 and 40 on `main` at
`3c52a01` with `bench/replay.ts`, in a window of 1,000,000: each had sent more
than 200,000 tokens by then. Only the first of each: a later one starts from
the conversation as the setting in use then rebuilt it. Three of them, B, C
and D, were a `/compact` typed without instructions (every `/compact` those
sessions recorded has none), replayed as one; Claude Code started the others
on its own. The plugin's count is what a target is a share of: what was in
use without thinking and what Claude Code adds. The first request is the
system prompt, the tools and the first message with what Claude Code puts in
it, which stays. Tokens as the plugin counts them.

| Session | Started | Plugin's count | First request | Target at 40 | Results moved | Inputs moved | Middles moved | Calls folded | Left at 1 and 20 | Left at 40 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | on its own | 765,947 | 85,681 | 382,974 | 33 of 469 | 43 | 0 | 267 | 454,771 | 454,771 |
| B | by hand | 457,970 | 99,611 | 228,985 | 37 of 186 | 12 | 0 | 104 (89 at 40) | 219,213 | 226,166 |
| C | by hand | 727,982 | 94,525 | 363,991 | 47 of 383 | 63 | 0 | 183 | 381,119 | 381,119 |
| D | by hand | 567,687 | 92,482 | 283,843 | 60 of 249 | 21 | 1 | 93 | 301,524 | 301,524 |
| E | on its own | 706,085 | 92,057 | 353,042 | 60 of 431 | 23 | 0 | 236 | 357,763 | 357,763 |
| F | on its own | 546,043 | 100,268 | 273,021 | 50 of 499 | 28 | 0 | 303 | 309,690 | 309,690 |
| G | on its own | 532,648 | 93,109 | 266,324 | 56 of 398 | 22 | 0 | 183 | 277,056 | 277,056 |
| H | on its own | 447,909 | 94,296 | 223,955 | 91 of 544 | 34 | 0 | 284 | 238,453 | 238,453 |

- **At 1 and at 20 every one moved out everything that may leave, and at 40
  seven of the eight did the same.** The target at 1 is 9,670 tokens and at
  20 193,400; at 40 it is never more than half of the plugin's count, so it
  was 224,000 to 383,000. What could not leave — the first request, what was
  said, short results, the newest `keepTokens` of each kind — came to 219,000
  to 455,000 (left at 1), over the target at 40 in seven.
- **In B, a `/compact` typed, 40 stopped short:** it reached its target after
  folding 89 old calls of the 104 that 1 and 20 folded, and left 226,166
  tokens where they left 219,213, 3 % more.
- In these sessions the default changes little at a first compaction: nothing
  where Claude Code compacted on its own, 3 % in one of the three typed.
- One message's middle left, in D, at each setting: a long answer of Claude's,
  which a `/compact` typed without instructions reaches into among the
  newest. Their long messages on the person's side, of 2,000 characters or
  more, 8 to 30 a session, were all a turn that carries tool results or what
  Claude Code writes in a person's place (another session's message, a
  notification), which stays.
- Not shown: the compactions after the first, where 40 left more than 1 in
  the window of 200,000 above; and what an agent fetches back afterwards.

### Before and after the setting was changed

The same machine ran `targetPercent` 40, the default, until 2026-10-02 00:30
UTC and 1 after. Every compaction the plugin made itself, in less than five
seconds, in a working session of Opus 5.5 or Fable 5.1 (not one the benchmark
or a test ran in a box of its own) from 2026-10-01 04:28 UTC to 2026-10-04,
with the first request after it where the session made one, from the
records:

| | Compactions | Typed | With a request after | Written to the cache by it | Read from it |
| --- | ---: | ---: | ---: | --- | --- |
| At 40 | 6 | 6 | 5 | 47,138 to 442,072 | 25,826 to 29,603, one 241,552 |
| At 1 | 10 | 5 | 9 | 256,299 to 748,835 | 25,378 to 30,337, two 0 |

These cannot be set against each other: the plugin was updated more than
once over those days, and every one the plugin made at 40 was typed, where
half of those at 1 Claude Code started on its own, at the end of the window.
One thing holds at both: the request after a compaction read from the prompt
cache 25,000 to 31,000 tokens, about what the system prompt and the tools
come to, and wrote the rest anew: in four of the five at 40 with a request
after, the other reading 241,552, and in seven of the nine at 1, the other
two reading nothing, their cache gone. That is what the
session above measured in a window of 200,000.
