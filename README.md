# lossless-compaction

[![CI](https://github.com/yottayoshida/lossless-compaction/actions/workflows/ci.yml/badge.svg)](https://github.com/yottayoshida/lossless-compaction/actions/workflows/ci.yml)

> A Claude Code plugin that compacts a conversation without summarizing it: old tool results move to files on your machine, and the agent reads any of them back, exact, by id.

Claude Code's `/compact` asks a model for a summary: tens of seconds, a
request the size of the conversation, and the summary in place of what was
said. This plugin moves old tool results out instead, leaving a line in
their place. That takes a fraction of a second and calls no model, and
what you and the agent said, Claude Code's attachments included, is stored
word for word. Where that is not enough, the oldest messages are stored
and listed in their place. What left is out of sight until recalled
([limits](docs/limits.md)).

## Demo

![Built-in compaction leaves one summary; lossless-compaction moves tool results to local files, and recall brings one back exact. Measured: a compaction in 61 ms.](docs/assets/lossless-compaction-animated.svg)

The 61 ms is the plugin's own count for one recorded compaction
([how](docs/measurements.md)).

## Quick start

In Claude Code 2.1.287 or later (checked on macOS; [other systems](docs/limits.md#systems)), type at the prompt:

```text
/plugin install lossless-compaction --marketplace yottayoshida/lossless-compaction
```

Press `y` if asked, choose **Install for you**, then Esc. The plugin runs in that session (after `/reload-plugins --force` if
asked), with nothing to set, unless mods are off ([how to tell](docs/limits.md#function-hooks)):
`/lossless-status` says it runs, its version and settings.
`/compact` and automatic compaction go through it, each with a
`lossless-compaction:` line ([other setups](docs/limits.md#setting-it-up)).

## What it does

- **Compacts without a summary.** Each result is written to a file named by
  its SHA-256 and read back before a ticket replaces it;
  nothing is sent anywhere ([how it works](docs/how-it-works.md)).
- **Gives a result back as it was.** The agent calls `recall` with the id on
  a ticket. It can also ask `find` in words; with a key,
  [Jev](https://typesafe.ai) chooses ([getting a key](docs/usage.md#getting-a-key)).
- **Saves the conversation before a summary.** When Claude Code's summary
  runs, the plugin keeps what it replaces first, for `recall` to read:
  not images, documents or thinking ([what is kept](docs/limits.md#what-a-summary-replaces)).

## Against the built-in compaction

The benchmark's six kinds of made-up conversation, measured
twice with Sonnet 5.5 at `targetPercent` 1, the default, beside the built-in
compaction's run on the same conversations: a `/compact` by hand, then nine
questions one after another:

|                                  |        Plugin |      Built-in |
| -------------------------------- | ------------: | ------------: |
| A summary was written            |       0 of 12 |      12 of 12 |
| `/compact` took                  |   0.11–0.48 s |       15–27 s |
| The next request carried, tokens |  7,970–18,243 |  9,044–30,735 |
| After the nine questions, tokens | 12,576–25,298 | 12,010–40,921 |
| Right answers, of 108            |           102 |            96 |
| The first run cost               |      0.65 USD |      2.17 USD |

- **`/compact` without instructions is instant and calls no model.** The next
  request was smaller in five kinds of six, and larger in the one of thinking,
  in both runs.
- **What left comes back.** With the plugin the agent called
  `recall` and `find`; after a summary it read files again and Claude Code's
  record of the session. Either way it re-entered context.
- **It cost less.** No summary to pay for: in the first run the plugin cost
  less in each of the six kinds, its questions alone more in four of them
  ([every table](docs/measurements.md#every-kind-of-conversation-at-the-default)).
- **In a window of 1,000,000**, at 579,000 tokens: `/compact` 0.29 s against
  52 s; eleven questions in a row, 11 right against 6, 0.14 USD against 1.58.

## Before you install

- **A `/compact` you type can do nothing**, with nothing to move out and room left ([limits](docs/limits.md#when-the-built-in-compaction-runs-instead)).
- **Results stay on disk as plain files while a conversation names them, with no limit on how much**, a secret in a tool result among them ([the files](docs/limits.md#the-files)).
- **`find` sends excerpts of the conversation** to the Jev provider you choose, from every repository once a key is set ([what it sends](docs/usage.md)).
- **Your `PreCompact` hooks run only before a summary** ([why](docs/limits.md#other-hooks-at-a-compaction)).

## Docs

- [Usage](docs/usage.md) — what a compaction prints, `recall`, what `find` sends
- [How it works](docs/how-it-works.md) — what is stored, leaves or is deleted
- [Limits](docs/limits.md) — when the summary still runs, what is not kept, setup
- [Comparison](docs/comparison.md) and every [measurement](docs/measurements.md)
- [Development](docs/development.md), [CHANGELOG](CHANGELOG.md), [settings](docs/usage.md#settings), [privacy](PRIVACY.md) and [decision records](docs/adr/)

The idea comes from [fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction), with which this shares no code. Not affiliated with TypeSafe AI or Anthropic.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT) at your option.
