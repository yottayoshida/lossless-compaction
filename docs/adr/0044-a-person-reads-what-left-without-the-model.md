# 0044. A person reads what left without the model

- Status: Accepted
- Date: 2026-10-08
- Builds on [0016](0016-the-store-is-told-not-bounded.md), whose command reads no result: showing one is a decision of
  its own.

## Context

A person had no way of their own to see what left a conversation or to look at one result: the agent's `recall` puts
it back into the conversation, which is what moving it out was for (#138). A command's answer is no way either:
Claude Code keeps it in the conversation, and the model reads it with the next request (ADR 0016, measured).

Claude Code gives a plugin three surfaces besides a command's answer. A pane (`$.ui.open`) is drawn by the plugin
itself, through `ui.render`, scrolled and focused by its own code. A notice (`$.ui.toast`) shows a few seconds of one
line. A log row (`$.ui.log`) is a line in the transcript, "not sent to the model" as the declarations say, and to a
`-p` or SDK host a `ui_log` event.

Measured on Claude Code 2.1.293 with Sonnet 5.5, on a conversation of 23 Bash results whose first lines were made at
random when the commands ran, so that no message held them, 22 moved out by the plugin's `/compact`:

- In `-p`, `/lossless-list` and `/lossless-show` gave their lines as `ui_log` events, and the session's transcript
  held none of them, only each command's one-line answer. From the same point, the conversation that ran both
  commands and the one that ran neither were asked the same question with no tool: the first came to 328 tokens
  more, the two commands and their answers, and neither could name the file `/lossless-show` had named, while both
  read the ids and sizes the tickets hold.
- In a terminal, at 250 columns, the list showed each result's first line on the screen. Asked with no tool for the
  first line of one, the model answered that it could not see it, and quoted the command's one-line answer. The
  transcript kept the rows as `system`, `informational`; resumed, the model again could not see the first line of
  another, and again quoted the answer.

## Decision

1. `/lossless-list [all | <word>]` and `/lossless-show <id>` are commands, as ADR 0016's is: not tools, so not
   offered to the agent. What they find is said in `ui.log` rows, a line each; their answer is one line that names
   no result.
2. The list is of the tickets the conversation names, gathered as `find` gathers them, so that every id the list
   shows is one `/lossless-show` takes. Those read out of kept parts come first, in the order they are read (not
   always the order they were written, where a summary was summarized: the owner's choice, kept simple); then the
   conversation's own, oldest first, by the message each ticket stands in, so that the newest is at the bottom. The
   last 50 unless `all` or a word is asked for; on a screen of 40 columns or more, a line no wider than it, a wide
   character counted as two cells; characters that move the cursor or colour the screen made spaces.
3. `/lossless-show` names the file a result is kept in, on a line of its own, for the person to open with a tool of
   their own; it does not show the result. A result that held images is said to be JSON.
4. Both put back from the trash what the conversation names, as `recall` and `find` do, so neither runs mid-turn.

## Alternatives Considered

- **A pane.** A result of megabytes drawn, scrolled and focused by the plugin's own code, where a path opens in the
  person's own editor. Not now; to be taken up if a path is found not to be enough.
- **The result's text in `ui.log` rows.** Megabytes in the transcript, and every character of it to be made safe for
  the terminal.
- **The list in the command's answer.** The model reads it: tens of tokens a result, in a conversation the plugin
  exists to keep small.
- **Copying the path to the clipboard, or offering ids as the person types** (`$.ui.copy`, `prompt.autocomplete`).
  The first writes over what the person copied without a word, the second runs at every key; not now (the owner's
  choice when #138 was planned).

## Consequences

- What a person reads with these commands costs the conversation two short lines, whatever the number of results.
- The rows stay in the transcript, on the screen and in the file Claude Code keeps, though not in what is sent.
  Measured were the conversation's own requests: whether Claude Code's own summary, where the plugin hands a
  compaction to it, or a model call of Claude Code's own, as one naming the session, reads the rows was not; nor
  whether another surface, the desktop app or an IDE extension, sends them.
- A file opened and saved no longer has the hash it is named by, and `recall` refuses it; the docs say to open it to
  read only.
