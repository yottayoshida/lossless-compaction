# lossless-compaction

[![CI](https://github.com/yottayoshida/lossless-compaction/actions/workflows/ci.yml/badge.svg)](https://github.com/yottayoshida/lossless-compaction/actions/workflows/ci.yml)

> A Claude Code plugin that compacts a conversation without summarizing it: old tool results move to files on your machine, and the agent reads any of them back, exact, by id.

Claude Code's `/compact` asks a model for a summary: tens of seconds, a
request the size of the conversation, and the summary in place of what was
said. This plugin moves old tool results out instead, leaving a line in
their place. That takes a fraction of a second and calls no model, and
what you and the agent said stays word for word. Where that is not enough,
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

Two made-up conversations of the kind the plugin compacts, measured once
with Opus 5.5, each question asked of a fresh copy of what `/compact` left:

|                                               |         Plugin |     Built-in |
| --------------------------------------------- | -------------: | -----------: |
| **102,276 tokens, mostly large tool results** |                |              |
| `/compact` took                               |         0.10 s |       23.2 s |
| The next request carried                      |  43,884 tokens | 6,952 tokens |
| `/compact` and nine questions cost            |       0.62 USD |     0.68 USD |
| **575,632 tokens, in a window of 1,000,000**  |                |              |
| `/compact` took                               |         0.35 s |       51.4 s |
| The next request carried                      | 272,428 tokens | 6,538 tokens |
| `/compact` and eleven questions cost          |       3.58 USD |     3.13 USD |

- **`/compact` is instant and calls no model, and every request after it is
  larger.** In the larger conversation its questions took longer, and cost
  more than the summary and the questions after it.
- **In one run of each model, the answers were no better with the plugin.**
  After a summary, Sonnet 5.5 and Opus 5.5 answered from Claude Code's own
  record of the session: Sonnet 9 of 9 either way, Opus 8 of 12 exact
  answers counted right with the plugin and 10 without, the rest right but
  for how an id was written
  ([every table](docs/measurements.md#with-opus-55-and-in-a-window-of-1000000)).

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
