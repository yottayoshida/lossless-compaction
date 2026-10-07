#!/bin/sh
# Claude Code's own check of the plugin: `claude plugin validate --strict` passes on
# the working tree and on a copy of it, and fails on a copy with each patch under
# test/fixtures/validate applied. The broken copies show that the check looks at the
# hook file at all: a Claude Code that skipped it would pass them, and this fails.
# The unbroken copy shows that a broken one fails for its patch, not for being a copy.
#
#   sh test/validate.sh                                       with the claude on PATH
#   CLAUDE=/path/to/node_modules/.bin/claude sh test/validate.sh
#
# It needs no sign-in and no setting. CI installs Claude Code at the version it names
# (.github/workflows/ci.yml); npm 12 blocks the install script that puts its binary in
# place, so a bare `npx @anthropic-ai/claude-code` may not run.
set -eu

# Split on purpose: CLAUDE may be a command with arguments.
claude=${CLAUDE:-claude}
root=$(cd "$(dirname "$0")/.." && pwd)
scratch=$(mktemp -d "${TMPDIR:-/tmp}/lossless-validate.XXXXXX")

# What git keeps or would keep, archived once before any copy exists: nothing it ignores
# (recorded sessions, keys, types Claude Code wrote), and a file it cannot read stops here.
(cd "$root" && git ls-files -z --cached --others --exclude-standard) > "$scratch/files"
(cd "$root" && tar -cf "$scratch/tree.tar" --null -T "$scratch/files")
copy_to() {
  mkdir "$1"
  tar -xf "$scratch/tree.tar" -C "$1"
}

echo "== the working tree"
$claude plugin validate --strict "$root/.claude-plugin/plugin.json"

# The marketplace a person adds, and the plugin entry it offers, as Claude Code reads them.
echo "== the marketplace"
$claude plugin validate --strict "$root"

copy_to "$scratch/unbroken"
if ! $claude plugin validate --strict "$scratch/unbroken/.claude-plugin/plugin.json" > "$scratch/unbroken.log" 2>&1; then
  echo "== a copy with no patch applied fails: the copies below would fail for being copies" >&2
  cat "$scratch/unbroken.log" >&2
  exit 1
fi
echo "== an unbroken copy: passed"

failed=0
for patch in "$root"/test/fixtures/validate/*.patch; do
  name=$(basename "$patch" .patch)
  copy="$scratch/$name"
  copy_to "$copy"
  if ! patch -p1 -s -N -d "$copy" < "$patch"; then
    echo "== $name: the patch no longer applies to hooks/move-out.ts; make it again" >&2
    failed=1
    continue
  fi
  if $claude plugin validate --strict "$copy/.claude-plugin/plugin.json" > "$scratch/$name.log" 2>&1; then
    echo "== $name: validate passed a hook file broken this way" >&2
    cat "$scratch/$name.log" >&2
    failed=1
  elif grep -q 'Validation failed' "$scratch/$name.log" && grep -qE '(\$ is passed|\$\.[a-z]+ is used)' "$scratch/$name.log"; then
    echo "== $name: failed, as it should"
    grep '❯ modules' "$scratch/$name.log" | cut -c1-300 || true
  else
    echo "== $name: validate failed, but not on what Claude Code requires of \$ (does the patch still apply where it should?)" >&2
    cat "$scratch/$name.log" >&2
    failed=1
  fi
done

# Left for the system to clear: copies of tracked files only, in a directory only its owner can read.
echo "(copies in $scratch)"
exit "$failed"
