# 0003. Jev picks what comes back, not what leaves

- Status: Accepted
- Date: 2026-09-30

> Written when the plugin was named `jev-lossless-compaction`. The rename is ADR 0004; what this record says of names and paths is of its time.

## Context

ADR 0001 gave Jev one job: order the results that may leave a compaction, by
a `score` question per result. Measured on the first real use (a 200k-window
session that compacted twenty times, and four compactions of a sixteen-read
conversation), that order never changed which results left: the size target
was far enough below the conversation that every candidate left every time.
The scores themselves moved as a block from one compaction to the next
(0.83–1.38 at one, 2.19–2.38 at the next) with a spread of 0.2–0.5 within a
compaction, so they did not tell results apart. A `choice` question at
compaction time, "which of these does the rest of the task most need", was
peaked but wrong: the two results the session read again afterwards ranked
seventh and tenth of thirteen. This agrees with what mizchi/jev-playground
measured (docs 39 and 46): judgment beats free word overlap only when a
quarter of the context may stay, and on "which entry holds the value the goal
asks for" the two tie (14/40 against 15/40).

At recall time the picture depends on what the call says. When the call names
the file (`Read` with a path) or the question quotes a line, the model reads
its way back on its own: over twenty such questions a bare Haiku with `recall`
answered 18, Jev's `choice` over digests 14. When the call says nothing of the
content — `git show <hash>`, `gh issue view <number>`, `git cat-file -p
<blob>` — and the question is about the content in other words, the bare
model answered 6 of 13, recalling 41 results on the way (three answers given
without recalling anything, one wrong after twelve recalls) and pulling
388,301 characters back into the context; Jev's `choice` over digests of the
same thirteen answered 13 of 13, each with a probability of 0.95 or more,
pulling back 120,833 characters, all of them the right result. Free word
overlap on the same digests answered 10.

Those figures are Jev's `choice` over the digests alone, 400 characters
each, asked from a script; what the registered tool does end to end was
measured afterwards on the same thirteen questions and is in the README.
Jev answers three kinds of question: `score` on a rubric, `choice` among up
to 255 named options with a probability for each and a confidence, and
`noul`, a yes/no probability. A `choice` with 95 options of 750 characters,
71,219 characters in all, went through the Cloudflare route in 1.5 seconds.

## Decision

1. A compaction asks Jev nothing. Rules order what leaves: results a later
   call replaced, then those sharing the least with the goal, then the
   oldest. Nothing is sent and nothing is waited for.
2. A `find` tool is registered beside `recall`, and only when a provider can
   be resolved at session start: without a key there is no `find`, and the
   tool list stays as it is. Called with a question in words, `find` puts one
   `choice` question to Jev whose options are the results moved out of this
   conversation, each described by its call, its size and a digest of its
   text, and returns the text of the one Jev chooses.
3. The options are the tickets in the conversation at hand, not everything
   the store holds. A subagent's call is answered at once with "nothing to
   find": this plugin never moves a subagent's results out (ADR 0001). (Since
   ADR 0026 what a summary replaces in a subagent's conversation is kept in
   parts, named after it for `recall`; `find` still does not look there.) Tickets
   that stand for an earlier `find` or `recall` result — whichever of the
   three names the ticket carries — are left out: their text is a copy of a
   result already on the list.
4. A phrase of twelve characters or more that the question puts in double
   quotes narrows the options to the results whose stored text holds it.
   When one result is left, it is returned with the matched phrase named on
   the first line and nothing is sent; when several are left, Jev chooses
   among them; when none is, Jev chooses among them all. Backticks do not
   count: models put identifiers in them without meaning "as written".
5. Every request carries one more option, "none of these", so that a
   question about a result that was never moved out has an answer. `find`
   returns text only when the top probability is at least 0.5 and at least
   0.3 above the second; the confidence figure is not used, since with many
   options it stays high when two of them split the mass. When "none" wins
   that way, `find` says that none of the moved-out results seems to be
   about the question. Otherwise `find` lists the three likeliest results
   with their calls, sizes, probabilities and ids, and the model recalls one
   by id.
6. More options than fit one request (eighty, or 60,000 characters) are asked
   in rounds; the three likeliest of each round meet in a last one, and the
   rule above is applied to the last round alone. A request refused for its
   size is split in two, as before. A request Jev answers without a readable
   probability for any option, or does not answer within twenty seconds,
   ends the asking: a distribution over some of the options would name the
   wrong one with confidence.
7. The question is blanked for the shapes of secrets before it is sent. A
   stored text of 256 KB or less is blanked whole and then digested, as
   before; a larger one is cut at a line boundary after its first 8 KB and
   the head blanked, a shape that begins in the head and ends past it being
   blanked to the end. Texts are read one at a time. A failed request is
   reported by its status alone.
8. `recall`, the tickets and the store's index are unchanged. Digests are cut
   from the stored text when `find` runs, so results moved out by 0.1.0 and
   0.2.0 are found too.
9. The `score` path is removed rather than kept behind a setting: it was
   measured to decide nothing, and a setting would keep sending digests at
   every compaction for nothing.

## Alternatives considered

- **Keep Jev's order at compaction and add `find`.** Rejected: the order was
  measured to change nothing, and keeping it keeps a request and a five
  second wait in every compaction.
- **Ask a relative question at compaction instead of an absolute one.**
  Rejected: measured; the distribution was peaked but did not point at what
  was read again.
- **One tool, `recall` taking either an id or a question.** Rejected: the
  ticket says "recall with id"; a second mode on the same tool makes that
  line say less than it should.
- **`find` without Jev, by word overlap between the question and the
  digests.** Rejected: 10 of 13 against 13 of 13 on the questions where the
  call says nothing. Word lookup is kept for the case it is exact at: a
  quoted phrase.
- **Decide by Jev's confidence.** Rejected: confidence measures how peaked
  the whole distribution is, and with ninety options two of them splitting
  the mass still reads as peaked.
- **Store a digest in each index entry when a result is moved out.**
  Rejected: entries written by earlier versions have none, and reading the
  stored text when `find` runs covers every entry at the cost of a few file
  reads.
- **Offer everything in the store.** Rejected: it sends other conversations'
  digests to a third party and mixes unrelated results into the choice.
- **Ship the removal of Jev from compaction as its own release, and `find`
  later.** Rejected: both are one decision about where Jev sits, and the
  release in between would be one in which Jev does nothing.

## Consequences

- A compaction is as fast as writing a few files; the five second wait for
  Jev is gone.
- What is sent to Jev, and when, changes: nothing at compaction; at each
  `find` that a quoted phrase does not settle, the question and a digest of
  every result moved out of the conversation. The README says so at the top.
- Without a key there is no `find`; `recall` needs no key and is unchanged.
- `find` adds one round of requests per call, and a last round when there
  were several.
- A result that was read twice into the conversation gives two options that
  Jev cannot tell apart; `find` then lists both and the model chooses.
- After the built-in compaction has run, the tickets may be gone from the
  conversation and `find` has nothing to offer; the files remain and
  `recall` still reads them by id.
- Sessions compacted by 0.2.0 keep their tickets and their files; only the
  order in which results left them was ever Jev's, and that is not undone.
