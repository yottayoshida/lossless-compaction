# lossless-compaction

[![CI](https://github.com/yottayoshida/lossless-compaction/actions/workflows/ci.yml/badge.svg)](https://github.com/yottayoshida/lossless-compaction/actions/workflows/ci.yml)

> A Claude Code plugin that compacts a conversation without summarizing it: old tool results move to files on your machine, and the agent reads any of them back, exact, by id.

Claude Code's `/compact` asks a model for a summary: tens of seconds, a
request the size of the conversation, and the summary in place of what was
said. This plugin moves old tool results out instead, leaving a line in
their place. That takes a fraction of a second and calls no model, and
what you and the agent said, Claude Code's attachments included, is stored
word for word. Where that is not enough, the oldest messages are stored too
and listed in their place. What left is out of sight until recalled
([limits](docs/limits.md)).

## Demo

![Built-in compaction leaves one summary; lossless-compaction moves tool results to local files, and recall brings one back exact. Measured: a compaction in 61 ms.](docs/assets/lossless-compaction-animated.svg)

The 61 ms is the plugin's own count for one recorded compaction
([how](docs/measurements.md)).

## Quick start

In Claude Code 2.1.287 or later, type this at the prompt:

```text
/plugin install lossless-compaction --marketplace yottayoshida/lossless-compaction
```

Press `y` if asked, choose **Install for you**, then Esc. The plugin runs in that session (after `/reload-plugins --force` if
asked), with nothing to set, unless mods are off ([how to tell](docs/limits.md#function-hooks)):
`/lossless-status` says it runs, with its version and settings.
`/compact` and automatic compaction go through it, each with a
`lossless-compaction:` line ([other setups](docs/limits.md#setting-it-up)).

## What it does

- **Compacts without a summary.** Each result is written to a file named by
  the SHA-256 of its content and read back before a ticket replaces it;
  nothing is sent anywhere ([how it works](docs/how-it-works.md)).
- **Gives a result back as it was.** The agent calls `recall` with the id on
  a ticket. With a key for [Jev](https://typesafe.ai), it can also ask in
  words with `find` ([usage](docs/usage.md)).
- **Saves the conversation before a summary.** When Claude Code's summary
  does run, the plugin keeps what it replaces first, for `recall` to read:
  not images, documents or thinking ([what is kept](docs/limits.md#what-a-summary-replaces)).

## Against the built-in compaction

The benchmark's six kinds of made-up conversation, measured
twice with Sonnet 5.5 at `targetPercent` 40, the default then: a `/compact` by
hand, then nine questions one after another:

|                                  |        Plugin |      Built-in |
| -------------------------------- | ------------: | ------------: |
| A summary was written            |       0 of 12 |      12 of 12 |
| `/compact` took                  |   0.07–0.35 s |       15–27 s |
| The next request carried, tokens | 12,283–83,475 |  9,044–30,735 |
| After the nine questions, tokens | 21,647–84,889 | 12,010–40,921 |
| Right answers, of 108            |           106 |            96 |
| The first run cost               |      2.82 USD |      2.17 USD |

- **`/compact` is instant and calls no model.** At 40 the next request was
  larger in five kinds of six; at 1, the default, smaller in four
  ([both](docs/measurements.md#the-six-kinds-of-conversation-at-40-and-at-1)).
- **What left comes back by its id.** With the plugin the agent called
  `recall`; after a summary it read files again and Claude Code's record of
  the session. Either way, it went back into context.
- **The cost moves.** No summary to pay for, and at 40 larger requests after it:
  the plugin cost less in five kinds, and more in the one that fills the
  window, where Claude Code wrote it to the cache again at four questions
  ([every table](docs/measurements.md#every-kind-of-conversation-with-sonnet-55)).
- **In a window of 1,000,000**, at 40 and 576,000 tokens: `/compact` 0.26–0.27 s
  against 40–52 s; eleven questions in a row, 11 right against 6, 2.05 USD against 1.58.

## Before you install

- **A `/compact` you type can do nothing**, with nothing to move out and room left ([limits](docs/limits.md#when-the-built-in-compaction-runs-instead)).
- **Results stay on disk as plain files while a conversation names them, with no limit on how much**, a secret in a tool result among them ([the files](docs/limits.md#the-files)).
- **`find` sends excerpts of the conversation** to the Jev provider you choose, from every repository once a key is set ([what it sends](docs/usage.md)).

## Docs

- [Usage](docs/usage.md) — what a compaction prints, `recall`, what `find` sends
- [How it works](docs/how-it-works.md) — what is stored, what leaves, what is deleted
- [Limits](docs/limits.md) — when the summary still runs, what is not kept, setup
- [Comparison](docs/comparison.md) and every [measurement](docs/measurements.md)
- [Development](docs/development.md), [CHANGELOG](CHANGELOG.md), [settings](.claude-plugin/plugin.json), [privacy](PRIVACY.md) and [decision records](docs/adr/)

The idea comes from [fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction), with which this shares no code. Not affiliated with TypeSafe AI or Anthropic.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT) at your option.
