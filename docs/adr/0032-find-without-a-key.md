# 0032. `find` without a key

- Status: Accepted
- Date: 2026-10-06
- Amends [0003](0003-jev-picks-what-comes-back.md), decision 2

## Context

`find` was registered only where a key for Jev resolved (0003, decision 2).
Two of the ways it looks never ask Jev: a quoted phrase, matched in the whole
of each stored text, and the values a question names, matched a line at a
time. With no key the agent had only `recall`, and where nothing in a call
says what it returned it opened tickets one by one: in `opaque`, a run of ten
questions made 97 to 113 calls to `recall` and cost 1.59 to 3.20 USD,
against 3 to 9 calls elsewhere (docs/measurements.md, at 0.7.0 and
`targetPercent` 40). Most people run the plugin with no key (#110).

0003 rejected word overlap as a replacement for Jev: 10 of 13 against 13 of
13. Set against `opaque`, whose questions are written in other words than
what each result is about, a ranking by the words shared put the right result
first in 0 to 3 of 7 questions, by how ties were broken; weighting rare words
gave 1 of 7.

## Decision

1. `find` is registered with no key, and where looking for the key failed.
   Settings that name a key that cannot be used register nothing, and a line
   at the start says why, as before.
2. With no key nothing is sent. A quoted phrase one result holds returns that
   result as it was; several are listed. The values a question names are
   looked for a line at a time, and the results with such a line are listed
   with that line, none given as the answer.
3. A question in words, or one whose phrase or values no result holds, is
   answered with every result by its call and its first line: the
   conversation's tickets newest first, then those read out of parts, within
   8,000 characters. Nothing is ranked: the agent reads the list and recalls
   the one it means.
4. Each answer given with no key ends with a line saying that Jev was not
   asked, after the answer, where the benchmark reads a `[found]` at its head.
5. With a key, `find` is as it was.

## Alternatives Considered

- **Rank the results by the words they share with the question** (BM25 or the
  overlap the compaction orders by). Measured above: near chance on the
  questions where `find` matters.
- **Quoted phrases and values alone with no key, a question in words
  refused.** The question in words is the common one, and the one the cost
  was in.
- **Give one result as the answer with no key.** Chosen wrongly, the agent
  would not know.
- **Register the no-key `find` where the settings are broken.** They say why
  at the start; going on another way without a word makes them harder to put
  right.

## Consequences

- The tools every request carries grow by `find`'s description where there
  is no key.
- A list costs the agent the reading of it: up to 8,000 characters, and a
  line or a few after it (that Jev was not asked, the middles of long
  messages that hold what was asked).
- A key set during a session is used from the next call, though `find`'s
  description stays as it was registered at the start: setting it in the
  plugin's settings loads the hook again, with no record of the start.
- Where a result's first line says nothing, the list helps no more than
  `recall` one by one. `opaque`'s results open with their title, which is the
  case the list suits best.
- The benchmark's variant with no key has `find` since this change; a
  checkout of before is measured beside it with `--without-find`.
