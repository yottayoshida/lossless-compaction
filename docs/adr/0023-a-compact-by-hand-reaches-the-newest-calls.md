# 0023. A /compact by hand reaches the newest calls

- Status: Accepted
- Date: 2026-10-04
- Amends [0002](0002-keep-the-newest-by-size.md) for a `/compact` typed
  without instructions: the newest results stay up to `keepTokens` only until
  what is older is out; then they may leave too, up to the last thing the
  person said. Narrows where [0015](0015-a-compact-with-nothing-to-move-and-room-left-is-not-summarized.md)
  leaves a `/compact` undone, and has its line say what takes the room.

## Context

A compaction keeps the newest `keepTokens` (20,000 by default) of results,
long inputs and old calls in place: what the agent is working on now is in
them. On its own, Claude Code compacts when the conversation is large, and
the newest are a small part of it. A `/compact` typed by hand comes at any
size. Over the compactions typed by hand in working sessions on one machine
(73, as of 2026-10-04), the median conversation was 131,652 characters, and
the results kept for being among the newest came to a median 43,636 of them:
a third of the conversation, which moving out what is older never reached.

The person asked for room now, by hand. What they asked for and what was done
for it since is what they are working on; what came before their last
message is not, whatever its age.

## Decision

1. A `/compact` typed without instructions moves out, as any compaction,
   results, then long inputs, then old calls older than the newest
   `keepTokens`. While still short of the target, it does the same three
   again over everything before the last thing the person said, told as the
   goal is told (not a command, not the host's text, not a line of this
   plugin's, nor what Claude Code writes in a person's place: a turn stopped
   with Esc, a Stop hook's answer, a message another session sent, a command
   run with `!` and what it printed, the note after a summary that held what
   others wrote). The second round leaves that message and
   what came after it as they were, a call answered after it included; what is
   older than the newest `keepTokens` there left in the first round, as at any
   compaction. What the first round tried, written or not, is not tried again.
2. In the second round the newest result and the newest long input before
   that message are not kept for being the newest: what stays is told by the
   message.
3. The line counts what the second round took: `; 3 of these from the newest
   turns`.
4. Where nothing could be moved out and the `/compact` is left undone (0015),
   the line says what takes the room, where the conversation was counted:
   what every request carries, which no compaction makes smaller (the system
   prompt, tools, memory and the like), the first
   message, which always stays, and the rest.
5. A compaction Claude Code starts on its own, and a `/compact` with
   instructions, keep the newest `keepTokens` as before.

## Alternatives Considered

- **Keep the newest at a `/compact` by hand too.** A conversation of the size
  people type `/compact` at is mostly the newest `keepTokens`: nothing moves.
- **Lower `keepTokens` for a `/compact` by hand.** A number is not what the
  person is working on; the last thing they said is.
- **Take the newest of every kind by age, not results, inputs, then calls.**
  One order for both rounds is simpler to read and to test, and every one of
  the three is given back by `recall`.

## Consequences

- Right after a `/compact` by hand, the agent may `recall` what it was just
  working on more often: what it was looking at before the person's last
  message left. The line says how much was taken from there.
- The second round's checks that more is still needed, and that a run was
  already folded by the first, change no outcome: the stages check the first
  themselves, and a run left with no calls would not be folded. They save
  work.
