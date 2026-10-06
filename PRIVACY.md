# Privacy

lossless-compaction is a Claude Code plugin that runs on your machine. This
page says what it reads, what it keeps and where, what it sends and to whom,
and how to remove what it kept. It reads and keeps these for one purpose: to
compact a conversation without a summary, and to give back, exact, what it
moved out. `test/privacy.test.ts` reads the plugin's code for the addresses,
the programs and the places under its directory that are written there, and
fails when this page does not name one; it does not see one that the code
puts together some other way.

## In short

- **The plugin itself sends nothing anywhere unless it has a key for
  [Jev](https://typesafe.ai)**, set in its settings or in the environment.
  A key in the environment (`TYPESAFE_API_KEY`, `CLOUDFLARE_API_TOKEN`) is
  used only where the plugin's own settings choose the provider: `provider`
  set to `typesafe` or `cloudflare`, or a Cloudflare account id entered. Left
  on `auto` with no account id, nothing is sent without a key in the
  plugin's settings. With a key set, each call to `find` sends the
  provider you chose what [Usage](docs/usage.md) lists. Nothing is ever sent
  to the maintainer: there is no telemetry, crash report or update check.
- **What it keeps stays on your machine**, in plain files, while a
  conversation Claude Code can resume names it, and for one to three weeks
  after, longer while no session is started or the clean-up cannot run.
- **What `recall` and `find` give back, and what `/lossless-store` and
  `/lossless-status` print, goes into the conversation**, and Claude Code
  sends the conversation to its model provider, as it sends everything else
  you and the agent say. That is Claude Code's, under its provider's terms,
  not the plugin's.

## What it reads

- The conversation of the session it runs in, through Claude Code's plugin
  interface: at a compaction, when `recall` or `find` is called, when a
  tool is called (to refuse a tool call that hands on a ticket), when Claude
  Code shows a file again after a summary, each message you send (to tell
  one sent again from a rewind), and when you type `/lossless-status` (to
  count the tickets in it). `hooks/notice.sh` is handed each message
  too, and a `/compact`, and keeps of them only the session id below.
- At a summary, up to 20 of the files the conversation read with `Read`, of
  256 KB or less each, as they are on disk now, to say which changed since.
  Nothing of them is kept or sent.
- Claude Code's transcripts under `<config>/projects/`, in the places recorded
  in `roots/` (below), once a week, or once a day while a clean-up keeps
  stopping before its end, with `grep`, for 64-character
  hexadecimal strings only: that is how the clean-up tells which kept results a
  conversation still names. Nothing else of a transcript is read or kept.
  Besides, at each clean-up, the transcript of each conversation compacted
  with tickets is searched with `grep` for the one id noted for it, and the
  names of the files and directories in those places are looked at, for
  that conversation's session id
  ([ADR 0027](docs/adr/0027-a-clean-up-first-finds-what-was-seen.md)).
- Your settings files (user, project and local), for the plugin's settings and
  to tell a value a repository put there from one you set.
- The environment variables `HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`,
  `TYPESAFE_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, the
  proxy and certificate variables named in [Limits](docs/limits.md#what-a-repository-can-change),
  and `CLAUDE_PID` and `CLAUDE_PLUGIN_DATA`, which Claude Code sets. It sets
  one, `LOSSLESS_COMPACTION_RUNNING`, to its process id, in Claude Code's
  process and those that starts.
- Claude Code's version, through its plugin interface, when you type
  `/lossless-status`, which prints it.

## What it keeps, and where

Under `~/.claude/lossless-compaction/`, or under `CLAUDE_CONFIG_DIR` when that
is set, or in the directory set as `storeDir`; and in
`~/.claude/jev-lossless-compaction/` (under `CLAUDE_CONFIG_DIR` likewise)
while a version before 0.4.0 left one there
([the files](docs/limits.md#the-files)). A `storeDir` on a synced or network
drive is no longer only on your machine.

- `blobs/`: the text of everything moved out of a conversation. That is tool
  results, images in them included; long values handed to a tool (what `Write`
  was to write, a Bash command); whole long messages of yours and Claude's
  whose middle left; runs of old small tool calls with what they returned; and
  the conversation as it stood before a summary or a cut, what you and Claude
  said with every tool call and result, long messages whole. Not kept:
  thinking, and images and documents outside tool results. Any of this can hold personal data a tool
  printed or you wrote: names, addresses, email addresses, a secret.
- `index/`: the size of each and the name of the tool it came from.
- `roots/`: the paths of the directories Claude Code keeps transcripts in.
- `gc.json`: when the clean-up last ended and last tried, how often it was
  tried, and the kind of its last stop.
- `sentinel.jsonl`: one line of 64 zeros, which a search of the transcripts
  must print to count as finished.
- `witness/`: for each conversation compacted with tickets, its session id,
  one id its transcript was seen to hold, and when.
- `trash/`: results no transcript names any more, for a week before removal.
- `tmp/`: a write in progress; a process that stopped partway can leave one.

And in Claude Code's data directory for the plugin,
`~/.claude/plugins/data/<plugin id>/`: `told`, the process ids of the sessions it told that it is not running, and
`held`, the process ids and session ids of those whose `/compact` it held for
that reason: about the newest fifty of each.

`roots/`, `gc.json`, `sentinel.jsonl`, `told` and `held` stay until you
remove them. A file in `witness/` stays while its conversation's transcript,
or a file or folder of it other than those Claude Code keeps beside one, does,
and goes at the clean-up after.

The key for Jev is kept by Claude Code with the plugin's other settings, not
by the plugin.

## How long

- A result is kept while a transcript Claude Code can still resume, or a part
  kept from one, names it. A clean-up runs when a session starts, once a
  week: a result over a day old that none names goes to `trash/`, and a
  clean-up that finds it there over a week later, still named by none,
  removes it. With sessions started every day that is one to three weeks
  after the last conversation that named it is gone. Claude Code removes
  transcripts after `cleanupPeriodDays`
  ([how long](docs/limits.md#how-long-results-are-kept)).
- Nothing is removed while no session is started, while the clean-up stops
  before its end (`/lossless-store` says when it last ended), or before a
  place transcripts are kept in is recorded.
- There is no limit on how much is kept.
- A transcript outside a recorded place, one copied from another machine say,
  is not counted, and what only it names can be removed.

## What it sends, and to whom

- **With no key: nothing.** The plugin makes no network request.
- **With a key, at each call to `find`**: to the provider your settings name,
  TypeSafe AI (`https://api.typesafe.ai`) or Cloudflare Workers AI
  (`https://api.cloudflare.com`, with your account id), the key and what
  [Usage](docs/usage.md) lists: the question; a digest of 400 characters of
  each result, long input and kept part moved out of the conversation, with
  the call a result or an input came from; and a sentence where one result has
  a line holding a value the question names. Nothing of the middle of a long
  message that left is sent; a message kept whole in a part, before a summary
  or a cut, can have lines in that part's digest. Shapes of secrets are blanked first, which is a courtesy
  and not a guarantee. A proxy set in the environment is used for these
  requests. How long the provider keeps what it is sent is set by its terms.
- Installing the plugin fetches it from GitHub, under GitHub's own terms.

## Commands it runs

`mkdir`, `chmod`, `mv`, `rm`, `grep` and `sh`, from `/bin` or `/usr/bin`: on
the files under where it keeps results and, for `mkdir`, the directory that
is to hold them; `grep` on transcripts as above; and `sh` to read its own
process id. Claude Code runs `hooks/notice.sh` with `sh` at each message you
send and around a compaction. None of them connects to a network.

## How safe the files are

- They are plain text, not encrypted. The directory is made readable by its
  owner alone (mode 700) before anything is written; root, and a backup of
  your home directory, can still read them. On Windows no mode is set.
- A secret a tool printed stays there until the clean-up removes it or you do.

## Removing what it kept

- `/lossless-store` says where results are kept and how much.
- Delete that directory, and `~/.claude/jev-lossless-compaction/` if it is
  there. `recall` then finds nothing for the tickets left in a conversation.
- `claude plugin uninstall lossless-compaction@lossless-compaction` removes
  `~/.claude/plugins/data/<plugin id>/`, unless given `--keep-data`, and does
  not remove where results are kept: delete that yourself.
- Clear the key with `/plugin configure lossless-compaction@lossless-compaction`,
  and there set `provider` back to `auto` and clear the account id: a key in
  the environment is used while the settings choose the provider.

## Children

The plugin is not meant for anyone under 18.

## Changes and questions

Changes to this page are in the repository's history and the
[CHANGELOG](CHANGELOG.md). Ask at
[the issues](https://github.com/yottayoshida/lossless-compaction/issues).
