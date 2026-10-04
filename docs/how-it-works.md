# How it works

- **A result is stored before it is replaced.** It is written to a file named
  by the SHA-256 of its content, read back, and compared. Only then does a
  ticket take its place. The tool call itself stays in the conversation, but
  for old short calls, which fold with their results into a list kept as a
  part ([ADR 0022](adr/0022-old-tool-calls-fold-into-a-list.md)), and
  `recall` checks the content against its name again before returning it. A
  long message is kept the same way, whole, its first and last paragraphs and
  a line in place of its middle standing in the conversation
  ([ADR 0024](adr/0024-the-middle-of-a-long-message-leaves.md)). A
  write that fails loses nothing: a result is ticketed only once all of it is
  written.
- **Rules decide what leaves. On this path no summary is written, and
  nothing is sent.** Where moving results out makes room, a compaction takes
  the time of writing a few files. Results leave in this
  order until the conversation is estimated to be under the target size
  (`targetPercent`): those a later call replaced, then those sharing the
  least with what you are working on, then the oldest. The newest results
  stay, up to `keepTokens` tokens of them (20,000 by default), but at a
  `/compact` typed without instructions, which reaches into them too, up to
  what you said last ([ADR 0023](adr/0023-a-compact-by-hand-reaches-the-newest-calls.md)). A result a
  later call made obsolete can leave even when it is the newest, and a result
  that holds an image always leaves. Where moving results out does not make
  room, the oldest messages are kept whole in the same store and a list of
  them stands in their place; the first message stays, and still no summary
  is written ([when it is too full](limits.md#when-the-conversation-is-too-full)).
- **Nothing is deleted that a recorded transcript still names.** Files are
  plain text under `~/.claude/lossless-compaction/`, in a directory closed to
  mode 700 before anything is written. Once a week the transcripts are read.
  A file that neither they nor a part kept before a summary names goes to a
  trash, and is removed a week later if still named by none. `/lossless-store`
  says how much is kept and how the clean-up went, without opening a result.
