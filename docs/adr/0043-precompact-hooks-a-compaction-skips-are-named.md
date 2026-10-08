# 0043. The PreCompact hooks a compaction skips are named, not run

- Status: Accepted
- Date: 2026-10-08
- Refers to [0010](0010-a-mark-says-the-plugin-is-running.md), which measured that a classic `PreCompact` hook does
  not run when the module compacts by itself, for the plugin's own hook.

## Context

Claude Code runs `PreCompact` hooks inside its own summary. When the plugin answers a compaction itself, moving
results out, folding old calls or cutting, the summary does not run, and neither do they. A person's hook that copies
the transcript first, writes notes, or holds automatic compactions back by exiting 2 stopped running the day the
plugin was installed, and nothing a user reads said so (#126).

Measured on Claude Code 2.1.293, `claude -p` with `--setting-sources project,local`, a project's
`.claude/settings.json` holding a `PreCompact`, a `PostCompact` and a `SessionStart` hook with the matcher `compact`
that each wrote its input to a file, and two probe plugins hooking `session.compact` beside this one:

- A `/compact` the plugin answered by moving results out, and an automatic compaction it answered the same way: no
  `PreCompact`; `PostCompact` ran with an empty `compact_summary`; `SessionStart` ran.
- A `/compact` with instructions, which the plugin hands to the summary after moving out (0036): all three ran.
- A `/compact` left undone (0015): none ran.
- The plugins nested in the order of `--plugin-dir`, the first outermost. Outside this one, a probe's
  `session.compact` was entered and left around it; inside, it was never entered, as this one did not call `next`.
- A function hook on `classic.PreCompact` or `classic.PostCompact`, in either probe, did not run in any of these,
  even where the settings file's hook did.
- After the compaction the transcript still held the earlier messages above its boundary.
- `$.settings.read({ source })` returned each of `user`, `project`, `local`, `flag` and `policy`, the user file too,
  though the session did not load it.

A plugin cannot run a classic hook: `$.classic` is on the engine of the test kit, not on a running plugin's `$`
(Claude Code 2.1.292's declarations). It can read the settings files, and not another plugin's hooks.

## Decision

1. In the compaction hook, the `next` handed to the steps that reach the summary notes that it was called.
2. When the hook answers with the conversation replaced, that `next` was never called, and Claude Code has not gone
   on without the hook, the plugin reads the five settings sources and names those holding a `PreCompact` hook, in
   one line, once a session (`your PreCompact hooks did not run: …`), with a notice short enough that one cut at the
   width of the screen still shows the files. It names where a hook is set, not whether Claude Code would have run
   it: a group whose matcher is exactly the other trigger's name (`auto` at a `/compact`, `manual` at an automatic
   compaction) is left out, and every other matcher counts, a pattern among them, so that a hook is named rather than
   missed. A source is named only for a group no source before it holds, word for word: the project file of a session
   in the home directory is the user file, and a Claude Code that answers a source it does not know with the merge
   would otherwise name the other files' hooks as `--settings`. The user file is named as "your user settings", which
   `CLAUDE_CONFIG_DIR` may put elsewhere. A source that cannot be read names nothing; nothing here changes the
   compaction.
3. Nothing is said where the compaction was left undone, for a compaction computed ahead, for a subagent's, or where
   Claude Code went on without the hook: its handler then hands the conversation to the summary, where the hooks run.
4. `docs/limits.md`, "Other hooks at a compaction", says what runs, what to use instead, and how another plugin's
   `session.compact` stands beside this one.

## Alternatives Considered

- **Run the settings' `PreCompact` commands from the plugin.** It would make Claude Code's hook rules again: the
  matcher, exit 2 holding the compaction, the standard output added to the summary's instructions (there is no
  summary to add them to), the time allowed, and whether a repository's hooks are trusted. Turned down by the
  owner.
- **Say it only in the docs** (the issue's proposal). A person who does not read them stays where the issue began:
  the hook stops without a word.
- **Watch `classic.PreCompact` to tell whether it ran.** It would also catch a plugin inside this one that answers
  itself. Measured above, a module's `classic.*` hook did not run where the settings hook did, so it tells nothing.
- **Hand every compaction with a `PreCompact` hook to the summary.** The plugin would then do nothing for those who
  have one.

## Consequences

- A person with a `PreCompact` hook in a settings file is told once a session, at the first compaction the plugin
  makes itself, which file holds it. Another plugin's `PreCompact` hook is not named.
- A plugin inside this one that answers a compaction itself, after this one called `next`, keeps the hooks from
  running too, and nothing is said.
- The line is said before the hook returns. Where Claude Code then refuses what it answers, its handler hands the
  conversation to the summary, and the hooks run after a line that said they did not.
- "Once a session" is once for each set of files named, and anew once the plugin's settings change, as for the lines
  of `find` (#143).
- The five settings sources are read at each compaction that replaced the conversation, after the line was said
  too: each read is a snapshot in memory, and the time a hook waits on `$` is not counted against it.
