# 0040. A ticket counts a result's lines and quotes nothing of it

- Status: Proposed
- Date: 2026-10-07
- Keeps [0001](0001-move-out-and-order.md)'s rejection of "keep a truncated head of each result", now measured

## Context

A ticket said a result's tool, its size and its id, and nothing of the result
(`src/store.ts`). Where a call does not say what came back, as `sh show.sh 03`
does not, the agent has nothing to choose a ticket by (#149). 0001 rejected
keeping a cut head of each result in its place: it loses content, and the
head is text from outside placed in the plugin's voice. #149 proposed a line
under the ticket quoting the result's first line, the result kept whole, and
a count of its lines, the quote to be measured on its own.

Since [0037](0037-find-without-a-key.md), `find` with no key answers a question
in words with every result by its call and first line, so that a result can
already be chosen by its first line with one call.

## What was measured

Sonnet 5.5, no key, Claude Code 2.1.289, `opaque`, three runs of each, on the
seven questions that name a document by what it was about and ask for a line
in its middle, which no first line holds (`docs/measurements.md`, "A ticket's
quote of a result's first line"). The line set before the runs: the calls to
`find` and `recall` together at 75 % of before or fewer, no more ids opened
that hold nothing asked for, and no fewer right answers.

| | Calls to `find` and `recall` | Right, of 7 |
| --- | ---: | ---: |
| Before (`7309597`) | 13, 14, 15 | 6, 7, 7 |
| The quote under `  begins: ` (`24323d4`) | 4, 5, 5 | 4, 5, 4 |
| The quote under `  first line, recall for the rest: ` (`61ad10d`) | 7, 5, 5 | 5, 5, 5 |

The calls fell to a third; the answers fell too, and the line was missed both
times. Of the fourteen answers missed with a quote, thirteen went the same
way: the agent knew the document from the quote, did not recall it, and gave
the ticket's id as the code the question asked for, quoting the ticket as the
line. The fourteenth was stopped by Sonnet 5.5's safeguards after a recall. Saying on the line that
the rest is recalled changed nothing of it. Before, `find`'s list said to
recall one by its id, and the agent did each time.

## Decision

1. A ticket of a result says how many lines of text the result held:
   `[moved out] Bash result, 412 lines, 10605 bytes; recall with … id …`.
   One line is "1 line". A result that held images is counted by its text,
   and one that is an image alone is not counted.
2. A ticket quotes nothing of the result. 0001's rejection stands, now on a
   measurement: a line of the result beside a ticket is read as what the
   result says, and the ticket's own fields as part of it.
3. Inputs, parts and the middles of long messages are named as before.
4. A ticket is one line. Those of 0.4.0 to 0.7.1, with no count, are read
   the same, and are written again in the current wording only where an
   earlier name or wording makes them so (0004).
5. `find`'s list with no key chooses a result's first line as the first that
   has a letter or a digit, `Read`'s number taken off also where Claude Code
   added a line after the reading, and does not show one that holds an id,
   the plugin's name, `[moved out]` or the words an answer of `find` opens
   with.

## Alternatives considered

- **The quote, under either opening measured.** Rejected: answers lost, above.
- **The quote, for Claude Code's tools that work on this machine alone.** The
  scope the owner chose for it, and the one measured: it is a quote of a
  `Bash` result that cost the answers.
- **No count either.** A count tells the agent how long a result is in the
  unit `Read` and `grep` speak of, and costs about four tokens a ticket.

## Consequences

- A ticket is longer by its count, a few tokens.
- An agent still chooses a result whose call says nothing of it through
  `find`, one call more than a quote would take, as before.
- The benchmark keeps what was added to measure this: the bytes `recall`
  and `find` hand back to each question, the ids opened that hold nothing
  asked for, and the seven questions by subject.
