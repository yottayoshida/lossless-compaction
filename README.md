# lossless-compaction

[![CI](https://github.com/yottayoshida/lossless-compaction/actions/workflows/ci.yml/badge.svg)](https://github.com/yottayoshida/lossless-compaction/actions/workflows/ci.yml)

> A Claude Code plugin that compacts a conversation without summarizing it: old tool results move to files on your machine, and the agent reads any of them back, exact, by id.

Claude Code's `/compact` asks a model for a summary: tens of seconds, a
request the size of the conversation, and the summary in place of what was
said. This plugin moves old tool results out instead, leaving a line in
their place. That takes a fraction of a second and calls no model, and
what you and the agent said is kept word for word. Where that is not enough,
the oldest messages are stored too and listed in their place. The price is
a larger conversation afterwards ([limits](docs/limits.md)).

## Demo

![Built-in compaction leaves one summary; lossless-compaction moves tool results to local files, and recall brings one back exact. Measured: a compaction in 61 ms.](docs/assets/lossless-compaction-animated.svg)

The 61 ms is the plugin's own count for one recorded compaction
([how it was taken](docs/measurements.md)); no model is called.

## Quick start

In Claude Code 2.1.287 or later, type this at the prompt:

```text
/plugin install lossless-compaction --marketplace yottayoshida/lossless-compaction
```

Press `y` if asked, choose **Install for you**, and close the options with
Esc. The plugin runs in that session (after `/reload-plugins --force` if
Claude Code asks for it), with nothing to set, unless mods are turned off for
you ([how to tell](docs/limits.md#function-hooks)). `/compact` and automatic
compaction then go through it, each with a line marked `lossless-compaction:`
([other ways to set it up](docs/limits.md#setting-it-up)).

## What it does

- **Compacts without a summary.** Each result is written to a file named by
  the SHA-256 of its content and read back before a ticket replaces it;
  nothing is sent anywhere ([how it works](docs/how-it-works.md)).
- **Gives a result back as it was.** The agent calls `recall` with the id on
  a ticket. With a key for [Jev](https://typesafe.ai), a model reached
  through TypeSafe AI or Cloudflare, it can also ask in words with `find`
  ([usage](docs/usage.md)).
- **Saves the conversation before a summary.** When Claude Code's summary
  does run, the plugin keeps what it replaces first, for `recall` to read:
  not images, documents or thinking ([what is kept](docs/limits.md#what-a-summary-replaces)).

## Against the built-in compaction

The benchmark's six made-up conversations, each of another kind, measured
twice with Sonnet 5.5: a `/compact` typed by hand, then nine questions asked
one after another:

|                                  |        Plugin |      Built-in |
| -------------------------------- | ------------: | ------------: |
| A summary was written            |       0 of 12 |      12 of 12 |
| `/compact` took                  |   0.07–0.35 s |       15–27 s |
| The next request carried, tokens | 12,283–83,475 |  9,044–30,735 |
| After the nine questions, tokens | 21,647–84,889 | 12,010–40,921 |
| Right answers, of 108            |           106 |            96 |
| The first run cost               |      2.82 USD |      2.17 USD |

- **`/compact` is instant, calls no model, and leaves more.** What fills the
  conversation is moved out, not summarized: the next request was larger in
  five kinds of six, and smaller in the one of many short calls.
- **What left comes back by its id.** With the plugin the agent called
  `recall`; after a summary it read files again and Claude Code's record of
  the session. Either way, what it read went back into context.
- **The cost moves.** No summary to pay for, and larger requests after it:
  the plugin cost less in five kinds, and more in the one that fills the
  window, where Claude Code wrote it to the cache again at four questions
  ([every table](docs/measurements.md#every-kind-of-conversation-with-sonnet-55)).

## Before you install

- **A `/compact` you type can do nothing**, with nothing to move out and room left ([limits](docs/limits.md#when-the-built-in-compaction-runs-instead)).
- **Results stay on disk as plain files while a conversation names them, with no limit on how much**, a secret in a tool result among them ([the files](docs/limits.md#the-files)).
- **`find` sends excerpts of the conversation** to the Jev provider you choose, from every repository once a key is set ([what it sends](docs/usage.md)).

## Docs

- [Usage](docs/usage.md) — what a compaction prints, `recall`, what `find` sends
- [How it works](docs/how-it-works.md) — what is stored, what leaves, what is deleted
- [Limits](docs/limits.md) — when the summary still runs, what is not kept, setup
- [The comparison measured with Haiku 4.5](docs/comparison.md), and every [measurement](docs/measurements.md)
- [Development](docs/development.md), [CHANGELOG](CHANGELOG.md), [settings](.claude-plugin/plugin.json) and [decision records](docs/adr/)

The idea comes from [fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction), with which this shares no code. Not affiliated with TypeSafe AI or Anthropic.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT) at your option.
