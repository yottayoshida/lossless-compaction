#!/bin/sh
# The type check of hooks/move-out.ts against the declarations of the Claude Code
# that runs it: the working tree and a copy of it pass, and a copy with each patch
# under test/fixtures/typecheck applied fails where Claude Code's `$` is handed to
# a shape the hook file states of it. The broken copies show that the check reads
# the hook file against Claude Code's own declarations at all: a check that read
# none, or skipped the hook file, would pass them, and this fails.
#
#   sh test/typecheck-hooks.sh                                       with the claude on PATH
#   CLAUDE=/path/to/node_modules/.bin/claude sh test/typecheck-hooks.sh
#
# The declarations are not in the repository: Claude Code writes them beside the
# plugin, as .claude-plugin/types/claude-code/index.d.ts, when it loads it from a
# folder, and names its version on their first line. Where they are missing or of
# another version, this starts Claude Code once, for at most a minute, to write
# them: with only HOME and PATH of your environment, a configuration directory of
# its own, none of your settings, and its updater and traffic other than to a
# model turned off. So no key of yours reaches it, and it stops at "Not logged
# in" before any model is asked; nothing of the session is kept. Settings an
# organization manages are read all the same: if they give it a key, the
# one-letter prompt `x` is sent. It needs `npm ci` first, for tsc.
set -eu

# Split on purpose: CLAUDE may be a command with arguments.
claude=${CLAUDE:-claude}
root=$(cd "$(dirname "$0")/.." && pwd)
tsc="$root/node_modules/.bin/tsc"
types="$root/.claude-plugin/types/claude-code/index.d.ts"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/lossless-typecheck.XXXXXX")

if [ ! -x "$tsc" ]; then
  echo "== no tsc at $tsc: run npm ci first" >&2
  exit 1
fi

# The first word of `claude --version`: `2.1.291 (Claude Code)`, or a version with a suffix.
version=$($claude --version | sed -n 's/^\([0-9][^ ]*\).*/\1/p' | head -n 1)
if [ -z "$version" ]; then
  echo "== the version of $claude could not be read" >&2
  exit 1
fi
written="// Written by Claude Code $version."

if [ "$(head -n 1 "$types" 2>/dev/null || true)" != "$written" ]; then
  echo "== writing the declarations of Claude Code $version"
  mkdir "$scratch/config"
  # It ends with "Not logged in", which is the exit code; what tells is the first line written.
  (cd "$root" && exec env -i HOME="$HOME" PATH="$PATH" CLAUDE_CONFIG_DIR="$scratch/config" \
    DISABLE_AUTOUPDATER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    $claude --setting-sources '' --no-session-persistence --plugin-dir "$root" -p x \
    < /dev/null > "$scratch/start.log" 2>&1) &
  started=$!
  waited=0
  while kill -0 "$started" 2> /dev/null; do
    if [ "$waited" -ge 60 ]; then
      kill "$started" 2> /dev/null || true
      echo "== Claude Code $version had not ended after a minute; stopped" >&2
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$started" 2> /dev/null || true
  if [ "$(head -n 1 "$types" 2>/dev/null || true)" != "$written" ]; then
    echo "== Claude Code $version did not write its declarations to $types" >&2
    cat "$scratch/start.log" >&2
    exit 1
  fi
fi
echo "== declarations: $written"

echo "== the working tree"
(cd "$root" && "$tsc" -p tsconfig.hooks.json)

# What the type check of the hook file reads, and nothing else: the configs, src/ and hooks/, in
# which nothing git ignores is kept, and the declarations beside them.
copy_to() {
  mkdir -p "$1/.claude-plugin"
  cp "$root"/tsconfig*.json "$1/"
  cp -R "$root/src" "$root/hooks" "$1/"
  cp -R "$root/.claude-plugin/types" "$1/.claude-plugin/types"
}

copy_to "$scratch/unbroken"
if ! (cd "$scratch/unbroken" && "$tsc" -p tsconfig.hooks.json) > "$scratch/unbroken.log" 2>&1; then
  echo "== a copy with no patch applied fails: the copies below would fail for being copies" >&2
  cat "$scratch/unbroken.log" >&2
  exit 1
fi
echo "== an unbroken copy: passed"

failed=0
for patch in "$root"/test/fixtures/typecheck/*.patch; do
  name=$(basename "$patch" .patch)
  copy="$scratch/$name"
  copy_to "$copy"
  if ! patch -p1 -s -N -d "$copy" < "$patch"; then
    echo "== $name: the patch no longer applies to hooks/move-out.ts; make it again" >&2
    failed=1
    continue
  fi
  if (cd "$copy" && "$tsc" -p tsconfig.hooks.json) > "$scratch/$name.log" 2>&1; then
    echo "== $name: the type check passed a hook file broken this way" >&2
    failed=1
  elif grep -q "^hooks/move-out\.ts([0-9,]*): error TS2345: Argument of type 'EngineInterface' is not assignable" "$scratch/$name.log" &&
    ! grep -v '^hooks/move-out\.ts(' "$scratch/$name.log" | grep -q 'error TS'; then
    echo "== $name: failed, as it should"
    grep -m 1 "error TS2345" "$scratch/$name.log" | cut -c1-200
  else
    echo "== $name: the type check failed, but not where Claude Code's \$ is handed to the hook file's shapes" >&2
    cat "$scratch/$name.log" >&2
    failed=1
  fi
done

# Left for the system to clear: copies of src/, hooks/, the configs and Claude Code's declarations, in a directory only its owner can read.
echo "(copies in $scratch)"
exit "$failed"
