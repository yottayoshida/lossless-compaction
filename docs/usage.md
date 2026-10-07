# Usage

Three things, in the order you will meet them, and a command that says how
the plugin stands.

**`/lossless-status`.** Typed at the prompt, it says that the plugin runs in
this session, its version and Claude Code's, the value each number setting is
used at and, where that is not what was set, what was set, whether the other
settings are set, and whether `find` is registered, with where its key came
from or why it is not. It prints no key and reads no stored result: of
`find`'s settings it shows `provider` when it is `auto`, `typesafe` or
`cloudflare`, and of the others only whether they are set. What it says stays
in the conversation, as any command's output does. Its first lines are what a
bug report needs. Where Claude Code does not know the command, the plugin is
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

Each result that left has a ticket in its place, from the same check:

```text
[moved out] Read result, 45130 bytes; recall with mcp__lossless-compaction__recall id 9f4115d935e68429ec7e4e3409c400c15ba50e8d5f355797caf064c961eecf61
```

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
