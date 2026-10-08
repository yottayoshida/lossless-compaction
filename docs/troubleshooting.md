# Troubleshooting

Find the line you saw on this page, in its own words, with `…` where it
names a path, a count or what the system said. Every line beginning
`built-in compaction:` has an entry, as do the lines below that ask
something of you. The detail is in [Limits](limits.md), and setting the
plugin up in [Usage](usage.md#setting-it-up).

First, type `/lossless-store` at the prompt. If Claude Code answers
`Unknown command: /lossless-store`, the plugin is not running in this
session: see [installed and not running](#installed-and-not-running).
Otherwise, search this page for the line you saw.

## Installed and not running

Claude Code says one of these itself, as the plugin is not there to:

- `lossless-compaction is enabled but is not running in this session: …`, at the first prompt
- `lossless-compaction is enabled but was not running: this compaction was Claude Code's own summary. …`
- `… so this /compact would be Claude Code's own summary, which cannot be undone. …`, when a `/compact` is held

The plugin needs Claude Code 2.1.287 or later (`claude --version`) and mods
that are not turned off for you: `claude plugin test`, run in an empty
directory, says when Anthropic or a setting turned them off
([function hooks](limits.md#function-hooks), [systems](limits.md#systems)).
With both, start a new session. If both hold already, run `claude --debug`
and look for `lossless-compaction`.

## Claude Code's summary ran

| The line says | What happened | What to do |
| --- | --- | --- |
| `built-in compaction on what is left, as it was asked for with instructions: …` | `/compact` was given instructions: what could leave left, then Claude Code's summary ran with them ([ADR 0036](adr/0036-a-compact-given-instructions-is-summarized.md)) | Nothing: this is what instructions ask for. `/compact` without them moves results out instead |
| `built-in compaction on what is left, too much is still in use: …` | Moving out was not enough. Without instructions, no cut between messages brought the conversation under `maxAfterPercent` ([too full](limits.md#when-the-conversation-is-too-full)); with them, none is tried | Nothing: what the summary replaced was kept first |
| `built-in compaction: …` | The plugin could not compact this conversation: the reason follows, [below](#built-in-compaction) | What the entry below says |
| `the compaction stopped (…); the built-in summary runs in its place, the conversation kept first where it can be` | The plugin's own hook threw, gave an answer Claude Code refused, or ran out of time | [Open an issue](https://github.com/yottayoshida/lossless-compaction/issues) with the line and `/lossless-status`'s first lines |
| `nothing could be kept (could not write: …), so the summary did not run; …` | The disk refused the conversation, and no summary runs with nothing kept | Free some space, or let the place results are kept in be written to, and compact again |

After the summary, `kept the conversation in … before the built-in summary`
says that `recall` gives back what it replaced, by the ids right after it
([what a summary replaces](limits.md#what-a-summary-replaces)).
`nothing of the conversation is kept before the built-in summary: …` says it
was not, and why: what the summary replaced is lost.

## built-in compaction

### Where results are kept

| The line says | What happened | What to do |
| --- | --- | --- |
| `built-in compaction: where results are kept would be decided by the repository (…); set storeDir in your user settings` | A repository's settings set what the place is made from, which a repository may not decide | Set `storeDir` with `/plugin configure lossless-compaction@lossless-compaction` ([what a repository can change](limits.md#what-a-repository-can-change)) |
| `built-in compaction: the repository's settings files could not be read, so no value is known to be yours` | Claude Code could not read the repository's `.claude/settings.json` or `settings.local.json` for the plugin, as one without the call that reads them cannot | Update Claude Code; if it is current, [open an issue](https://github.com/yottayoshida/lossless-compaction/issues) |
| `built-in compaction: the place to keep results in is not an absolute path; set storeDir to one` | `storeDir`, or where it is not set the directory Claude Code keeps its own in (`CLAUDE_CONFIG_DIR`, else `HOME` or `USERPROFILE`), is not a path from `/`, or none is set | Set `storeDir` to one |

### The place cannot be made private

`built-in compaction: the place results are kept in cannot be made private: …`,
then one of these. Nothing is written to a place others could read
([the files](limits.md#the-files)).

| After it | What to do |
| --- | --- |
| `… is a symbolic link` | Set `storeDir` to the directory the link leads to |
| `… is not a directory` | Move the file out of the way, or set `storeDir` elsewhere |
| `… could not be made` | Make the directory above it writable, or set `storeDir` elsewhere |
| `no mkdir could be run to make it`, `no chmod could be run to make it readable by you alone` | Neither `/bin` nor `/usr/bin` has one the plugin could start, as on NixOS: results cannot be kept there ([systems](limits.md#systems)) |
| `… could not be made readable by you alone (not yours?)` | The directory is another user's: set `storeDir` to one of yours |
| `… changed while it was being made private` | Something replaced it meanwhile: compact again |

### The conversation cannot be rebuilt

The conversation is kept first and Claude Code's summary runs on it
([when the built-in compaction runs](limits.md#when-the-built-in-compaction-runs-instead)).
There is nothing to change; what the summary replaced comes back by `recall`.

| The line says | What happened |
| --- | --- |
| `built-in compaction: the conversation holds what a rebuilt message cannot carry: …` | `image`: an image pasted into a message. `document`: a PDF or another document, wherever it is, in a tool's result too. `a block without a kind`, `a kind with an unusual name` or another name: a kind of block the plugin does not know |
| …the same, then `an image in a tool result that is not a list of blocks`, `an image in a tool result without the id of its call`, `an image in a tool result next to a block that is not text`, `an image that is not held as its bytes` or `an image of a kind that is not kept` | A tool returned an image in a form the plugin does not move out ([images](limits.md#images)) |
| `built-in compaction: the conversation has … messages or more, and older ones may not have been shown` | 4096 messages or more: Claude Code shows a plugin no more, and the oldest may be missing ([too long](limits.md#when-the-conversation-is-too-long)) |
| `built-in compaction: the conversation could not be read with its blocks` | Claude Code did not hand over the conversation as it was sent. [Open an issue](https://github.com/yottayoshida/lossless-compaction/issues) |

### A result, or what was attached, could not be stored

| The line says | What happened | What to do |
| --- | --- | --- |
| `built-in compaction: a tool result that holds an image is not among the messages shown` | A result with an image is in the conversation as Claude Code sends it, and not among the messages it handed the plugin | Nothing: the conversation was kept first |
| `built-in compaction: a tool result that holds an image could not be moved out: …` | It could not be stored | What the reason after it says, below |
| `built-in compaction: what Claude Code attached to the messages could not be kept: …` | What came with the messages (a file given with `@`, a hook's text) could not be stored ([ADR 0030](adr/0030-what-claude-code-attached-is-kept-at-the-end.md)) | What the reason after it says, below; any other words are what was thrown: [open an issue](https://github.com/yottayoshida/lossless-compaction/issues) |

The reasons, which a compaction's own line gives too
([what a compaction says](usage.md#using-it)):

| After it | What to do |
| --- | --- |
| `could not be written`, with what the system said | `(ENOSPC)`: free some space. Otherwise let the place results are kept in be written to |
| `too large to keep (over about 4 MB)` | Nothing: it stays as it was |
| `where the store has a link in its place`, `where the store has something other than a file in its place`, `read back unlike what was written` | Something else writes where results are kept: `/lossless-store check` names what is not whole |
| `from a tool whose name cannot go on a ticket`, `whose text is not the same in its call and its result` | Nothing: it stays as it was |

### Nothing could be moved out, or moving out failed

| The line says | What happened | What to do |
| --- | --- | --- |
| `built-in compaction: nothing could be moved out: …` | Nothing left, and Claude Code's summary ran on the conversation as it was: `/compact` was given instructions, which ask for it, or too much was in use and no cut could be made. `… left in place: …` at its end names what stayed, and why | With instructions, nothing. A reason after `left in place` is in the table above. Otherwise what the summary replaced was kept first, and a lower `keepTokens` lets more leave ([settings](usage.md#settings)) |
| `built-in compaction: moving out failed: …` | Something failed while the plugin tried, in the words after it | [Open an issue](https://github.com/yottayoshida/lossless-compaction/issues) with the line and `/lossless-status`'s first lines |

## Not compacted

`Not compacted · lossless-compaction: nothing to move out, …` follows a
`/compact` typed without instructions, with nothing to move out and room
left: nothing is done, and nothing is lost
([ADR 0015](adr/0015-a-compact-with-nothing-to-move-and-room-left-is-not-summarized.md)).
To have Claude Code summarize anyway, give `/compact` instructions.

## Your PreCompact hooks did not run

`your PreCompact hooks did not run: …`: they run only before Claude Code's summary; use `SessionStart` with the matcher `compact` ([other hooks at a compaction](limits.md#other-hooks-at-a-compaction)).

## find is not there, or does not ask Jev

`/lossless-status` says whether `find` is registered, where its key came from
or why not. With no key it is there all the same, and looks on this machine
([getting a key](usage.md#getting-a-key)).

- `the find tool is not registered: …`: a key is set, and the settings cannot send it, for the reason given
- `looking for the find tool's key failed, so it looks on this machine and sends nothing: …`
- `Jev refused the find tool's key (HTTP 401): …`, `Jev's provider refused access (HTTP 403)`, `asks for payment (HTTP 402)` or `is limiting requests (HTTP 429)`: what to do follows in the line

## recall finds nothing

`Nothing is stored under that id on this machine.`: the id was copied wrong
(the answer names the tickets it may stand for), the conversation was
resumed on another machine without `/lossless-export` and `/lossless-import`
([to another machine](limits.md#to-another-machine)), or the result was
removed by hand. `/lossless-store check` names what is not whole.
`That id is not 64 hexadecimal characters.`: the agent did not give the whole id.

## The store is large, or nothing is cleaned up

`/lossless-store` says how much is kept, where, and how the clean-up went.
There is no limit by design: a result is kept while a conversation Claude
Code can resume names it, and a week after; a clean-up moves it to the
trash, and removes it once the trash has held it a week, still named by none
([how long results are kept](limits.md#how-long-results-are-kept)).
`moved-out results are kept, not cleaned up: …` says why one stopped;
nothing is removed then. A store used from two machines is not cleaned up.

Not here? [Open an issue](https://github.com/yottayoshida/lossless-compaction/issues)
with the line and `/lossless-status`'s first lines.
