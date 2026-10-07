# 0035. The places written to before are read, and never cleaned up

- Status: Accepted
- Date: 2026-10-06
- Under [0005](0005-a-repository-does-not-decide-where-results-go.md):
  where results are read from is decided by the user's settings, as where
  they are written

## Context

With `storeDir` set, that place alone was read and written; without it, the
default places under the current name and the old one. Setting `storeDir`
for the first time, or changing it, turned every ticket written before into
"Nothing is stored under that id on this machine", and left the earlier
place with no clean-up (#116). `docs/limits.md` said so: results kept
elsewhere are not found until the settings change back.

## Decision

1. The places results are written to are noted, newest first, in the
   plugin's own store (`$.store`, a file of Claude Code's under
   `~/.claude/plugins/store/`), each time the place is worked out: up to 16,
   the oldest going past that. A place not found stays on the list, as a
   disk not mounted does.
2. Results are read from the places of the settings in use first, then from
   the earlier ones on the list and, where `storeDir` is set, from the
   default places. The defaults are read only where the repository's
   settings did not set `HOME`, `USERPROFILE` or `CLAUDE_CONFIG_DIR`; the
   list holds only places the user's settings decided, since a place the
   repository decides is refused before it is noted.
3. Only the places of the settings in use are cleaned up, made private, put
   back into from the trash and counted by the clean-up. An earlier place is
   read alone.
4. `/lossless-store` counts the earlier places after the current ones, as
   read and never cleaned up.
5. Where the plugin's store cannot be read or written, the places of the
   settings in use are read, as before.

## Alternatives Considered

- **Clean up the earlier places too.** A clean-up removes what no
  transcript it knows of names. Another configuration, or another machine
  through a synced folder, may still use the earlier place, and its
  conversations are not known here (as #113 found of one store used from two
  machines). Rejected: an earlier place is read only.
- **Say once, when the place changes, where the results stay.** Leaves the
  tickets refused. The issue asked for it at the least; reading is no more
  work and gives the results back.
- **Keep the list in the store directory.** The list is about more than one
  store; kept in one, it is lost when that one changes. Claude Code's store
  for the plugin is under the user's configuration, which no repository's
  settings write to.

## Consequences

- A session with `storeDir` set reads the default places as well. Results
  are found there by id only, the SHA-256 of what was stored, which a
  conversation holds only where that result was in it.
- A result in an earlier place's trash is not found: it is not put back.
- Places written to before this version are not on the list until used
  again.
- The benchmark runs the plugin from its directory, as `lossless-compaction@inline`,
  with Claude Code's own configuration: its runs note their places in one
  list and read each other's, which are read only.
