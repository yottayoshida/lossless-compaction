# Usage

How to set the plugin up, then three things, in the order you will meet
them, and a command that says how the plugin stands. [Settings](#settings),
at the end, says which to change for what. A line you saw and do not
understand: [troubleshooting](troubleshooting.md).

## Setting it up

The README's quick start installs from a Claude Code session, where
`--marketplace` takes this repository on Claude Code 2.1.275 or later.
**Install for you** records the plugin in `~/.claude/settings.json` (under
`CLAUDE_CONFIG_DIR` when that is set), **Install for you, in this repo only**
in the repository's `.claude/settings.local.json`, and **Install for all
collaborators on this repository** in its `.claude/settings.json`, which you
commit and each collaborator installs from again. Installed in a session, the
plugin runs in that session: measured on Claude Code 2.1.289 with a copy of
the plugin under another name, from a marketplace in a directory, installed
before the first message and again after two in another session, the install
said `Plugin is now active.`, `/plugin` said one mod was active, `recall` was
among the agent's tools, and a `/compact` went through the plugin. Claude
Code's documentation says it holds an install whose reload would make the
next request read the conversation again uncached, and asks for
`/reload-plugins --force`; that was not met. Where the plugin is installed
already there is nothing to do: typed there, the line opened the plugin's
options and, those closed with Esc, said `Already installed
lossless-compaction.` and changed no setting (measured on 2.1.289, with the
marketplace added from this repository).

From the shell, or a script, it is two commands, and the plugin loads in the
next session or after `/reload-plugins`:

```sh
claude plugin marketplace add yottayoshida/lossless-compaction
claude plugin install lossless-compaction@lossless-compaction
```

To use the plugin in one repository only, add `--scope local` to the install
and run it there; set the key without `--scope`.

Nothing is to be set for the plugin to run: the variable the quick start
asked for before Claude Code 2.1.287 is ignored from that version on and can
be removed ([function hooks](limits.md#function-hooks)). The plugin is not on
npm; it installs from this repository.

The four number settings each take a value in a range: `targetPercent` 1 to
99, `keepTokens` 0 to 1,000,000, `minChars` 0 to 10,000,000 and
`maxAfterPercent` 1 to 100. A number outside its range is taken as the
nearest end of it, never as the setting's default, and the first session
after says so in one line; so is a value left empty, which is taken at the
default. A value that is not a number at all, such as `"40"` written in
quotes, keeps Claude Code from loading the plugin: `/compact` is then
Claude Code's own (measured on Claude Code 2.1.291).

The key for `find` is set with
`/plugin configure lossless-compaction@lossless-compaction`. `provider` is
`auto` unless you change it: an account id entered there chooses Cloudflare
and none chooses TypeSafe. When the account id is not 32 hexadecimal
characters, or `provider` is `typesafe` while an account id is entered,
nothing is sent: with a key for the provider chosen, `find` is not
registered and a line at the start of the session says why; with none,
`find` is there with no key, as for any setup without one, looking on this
machine and sending nothing (#110). A key in the environment
(`TYPESAFE_API_KEY`, `CLOUDFLARE_API_TOKEN`) is used only where the
plugin's own settings choose the provider: `provider` set to `typesafe` or
`cloudflare`, or a Cloudflare account id entered. Left on `auto` with no
account id, nothing is sent without a key in the plugin's settings: a key
exported for another tool does not make `find` send anything, and nothing is said of it
at the start of a session; `/lossless-status` says it is there and what
would use it.
Where the settings choose the provider and hold no key, the key of the
provider chosen is read from the environment, unless a repository's settings
set it: `TYPESAFE_API_KEY` once `provider` is `typesafe`, or
`CLOUDFLARE_API_TOKEN` once Cloudflare is chosen, by the account id or by
`provider` set to `cloudflare`; only the latter also reads
`CLOUDFLARE_ACCOUNT_ID`. The two Cloudflare variables alone choose nothing
([ADR 0009](adr/0009-an-account-id-is-enough-to-choose-cloudflare.md), [ADR 0028](adr/0028-a-key-in-the-environment-waits-for-a-choice.md)).

An installed copy is replaced only when the plugin's version changes.
Claude Code does not update it on its own unless auto-update is turned on
for this marketplace (`/plugin`, **Marketplaces**, `lossless-compaction`,
**Enable auto-update**); otherwise `/plugin marketplace update
lossless-compaction` in a session, or from the shell:

```sh
claude plugin marketplace update lossless-compaction
claude plugin update lossless-compaction@lossless-compaction
```

and the new copy loads in the next session or after `/reload-plugins`.
`claude plugin list` names the version installed. The marketplace points at
the tip of `main`: a copy installed between two releases can hold changes not
yet released, under the last release's number, and keeps them until the
version changes (#106).

To stay on one release, add the marketplace at its tag, before installing:

```sh
claude plugin marketplace add yottayoshida/lossless-compaction#v0.7.1
claude plugin install lossless-compaction@lossless-compaction
```

Each tag from `v0.4.0` installs that release (measured with `v0.7.1` on
Claude Code 2.1.291); the two before were named `jev-lossless-compaction`. A
marketplace that is added cannot be moved to another tag from the shell:
adding it again from another one is refused, and with its `ref` edited in
`~/.claude/settings.json`, `claude plugin marketplace update` and `claude
plugin install` said it was not found (measured on 2.1.291). It is removed
and added again, and removing it removes the plugin's settings with it,
`storeDir` among them (measured). Note them first and set them again when
installing, with `--config storeDir=…`: with `storeDir` not set again,
results are written to the default place, and what was kept elsewhere is
read only where that place is still on the list of earlier places (#116),
which is kept apart from the settings; whether removing the plugin removes
it was not checked. Whether an older version reads a store a newer one wrote,
or whether its clean-up removes what the newer one keeps, was not checked.

Coming from `jev-lossless-compaction` (0.3.0 and before), an installed copy
does not follow the rename: see [moving from the old
name](limits.md#moving-from-the-old-name).

## Using it

**`/lossless-status`.** Typed at the prompt, it says that the plugin runs in
this session, its version and Claude Code's, the value each number setting is
used at and, where that is not what was set, what was set, whether the other
settings are set, and whether `find` is registered, with where its key came
from or why it is not. It prints no key and reads no stored result: of
`find`'s settings it shows `provider` when it is `auto`, `typesafe` or
`cloudflare`, and of the others only whether they are set. What it says stays
in the conversation, as any command's output does. Its first lines are what a
bug report needs; its last names [troubleshooting](troubleshooting.md). Where Claude Code does not know the command, the plugin is
not running ([function hooks](limits.md#function-hooks)). `/lossless-store`
says where results are kept and how much.

**`/lossless-export` and `/lossless-import`.** `/lossless-export <directory>`
writes the results the conversation's tickets name, through the tickets in
its kept parts, into a new directory; `/lossless-import <directory>` takes
such a directory, or an earlier place, into the store, each result checked
against its name, so that the conversation resumed on another machine gives
them back. To go on with a conversation elsewhere: export into a new
directory outside any repository, copy it and the conversation's record
(`<session id>.jsonl` under Claude Code's `projects/`) to the other
machine, put the record in the folder of `projects/` for the directory you
resume it from there, resume the conversation and type `/lossless-import`
with the directory
([what is written and checked](limits.md#to-another-machine)).

**A compaction.** A line starting `lossless-compaction:` says what each one
did, in the transcript, and a shorter one shows over it for a few seconds.
From the host check (`npm run check:host`), a session that read six files of
about 45 KB, at the default settings:

```text
lossless-compaction: moved out 5 of 6 tool results; about 109,339 tokens in use before, about 22,360 after, of the 167,000 at which Claude Code compacts on its own; 43 ms
```

and over it, on one line under the plugin's name, which a narrow screen cuts
short at its end:

```text
lossless-compaction: moved out 5 of 6 tool results · ~22k of 167k tokens, where Claude Code compacts · 43 ms
```

The line names what each of its figures counts and, in words, why anything
it could not move out stayed: no code of the plugin's own reaches it. The
first figure is what was in use before, as Claude Code counts it, thinking
included; the second is what the plugin counts in use after
([ADR 0011](adr/0011-the-size-after-is-what-stays.md)). Both are of the size
at which Claude Code compacts on its own; with automatic compaction off the
line names the model's window instead, and where Claude Code gave neither,
an assumed window, and says so. Where the plugin could not count the
conversation from what Claude Code gave, it gives the conversation in
characters instead, and no tokens. Where nothing could be moved out and
Claude Code's summary runs on the conversation as it was, the line gives,
where it was counted, what was in use and what the plugin counts of it less
the thinking, images and what Claude Code attached, which no rebuilt message
carries; where it was not, no size. What the plugin left by its settings (the newest results,
those too short) is not named; what it could not move out is, after the
time, by why:

| The line says | What happened | What to do |
| --- | --- | --- |
| too large to keep (over about 4 MB) | One result is over what the store takes | Nothing: it stays as it was |
| could not be written (ENOSPC) | The disk refused, with what the system said | Free some space, or let the place results are kept be written to |
| where the store has a link in its place, where the store has something other than a file in its place, read back unlike what was written | Something else wrote where results are kept | `/lossless-store` says where that is; `/lossless-store check` names what is not whole |
| from a tool whose name cannot go on a ticket, whose text is not the same in its call and its result | The result cannot stand behind a ticket | Nothing: it stays as it was |

Each result that left has a ticket in its place. Of a page of these docs
read with `Read`:

```text
[moved out] Read result, 1600 lines, 106768 bytes; recall with mcp__lossless-compaction__recall id 98578c7e6eadae56d5548c36a17db0c38ac2b0b15e94ecec42367af63a4ec810
```

A ticket says how many lines of text the result held (a result that is an
image alone has no count), and nothing of what it said: a quote of each
result's first line was measured, and the agent took a ticket's id for what
a question asked and answered without reading the result
([ADR 0040](adr/0040-a-ticket-counts-a-results-lines-and-quotes-nothing.md)).
A ticket written by 0.4.0 or later keeps its wording; one of an earlier
version is written in the current one, with no count.

Where moving results out is not enough, or there is nothing to move out and
the conversation is too full to go on with, the oldest messages are kept
whole instead and no summary runs. From the host check's session made to be
cut, at `maxAfterPercent` 1, `keepTokens` 0 and `minChars` 10,000,000, not
the defaults:

```text
lossless-compaction: no summary, messages 2-18 of 20 kept in 1 part: moved out 0 of 7 tool results; about 40,276 tokens in use before, about 4,632 after, of the 167,000 at which Claude Code compacts on its own; 44 ms; still over what may stay in use, which a summary would not change
```

A conversation that holds 1,536 of the 4096 entries Claude Code hands a
plugin is cut down to 1,024 messages the same way, however much room is left
([why](limits.md#when-the-conversation-is-too-long)). From a made-up
session of 3,400 short messages, at a `/compact` by hand, with no figures
from Claude Code to count by:

```text
lossless-compaction: no summary, messages 2-2378 of 3400 kept in 3 parts for its length, 3400 of the 4096 entries Claude Code hands a plugin: moved out 0 of 0 tool results; the conversation from 83,181 to 26,742 characters; 86 ms
```

The first message stays, and one message lists the parts where the others
stood ([what stays, and how far a cut goes](limits.md#when-the-conversation-is-too-full)).
From the cut above:

```text
[lossless-compaction] Earlier messages of this conversation are kept as they were said, with no summary in their place, in 1 part; recall a part by its id.
[moved out] conversation, part 1 of 1, messages 2-18, 3904 bytes; recall with mcp__lossless-compaction__recall id ba6a93c9890c7edb1c0d2455e90db09e0f61809b61c3c9deb221978c33eb7f8c
```

Old small calls fold into a list where they stood, each run kept as a part,
once moving results and long inputs out is not enough
([which calls fold](limits.md#in-short)):

```text
[lossless-compaction] 2 tool calls were moved out here, with what they returned; recall the part for all of it.
[moved out] conversation, part 1 of 1, messages 12-15, 849 bytes; recall with mcp__lossless-compaction__recall id ae3a60d299d1060a7a920c43933c89a9d0b3715ad679f450ca5a68b0e0086367
Read: /work/notes.md -> 4 lines; what it returned then comes back with mcp__lossless-compaction__recall id 7eb572e61cf43a61319777b05fd294ce71692bd1b502ce3b1924362ce7606e59
Edit: /work/notes.md -> written
```

To have Claude Code's summary, give `/compact` instructions: what can leave
is moved out, and what is left is summarized with them, the conversation
kept first (ADR 0036). Any words will do, and they are what the summary is
told to keep or stress. A `/compact` typed without them asks for none.

In a session where the plugin is enabled and is not running, a line says so
at the first message you send, naming what the plugin needs: Claude Code
2.1.287 or later, and mods not turned off for you
([what else it does, and what it does not reach](limits.md#function-hooks)).

**`recall`.** The agent calls it with the id on a ticket and gets the result
back unchanged. It needs no key. An id the agent copied wrong is taken for the
one id written in the conversation that shares the most characters with it
from the first, 8 or more, where no other shares as many; one still refused is
answered with the tickets of the conversation whose ids begin as it does and
the parts kept from it, up to five, each with what it stands for where the
conversation says, and its id; where the id given is itself written in the
conversation, with the parts alone
([what is not taken](limits.md#what-an-agent-does-not-fetch)).

**`find`.** With a key for Jev, asked in words, it returns the moved-out
result of this conversation that the question is about, or lists the
likeliest few when Jev is not sure which. Asked in other words which of thirteen moved-out results
reported a refusal on an unsupported kernel call, in a session where the
calls said nothing of what they returned, the agent called `find` and got it
back:

```text
[found] Bash result, 2271 bytes; id 968e6cdd8a21069b3907388db507c061ce28cac950b7a63eae5a0967adf39edc; probability 0.99
```

With no key, `find` looks through what was moved out on this machine and
sends nothing (#110, ADR 0037). A phrase of twelve characters or more in
double quotes is looked for as written, and the one result that holds it
comes back as it was; several are listed. A number, a checksum or a code the
question names is looked for a line at a time, and the results with such a
line are listed with it. A question in words lists every result by its call
and its first line, those written in the conversation newest first and
then those in kept parts, for the agent to choose from: nothing is
ranked, so a result whose first line says nothing is no easier to pick than
by reading it with `recall`. Each answer ends saying Jev was not asked. A
key set during a session is used from the next call, though the tool's
description stays as it was when the session started.

To have Jev choose, set a key with
`/plugin configure lossless-compaction@lossless-compaction` inside Claude
Code. For Jev on Cloudflare Workers AI, enter the account id there as well:
with `provider` left on `auto`, an account id entered there sends the key to
Cloudflare, and none sends it to TypeSafe. A key in the environment
(`TYPESAFE_API_KEY`, `CLOUDFLARE_API_TOKEN`) is used only once `provider` is
set there to `typesafe` or `cloudflare`, or an account id is entered.
[Getting a key](#getting-a-key) says where to make one.

When the provider refuses the key, `find` tells the agent what to set and
where, and the person sees it once in the session: a line says that Jev
refused the key (HTTP 401), to set it with `/plugin configure`, that
`/lossless-status` says where the key came from, and where to get one. A
refusal of access (HTTP 403) is told the same way, as the key, what it may
reach or the account: Cloudflare answers so for an account not allowed the
model, a model its plan does not cover, terms not agreed to or an account
blocked ([its errors](https://developers.cloudflare.com/workers-ai/platform/errors/)). So
are a provider that asks for payment (HTTP 402) and one limiting requests
(HTTP 429), which on Cloudflare can be a day's free allocation used up; a
provider that fails is named to the agent alone. An answer of these that is
not in JSON, as the providers' are, a proxy's page say, is put on neither
the key nor the provider, and you are told nothing of it. Every
answer that says Jev could not be asked ends saying `recall` still reads a
result by its id.

With a key set, each call to `find` sends the provider:

- the agent's question;
- for every result moved out of the conversation, the call that made it and
  a 400-character digest of it;
- for every long value moved out of a call's input (what `Write` was handed
  to write, say), the call as it stands with the ticket in the value's place,
  and a 400-character digest of the value;
- nothing of the middle of a long message that left: `find` looks through
  those here, for a quoted phrase or the values the question names; where no
  result holds the phrase and one middle does, it gives that message back,
  and it names the other middles that hold what was asked beside its answer
  (ADR 0024);
- nothing of the parts that keep what Claude Code attached to the messages
  as it sent them (a file handed over with `@`, what a hook added,
  reminders, what it says of the machine): `find` looks through those here,
  as it does a middle (#105, ADR 0030). Where a conversation could not be
  rebuilt and was kept as it was sent, what was attached is in that
  conversation's own parts, and their digest, below, can hold it;
- for every part of the conversation that was kept, before a summary, in
  place of one or as old tool calls folded into a list, a 400-character
  digest of what was said or returned in it, made as a
  result's is: its first lines, up to five lines between that look like
  failures, and its last lines, which are its newest messages (of a result or
  a part over 256 KB, the digest is of its first 8 KB);
- where one result alone has a line holding a number, a checksum or a code
  the question names: that it has, in one sentence, and no line of it.

Jev chooses among them, with "none of these" among the choices; a phrase of
twelve characters or more in double quotes is looked for as written first.
Shapes of secrets are blanked before anything is sent, which is a courtesy
and not a guarantee. A result that holds an image is not offered, and nothing
of it is sent. Without a key `find` looks on this machine, and nothing is
sent.

## Getting a key

For TypeSafe, sign in to its console from [typesafe.ai](https://typesafe.ai)
and make a key there. For Jev on Cloudflare Workers AI, open Workers AI in
the Cloudflare dashboard and choose **Use REST API**, then **Create a
Workers AI API Token**: the token needs `Workers AI - Read` and
`Workers AI - Edit`, and the account id is under **Get Account ID** on the
same page ([Cloudflare's guide](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)).
Enter the key, and for Cloudflare the account id, with
`/plugin configure lossless-compaction@lossless-compaction` in your user
settings.

What a call costs is the provider's to say:
[TypeSafe](https://typesafe.ai),
[Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/).
Each call to `find` sends what is listed above: the question, and a digest
of every result, long input and kept part moved out of the conversation.

## Settings

Each setting's description in the settings dialog says, in under 250
characters, what it does, the values it takes and its default, and names
this section, which says what to change for each aim that was measured.
They are set with `/plugin configure lossless-compaction@lossless-compaction`
in your user settings
([what a repository can change](limits.md#what-a-repository-can-change)).

| To | Change | As measured |
| --- | --- | --- |
| Leave more in place after a compaction | `targetPercent` to 40 | About 65,000 tokens left in use against 26,000 at 1; five compactions against three or four, and a quarter more to pay ([one session](measurements.md#one-session-that-compacts-several-times-under-each-setting)) |
| Move out all that may leave, and compact less often | Nothing: `targetPercent` 1 is the default | About 26,000 tokens left in use, three or four compactions ([one session](measurements.md#one-session-that-compacts-several-times-under-each-setting)) |
| Have Claude Code summarize what is left | Nothing; type `/compact` with instructions before the conversation fills | About 9,000 tokens left, each compaction waiting 24 to 44 seconds for the summary ([one session](measurements.md#one-session-that-compacts-several-times-under-each-setting), as `hybrid`) |

At 40, what stays is chosen by how much a result shares with what you are
working on, not by how new it is; the newest results stay by `keepTokens`.
The third row was measured on 0.7.0 with `maxAfterPercent` at 10 and the
`/compact` typed before each turn that would fill the conversation; a
`/compact` given instructions now goes to the summary whatever
`maxAfterPercent` is (ADR 0036). An automatic compaction in between goes as
any of the plugin's does, to a summary only where
[the built-in compaction runs instead](limits.md#when-the-built-in-compaction-runs-instead).

- **`targetPercent`**, default 1: how far a compaction goes, in percent of
  the size at which Claude Code compacts on its own, or of the model's
  window when automatic compaction is off
  ([how far a compaction goes](limits.md#how-far-a-compaction-goes)).
- **`keepTokens`**, default 20,000: the newest tool results that stay,
  the newest always, and 0 keeps that one alone; long inputs and long
  messages have as many of their own, and a `/compact` typed without
  instructions reaches into all three, up to the last thing you said, where
  that is not enough. Where the oldest messages are kept in place of a
  summary, the newest messages stay up to as many
  ([which results leave](limits.md#which-results-leave)).
- **`minChars`**, default 2,000: tool results, input values (what `Write`
  was handed, a long command) and messages shorter than this many characters
  are not moved out one by one; old calls whose inputs and results are all
  shorter may still fold into a list with what they returned
  ([in short](limits.md#in-short)), so raising it folds more of them rather
  than keeping them: to keep more in the context, raise `targetPercent` or
  `keepTokens` instead.
- **`maxAfterPercent`**, default 75: where more than this percent of the
  same size is still in use after moving out, or of the model's window when
  automatic compaction is off, the oldest messages are kept in parts with no
  summary; a `/compact` given instructions goes to the summary whatever is
  in use. A `/compact` typed without them, with nothing to move out and no
  more than this in use, leaves the conversation as it is, unless it holds
  1,536 of the entries Claude Code hands a plugin
  ([too full](limits.md#when-the-conversation-is-too-full),
  [too long](limits.md#when-the-conversation-is-too-long)).
- **`provider`**, **`apiKey`** and **`cloudflareAccountId`**: where `find`
  asks Jev, as `find` above says
  ([setting it up](#setting-it-up)).
- **`model`**, default `jev-latest`: the Jev model TypeSafe is asked for. On
  Cloudflare the model is `typesafe/jev` whatever this says.
- **`storeDir`**: where moved-out results are kept, an absolute directory
  set in your user settings; one from a repository's settings stops the
  plugin. It is made mode 700 before anything is written, so point it at a
  directory of its own
  ([how long results are kept](limits.md#how-long-results-are-kept)). Unset,
  it is `lossless-compaction` under `CLAUDE_CONFIG_DIR`, else under
  `~/.claude`, or an existing `jev-lossless-compaction` there from 0.3.0 and
  before ([the files](limits.md#the-files)).

A number outside its range is taken as the nearest end of it, and the
first session after says so ([setting it up](#setting-it-up)).
