# Limits

What the plugin does not do, and what a repository or a version can change.

## In short

- **A `/compact` with nothing to move out and room left does nothing** but
  say so: Claude Code shows it as not compacted, and `/compact` with
  instructions summarizes (ADR 0015). A conversation of 1,536 entries or
  more is cut for its length instead ([below](#when-the-conversation-is-too-long)).
- **A conversation too full is cut, not summarized.** When moving results
  out is not enough, or nothing can be moved out and the compaction is
  automatic or more than `maxAfterPercent` is in use, the oldest messages
  are kept in parts, a list of them stands in their place, and the first
  message stays. More is sent with each request than after a summary, and
  the agent knows what was cut by the list alone (ADR 0019).
- **A conversation near the 4096 entries Claude Code hands a plugin is cut
  too.** At a compaction without instructions, one handed over with 1,536
  or more is cut down to 1,024 messages, however much room is left: under
  the plugin no summary starts the count over, and one that reaches 4096 is
  summarized with what is older not kept
  ([below](#when-the-conversation-is-too-long), ADR 0034).
- **Claude Code's own summary still runs** when `/compact` is given
  instructions, on what is left once results, long inputs and old calls
  are moved out, whatever room that made: a `/compact` given instructions
  moves out what it can, then runs Claude Code's summary with them on what
  is left, once the conversation is kept; where the disk refuses the write,
  nothing runs (ADR 0036, ADR 0008). It also runs when no cut
  between messages brings the conversation under `maxAfterPercent`, as with
  one very long message said last; when the plugin cannot count the
  conversation and its messages come to less than `keepTokens`; when the
  conversation holds
  an image or a document outside a tool result, a block of a kind the plugin
  does not know, or 4096 messages or more; when a part cannot be written;
  and in a subagent.
- **Long inputs leave after results.** Where moving results out is not
  enough, long values handed to `Write`, `Edit`, `MultiEdit`, `NotebookEdit`
  and Bash leave too, each a line in its call; the newest stay up to
  `keepTokens` of their own, but at a `/compact` typed without instructions
  (ADR 0023). The inputs of other tools stay (ADR 0020).
- **The middle of a long message leaves next.** A message of yours or of
  Claude's of `minChars` characters or more, with three paragraphs or more,
  keeps its first and last paragraphs (500 characters of each at most) and a
  line in place of what is between them; the whole message is kept, and the
  newest such messages stay up to `keepTokens` of their own, but at a
  `/compact` typed without instructions. The first
  message, the plugin's own lines and what Claude Code writes in your place (a
  notification, another session's message) stay. A paragraph is never cut
  inside a fenced block of code: where it could only be, the message stays
  whole. Until it recalls the message, the agent sees only its first and last
  paragraphs: an instruction in the middle of a long message is out of its
  sight. `find` looks through the middles here, in the conversation and in
  the kept parts it reads, for a quoted phrase or the values a question
  names, and sends Jev nothing of them; a part kept before a summary is
  offered to Jev by its digest, as before, and can hold what was said. A
  message you send again from a rewind as its paragraphs and the line goes
  in whole. A call of any tool but those known only to read that hands on the
  first and last paragraphs together, the line dropped, is refused; where the
  two are under 40 characters together, only side by side (ADR 0024).
- **Old small calls fold into a list after that.** Calls of `Bash`, `Read`,
  `Grep`, `Glob`, the tools that write, `WebFetch` and `WebSearch` whose
  inputs and results are all short and hold no ticket, older than the newest
  `keepTokens` (at a `/compact` typed without instructions, older than the
  last thing you said), leave with their results, kept as a part; a list of what was
  called stands where they stood, and what was said stays. A call that holds
  a ticket stays, so the ticket goes on naming what it stands for. A run
  folds only where its list is smaller than it. The agent sees an old step by
  its line, not by what it returned, until it recalls the part; so does a
  summary of what is left, where one runs (ADR 0022).
- **A tool call that hands on a ticket is refused**, whatever the tool, when
  the id is one this store holds or this conversation names, or when the store
  cannot be read to tell. Not caught: a ticket built up in a script, one whose
  id is held nowhere, and a call that runs past the time Claude Code gives a
  hook, which goes on. The tools that only read are let through. The refusal
  tells the agent to recall the id and use what comes back: where the tool
  sends on what it is handed (another agent, an MCP server), the whole of the
  value goes there instead of the line (ADR 0020).
- **What a summary replaces is kept first**, on the main conversation, and
  `recall` returns it unchanged by the ids left right after the summary. Not
  kept: images, documents, thinking, and messages older than the 4096 Claude
  Code shows; half of a character left alone is kept as U+FFFD.
- **`find` does not see everything.** It offers the tickets it sees in the
  conversation and in the parts kept before a summary, shows Jev the first
  lines of each result, and gives a request to Jev up after twenty seconds.
- **Sizes are not capped, and are estimates.** There is no limit on how much
  is kept. How full the conversation is afterwards is counted from Claude
  Code's own figures: where results were moved out it came within 20 % of
  what the next request sent, and within 3 % in five long working
  sessions. `keepTokens` is turned into characters at three to a token.

Each of these in full, and the rest, below.

## When the built-in compaction runs instead

Claude Code's built-in compaction runs instead when the conversation holds an
image or a document outside a tool result, or any block of a kind the plugin
does not know, has 4096 messages or more (one is cut well before that,
[below](#when-the-conversation-is-too-long)), or belongs to a subagent; when
`/compact` was given instructions, typed or by a plugin, on what is left
after moving out (ADR 0036; an automatic compaction handed instructions by
another hook is handed back rebuilt where moving out made room, as one
without them, and goes to the summary where too much is still in use, as
before); and when a conversation that is too full
cannot be cut ([below](#when-the-conversation-is-too-full)). An image in a tool result is moved out with the result: a line
stands in its place, and the conversation is compacted by the plugin (see
[images](#images)).

One case of nothing to move out is left alone (ADR 0015). A `/compact` run
by hand without instructions, on a conversation that has nothing to move out
and uses no more than `maxAfterPercent` of the size at which Claude Code
compacts on its own, is not carried out: Claude Code's summary does not run,
and a line says so.

Where the conversation was counted, the line says what takes the room: what
every request carries, which no compaction makes smaller, the first message,
which always stays, and the rest (ADR 0023).

```text
Not compacted · lossless-compaction: nothing to move out, 28425 of 167000 tokens in use: the conversation is left as it is; of what is in use, 12100 are sent with every request (the system prompt, tools, memory and the like), 15700 the first message and 625 the rest. /compact with instructions runs Claude Code's summary
```

- The line is the one Claude Code shows for a compaction a plugin skipped,
  and it records the compaction as failed. Nothing of the conversation is
  kept, rebuilt or sent, and the line is all that is added to it. As at any
  compaction, the place results are kept in is made private first and what
  a clean-up moved to the trash is put back.
- With `claude -p --resume … "/compact"`, such a session ends without an
  error, exit 0, and prints that line: a script that compacts this way to
  make a conversation smaller gets it back as it was. `/compact` with
  instructions summarizes.
- What is in use is Claude Code's own figure, thinking included, since
  nothing is rebuilt. Right after a summary Claude Code gives none: the
  conversation's characters over three are measured instead, which holds no
  system prompt and no tools, and the line names no figure. A conversation
  of text that comes to a token a character or more, Japanese say, can then
  be counted under the line where it is over. Right after a summary the
  conversation is the summary, which a summary would not make smaller; where
  else Claude Code gives no figure was not measured.
- `/compact` with instructions is summarized as before, the conversation
  kept first. An automatic compaction, which runs because the conversation
  is full, and a `/compact` with `maxAfterPercent` set under what is in use
  are not left undone: one that fits once its messages are rebuilt is
  handed back so, and of one that does not the oldest messages are kept in
  place of a summary ([below](#when-the-conversation-is-too-full)).
- The other cases above are not this one: a conversation handed over before
  anything could be moved (no place to keep results in, an image pasted into
  a message, 4096 messages or more) is summarized with room or without.

Measured with `-p` on Claude Code 2.1.287 and 2.1.288, and in a terminal on
2.1.288.

When the plugin's own compaction fails (#102) — its hook throws, answers
what Claude Code refuses, or outruns the ten seconds of its own time Claude
Code gives a hook — Claude Code runs the hook's handler of a failure, which
says what failed:

```text
lossless-compaction: the compaction stopped (throw: …); the built-in summary runs in its place, the conversation kept first where it can be
```

It then keeps the conversation as it was sent, as where the compaction
could not be tried, and hands it to Claude Code's summary; the tickets of
what was kept follow the summary ([what a summary replaces](#what-a-summary-replaces)),
and a second line says it was kept. Where the hook had already asked for
the summary, it is not asked for again: what it came to stands with the
tickets after it, and a summary that failed is left failed, with nothing
kept for it. Where Claude Code went on without the hook while it was
trying the compaction, the hook says and hands on nothing more once the try
is over; past that, within the little left of its work, it may still say a
line of its own. The handler has a second of its own time, waits
on the disk not counted; keeping 4,096 messages of six million characters
took 59 ms in memory where it was written. Past that second nothing is
kept and the second line is not said. A compaction computed ahead, which
the hook skips before anything can fail, and a subagent's, which it hands
straight on, are left to Claude Code.

Measured with `-p` on Claude Code 2.1.291 by `npm run check:host`, on
copies broken as `test/fixtures/failing/` says: a throw, an answer that is
not a list, a throw after the summary was asked for, and ten seconds waited
past the hook's time right after the compaction was tried. In each the
conversation was kept in one part and compacted once, and held the ticket
afterwards. Without the line that stops the hook once Claude Code has gone
on, the copy that waited said it had moved results out after the handler's
line. A hook held up by its own work, not by a wait, was not measured.
`claude plugin validate --strict` of 2.1.287 and 2.1.288 accepts the hook
file.

How full it is afterwards is counted as what is in use less what goes (ADR
0013). What Claude Code's breakdown says is not the conversation (the system
prompt, the tools' definitions and the like) stays as it is. Of the
conversation, the breakdown's `Messages` row, three things are gone once the
messages are rebuilt, whatever is moved out: images, taken off at about
1,500 tokens each; thinking, whose tokens a plugin cannot read, and which is
estimated from how long the signatures of the thinking blocks are; and what
Claude Code added to the conversation as it sent it — reminders after
results and after what you said, the text of commands and attachments —
which is in no message a plugin is handed (it is kept apart, and named at
the end of what is handed back: [what a summary replaces](#what-a-summary-replaces)).
What is left of the row is spread
over the characters that were sent, a digit counting as two and a character
that is not ASCII as three, and what Claude Code added at four fifths of
what the messages' characters count; the rebuilt conversation is counted at
that rate. What a result saves by leaving is counted at it too.

Where the plugin moved results out, the size it goes by came within 20 % of
what was in use afterwards, and no more than 6 % under it, in every
conversation it was measured on, compacted by the model that had built it.
On Sonnet 5.5, the six conversations of the benchmark at `targetPercent` 40
and at 1 ([at 40 and at 1](measurements.md#the-six-kinds-of-conversation-at-40-and-at-1)):
from 6 % under to 17 % over, the most in `thinking`, where only its three
results could leave.
On Haiku 4.5, in the made-up conversations of
[the benchmark](measurements.md#the-size-after-a-compaction-counted-again):
mostly tool results, pasted English prose with logs, and Japanese with logs.
On Opus 5.5: Japanese with logs, made up, and five long working sessions
with 172 to 235 thinking blocks.

Where nothing could be moved and the `/compact` is left undone, or the
conversation goes to the summary, nothing the plugin would have rebuilt is
sent, so there is no afterwards to measure. Set against what was in use before less its thinking, the size came
up to 7 % under in the five such conversations of the benchmark (files
written, pasted prose, many short results, a full window, a third
thinking), where 0.6.0 ran from 49 % over to 22 % under. Where the oldest
messages were kept in place of a summary, the size the plugin gave came
0.8 % over what the next request sent with Sonnet 5.5, and 5 % and 6 % over
with Haiku 4.5, on one conversation of pasted text; and 12 % over on one
handed back as rebuilt, a third of it thinking, with Haiku 4.5.

Which way it is off, where that is known:

- Over where what leaves comes to more tokens a character than what stays:
  3 % and 7 % with logs moved out, the 7 % out of English prose.
- What Claude Code added comes to fewer tokens than the same weight of the
  messages: 0.75 to 0.88 of them in the five working sessions, where it
  was half to four fifths as much again as the messages themselves. It is
  counted at four fifths, chosen on the first four of those sessions; the
  fifth, measured with that, came 1 % under. A session whose own figure
  lies further from four fifths is off by the difference, times the share
  that was added: 3 % at most in the five.
- The thinking is estimated at 0.6 to 1.5 times what it was, in
  conversations of four thinking blocks or more. With one block, or with
  blocks whose signatures are all as long, it comes out at nothing, and the
  size over by as much.
- Right after the model is changed, the breakdown is still of the last
  response, which the model before gave. A conversation built with Haiku
  and compacted by Sonnet before Sonnet had answered came 20 % under where
  English prose stayed, for which Sonnet counts a third more tokens, and
  5 % over where logs did. Once the new model has answered, the figures are
  its own.
- Two of the working sessions held 29 and 11 images in their results,
  taken off at about 1,500 tokens each, and came within 3 %. A conversation
  that is mostly images was not measured with this count; with the one
  before it, five images among four text files came 29 % over.

When the breakdown cannot be relied on, the line a compaction shows names
no token count, and what was in use less what was moved out is measured
instead, at three characters a token: that still counts the thinking, and
with no response since the last compaction, what was in use is the
conversation's characters over three, without the system prompt or the
tools. It is not relied on either when the conversation cannot be read as
it was sent, when the thinking comes out at more than nine tenths of the
`Messages` row, or when the row comes to fewer than 0.05 or more than 3
tokens a weighted character.

## When the conversation is too full

Where results were moved out and more than `maxAfterPercent` of the size at
which Claude Code compacts on its own is still in use, or nothing could be
moved out and the `/compact` is not left undone, the oldest messages are
kept in place of a summary (ADR 0019), unless `/compact` was given
instructions. They are written in parts, as a conversation is before a
summary ([below](#what-a-summary-replaces)), and one message lists the parts
where they stood:

```text
[lossless-compaction] Earlier messages of this conversation are kept as they were said, with no summary in their place, in 11 parts; recall a part by its id.
[moved out] conversation, part 1 of 11, messages 2-12, 1438 bytes; recall with mcp__lossless-compaction__recall id …
```

- The first message stays in front of the list: what was asked for, and any
  rule given with it. Where the conversation does not fit with it there, it
  is cut with the rest.
- A cut ends where you start to speak, or right after the results of a call
  came back: a call and its result are never parted.
- It goes down to the size results are moved out to reach: `targetPercent`
  of the size at which Claude Code compacts on its own, and never more than
  half of what was in use. The newest messages stay while they add up to
  `keepTokens`, counted here as the plugin counts a size (above) and not at
  three characters a token. With `targetPercent` at 1, the default, that is
  all that stays behind the first message. Fewer stay only where leaving that many
  would keep the conversation over `maxAfterPercent` and a cut further on
  brings it under: a summary would leave none of them as they were said.
- No summary is written, by Claude Code or by the plugin. What the agent
  has of the messages that were cut is the list: parts by their numbers,
  with no word of what each held. With a key, `find` reads them; without
  one it lists them, each part by the messages it holds, and `recall`
  takes an id from the list. A rule or a decision stated later
  than the first message is in a part, and an agent that does not fetch it
  does not have it. Asked for what was cut, Sonnet 5.5 called `recall` and
  gave it each time; Haiku 4.5 mostly said that it did not have it.
- More is sent with each request than after a summary, and the next
  compaction comes sooner: with Sonnet 5.5 and `targetPercent` at 40, the
  default then, 75,188 tokens a request where a summary left about 11,500, on
  a conversation that filled 85 % of the window. At 1 the cut goes as far as
  `keepTokens` allows: with Haiku 4.5, 39,187 where 40 left 54,705.
- The files changed on disk are not named, as they are
  [after a summary](#what-a-summary-replaces): Claude Code shows no file
  again where no summary ran. One case apart: where a summary earlier in
  the conversation named some and its message is among those cut, the list
  names again those that still differ, set against the disk as at a
  summary, so that the line standing for a changed file shown again still
  does.

Claude Code's summary still runs for the size, the conversation kept first,
where no cut helps: what is behind the last place a cut could end is over
`maxAfterPercent` by itself (one very long message said last, say), there is
no such place, or a part cannot be written. Where the plugin cannot count
what would stay (the cases at the end of
[the section above](#when-the-built-in-compaction-runs-instead)), a
conversation with nothing to move out is cut down to the same size even
when what is in use looks under the line: the compaction was asked for, by
Claude Code where the conversation is full, and the plugin cannot say that
it fits as it is. The newest `keepTokens` always stay there, since nothing
the plugin counted says the conversation is over the line: one whose
messages behind the first come to less than `keepTokens` is not cut, and
the summary runs. What fills such a conversation is not what was said in
it, which is all a cut could take away.
A conversation over the line for what is not the conversation, the
system prompt and the tools' definitions, is handed back all the same, since
a summary would not change that: cut as far as it goes, or as it is where
results were moved out.

```text
lossless-compaction: no summary, messages 2-19 of 20 kept in 1 part: moved 0 of 7 tool results out (67214 -> 453 chars, about 6599 of 167000 tokens in use) in 79 ms; still over what may stay in use, which a summary would not change
```

Measured on Claude Code 2.1.288: with Sonnet 5.5 at a `/compact` by hand,
and with Haiku 4.5 at one too and at compactions Claude Code started
([measurements](measurements.md#the-oldest-messages-kept-in-place-of-a-summary)).

## When the conversation is too long

Claude Code hands a plugin the newest 4096 entries of a conversation, and
the plugin leaves one of 4096 or more to the summary, kept first, with what
is older than the 4096 not kept
([above](#when-the-built-in-compaction-runs-instead)). Moving results out
leaves the messages where they were, and no summary starts the count over,
so under the plugin it grows from one compaction to the next. How much it
can grow by is what one window holds: from an empty start to the next
compaction a conversation gathered 1,510 entries at the median and 2,045 at
most, counted on one machine; after a compaction the plugin rebuilt, where
more stayed in use, it grew by 10 to 1,228 where it grew
(ADR 0034, [measurements](measurements.md#how-many-entries-a-conversation-holds-at-a-compaction)).

At a compaction without instructions, a conversation that holds 1,536 of
the 4,096 entries Claude Code hands a plugin is cut, its oldest messages
kept in parts with no summary, down to 1,024 messages, however few of the
newest `keepTokens` that leaves, so that compactions do not carry it to the
4,096 at which the summary runs and older messages are not kept.

- The entries are counted as the larger of the messages the plugin is
  handed and the conversation as Claude Code sends it, before anything is
  rebuilt. In a made-up session of 3,400 messages, a row of the record
  each, Claude Code handed over 3,400, and after the cut 1,026: the 1,024
  handed back and the two commands typed since. Whether it counts rows of
  other kinds was not measured.
- The 1,024 are the messages handed back, the list among them, and with
  the message naming what Claude Code attached at the end where it added
  any (ADR 0030), 1,025.
- It is cut where moving results out was enough by size, and at a
  `/compact` by hand that would otherwise be left undone. Past 1,536, each
  compaction without instructions cuts it again.
- The first message stays, a cut falls where a cut by size may, and the
  list stands for what was cut, as [above](#when-the-conversation-is-too-full).
  Where the conversation is too full as well, the cut that goes further is
  taken; where it is too full and no cut brings it under the line with the
  first message in front, the first message goes too, or the summary runs,
  as above.
- With instructions, the summary that was asked for runs, the conversation
  kept first, and the count starts over.
- Where no place to cut is left (one call waiting for its result through
  all of it, say) or a part cannot be written, the compaction goes as it
  would have.
- `/lossless-status` says how many of the 4096 the conversation holds.
- A conversation that gathers more than 2,560 entries between two
  compactions, or 4096 before its first, still reaches 4096 and is
  summarized, kept first. In a window of 1,000,000 the first takes fewer
  than 377 tokens an entry on average (967,000 over 2,560) and the second
  fewer than 236, less what every request carries besides the conversation
  and what stayed in use; the most gathered counted, 2,045 entries, came to
  about 470.

## What a summary replaces

Before the built-in summary runs, on the main conversation or a subagent's
(ADR 0026), the plugin keeps the conversation it summarizes (ADR 0007): in
the parts, every result of 400 bytes or more still in it is stored as usual
and stands as its ticket, a shorter one staying in the text; the conversation
the summary is made of is left as it was. It is written as text in parts of at most
40,000 bytes, each stored like a result. Right after the summary, one message
names each part:

```text
[lossless-compaction] The conversation this summary replaces is kept, in 2 parts; recall a part by its id.
[moved out] conversation before the summary, part 1 of 2, messages 1-40, 38211 bytes; recall with mcp__lossless-compaction__recall id …
```

A subagent's conversation is never moved out of or rebuilt: Claude Code
summarizes it, kept first in the same way, with its line in the transcript
alone, starting `subagent <its id>:`. Where the disk refuses the write, its summary
runs all the same, with nothing kept: no one can compact a subagent again
once room is made. A subagent given a list of tools that leaves `recall` out
cannot read its parts back.

A part writes each message as `--- user` or `--- assistant`, then its text,
then for each call `[call <tool> <id>]` with a one-line form of its input
and, below it, every field of the input as `<name>:` followed by its value
with its own line breaks, then `[result <id>]` (`[result <id> error]` for a
failed one) followed by the result or its ticket. An input value too long
for a part leaves as a ticket named for the call and the field, such as
`Write.content`, whose wording still says "result". A message too long for
a part is cut at a line, and a line too long at a character. Read in order,
the parts are the messages in order.

In a part, a line `--- user`, `--- assistant`, `[call <tool> <id>] …` or
`[result <id>]` is one the plugin wrote; none comes from what was said,
handed or returned (#104, ADR 0029). A line of a message, an input, a
field's name or a result that reads as one of them is written with a `\`
in front: one that does, once the backslashes and whitespace (spaces, tabs,
carriage returns: JavaScript's `\s`) it starts with are read past and the
whitespace it ends with is not counted,
is `--- user` or `--- assistant`, or starts `[call ` or `[result `. In the
parts joined in order, taking one `\` off each line that starts with one
and reads so after it gives the text back as it was; no reader of the
plugin does, since a marked line is no fixed line. A part that begins
inside a line is not read that way on its own. Where a line is cut at a
character, the cut goes one character earlier if what follows would start
`--- user`, `--- assistant`, `[call ` or `[result `. Parts
written before this change are as they were: there a line of what was
returned may read as a fixed line, and a line that starts with `\` is as
it was said. `recall`'s description tells the agent how a part is read.

What Claude Code attached to the messages as it sent them — a file handed
over with `@`, what a hook added to what you said or to what a tool
returned, the text it shows with a command, reminders — is in no message a
plugin is handed, and a rebuilt conversation would not carry it (#105, ADR
0030). Wherever a compaction rebuilds the conversation, cuts it, or hands
what it rebuilt or what it was handed to the summary, that is kept first,
in parts as a conversation is, and a message at the end of what is handed
back names the parts; where the summary runs, that message is the last of
the conversation kept before it, reached through the summary's tickets.
Each block stands under a heading that says it is
Claude Code's and names the message it came with, by its number among the
messages the hook was handed, as near as the conversation as sent tells it
(`What Claude Code attached with message 3:`, `before message 1:` where it
came alone; blocks sent with two messages Claude Code joined stand under
the first); a block sent again is written once:

```text
[lossless-compaction] What Claude Code attached to these messages as it sent them is kept, in 1 part; recall a part by its id.
[moved out] what Claude Code attached as it sent the messages, part 1 of 1, 3214 bytes; recall with mcp__lossless-compaction__recall id …
```

It stands at the end, so that what an earlier compaction left stays as it
was. What Claude Code puts back on its own after a compaction (the
CLAUDE.md files, the environment, the date) is kept with the rest: the
plugin does not tell the kinds apart. The figures a compaction's line gives
leave that message out, but for a cut's, whose count of messages and of
characters take it in. Where the parts cannot be written, the
conversation is not rebuilt: it goes to the built-in summary kept as it was
sent, what was attached and all, and where that cannot be written either,
the summary does not run (ADR 0008); so on a disk with little room left a
compaction that would have handed back a rebuilt conversation can now be
skipped. A conversation that cannot be rebuilt (an image pasted into a
message, say) is kept as it was sent, what was attached in its own parts,
with no message at the end. A compaction left undone keeps nothing, as the
conversation stays as it is. `find` looks through the parts named at the
end here, as it does the middle of a long message, and sends nothing of
them to Jev; a conversation kept as it was sent holds what was attached in
its own parts, whose 400-character digest Jev can be sent (see
[`find`](#find)).

Measured with `-p` on Claude Code 2.1.291 by `npm run check:host`: a file
handed over with `@`, a word a `UserPromptSubmit` hook added to the first
thing said and one a `PostToolUse` hook added after a `Read` were kept in
one part at a `/compact`, and the agent, asked afterwards with no tool to
read a file, recalled it and gave all three. Before this change, asked the
same of a file handed over with `@`, it answered that it was not visible.

What is not kept: images and documents still in the conversation, which
leave `[image not kept]` or `[document not kept]` (an image the plugin moved
out with its result is a ticket by then, and is kept as one); thinking;
a reminder Claude Code sends as a turn of its own, which is in no message;
messages older than the 4096 Claude Code
shows a plugin; a subagent's conversation where the disk refuses the write. Half of a character left
alone (a UTF-16 surrogate with no other half, which UTF-8 cannot hold) is
kept as U+FFFD, what a UTF-8 file makes of it; a result, or a long input
value, holding one is not moved out on its own, and stays as it was in the
conversation, or in the part's text, where the U+FFFD is. Nothing is kept when the
place results are kept in is not an absolute path or cannot be read, or when
a part cannot be written for a reason other than a write the
system refused, and the compaction says so; the summary is then Claude
Code's alone, as before, and earlier tickets may be gone from the
conversation, the files remaining. A write the system refused stops the
summary instead: see [the files](#the-files). A block of a kind
the plugin does not know is kept as its JSON.

`find` offers the parts and the results their tickets stand for, reading at
most 64 parts, parts of an earlier summary included; of the results found in
parts, it offers no more than make 1,200 tickets in all, and `recall` still
reads the others by id. Whether the agent goes
back to what was kept rather than trusting the summary is up to it.

After a summary, Claude Code shows the files read most recently again in
the next request (three of them, where it was measured), each as it is on
disk then, in the words of a `Read` result. A file that changed since the conversation read it is shown
as it is now, and an agent can take that for what it read. Right after a
summary, the plugin names the files the conversation read whole whose text
on disk is no longer what the last such `Read` returned, each with the id
that reading comes back by (ADR 0014):

```text
Changed on disk since it was read in the conversation, as of this summary: /work/app/config.json. If it is shown again after the summary, that is the file as it is now; what the Read returned then comes back with mcp__lossless-compaction__recall id …
```

To tell, the plugin reads those files: paths the conversation read, the
newest twenty of them, regular files of up to 256 KB and no links. It sends
nothing, and writes nothing of them but a reading too short to have been
stored, which is stored so that it can be named. Ten files are named and
the rest counted. A path of over 512 characters is not named, nor one
holding a control character, a line separator or a mark that turns the
direction of text: the line stands in a message of your side of the
conversation, and a path is all it holds that the plugin did not write.

A reading is a `Read` without `offset`, `limit` or `pages` that returned
the file's lines, the last such one of a path. A file the conversation
wrote to afterwards with Edit, Write, MultiEdit or NotebookEdit is left
out, unless that write failed; one changed through Bash is named like any
other, and so is one written to under another spelling of its path. The
file is set against the reading just before the summary runs, a carriage
return at the end of a line and a byte order mark left out on both sides.
What changes later is set against it again at the next summary, which
names the file again while it differs: the line of the summary before is
read for that, in the plugin's own message and nowhere else. A file that
was still what was read at one summary and changes after it is not taken
up at the next: its reading is in a part by then, and no line names it. A
file that is gone, a notebook, an image, an empty file, a file that does
not read as text (not UTF-8, or holding a NUL) and a reading the plugin
could not have are not named, and nothing is named when the conversation
could not be kept. The comparison rests on the form
Claude Code 2.1.287 gives a `Read` result, a number and a tab before each
line: without them nothing is named, and a form that kept them and cut the
text short would name files that did not change.

Where Claude Code then shows such a file again, a line of the plugin's
stands in its place (ADR 0018):

```text
[lossless-compaction] Not shown again here: /work/app/config.json changed on disk since the conversation read it. What the Read returned then comes back with mcp__lossless-compaction__recall id …; the file as it is now, by reading it again.
```

The other files shown again are left as they are. So is the changed file
once a file of its name has been handed over with an `@`, in anything typed
that stands behind the plugin's message (`@config.json`,
`@app/config.json`): it is then shown as you asked for it, where Claude Code
shows it again as well. How Claude Code reads an `@` is its own, so the
plugin errs on the side of showing: the name anywhere in what follows the
`@` counts, and another file whose name holds it (`@old-config.json`) shows
this one too. An `@` in a command's arguments is read the same way, which
was not tried in a session; nor was an `@` typed while the agent was at
work. Handed over in another letter case (`@Config.json`), the file handed
over is shown, and the one shown again still gives way to the line. What stands
behind the plugin's message is what was typed since the summary and the last
messages Claude Code kept from before it, so a file handed over just before
the summary may be shown as well. When Claude Code asks again of a file, as
it does when a session is resumed, the answer is the same while the
conversation is, and a file handed over since is shown as it is where the
line stood.

A file Claude Code shows is told by its first line, the call that would have
read it, and matched to what the plugin named by its path as written: framed
otherwise, or shown by another spelling of the path, nothing is put in its
place. Nor is anything in a subagent's conversation. For each file Claude
Code attaches, the plugin reads the conversation; its own part of that took
1.8 ms on a conversation of 4096 messages. `prompt.attachment` is an event
of function hooks like `tool.describe` ([`find`](#find)): a Claude Code that
does not know it loads no hook of the plugin at all. `claude plugin
validate` takes it on Claude Code 2.1.285 to 2.1.288.

With that line in the file's place, asked what a file said when it was read,
the question saying that the file has been regenerated since, Haiku 4.5
answered right 9 times of 9 in the
[three conversations sent to the summary](measurements.md#the-note-narrowed)
where the file is shown again, each after one `recall`, where it was right 6
times of 9 with the file shown as it is now (12 of 12 against 9 with a
fourth, where the file is not shown again); asked what the file says now, it
read the file again and was right 12 times of 12. With the line after the summary alone,
and before the two tools were listed, it answered right six times of twelve
in the four conversations where the file is shown again (three of three in
one of them, none of three in another), where without the line it answered
with the file as it is now twelve times of twelve; Sonnet 5.5 answered right
with the line and without it, in one run on two conversations
([the benchmark](measurements.md#a-file-shown-again-after-a-summary)). An id
is 64 characters, and an agent copying one gets it wrong now and then:
`recall` takes it for the one id written in the conversation that shares the
most characters with it from the first, 8 or more, and refuses it where none
does or two share as many, naming the tickets it may stand for
([what is not taken](#what-an-agent-does-not-fetch)). Measured with
`claude -p` and a manual `/compact`; a compaction Claude Code starts on its
own was not.

Every summary keeps the whole conversation, so the directory grows faster
than moving out alone makes it grow.

Every message is rebuilt, so older thinking blocks are not carried over, and
a tool that was loaded on demand has to be loaded again. The built-in
compaction drops both as well.

## Which results leave

Of the tool results that could leave — long enough, not failed, not a
ticket, not in the first message, not made obsolete by a later call, and with
the same text on both sides of the call — a compaction keeps the newest
whatever its size, and keeps the ones before it while they and the newest
together add up to at most `keepTokens` tokens (three characters to a token,
20,000 by default); every older one is a candidate to leave, whatever message
it is in. A result a later call made obsolete is a candidate even when it is
the newest.

A `/compact` typed without instructions goes on where that is not enough:
once every result, long input, middle of a long message and old call older
than the newest `keepTokens` is out, the same are taken from the newer ones, up to
the last thing you said (a turn stopped with Esc, a Stop hook's answer, a
message from another session and a command run with `!` are not things you
said); the second round leaves that message and what came
after it as they were (what is older than the newest `keepTokens` there
leaves as at any compaction) (ADR 0023). The line then says
`; 3 of these from the newest turns`.

`keepTokens` has a second meaning where the oldest messages are kept in
place of a summary ([above](#when-the-conversation-is-too-full)): the least
of the conversation left behind the first message, every message counted and
not results alone, unless fewer have to stay for the conversation to fit.

## How far a compaction goes

`targetPercent` is how far a compaction goes: results leave until the
conversation is estimated to be under that share of the size at which Claude
Code compacts on its own, and only where that is not reached do long inputs,
the middles of long messages and runs of old calls leave after them. At 1,
the default (ADR 0025), the target is 1,670 tokens in a window of 200,000,
less than what stands before the conversation, so it is not reached: each
compaction, automatic or typed, moves out everything that may leave but the
newest `keepTokens` of results, of long inputs and of long messages, and the
calls among the newest `keepTokens` of the conversation (a `/compact` typed
without instructions reaches into those too), and a cut in place of a summary goes as far. In a
window of 1,000,000 the target is 9,670 tokens, reached only where what is
left comes to less. A target is never more than half of what the plugin
counts in use: in eight working sessions replayed in that window, what could
not leave was over it even at 40 in seven, and there 1, 20 and 40 moved out
the same at the first compaction
([replayed](measurements.md#working-sessions-in-a-window-of-1000000)). (Where Claude Code gives no figures to count from, what
a result saves is counted at three characters a token, and the target can be
taken for reached sooner.)

What each end costs, measured with Sonnet 5.5 in a window of 200,000
([one session, several compactions](measurements.md#one-session-that-compacts-several-times-under-each-setting)):

- **At 1** the conversation after a compaction is as small as the plugin
  makes it, about 26,000 tokens in that session, so compactions come less
  often. The price is in sight: more of what was read is behind tickets, and
  a long message older than the newest `keepTokens` of them stands as its
  first and last paragraphs after an automatic compaction as after one typed,
  so the agent calls `recall` for more of what it needs.
- **At 40** about 65,000 tokens stayed, chosen by how much a result shares
  with what you are working on, wherever it stands, and left at the next
  compaction in turn. A message's middle and old calls stayed while results
  were enough.
- **At either**, the request after a compaction read from the prompt cache
  only what stands before the conversation, about 4,000 tokens, and wrote the
  rest anew. What differs is how much and how often: 60,000 tokens five times
  in the session at 40, 22,000 three or four times at 1, and a quarter more
  to pay at 40.

Between them a value is a share of the window: 20 left what 1 did in a
window of 200,000, where the newest 20,000 tokens of results stay anyway, and
leaves up to 193,000 tokens of results in a window of 1,000,000. A window of
1,000,000 was not measured.

## Images

A tool result that holds an image — a screenshot a tool returned, an image
file read with `Read` — is moved out at every compaction, whatever its age
or size and before any other result: a rebuilt message cannot carry an
image, so the newest one leaves too. The result's text and its images are
stored together, in the order the result held them, and one line stands in
the result's place, worded as any other. What the host added after the
result's own blocks is not stored. `recall` returns the text and the
images in that order, as images and with nothing added; the bytes of an
image are never returned as text. Recalled and compacted again, the result
comes to the same stored text and nothing is written a second time. A
tool's output that is, to the character, a stored result holding an image
— the store's own file printed by a command — is returned as that image
too, and is not offered by `find`.

When such a result cannot be stored — it is over about 4 MB with its images
in base64, the write fails, or the store refuses it for any other reason
it refuses a result — nothing is rebuilt, and the conversation goes to the
built-in compaction as it was, which the line says. So does a conversation
with an image that is not held as its bytes, whose bytes do not begin as a
PNG, JPEG, GIF or WebP does, or next to a block that is not text; with an
image pasted into a message; and with a document. No pasted image and no
document was in the transcripts this was measured on. If the compaction
says `cannot carry: image` or `document` for yours, that is the next thing
to build.

`find` does not offer a result that holds an image: nothing of it is sent
to Jev, its text included. `recall` reads it by the id in its line.

Images make the store grow faster: 621 of them in two months of one
person's transcripts came to 120.8 MB in base64. They are kept and cleaned
up as results are.

## Function hooks

The plugin needs Claude Code's function hooks, which run a plugin's hooks
module, a mod. From Claude Code 2.1.287 they are on by default, and
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, which early access asked for, is
ignored: set to `0`, it does not turn them off. They can still be off for
you. Anthropic can turn installed mods off remotely, and `disableAllHooks`
or your organization's policy can turn them off; `claude plugin test`, run
in a directory that holds no mod (an empty one will do), says which. Run
where a mod is, it runs that mod's tests instead. An organization's
`allowManagedModsOnly` lets only its own mods load, which that command does
not report and `claude --debug` does, and in a directory whose trust prompt
is not answered no mod loads (Claude Code's page on troubleshooting a mod). With them off the
plugin installs, shows in the list, and moves nothing out: there is no
`recall` tool, and a compaction is Claude Code's own. Measured on Claude
Code 2.1.289: with the variable unset, `0` or `1`, and no settings file
read, the module loaded. Before 2.1.287 the variable decided and, when it
was not set, Claude Code's rollout for your account: on 2.1.286, on one
account, they were off without it.

A compaction in such a session does not go by unsaid where the plugin's
classic hooks still run. When the module runs, it sets
`LOSSLESS_COMPACTION_RUNNING` to the id of its process. Three classic hooks,
which run whether or not the module does unless hooks are turned off
altogether (below), compare it with the id Claude Code hands them:

- At the first message sent in a process without the mark, one line says
  that the plugin is not running in this session, that a compaction there
  would be Claude Code's own, what the plugin needs (Claude Code 2.1.287 or
  later, and mods not turned off), where to look (`claude --version`,
  `claude plugin test` in an empty directory, then `claude --debug`), and to
  start a new session. It is said once in a process, and again in the conversation
  reopened in another, where the plugin may still not run. The line is shown
  on the screen and is not part of the conversation: measured on Claude Code
  2.1.286, the tokens sent were the same with and without it, and `claude -p`
  printed the same bytes. The processes told are one line each in `told`
  next to `held` (below), kept the same way. The hook runs at every message;
  in a session where the plugin runs it reads no file and takes about 10 ms
  (0.3 s for a message of 1 MB, most of it reading its input).
- Before a `/compact` without the mark, the compaction is held: nothing is
  compacted, and a line says that the plugin is not running, what it needs,
  how to reopen the conversation, and that running `/compact` again
  in that session goes ahead with the built-in summary. A process is held
  once. The conversation reopened in another process is held once more, so
  that a cause that was not put right is noticed before the summary runs, and
  from the third process on it goes through: `claude -p --resume … "/compact"`
  is a new process each time. What was held is one line each in `held` under
  the plugin's data directory (`~/.claude/plugins/data/`), written for its
  owner alone and started again past fifty lines, after which an earlier
  conversation is held again.
- After a compaction that went ahead without the mark, a `/compact` run
  again or an automatic one, a line says it was Claude Code's own.
  An automatic compaction is never held: stopped, it would leave the
  conversation to overflow.

Not reached:

- A session that was already open when the plugin was installed or enabled
  from the shell or from another session: its hooks are not loaded there
  either, until `/reload-plugins` is run in it. Installed from that session
  itself, the plugin runs there unless Claude Code holds the reload, which
  then waits for `/reload-plugins --force` in the same way
  ([setting it up](#setting-it-up)).
- A setup that turns all hooks off, the plugin's classic hooks with them:
  `disableAllHooks`, and, as Claude Code's documentation has it, the policy
  of an organization that keeps every hook of an installed plugin off.
- A module that ran and was unloaded later in the same process: the mark
  stays.
- A system without `/bin/sh` or `/usr/bin/sh`: the mark is then `any`, which
  a `claude` started from the session inherits and counts as its own.
- A Claude Code that hands a classic hook no `CLAUDE_PID`: nothing is held,
  nothing is said at the first message, and any mark counts.
- A `held` that cannot be written, cannot be read, or is a link: nothing is
  held; the line after the compaction is still said. The same for `told`:
  nothing is said at the first message, since it would then be said at every
  one.
- A slash command does not pass the hook that runs at a message: in a session
  where only slash commands are sent, the line comes at the first message
  that is not one. A `/compact` among them is held as above.
- A process id used again by a later session, as where every run gets the
  same id: its first `/compact` is not held, and it is not told at its first
  message, since `told` keeps process ids alone. After `/clear`, the new
  conversation is in a process already held and told, and is neither held
  nor told.
- `LOSSLESS_COMPACTION_RUNNING` set by hand, or by the `env` of a
  repository's settings: `any`, or the process's own id, counts as the
  plugin's mark and silences all three hooks, which leaves a session as it
  was before them. It is not among the values in
  [What a repository can change](#what-a-repository-can-change), since it
  decides neither where results are written nor where `find` sends.

The other way round, where `sh` is started through something that stands
between it and Claude Code, the id the module reads would not be the one the
hooks are handed, and a running session would be told it is not; this was
not met, and was measured on one machine.

Where mods stay off with the plugin enabled and its classic hooks still run,
as with function hooks off before Claude Code 2.1.287, every conversation is
told and held as above; `LOSSLESS_COMPACTION_RUNNING` set to `any` in your
own settings' `env` ends it. Which of the ways mods are turned off now leave
the classic hooks running was not measured. The variable is in the
environment of everything the session starts, as every variable a plugin
sets is. Measured on Claude Code 2.1.286, interactively and with `-p`: the
line at the first message, the held `/compact`, the line after one that went
ahead, and an automatic compaction with `CLAUDE_CODE_AUTO_COMPACT_WINDOW`
lowered. With function hooks on, the mark was in place by the first message
in 30 of 30 interactive starts (with a prompt on the command line, typed as
soon as the input box showed, and right after `--resume`), and after
`/reload-plugins` loaded the module into a session that had started without
it; a `/compact` there was not held.

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

Nothing is to be set for the plugin to run. `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`,
which the quick start asked for before Claude Code 2.1.287, is ignored from that
version on and can be removed. The plugin is not on npm; it installs from
this repository.

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
name](#moving-from-the-old-name).

## The files

Files are plain text under `~/.claude/lossless-compaction/`, or under
`CLAUDE_CONFIG_DIR` when that is set. A secret in a tool result stays there
until no conversation holds it any more, as below, or until you delete it.
A result deleted by hand is deleted with both its files, `blobs/<id>.txt`
and `index/<id>.json`: the entry of a kept part left without its text, while
a conversation still names the part, stops the clean-up (#114).

`/lossless-store` says how much is kept, by what it was kept from, in the
trash and left in `tmp/`, and when the clean-up last ended and last tried,
how often it has been tried since and when and how it last stopped, without
reading a stored result and naming no path but the places results are read
from (ADR 0016):

```text
lossless-compaction: Results are kept in one place, set by storeDir:

/Users/you/results
  results: 3 (4.9 KB), 2026-09-30 to 2026-10-02; their entries: 2 (68 B)
  kept from: tool results 1 (42 B), kept conversations 1 (4.9 KB), lossless-compaction's own tools 0 (0 B), no readable entry 1 (22 B) (/lossless-store check looks at each)
  trash: 3 (60 B) files, by day moved there: 2026-09-25 2 (58 B), 2026-10-01 1 (2 B)
  tmp/: 2 (35 B) files, 1 over a day old, left by a write that stopped; those can be removed by hand

Read as well, never cleaned up: 2 places, written to before under your settings or the default ones beside storeDir (docs/limits.md, "The files"):

/Users/you/.claude/lossless-compaction
  results: 41 (612.0 KB); trash: empty

/Users/you/.claude/jev-lossless-compaction
  not there, or not a plain directory

clean-up:
  last ended: 2026-09-21 03:40 UTC; last tried: 2026-10-03 02:40 UTC
  tried since it last ended: 2; last stopped 2026-10-03 02:42 UTC: the transcripts could not be read to the end
  next: one was tried less than a day ago

machines the store is used from:
  this one, 3f9a…: first 2026-09-30 08:12 UTC, last 2026-10-03 02:40 UTC
```

- It counts what the host lists of the directories, with sizes and times,
  and reads the entries in `index/`, which hold a result's size and the
  name of the tool it came from. A result is never opened, so one holding
  an image is not told apart from one that does not.
- Its answer is a command's output: Claude Code shows it as it is, and keeps
  it in the conversation as it keeps any command's output, so the model
  reads it with the next request (measured). It holds the places results
  are read from, counts, times and the kind of the last stop. Where kept
  parts, or things named in the trash, stopped it, it names each by its id
  with why and how the clean-up goes on: a text not there, removed by hand
  or not yet written by a sync; a text changed or that does not read; one
  in the trash that could not be put back. An entry that does not read, over
  a text that is the one stored, stops nothing: the text is read as a kept
  part's ([ADR 0033](adr/0033-an-entry-that-does-not-read-is-read-through-its-text.md)). It is not a tool: the agent
  is not offered it.
- `/lossless-store check` names, once each, every id a place keeps whose
  files are not whole — any copy of it, in place or in the trash — of every
  place results are read from, with what that does: a link where a text or
  an entry is kept, and a text that no longer has the hash it is named by
  or does not read, which `recall` refuses; an entry with no text, and a
  text with no entry, under which it finds nothing in that place; an entry
  that does not read or names no tool, whose text `recall` gives back and
  `/lossless-export` leaves out; an entry that gives another size than its
  text, or none, whose text `recall` gives back and whose ticket a
  compaction does not take for one it wrote; and a copy in the trash that is
  not whole beside a whole text and entry in place, which does nothing now,
  `recall` reading the one in place. A text and its entry that are whole and
  stand apart, one in place and one in the trash, are counted, not named:
  `recall` puts them back when asked for in the place results are kept in,
  and not in an earlier one (#116); of an earlier place the answer says that
  `recall` puts back nothing from its trash. A file under a minute old,
  which a write may be partway through, is counted and not judged; a
  clean-up or a `recall` moving files while it reads can make one look
  apart or alone, which a second run tells. Where the ten seconds a command
  has of its own do not reach the end, it says where to go on from:
  `/lossless-store check from <place>:<start of an id>`. Each id is named by
  its first 16 characters, at most fifty of a kind: whole, an id the command
  printed would stand in the conversation and be taken by the clean-up for
  one named. A place, or a directory of it, that is there and cannot be
  listed is said so and not checked. It reads every stored text to hash it,
  shows none of it, and writes nothing (#117). Measured on 2026-10-07 with
  Claude Code 2.1.291: one run over two places of 5,549 results and 72 MB
  each, 11,098 in all, took 8.8 to 10.1 s in three runs, of files read
  before; a run over one of them, about 5,600 in all, took 41 s with the
  machine busier (load 6, an antivirus reading what was read). Waiting on
  the disk is not counted against the ten seconds, so a slow disk makes the
  answer late, not partial. A first run on files not read since was not
  timed.
- A clean-up that stops records the kind of stop in `gc.json`, and the ids
  and causes of the stored things that stopped it, every one it reaches in
  that try, up to twenty with a count of the rest; one behind a part that
  does not read is reached once that part is mended. Never the words it is
  said in, which name directories of other repositories. A
  try is counted when it starts, so one a short session cut off is counted
  too; one that ends clears both.
- It reads, and changes nothing. There is still no limit and nothing deletes
  on a size (ADR 0008).

Measured on Claude Code 2.1.288, with `-p` and in a terminal: the command
answered in about 30 ms on a store of a few results, and a session started
and answered in 1.4 s on one of 1,820.

A write that fails — the disk is full, say — loses nothing: a result is
ticketed only once all of it is written, a stored result or its entry is
never written over by a failed write, and when a failed write leaves nothing
kept before Claude Code's summary, the summary does not run and the
compaction says why (ADR 0008):

- A stored result and its entry are written to `tmp/` first, read back, and
  moved into place with `mv` (`/bin`, else `/usr/bin`; when the move fails,
  `mkdir -p` makes the directory and it is moved once more, which is what
  the first result in a new place takes), so the file at a result's name is
  always whole. The host's own write cuts a file short when
  the disk refuses it (measured), which is why. Where `mv` cannot be started
  (Windows), they are written in place, and a write the disk refuses can
  still cut short a result another write stored at the same moment. Each
  move took about 4 ms on macOS; a stored result takes two.
- What the system said is in the line the compaction prints:
  `could not write: ENOSPC`. A result that could not be written stays in
  the conversation as it was.
- When nothing could be kept before Claude Code's summary because a write
  failed, the compaction is skipped:
  `nothing could be kept (could not write: ENOSPC), so the summary did not
  run; free some space and compact again`; for a refusal other than a full
  disk it names what the system said and asks for nothing to be freed. The conversation stays as it is,
  and one that reaches its limit cannot go on until there is room. A place
  that cannot be made private, because the disk is too full to make it, is
  not that case: nothing is kept and the summary runs.
- An entry, or a record of where transcripts are, that a refused write left
  empty is written again the next time.
- A part of a kept conversation written before a later one failed stays
  until the clean-up; a file in `tmp/` that a process left when it stopped
  partway stays until removed by hand.
- There is no limit on how much is kept, by default or by setting: past a
  limit nothing could be moved out, and the summary that followed could not
  be undone. How much stays is what the conversations Claude Code keeps
  (`cleanupPeriodDays`) name, below. On the machine this was measured on,
  two days of use left 157 files, 4.9 MB, before every summary kept the
  conversation (ADR 0007). The trash is on the same disk: space comes back
  when it is emptied, one to three weeks after a result stops being
  named with sessions started every day. A full disk can keep the clean-up from running too, since it
  writes a few small files first.

## How long results are kept

A result is kept while a conversation Claude Code can still resume names
it, and a week after (ADR 0006). The conversations Claude Code can resume
are its transcripts under `<config>/projects/`; a forked conversation, a
rewound branch and one compacted by an earlier version keep the ids in them
too, so they are counted without the plugin keeping a list of its own.

- The place transcripts are in is recorded at a compaction, in the store
  (`roots/`), when a directory under `<config>/projects/` holds this
  session's transcript. Nothing is collected until one is recorded, nor in
  the week after the first was.
- At most once a week, after a session starts and without holding it up, the
  plugin reads every 64-hex string out of those transcripts (`grep` from
  `/usr/bin`, else `/bin`; measured: 81 s for 2.9 GB). A result over a day
  old that none of them names moves, with its index entry, to
  `trash/<day>/`. One the trash has held over a week, still named by none,
  is removed; one named again goes back.
- `recall`, `find` and a compaction put back from the trash what the
  conversation names before reading it, and what the kept parts among that
  hold, through the parts of earlier summaries. A result moved there while a
  session used it is not lost. A clean-up does the same before it counts
  what is named: a kept part that is in the trash and named again goes back
  first, with what it names, and where something named is still in the trash
  and not in its place, the clean-up stops before anything moves.
- A recorded place that is gone is skipped: nothing can be resumed from it.
  A place on a disk that is not mounted at the time looks gone too, and what
  only its transcripts name can go to the trash; it comes back from there if
  the disk is back within the week.
  One that is there but cannot be looked at or read in full, a project
  directory that is a link (a search does not follow it), a search that does
  not reach its end — every search also reads a file of the plugin's own that
  holds one known id, and one that does not print it did not finish — a
  search whose output is too long, all recorded places gone, or commands that
  cannot be run, stop the collection before anything moves, and the line it
  prints says why. A transcript that is itself a link inside a project
  directory is not followed and not counted.
- The search reads transcripts as Claude Code writes them now: files named
  `*.jsonl`, an id spelled as 64 lowercase hexadecimal characters. Were it to
  write them otherwise — from the start of a conversation or from some point
  in it — the search would find none of those tickets. So at each compaction
  of the main conversation, the newest ticket of the conversation handed
  back is noted in `witness/` with the session id — one this compaction put
  in, where it put any, as a cut puts its parts' in front of what stays; when
  a session starts with tickets, the newest of the conversation, unless the
  one noted before is still in it. Before anything moves, a clean-up looks for each noted
  ticket in that conversation's own transcript, `<session>.jsonl`, with
  `grep`. Not written there; no such file but another beginning with the
  session id, or anything in its directory but `subagents/`, `tool-results/`,
  `workflows/` and hidden files; a place that cannot be listed: the clean-up
  stops, and its line says so. Where nothing of the conversation is left, the
  noted ticket goes ([ADR 0027](adr/0027-a-clean-up-first-finds-what-was-seen.md)).
  Not told apart from a conversation removed: transcripts moved whole out of
  the recorded places, or kept under names that hold no session id. A
  conversation compacted before this version has none noted until it is
  resumed or compacted again. A ticket shown but never written to its
  transcript — a compaction Claude Code could not write, or `--no-session-persistence`
  on a resumed session — stops clean-ups until the conversation is resumed or
  compacted again, or its transcript is gone; a clean-up that reads a
  transcript before Claude Code has written the compaction just made stops
  until the next try, a day later; and once a transcript is gone, a folder
  Claude Code comes to keep beside it stops clean-ups until this page names
  it. Nothing is lost while a clean-up stops: the line at the start of a
  session says so after 14 days.
- A collection stopped while moving leaves what it moved in the trash, where
  `recall` and the next collection put it back when it is named. What it
  reports is counted on disk afterwards.
- A collection that a short session cuts off is tried again a day later;
  only one that went to the end waits a week.
- A session that can read where results are kept — as `/lossless-store`
  does — says when it starts that no clean-up has ended for 14 days, when
  none has: since the last that ended, or, if none ever has, since a place
  transcripts are kept in was first recorded, or, if none is on record,
  since the oldest result kept (ADR 0016). It says so whether it then tries or
  not, once a process, and adds when no place is on record:

  ```text
  moved-out results have not been cleaned up since 2026-09-13 UTC (20 days); /lossless-store says how the clean-up went
  ```

  Fourteen days is two of the clean-up's weeks, so one missed is not said.
  A clean-up that keeps stopping, one never tried because the place cannot
  be made private, one that sessions too short keep cutting off, and one
  with no place recorded are each said this way. A session that tries and
  ends the clean-up has said it all the same; the next does not. A time
  ahead of the clock — written while it ran ahead — holds back both the
  clean-up and this line until it is reached.
- A transcript outside a recorded place — copied from another machine, or of
  a `CLAUDE_CONFIG_DIR` that shares a `storeDir` and has not compacted since
  — is not counted. Resuming it can find a result gone. Starting a session
  and compacting once under each configuration records its place.
- A store is not to be shared between machines: a clean-up reads this
  machine's transcripts only. Each session marks the store, at its start and
  at each compaction, in `machines/<name>.json`: named by its machine's id,
  made once in `~/.local/state/lossless-compaction/machine.json`, or by the
  session where no id can be kept there; with the ids of the machine's latest
  three sessions. A clean-up stops before anything moves where a mark holds
  no session whose transcript it finds in the places recorded, and is not of
  the session at hand — another machine using the store through a synced
  folder, a network drive, or a `storeDir` set alike — and where the marks
  cannot be listed ([ADR 0032](adr/0032-a-store-used-from-another-machine-is-not-cleaned-up.md)).
  `/lossless-store` lists the marks, says whose transcripts are not read
  here, and how to go on: remove the mark of a machine that no longer uses
  the store; the clean-up runs at its next try, a day after the last. A mark
  of another name whose sessions' transcripts are read here is taken off at
  the clean-up, while those transcripts last: a container made again over
  the same transcripts, a devcontainer that keeps `~/.claude`, which has a
  new id; a session's own mark where no id could be kept. One still in use
  marks the store again at its next session. Where Claude Code removed those
  transcripts before a clean-up ran here — no session for longer than its
  `cleanupPeriodDays` — the mark stops it until removed by hand. A machine
  that runs an earlier version, or has not started a session since this one,
  leaves no mark: until it does, what only its transcripts name can go as
  before. Two machines holding one id, copied with a home directory, are not
  told apart; nor is one whose transcript of a latest session was copied
  here, which is taken for this machine's.
- Any 64-hex string counts, a git object id or another hash as well; that
  keeps more, never less.
- The trash and the removal run `mkdir`, `mv` and `rm` from `/bin` or
  `/usr/bin` on the files under `blobs/`, `index/` and `trash/` only; a
  write runs `mv` from `tmp/` into `blobs/` and `index/`, `mkdir -p` on those
  two, and `rm` on a part of its own in `tmp/` that it could not move. A
  guard that sits in `PATH` does not see them.
- A copy of 0.4.0 or earlier, on the same store, does not put back from the
  trash: a result moved there while it ran is read again once a current copy
  puts it back, which the next collection does for any result a transcript
  names.

Before a compaction writes anything, the plugin makes the directory it writes
to readable by its owner alone: it runs `mkdir -m 700` when the directory is
not there and `chmod 700` on it either way (from `/bin`, else `/usr/bin`,
never through `PATH`). A link or a file in its place, a directory `chmod`
fails on (someone else's), or a host where neither command can be run —
NixOS without `/bin` and `/usr/bin`, a surface of Claude Code that runs no
commands — means nothing is moved out, and the line the compaction prints
says why. Each other directory it reads from that is there as a directory is
closed the same way; when that fails, the compaction says so and goes on. A
`storeDir` you point at an existing directory is made mode 700 too: point it
at a directory of its own.

What that covers and what it does not:

- The files inside keep the mode the host writes them with; no other user can
  reach them through a directory of mode 700.
- That the mode is 700 afterwards is known from `chmod` succeeding: the host's
  file information has no mode. It proves less for root, whose `chmod`
  succeeds on anyone's directory, and on a file system without modes (exFAT,
  some network mounts), where `chmod` can succeed and change nothing. An
  access control list on macOS (one that lets everyone read, say) is not
  removed by `chmod`. Another plugin's hook on the host's command runner could
  answer for `chmod` without running it.
- Between the check that a path is a plain directory and the write, only a
  process of your own user can put a link in a directory of mode 700 that you
  own. That is outside what the plugin guards against.
- On Windows (a place starting with a drive letter) no mode is set: the
  profile directory's access control is what keeps others out.
- A blob a write left half done, whose text no longer has the hash it is
  named by, is written over the next time the same result moves out.

Up to 0.3.0 the plugin was named `jev-lossless-compaction`, and the directory
with it. Results are read from both places; while the old directory exists — a
link to it counts — new results are written there too, whether or not the new
directory exists, since that is where the results are. It is made mode 700
like the new one. With `storeDir` set, the old directory is read, as an
earlier place, and not closed: `chmod 700 ~/.claude/jev-lossless-compaction`
if an earlier version made it. If the old directory is a link, writing is refused as
before and the built-in compaction runs, which the compaction says; a plain
file in its place is not written to. With a `storeDir` setting, that place
alone is written to.
Settings are kept under the plugin's id, so a `storeDir` set under the old id
has to be set again.

`recall` and `find` read every place results were written to under your
settings since this version, and the default places when `storeDir` is set,
the current one first: a ticket written before `storeDir` was set or changed
comes back. Only the current place is cleaned up, and `/lossless-store`
names the others (#116).

- The places written to are noted, newest first, in the plugin's own store
  under Claude Code's configuration directory
  (`~/.claude/plugins/store/`), up to 16. One not found stays on the list,
  as a place on a disk not mounted, and is read once it is there again.
- An earlier place is only read: not cleaned up, not made private, nothing
  put back from its trash. What another configuration still uses there is
  left to it. A result in its trash is not found. To be rid of an earlier
  place, see that no conversation you keep names its results, then remove
  it by hand; it leaves the list once 16 newer places are on it.
- The defaults are read beside a `storeDir` only where the repository's
  settings did not set `HOME`, `USERPROFILE` or `CLAUDE_CONFIG_DIR` (ADR
  0005).
- Places written to before this version are not on the list: set
  `storeDir` back to one and start a session with it once, and it is noted.
- A place on a disk that does not answer, a network share gone away say,
  is waited on wherever results are read, a compaction among them. To
  forget the earlier places, remove the plugin's file under
  `~/.claude/plugins/store/`.
- Two sessions with different `storeDir` settings at once, as the
  benchmark runs them, can each note its place over the other's: one earlier
  place can drop off the list. With one `storeDir`, the same place is
  noted.

### To another machine

`/lossless-export <directory>` writes the results the conversation's tickets
name, through the tickets in its kept parts, into a new directory;
`/lossless-import <directory>` takes such a directory, or an earlier place,
into the store, each result checked against its name, so that the
conversation resumed on another machine gives them back (#116).

- Each runs only when you type it, at the prompt or through Remote Control:
  from `claude -p`, a channel, another agent or a scheduled run it writes
  nothing.
- The directory is given from `/`, with no `.` or `..` in it; a drive
  letter's form is refused, so this does not run on Windows.
  `/lossless-export` writes only into one not there yet, made readable by
  you alone, or one it made before, to go on; it refuses one inside a
  repository: a `.git`, a directory or a
  worktree's file, in it or above it, as the path is written and through
  links.
- Written out: what the conversation's tickets name, and in each kept part
  what has the shape of a ticket; a hash a tool printed in a part is not
  followed. What was in the trash is put back first, as for `recall`, and
  what is kept nowhere here is counted. Each result goes with its entry, in
  the store's own shape (`blobs/`, `index/`), and stays where it was.
- Read in: each result whose text has the SHA-256 it is named by and whose
  entry says what it is; any other is refused and counted, and one there
  already is passed over. Each stops while some of the hook's own time is
  left, which the host's reads and writes do not spend, and says how many
  are left: type the same command again to go on, and what is there
  already is passed over.
- Of a conversation longer than the 4096 entries Claude Code hands a
  plugin, what only the older messages name is not written out, nor counted.
- The clean-up keeps what the records of conversations name. Where the
  conversation's record is copied in and resumed, what was read in is named
  by it; the place of the record and a witness are noted, as at a
  compaction. Read in from another conversation, it is named by no record
  here, and the clean-up takes it as it would any result no record names.
- The record is found by the folder Claude Code keeps for the working
  directory a conversation was started in, under `projects/`: put it in the
  one for the directory you resume it from there (start Claude Code there
  once to make it).
- Nothing is sent anywhere. The directory written holds the results as they
  were returned, a secret among them: keep it as you keep the conversation.
  On Windows no mode is set (see above), and the commands do not run there.

A part kept before a summary (see above) names the results it holds, which
no transcript names: the ids a collection keeps are those the transcripts
name and every id written in a part they name, through the parts of earlier
summaries. A part that cannot be read stops the collection before anything
moves.

## What a repository can change

A repository you open brings `.claude/settings.json` and can bring
`.claude/settings.local.json`, and Claude Code puts the `env` of both into
the process. Neither decides where moved-out results are written or where
`find` sends. Before either is used, the plugin reads both files, and a
value it would use that one of them holds stops it:

- `HOME`, `USERPROFILE` or `CLAUDE_CONFIG_DIR`, when no `storeDir` of yours
  is set, or a `storeDir` under this plugin's `pluginConfigs`: nothing is
  moved out and the built-in compaction runs; `recall` and `find` read
  nothing.
- `TYPESAFE_API_KEY`, `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID`,
  when the key would be read from the environment: the plugin's settings
  hold no key and choose the provider ([Setting it up](#setting-it-up));
  `apiKey`, `provider`,
  `cloudflareAccountId` or `model` under its `pluginConfigs`; or a proxy or
  certificate variable (`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` in either
  case, `NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`,
  `SSL_CERT_FILE`, `SSL_CERT_DIR`): there is no `find` that asks Jev.

Each time, the line the plugin prints names the value and the file. Set the
key and `storeDir` in your user settings (`/plugin configure` without
`--scope`). If the files cannot be read — a Claude Code without
`$.settings.read` among them — the plugin does neither. A session started in
your home directory reads `~/.claude/settings.json` as its project file too;
while the two are the same, it counts as yours.

What is compared is the file as it is now and the environment as the plugin
sees it. If a value taken out of the file during a session stayed in the
environment, it would not be seen as the repository's (whether Claude Code
keeps it was not measured); start the session again.

Measured on Claude Code 2.1.286: `HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`
and `pluginConfigs` from those files did not reach the plugin, and a key
variable and `HTTPS_PROXY` did, the latter for the plugin's requests and
Claude Code's own. The checks above stay for a version that hands the rest
over.

This covers what a repository's settings change quietly, not what a
repository you trust can run: its settings hooks, MCP servers, and the
plugins it enables, mods among them, run code of their own, which can read
the files directly or change the environment without a settings file.

## `find`

`find` offers Jev the tickets it finds in the conversation, so after the
built-in compaction has run it may find none, though the files remain and
`recall` reads them by id; and of a conversation longer than 4096 messages,
the oldest tickets are not offered. Jev sees the first lines of a result and
little of its middle, and of a result over 256 KB only the first 8 KB. A
subagent's call is answered with nothing to find: `find` does not look in a
subagent's conversation, whose parts kept before a summary are named after
it for `recall` to read by id. A result over about 50 KB comes back the
way Claude Code returns any large tool output: saved to a file whose path is
shown, which the agent reads; what `recall` returns is unchanged, but a line
of it longer than the agent's reading tool takes (Claude Code's `Read` cuts
lines over 2,000 characters) may reach the agent cut. A request to Jev is
given up after twenty seconds.

`recall` and `find` stand in the list of tools the agent is given, with
their descriptions: a `tool.describe` hook keeps the two from waiting behind
Claude Code's tool search, where an agent reads a tool's description only
once it has loaded the tool, and Haiku 4.5 often answered that a moved-out
result was not there. `claude plugin validate` takes the hook on Claude Code
2.1.285 to 2.1.288; an earlier one was not tried, and one that does not know
the event would load no hook of the plugin's module, and the line at the
first message would say so, naming the version the plugin needs, 2.1.287 or
later (ADR 0010, ADR 0014, ADR 0017). Where the calls that made the results say nothing of what
is in them, Haiku 4.5 with a key set calls `find`, without being told to,
for most questions about what a result was about: 20 of 21, in a made-up
conversation of thirteen such results, all moved out. With the two behind
the search it called it for 12 of 21, and for 19 with them listed and `find`
as it was before it looked for a value (Sonnet 5.5, one run: 6 of 7, listed
or not). Where the calls name what they read, it calls `find` for most as
well, 19 of 24 questions, where it called it for 5 with the two behind the
search. So with a key set more is sent to the provider than before: each
call sends what [Usage lists](usage.md).
[What an agent still does not fetch](#what-an-agent-does-not-fetch) is below.

With a key set, a question that names a value — a number, a checksum, a
code, with three digits or more in one of them — has its values looked for
in the whole of each moved-out result, a line at a time. Where one result
alone has a line holding them all, each as a word of its own, Jev is told so
beside that result's first lines, and still chooses: a result is not given
because a line of it holds a value. So a question about one result that
names a value of another has Jev told of the other, and Jev may take it:
asked 6 such questions it gave the result asked for 5 times and listed it
first once (`docs/measurements.md`). Where Jev takes none of the results,
those with such a line are named with their ids, eight at most, and none of
them is given as the answer. Jev is shown each result's first lines, so
without this a value further down is found only as a phrase in double
quotes.

What is sent for it is one sentence: that a line of that result holds the
values, which the question already holds. No line of the result is sent. The
values are taken from the question as it is sent, with shapes of secrets
blanked and cut at 2,000 characters: a value blanked or cut off there is not
looked for. Where several results have such a line, and where a line holds
only some of the values, Jev is told nothing: told of each of four results a
line of which held one of the two values asked for, it gave the first of
them as the answer (`docs/measurements.md`).

A value is a word of its own where no letter or digit stands right before or
after it: `4821` is found in `job-4821` and in `status:4821`, and not in
`48210` or `v4821`. Not found this way, and said so in the answer: values
that stand on different lines of a result, a value in another letter case, a
value that is only part of a longer word or number there (the first
characters of a checksum, the `1.2.3` of `v1.2.3`), the number of a line
(the number `Read` puts in front of each line is left out), and a value in a
kept part of the conversation. Nor is a result that holds an image looked
through. A run with one digit ("the 2 logs", `log7.txt`) is no value, a
number written with commas between its digits ("9,821.50") gives none, and a
question whose values all have fewer than three digits ("step 17") has none
looked for. With no key the same is looked for, and the results with such
a line are listed with it, Jev being told nothing (#110).

## What an agent does not fetch

What the plugin keeps comes back only when the agent asks for it. In what
was measured Sonnet 5.5 called `find` for 6 of 7 results asked for by what
they were about, and fetched the reading of a changed file. Haiku 4.5 asks
less often, in made-up conversations asked right after the compaction
([the figures](measurements.md#the-tools-in-front-of-the-agent)):

- **With no key, a result asked for by what it was about.** Since #110
  `find` lists every result by its call and first line for the agent to
  choose from, ranked by nothing: where the first line says nothing, that is
  no help. Before it there was no `find`, and nothing in the conversation
  said which ticket was the one asked about, as below. Of thirteen results whose calls say nothing of what is in
  them, all moved out, Haiku was right on 3 questions of 21 and called
  `recall` for 4. With a key it was right on 19 of 21. Asked with no key
  for a code further down one of them, it was right on 3 of 9 in one set of
  three runs and on 0 of 9 in another; for 3 and for 5 of the nine it did
  not call `recall` at all.
- **A changed file you hand over after a summary.** Once you hand a file
  over with an `@`, it is shown as it is, where Claude Code shows it again as
  well, and no line stands in its place. The plugin's message after the
  summary still names the file and the id of its reading. With nothing in
  the file's place, in three conversations where the file is shown again
  (`prose`, `short` and `thinking`), Haiku fetched that reading 6 times of 9,
  and the other 3 times called nothing and gave another text. That was
  measured with no `@`, on the plugin before a line stood in the file's
  place; with the file handed over it was tried in one session, where the
  reading was fetched.
- **An id copied wrong within its first 8 characters.** An id is 64
  characters. Copied wrong, it is taken for the one id written in the
  conversation that shares the most characters with it from the first, 8 or
  more, where no other shares as many: written in the user messages and in
  what tools returned, not in what the agent said or put in its calls. What
  the agent wrote can still stand there, in Claude Code's summary or in a
  kept part `recall` returned; an id written there that is the one given,
  whole, is passed over for the one it was copied from. One that goes wrong
  within the first 8 characters is refused, as is one that two ids share as
  many characters with, and what is no id. In a subagent, the conversation
  read is the subagent's own. A refusal of what may be an id copied wrong names
  up to five tickets of the conversation it may stand for, each with what it
  stands for where the conversation says: those whose ids begin as it does,
  then the parts kept from the conversation, newest first, whose own tickets
  are not written in it. Where the id given is itself written in the
  conversation, it says nothing is stored under it here and names the parts
  alone, so that no other result is read in its place. Haiku gave `recall` an id it
  refused 15 times in 990 calls before this, over every plugin measured for
  it: 10 of those were taken by their first 16 characters (#54), 3 went wrong
  at the thirteenth character, which the first 12 now take where the id they
  were copied from is written in the conversation (not measured again), and 2
  were the size written on a ticket. In one session that compacts several
  times, Sonnet 5.5 was refused 8 times in three runs, each time an id that
  went wrong at the tenth character, where a pair of characters is written
  twice over (`406e6e8` copied as `406e8`): 7 of those are taken now; driven
  again three times at each of 1 and 40, the same copy came twice in 33 calls
  and was taken both times. The eighth of the 8 was copied from Claude Code's summary while the id it stood for was
  only in a part kept from the conversation: the refusal names the parts, the
  newest five, and whether that one was among them in that session was not
  measured ([the measurement](measurements.md#ids-copied-wrong-in-one-session-that-compacts-several-times)).

## What it was measured with

What an agent could answer after a compaction was measured with Haiku 4.5
three times and Sonnet 5.5 once, in a window of 200,000 tokens. It is
measured with Opus 5.5 as well, at the settings that were the defaults then
(`targetPercent` 40), in one run: on
`results`, `prose` and `large`, a conversation built in a window of
1,000,000, against Claude Code's own compaction on the same; and on `opaque`
with `find` and without
([measurements](measurements.md#with-opus-55-and-in-a-window-of-1000000)).
After the built-in compaction Opus searched Claude Code's own record of the
session, which the summary names. Of 17 questions about an exact text, 13
are counted right in the plugin's arm and 15 in the built-in arm; the other
6 answers hold the right line with a station's id written with the prefix a
rule of the conversation asks for, which was seen only once they were read.
One run tells no rate, the conversations are made up, and the default now
moves out more than was measured, and leaves less (ADR 0025).

## Sizes and older versions

`keepTokens` is turned into characters at three to a token, and since
source code runs nearer 2.2 characters a token, it keeps more than its
number says. How full the conversation is afterwards is counted as said
[above](#when-the-built-in-compaction-runs-instead); where the breakdown
cannot be relied on, tokens are estimated at three characters each, and
more can leave the conversation than the target asks for. The
`keepNewest` setting of 0.1.0 is gone and ignored; where the host still hands
its value to the plugin, every compaction of the main conversation says so.

Tickets written by 0.1.0 begin `[jev-lossless-compaction] This … result`;
those written by 0.2.0 and 0.3.0 begin `[moved out]` and name the old tool,
`mcp__jev-lossless-compaction__recall`; those written now name
`mcp__lossless-compaction__recall`. All three are recognised. A conversation
compacted again has its old tickets rewritten in the current wording, same
id and size (only when the compaction moves something out and hands the
conversation back; when it leaves the conversation to the built-in
compaction, nothing of it survives). In a conversation not compacted again,
the tickets name a tool that no longer exists: call `recall` with the same id.

## Moving from the old name

Up to 0.3.0 the plugin was named `jev-lossless-compaction`, and an installed
copy does not follow the rename: `claude plugin update` under the old id
fails with "Plugin not found" and changes nothing. Uninstall it, remove the
marketplace `jev-lossless-compaction`, then add and install as the README
says, and set the key — and `storeDir`, if you had set it — again under the
new id. Until then there is no hook, and Claude Code's own compaction runs;
do not keep both installed. Your results stay where they are:
`~/.claude/jev-lossless-compaction/` goes on being read and written to while
it exists, and the plugin makes it mode 700 before it writes there. Tickets
in old conversations name the old tool; call `recall` with the same id, or
compact once more and they are rewritten.
