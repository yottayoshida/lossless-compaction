# 0030. What Claude Code attached is kept, and named at the end

- Status: Accepted
- Date: 2026-10-06
- Amends [0001](0001-move-out-and-order.md), decision 8 (every message is
  handed back rebuilt), with what a rebuilt message does not carry

## Context

Claude Code adds to a conversation as it sends it: the content of a file
handed over with `@`, what a `UserPromptSubmit` or `PostToolUse` hook adds,
the caveat it shows before a command, reminders after what the person said
and after what a tool returned. None of it is in the messages a compaction
hook is handed; the conversation as it was sent
(`$.session.messages({ as: "api" })`) holds it, as text blocks of its own
and at the end of a result's text (#105).

Measured on Claude Code 2.1.291: of a conversation of nine messages sent as
five, the content of a file handed over with `@` and a word a hook added
were in the conversation as sent alone. After the plugin rebuilt it, the
agent, asked with no tool for the word in the file, answered that it was
not visible, and the next request did not hold it. In a working session,
Claude Code put back on its own, after a compaction of the plugin's, the
CLAUDE.md files, the environment, the date and the like; not the context a
hook had added to earlier prompts, the instructions typed while it worked,
the notes on files changed, or a subdirectory's CLAUDE.md. What was added
came to 0.57 to 0.86 as much again as the messages handed over
(docs/measurements.md).

## Decision

1. At each compaction that rebuilds the conversation, cuts it or hands it
   to the summary, what the conversation as sent holds that the messages
   handed over do not is kept first (`src/attached.ts` finds it): a text
   block no message of the person's was, what a result was sent with after
   its own text, and a result no handed message holds. Kept in parts as a
   conversation is, each block under a heading that says it is Claude Code's
   and names the message it came with, as near as the conversation as sent
   tells it (two messages it joined are named by the first); a block sent
   again is written once and named after where it first came.
2. One message at the end of what is handed back names the parts. Not after
   the first message: a later compaction would then change what an earlier
   one left (ADR 0001, decision 10).
3. Where the parts cannot be written, the conversation is not rebuilt: it is
   handed to the built-in summary kept as it was sent, as one that cannot be
   rebuilt is, and where that cannot be written either the summary does not
   run (ADR 0008).
4. Nothing of these parts is sent to Jev. They hold what Claude Code says
   of the machine; `find` looks through them here, as it does the middle of
   a long message (ADR 0024). A conversation kept as it was sent, where it
   could not be rebuilt, holds what was attached in its own parts, as it
   did before this decision, and those parts are offered to Jev as any
   conversation's are.
5. Every kind is kept, those Claude Code puts back on its own included: a
   list of kinds would let a kind Claude Code adds later go unkept without a
   word.

## Alternatives Considered

- **A ticket in each message that had something attached**, as issue #105
  proposed. Nearly every turn has a reminder; in a working session 380 came
  between two compactions, and a line of 150 characters for each puts 57,000
  characters back into what a compaction makes smaller.
- **A message right after the first.** Each compaction would put one in
  front of what the earlier ones left, and change it.
- **Rebuilding from the conversation as sent**, what was attached left in
  the messages. Every reminder of every turn would come back, beside what
  Claude Code puts back on its own.
- **Saying in the documents that it is not kept.** A file the person handed
  over with `@` would still be gone after a compaction of a plugin that says
  it loses nothing.

## Consequences

- A compaction that rebuilds writes one more set of parts, and the
  conversation it hands back ends in one more message, which stays there.
- A reminder Claude Code sends as a turn of its own is in no message, and is
  not kept.
- Where Claude Code changes how it sends what the person said or what a tool
  returned, so that the text no longer matches the message handed over, it
  is kept twice rather than not at all.
- PRIVACY.md lists what this keeps.
