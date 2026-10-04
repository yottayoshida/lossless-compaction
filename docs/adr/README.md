# Decision records

Why the plugin is built the way it is, one record a decision.

- [0001](0001-move-out-and-order.md): why results are moved out instead of
  deleted.
- [0002](0002-keep-the-newest-by-size.md): why the newest results are kept
  by size.
- [0003](0003-jev-picks-what-comes-back.md): why Jev chooses what comes
  back, not what leaves.
- [0004](0004-the-plugin-is-named-lossless-compaction.md): the rename, and
  how what the old name wrote is still read.
- [0005](0005-a-repository-does-not-decide-where-results-go.md): why a
  repository's settings do not decide where results go.
- [0006](0006-results-live-as-long-as-a-transcript-names-them.md): why
  results are kept as long as a transcript names them.
- [0007](0007-keep-what-the-summary-replaces.md): why what Claude Code's
  summary replaces is kept first.
- [0008](0008-no-limit-and-nothing-lost-to-a-failed-write.md): why nothing
  is lost to a failed write, and there is no limit.
- [0009](0009-an-account-id-is-enough-to-choose-cloudflare.md): why an
  account id is enough to choose Cloudflare.
- [0010](0010-a-mark-says-the-plugin-is-running.md): how a session learns
  that the plugin is enabled and not running.
- [0011](0011-the-size-after-is-what-stays.md): why the size after a
  compaction is counted from what stays.
- [0012](0012-an-image-in-a-result-is-moved-out.md): why an image in a tool
  result is moved out with the result.
- [0013](0013-the-size-after-is-what-is-in-use-less-what-goes.md): how the
  size after a compaction is counted, which replaces the way of 0011.
- [0014](0014-after-a-summary-files-changed-on-disk-are-named.md): why the
  plugin reads the files a conversation read, and names the changed ones
  after a summary.
- [0015](0015-a-compact-with-nothing-to-move-and-room-left-is-not-summarized.md):
  why a `/compact` with nothing to move out and room left is not summarized.
- [0016](0016-the-store-is-told-not-bounded.md): why the store is said, by
  `/lossless-store`, and still not bounded.
- [0017](0017-recall-and-find-are-listed-in-front-of-the-agent.md): why
  `recall` and `find` stand in the list of tools the agent is given.
- [0018](0018-a-changed-file-shown-again-gives-way-to-a-line.md): why a
  changed file Claude Code shows again after a summary gives way to a line
  with the id of its reading.
- [0019](0019-a-conversation-too-full-is-cut-not-summarized.md): why a
  conversation too full is cut, its oldest messages kept, and not
  summarized.
- [0020](0020-long-inputs-leave-and-a-ticket-is-not-handed-on.md): why long
  inputs of the tools that write leave, and a call that hands on a ticket is
  refused.
- [0021](0021-one-line-installs-it-and-nothing-is-set.md): why the plugin is
  installed with one line in a session and nothing is set for it to run.
- [0022](0022-old-tool-calls-fold-into-a-list.md): why old small tool calls
  fold into a list, kept whole, and what was said stays.
- [0023](0023-a-compact-by-hand-reaches-the-newest-calls.md): why a
  `/compact` typed without instructions reaches into the newest calls, up to
  the last thing the person said.
- [0024](0024-the-middle-of-a-long-message-leaves.md): why the middle of a
  long message leaves, its first and last paragraphs staying, and is never
  sent to Jev.
