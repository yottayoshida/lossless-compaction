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

**A compaction.** A line starting `lossless-compaction:` says what each one
did. From a real session of `Read` results, with `targetPercent` at 40:

```text
lossless-compaction: moved 6 of 21 tool results out (844544 -> 548237 chars, about 52357 of 167000 tokens in use) in 61 ms
```

Each result that left has a ticket in its place:

```text
[moved out] Read result, 83261 bytes; recall with mcp__lossless-compaction__recall id ed8701f23087852c07ee8eb0b91b9335cc94cc8b21e42826c6b684299e8008e3
```

Where moving results out is not enough, or there is nothing to move out and
the conversation is too full to go on with, the oldest messages are kept
whole instead and no summary runs. From a session of text pasted into
messages, at 40 as well:

```text
lossless-compaction: no summary, messages 2-22 of 30 kept in 11 parts: moved 0 of 3 tool results out (609241 -> 224393 chars, about 75804 of 231000 tokens in use) in 237 ms
```

The first message stays, and one message lists the parts where the others
stood ([what stays, and how far a cut goes](limits.md#when-the-conversation-is-too-full)):

```text
[lossless-compaction] Earlier messages of this conversation are kept as they were said, with no summary in their place, in 11 parts; recall a part by its id.
[moved out] conversation, part 1 of 11, messages 2-12, 1438 bytes; recall with mcp__lossless-compaction__recall id aeda8ee2358743538f517ef841ea5aa71780a5d523b81441ca65097beab4b2e7
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

**`find`.** Optional. Asked in words, it returns the moved-out result of this
conversation that the question is about, or lists the likeliest few when Jev
is not sure which. Asked in other words which of thirteen moved-out results
reported a refusal on an unsupported kernel call, in a session where the
calls said nothing of what they returned, the agent called `find` and got it
back:

```text
[found] Bash result, 2271 bytes; id 968e6cdd8a21069b3907388db507c061ce28cac950b7a63eae5a0967adf39edc; probability 0.99
```

It needs a Jev key: set it with
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
of it is sent. Without a key there is no `find`, and nothing is sent.
