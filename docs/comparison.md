# Against the built-in compaction

Measured on 2026-10-07 with Sonnet 5.5 at `targetPercent` 1, the default,
the plugin compacted each of the six kinds of conversation by itself and no
summary ran: a `/compact` took 0.11 to 0.48 s against 15 to 27 s, and left
the next request smaller in five of them. Asked one after another, twice,
the nine questions were answered right 102 times of 108 against 96, and in
the first run the `/compact`s and their questions cost 0.65 USD against 2.17
([every table](measurements.md#every-kind-of-conversation-at-the-default)).
In a window of 1,000,000, at 579,000 tokens, a `/compact` took 0.29 s
against 52 s, and the eleven questions one after another were answered right
11 times against 6 and cost 0.14 USD against 1.58. The built-in compaction's
figures are those of 2026-10-04, on the same conversations and Claude Code:
it does not read `targetPercent`. On 2026-10-05, with the code before #99 to
#111, asked each of a fresh copy once, a `/compact` by hand at 1 left the
next request at 7,373 to 17,641 tokens, smaller than after the summary in
four kinds of six, with 52 answers right of 54, against 53 at 40
([at 40 and at 1](measurements.md#the-six-kinds-of-conversation-at-40-and-at-1));
in a window of 1,000,000 each of a fresh copy was not measured at 1.

At `targetPercent` 40, the default until 0.7.1, on 2026-10-04: a `/compact`
took 0.07 to 0.35 s against 15 to 27 s, and left the next request larger in
five of them. Asked one after another, twice, the nine questions were
answered right 106 times of 108 against 96, and in the first run the
`/compact`s and their questions cost 2.82 USD against 2.17; asked each of a
fresh copy, where no question reads what another wrote to the prompt cache,
7.68 against 4.02
([every table](measurements.md#every-kind-of-conversation-with-sonnet-55)).
In a window of 1,000,000, at 576,000 tokens, a `/compact` took 0.26 to 0.27 s
against 40 to 52 s; one after another the eleven questions were answered
right 11 times against 6 and cost 2.05 USD against 1.58, and each of a fresh
copy 12.28 against 1.67.
What follows is how it stood before.

What follows was measured with Haiku 4.5, but for the one point on Opus 5.5.
Where Sonnet 5.5 and Opus 5.5 were asked after a compaction the plugin made
by itself, they answered no worse after the built-in one: after a summary
both read Claude Code's own record of the session and answer from it, which
Haiku did less often and to less effect
([Sonnet](measurements.md#sonnet-55-one-run),
[Opus](measurements.md#with-opus-55-and-in-a-window-of-1000000)). What
differed for them is the compaction itself and the size of what is sent
afterwards, which the README gives.

Six made-up conversations, each given `/compact` by hand once with the plugin
and once without, three times with Haiku 4.5. In every cell the plugin's
figure is first and the built-in compaction's second:

| The conversation is mostly      | The summary ran | `/compact` took     | Output of a script since removed: right, of 6 |
| ------------------------------- | --------------- | ------------------- | --------------------------------------------- |
| Large tool results              | 0 of 3 · 3 of 3 | 0.1 s · 20–26 s     | 6 · 2                                         |
| Files the agent wrote           | 0 of 3 · 3 of 3 | 0.05 s · 27–31 s    | 5 · 1                                         |
| Text pasted into messages       | 0 of 3 · 3 of 3 | 0.05 s · 20–26 s    | 4 · 4                                         |
| Many short results              | 0 of 3 · 3 of 3 | 0.05 s · 25–30 s    | 6 · 1                                         |
| Text filling most of the window | 3 of 3 · 3 of 3 | 25–31 s · 22–26 s   | 6 · 3                                         |
| Thinking                        | 0 of 3 · 3 of 3 | 0.04 s · 29–34 s    | 6 · 1                                         |

- **The plugin compacted by itself in one kind of the six**, the one where
  tool results are what fills the conversation. **In four it did nothing**:
  there was nothing to move out and room to go on, so the `/compact` was not
  carried out and the conversation stayed as it was. The one filling most of
  the window it kept and handed over to Claude Code's summary. That is how
  it was when the table was measured: such a conversation is now cut, and no
  summary runs (below).
- **What a file said before it changed was answered** 15 times of 18,
  against none after the built-in compaction: in the four left as they were
  it was still in the conversation, and all 12 were answered with no tool.
  A script's output that no file held any more: 33 of 36 against 12.
- **Where the plugin hands over, the conversation is kept first**: measured
  on 0.6.1, which handed over all five, a script's output that no file held
  any more was still answered 26 times of 30 through `recall`, against 10
  of 30 after the built-in compaction alone, and the summary took longer
  with the plugin in 14 of 15 pairs of runs, by a median 7.7 s. It no longer
  hands over for a conversation's size, as an automatic compaction of those
  four did then.
- **A conversation too full is cut, not summarized** (ADR 0019). Measured
  with Sonnet 5.5, three runs, on the conversation that fills most of the
  window, against the plugin as it was: `/compact` took 0.2 to 0.3 s where
  keeping and summarizing took 16 to 26 s, and no summary ran. All nine
  questions were answered in every run either way, the agent calling
  `recall` for what was cut. At `targetPercent` 40, the default then, each
  request afterwards carried 75,188 tokens against about 11,500: the nine questions cost 2.79 USD with the prompt
  cache cold and 0.36 with it warm, against 0.88 and 0.41 to 0.43 for the
  summary and its questions. Haiku 4.5 did not fetch what was cut, and
  answered six of nine where it had answered eight
  ([measurements](measurements.md#with-sonnet-55-against-what-the-cut-replaces)).
- **Left as it was, a conversation is sent whole and read from the prompt
  cache.** Every later request carries 29,343 to 69,039 tokens where a
  summary left 12,522 to 26,318, but the conversation is what was sent just
  before: with the cache still warm the nine questions cost 0.04 to 0.08 USD,
  against 0.18 to 0.61 for a summary and its nine questions, which start a
  new cache and read files again. With the cache cold they cost 0.40 to
  1.12. On one machine, 40 of 42 `/compact`s by hand came within the hour
  Claude Code keeps it.
- **Opus 5.5 was asked once.** After the built-in compaction it searched
  Claude Code's own record of the session: of 17 questions about an exact
  text, 13 were counted right with the plugin and 15 without, which one run
  does not tell apart. The plugin's `/compact` of 575,632 tokens took 0.35 s
  against 51.4 s and left more to send, 272,428 tokens a request against
  6,538
  ([measurements](measurements.md#with-opus-55-and-in-a-window-of-1000000)).
- **What goes the other way.** Where the plugin compacted by itself the next
  request was 43,995 tokens against 8,313. A rule stated in the first
  message was answered 34 times of 36 against 36: in the conversation that
  is a third thinking, left as it was, the agent twice asked back about the
  format, as it did three times of six asked of that conversation never
  compacted. The summary had written the rule out.
- **`find` was compared apart**, on seven distinct questions about what a
  result was and six about a value in it. Asked what a result was about, it
  gave or listed first the right one 16 times of 19; asked by a value
  further down a result, it said 13 times of 14 that none was about that,
  where one was. It now looks for a value the question names in the whole of
  each result and tells Jev of the one result that holds it, and gave the
  right one 17 times of 17; asked through an agent, Haiku 4.5 found a code in
  the middle of a document 8 times of 9, where it had found 1.
  With `recall` and `find` listed among the tools in front of it and no
  question naming them, Haiku 4.5 called `find` for 19 of 24 questions
  where each call named its file, and for 20 of 21 about what a result was
  about where the calls said nothing of what came back, finding the code 9
  times of 9. Each call sends the provider what [Usage](usage.md) lists.
  Asked about a result that was moved out, Haiku 4.5 with a key set called
  `find` for 48 of 54 questions.

The protocol, every table and what they do not show:
[measurements.md](measurements.md#the-benchmark).
