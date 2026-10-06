# 0001. Move tool results out instead of deleting them, and let Jev only order them

- Status: Accepted
- Date: 2026-09-29

> Written when the plugin was named `jev-lossless-compaction`. The rename is ADR 0004; what this record says of names and paths is of its time.

## Context

A coding agent's conversation fills with tool output. Claude Code compacts it
by having a model write a summary, which takes time and can lose an exact
path, error, or command. [fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction)
replaced the summary with decisions from [Jev](https://typesafe.ai): it asks,
for every tool call, whether the call and its result should stay, and deletes
what falls under a threshold.

Reports on that project describe three problems that follow from its design
rather than from bugs:

- A deleted result cannot be recovered except by running the tool again.
- Deleting a call while keeping the assistant's text about it leaves narration
  without evidence (issue 65 there).
- The questions are asked without showing the result's content, and the
  answers are cut at a fixed threshold (issues 26 and 56 there).

Jev returns typed answers with probabilities and cannot write text. It accepts
about 32k tokens of state per request. A conversation that needs compaction
is far larger than that.

## Decision

1. A tool result that leaves the conversation is written to a local file
   first, read back, and compared. Only then is it replaced by a fixed one-line
   ticket that says how to get it back.
2. The tool call itself always stays in the conversation.
3. Files are named by the SHA-256 of their content.
4. Jev is asked one `score` question per tool result, with a digest of that
   result in the question. The answers are used as an order, not cut at a
   threshold. How much is moved out is decided by a size target, 1 % of the
   window by default since ADR 0025. (Amended by ADR 0003: a compaction asks Jev nothing; rules alone order what leaves,
   and Jev chooses what comes back through the `find` tool.)
5. What rules can decide is not asked: results that a later call replaced,
   short results, failed calls, the first and the newest messages. (Amended
   by ADR 0002: the newest results are kept by size, not by count of
   messages, and a result a later call replaced is a candidate even when it is
   the newest.)
6. When Jev fails or runs late, the order falls back to rules. (Amended by
   ADR 0003: there is nothing to fall back from; the order is rules'.) When
   too much is still in use after moving out, and a summary of what is left
   could change that, what is left is handed to Claude Code's built-in
   compaction.
7. The plugin works once it is installed and given a key. It sends digests of
   the conversation to the Jev provider by default, and the README says so at
   the top.

Settled by running on a real Claude Code (2.1.284 and 2.1.285, 2026-09-29 and
2026-09-30), before and while the code was written:

8. Every message is handed back rebuilt, without the handle Claude Code gave
   it. With even one handle kept, resuming the session restored the whole
   history (28,133 tokens against 24,709 with none kept). What a rebuilt
   message cannot carry is older thinking and images, which the built-in
   compaction drops as well. A conversation is rebuilt only when every block
   in it is of a kind known to survive that: text, tool calls and their
   results, thinking, and what a search for a tool returns. With an image, a
   document, or a kind not on that list, it is left to the built-in
   compaction. (Amended by ADR 0012: an image in a tool result leaves with
   the result, and the conversation is rebuilt.) So is a conversation of 4096 messages or more, which is as many
   as the host shows a plugin: older ones may be missing from what it was
   handed.
9. A result is read back through a tool the plugin registers, `recall`. A
   `Read` of a file outside the working directory was refused without a
   permission; the plugin's own tool ran without one.
10. A ticket has the same wording for the same content: no time, no counter.
    A second compaction leaves the earlier part of the conversation as it was.
    (Amended by ADR 0002: the wording is shorter; tickets in this version's
    wording are still read.)
11. Files live under `~/.claude/jev-lossless-compaction/` unless a setting
    says otherwise, one index file per result. The host offers a plugin no
    directory of its own, so the place is built from `CLAUDE_CONFIG_DIR` or
    `HOME`, and refused when that is not an absolute path. The host's write
    follows symbolic links, so every path is checked with `stat` first and a
    link is refused.
12. A key is read from the plugin's settings first and from the environment
    only when none is set there, because a repository's own settings can set
    environment variables that reach the hook. Reading no key from the
    environment at all was considered and rejected: the steps people already
    follow for fast-jev-compaction would stop working. The README says at the
    top what a repository can do with this. The plugin's own settings were
    measured not to be reachable from a repository's `.claude/settings.json`
    (2.1.285), so a key set there stays the key; and with the key from the
    settings, the Cloudflare account id is not read from the environment
    either. (Amended by ADR 0028: a key in the environment is used only
    where the plugin's settings choose the provider.)
13. Sizes are measured against the point where Claude Code compacts on its
    own, which it reports, and against the model's window only when
    auto-compaction is off. The count of tokens in use includes the system
    prompt and the tools' definitions, which no compaction makes smaller: in
    the measured sessions they were more than half of the tokens in use.

## Alternatives considered

- **Fork fast-jev-compaction and patch it.** Rejected: the three problems come
  from deleting and from asking blind, which are the premises of its design.
- **Delete, but keep a truncated head of each result.** Rejected: still loses
  content, and the head is text from outside placed in the plugin's voice.
- **Send nothing unless the user lists directories where sending is allowed.**
  Rejected: it adds a setup step before the plugin does anything. The README
  instead shows how to install the plugin for one repository only.
- **Leave Jev out of the first release and order by rules only.** Rejected:
  the speed and cost this project is after come from Jev.
- **Name files by tool call id.** Rejected: a second compaction would
  overwrite the original with the ticket that replaced it.

## Consequences

- A wrong judgment costs one extra step to read the file back. It does not
  lose content.
- The conversation after compaction keeps every message and every call, so
  how it compares with a summary depends on how much of it is tool output. The
  README carries the numbers as measured, with how often each was measured.
- Moved-out files stay on disk in plain text and are not cleaned up
  automatically. The host creates them readable by other users of the machine
  (0644, in directories of 0755), and the mode cannot be set; a directory made
  0700 beforehand keeps them to their owner, and the README says to make it.
- The place is built from variables a repository can set. Only an absolute
  path is accepted, and the README says what a repository can do with the
  rest. A symbolic link along the way is not refused: a home directory kept
  elsewhere through a link is an ordinary setup, and refusing it would stop
  the plugin for those who have one.
- When the built-in compaction runs instead, tickets from earlier compactions
  may no longer be in the conversation. The files remain.
- The hook has ten seconds, and only its own computing counts: waiting for the
  host or for the built-in compaction does not. Running out of time is not
  what sends a compaction to the built-in one.
- Tokens are estimated from characters, three to a token. Results of reading
  source code measured 2.2 to 2.3, so more leaves the conversation than the
  target asks for. The estimate errs to that side on purpose: the other side
  hands a compaction that did enough to the built-in one.
