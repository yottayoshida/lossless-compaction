# 0031. The marketplace points at a release

- Status: Accepted
- Date: 2026-10-06

## Context

The marketplace entry's source is `"./"`: a new install takes the tip of
`main`, whatever has been merged since the last release, under that
release's number. `claude plugin update` keeps a copy until the version in
`plugin.json` changes, so two people on "0.7.1" can run different code, and
one installed between two releases keeps unreleased code until the next
(#106).

Measured on Claude Code 2.1.291, in a scratch configuration directory, with
no model called:

- An entry whose source is `{"source": "url", "url": "https://github.com/yottayoshida/lossless-compaction.git", "ref": "v0.7.1", "sha": …}`
  installs v0.7.1, not the tip of `main`; so does a `github` source with the
  same `ref`.
- With the same version and other content behind the ref, `claude plugin
  update` keeps the copy it has; installing anew takes the new content. That
  is what `"./"` does today.
- `claude plugin marketplace add yottayoshida/lossless-compaction#v0.7.1`
  installs v0.7.1: the tag's own `marketplace.json` has `"./"`, the tag's tree.
- An entry pointing at a tag that does not exist fails to install; nothing
  else is installed in its place.
- Removing the marketplace removes the plugin's settings (`pluginConfigs`,
  `storeDir` among them). A marketplace that is added cannot be moved to
  another ref from the shell: adding it again from one is refused, and with
  its `ref` edited in the settings, `claude plugin marketplace update` and
  `install` said it was not found.

Claude Code's documentation: the version comes from `plugin.json` first, then
from the marketplace entry; `claude plugin validate` warns where a relative
entry's version differs, an install does not. A `github`
source may need `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` without an SSH key, a
`url` source with an `https://` URL clones without credentials.

## Decision

1. The marketplace entry names no version; `plugin.json` alone does (now).
2. A release points the entry at itself: a `url` source, the repository's
   `https://` URL, `ref` the tag and `sha` its commit.
3. A release is three steps with nothing else merged between them: a pull
   request that raises the version with the entry's source `"./"`; the tag on
   its merge and the Release; a pull request that points the entry at the tag.
   The tag's tree then installs as itself, and `#vX.Y.Z` installs X.Y.Z.
4. Not now: pointed at v0.7.1 today, new installs would lose what was merged
   since, fixes among it (#103, #100), until the next release. The entry
   moves with that release (docs/development.md, "Releasing").

## Alternatives considered

- Pointing the entry at v0.7.1 now: a step back for anyone installing before
  the next release.
- A `github` source: may fail for people without an SSH key unless they set a
  variable; the `url` source does not ask for one.
- A `release` branch the entry follows: `#vX.Y.Z` would then install the
  latest release, not X.Y.Z, since every tag's entry would point at the branch.
- Moving the ref in the pull request that raises the version: installs fail
  between its merge and the tag's push.
- Moving the ref in that pull request but to the previous tag, the new one
  set after: `#vX.Y.Z` would install the previous release.
- A workflow that tags and releases: not needed for any of this; releases
  stay by hand.

## Consequences

- Until a release made with these steps, #106 is not fixed: new installs
  still take the tip of `main`. docs/limits.md says so, and how to stay on a
  release; the third step rewrites that, which a test holds to the entry.
- A release takes two pull requests where it took one, and nothing else may
  be merged between them. The first sets the entry back to `"./"` and
  docs/limits.md back to saying so; the second points both at the release.
- `npm run validate` checks the marketplace with `--strict` too; it cannot
  tell that a tag exists. The check that the entry's ref and sha are the
  release's comes with the pull request that first points the entry at one
  (docs/development.md, "Releasing", the third step).
- Going back to an older release means removing the marketplace and adding it
  again at that tag, which removes the plugin's settings; docs/limits.md says
  to note `storeDir` first.
