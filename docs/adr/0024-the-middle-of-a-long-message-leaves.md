# 0024. The middle of a long message leaves

- Status: Accepted
- Date: 2026-10-04
- Amends [0007](0007-keep-what-the-summary-replaces.md) ("what was said is
  kept as it was said"): what was said is kept as it was, whole, in the store;
  in the conversation, a long message stands as its first and last paragraphs
  and a line in place of its middle.

## Context

A document pasted into a message, or a long answer of Claude's, can be most of
a conversation, and nothing the plugin moved out touched it: of the six kinds
of conversation in the benchmark, two (`prose` and `full`) are mostly such
messages, and moving out results, inputs and old calls left them as they were.
The only way left was Claude Code's summary.

What was asked of a pasted document is before it or after it ("read these
notes", "what do you make of this?"). What the agent wrote at length opens and
closes with what it concluded.

## Decision

1. Once results and long inputs are out, a message of the person's or of
   Claude's of `minChars` characters or more, with three paragraphs or more,
   keeps its first paragraph and its last, 500 characters of each at most, cut
   at a line or else at whole characters; a line stands between them:
   `[moved out] the middle of this message; recall returns the whole message, 31204 bytes, head and tail included, …`.
   The whole message is kept under that id.
2. A paragraph ends at a blank line outside a fenced block of code: a block is
   never cut inside, and a message that is one block between two lines keeps
   them and loses the block. A block opened with backticks closes only at
   backticks, one opened with tildes only at tildes. Where what stays of a
   first or last paragraph could only end or begin inside a block, the
   message stays whole.
3. The first message stays, the plugin's own lines stay, what Claude Code
   writes in a person's place stays (told as 0023 tells it: a notification,
   another session's message, a mark), a message whose middle is under 400
   characters stays, and the newest such messages stay up
   to `keepTokens` of their own, the newest whatever its size; a `/compact`
   typed without instructions reaches them up to the last thing the person
   said (0023).
4. `find` sends Jev nothing of a middle that left (the owner's decision,
   2026-10-03, of the middles this change moves out; 2026-10-04): it looks
   through the middles here, in the conversation and in the kept parts it
   reads, for a quoted phrase or the values a question names. Where one result
   holds the phrase it is the answer, as before; where none does and one
   middle does, that middle is; the others that hold what was asked are named
   beside the answer. A part kept before a summary is offered to Jev by its
   digest as before (`docs/usage.md`), and can hold what was said.
5. A message the person sends again from a rewind (typed at the terminal, in
   an editor or the desktop app, or from their phone or the web), still its first paragraph, the line and its last, goes in as
   the whole message kept under the line's id, where a message is what is kept
   there and it begins and ends with them; else as it is. A peer's message, a
   notification or a plugin's prompt is not touched.
6. A tool call of any tool but those known only to read and the plugin's own
   (0020), a tool of an MCP server and a subagent included, whose input holds a
   message's first and last paragraphs less than 400 characters apart, where
   the tail stands last — the line between them dropped — or, where the two
   together are under 40 characters, side by side with nothing but blank
   space between them (the owner's decision, 2026-10-04: so short, they stand
   apart in writing of any kind) —
   is refused, the model told to recall the id and use the whole message. The
   conversation is read for this only where a value of the input is 200
   characters or more.
7. The clean-up, the guard of 0020 and `recall`'s reading of an id copied
   wrong read the line, in a message of the person's or of Claude's. What the
   person is working on is told without it.

## Alternatives Considered

- **The whole message as a ticket.** What was asked of it, and what Claude
  concluded, would be out of sight too.
- **Send the middles to Jev as `find` sends results.** A person pastes what
  they would not send anywhere; and what was sent cannot be taken back.
  Looked through here, a middle is found by what was quoted from it.
- **Cut at a number of characters, not at paragraphs.** The line would stand
  inside a sentence or a block of code.

## Consequences

- An instruction in the middle of a long message is out of the agent's sight
  until it recalls the message; `docs/limits.md` says so.
- A middle that holds what is asked but nothing quoted from it is not found by
  `find`; `recall` by the id on the line reads it.
- A message of the person's whose first and last paragraphs together are short,
  written with the line dropped in a value under 200 characters, is not
  refused.
