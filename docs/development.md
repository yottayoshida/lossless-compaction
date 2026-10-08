# Development

Node 24 or later. There are no runtime dependencies: the plugin runs inside
Claude Code, which has no Node, so `src/` and `hooks/` use web standards only.

```sh
npm ci
npm run typecheck   # src/ and test/
npm test            # node:test, no network and no real files
```

Everything that decides something is in `src/` and is tested there with a file
system and an HTTP client held in memory. `hooks/move-out.ts` only connects
Claude Code's events to `src/`.

`npm run mutate` breaks, in a copy of the tree, each line of `src/` that a
promise of [invariants.md](invariants.md) rests on, and checks that the test
named for it fails. CI runs it as the last step of `test`, on every pull
request and on `main` after each merge: a pull request whose named test no
longer catches its line does not pass. `main` does not require a pull request
to be up to date with it, so two that passed apart are checked together only
on `main`, after the second merge.

## Checks that need Claude Code

```sh
# Claude Code 2.1.287 or later: function hooks are on without a setting
npm run validate          # Claude Code's own check of the manifest and the hook file
npm run typecheck:hooks   # hooks/ against Claude Code's own type declarations
```

A change that passes `$` to a function imported from another file, or takes a
noun of `$` out to call it, fails CI: CI runs `claude plugin validate --strict`
with the Claude Code version `.github/workflows/ci.yml` names, and checks on
every run that a copy of the hook file broken that way fails it.
`npm run validate` runs the same (`test/validate.sh`) with the `claude` on
your `PATH`, or the command in `CLAUDE`: the working tree must pass, and each
patch under `test/fixtures/validate/` applied to a copy must fail, where a
copy with none applied passes. It needs no sign-in and no setting. Once a week `.github/workflows/claude-code-latest.yml` runs it
with the newest Claude Code; when that turns red, raise
`CLAUDE_CODE_VERSION` in `ci.yml`. GitHub stops a schedule in a repository
with no activity for 60 days. A patch that no longer applies to the hook file
fails the check: make it again.

What `validate` does not see is held by `npm test` (the tool name a
`tool.call` hook matches, below).

CI fails when `hooks/move-out.ts` does not type-check against the
declarations of the Claude Code version `ci.yml` names. `npm run
typecheck:hooks` (`test/typecheck-hooks.sh`) checks the working tree and a
copy of it, which must pass, and a copy with each patch under
`test/fixtures/typecheck/` applied, which must fail where Claude Code's `$` is
handed to a shape the hook file states of it (`WithUi`, `WithFiles`, …): a
shape Claude Code's `$` no longer satisfies fails there. A return the hook
file states as `void` or `unknown` is not compared: whatever Claude Code
returns satisfies it. The weekly workflow runs it with the newest Claude
Code.

To try a change, load the working tree as a plugin for one session:

```sh
claude --plugin-dir .
```

`typecheck:hooks` reads `.claude-plugin/types/claude-code/index.d.ts`, which
is not in the repository: Claude Code writes it beside the plugin each time
it loads it from a folder, as above, and names its version on the first
line. In a fresh clone, `npm ci` and then `npm run typecheck:hooks` is
enough. Where the file is missing or of another version than the `claude` on
your `PATH` (or the command in `CLAUDE`), the script starts that Claude Code
once, for at most a minute, to write it: with only `HOME` and `PATH` of your
environment, a configuration directory of its own, none of your settings,
and its updater and traffic other than to a model turned off, so it stops at
"Not logged in" before any model is asked, and keeps nothing of the session.
Settings an organization manages are read all the same; if they give Claude
Code a key, that start sends the one-letter prompt `x`. A type check that
fails inside `index.d.ts` itself may be a file written partway, or one your
TypeScript cannot read: delete `.claude-plugin/types/` and run it again.

Run `npm run validate` after a change to `src/` or `hooks/` as well, before CI does. When the hook
file or anything it imports does not parse, Claude Code still lists the plugin
as installed but loads no hook from it: the `recall` tool is missing from the
tools, and a `/compact` is held by `hooks/notice.sh`.

`npm run check:host` loads the working tree into the Claude Code you have and
checks, without a person watching, that `recall` is registered, that a
`/compact` of a made-up conversation moves results out and `recall` returns
one of them as it was, that the same conversation with next to nothing
allowed to stay is cut with no summary and what was cut is in the store as it
was said (ADR 0019), that a copy of the conversation compacted by a copy
whose compaction hook throws, answers what Claude Code refuses, throws
after the summary ran, or waits past its time (the patches under
`test/fixtures/failing/`) says so, says nothing more of the hook, is kept in
that copy's store, is compacted once, and holds the tickets afterwards
(#102), that what Claude Code attached as it sent the messages (a file
handed over with `@`, words two hooks added) is kept at a `/compact` and
comes back to an agent that has no tool to read a file (#105), that with the
plugin enabled and not running the
first message is told and a `/compact` is held, and that nothing is set for
the plugin to run: every session is started without
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, and one more, with it at `0`, runs the
plugin too. It prints the version it ran on. Run it with every new Claude Code and before a release. It signs in as you
do and spends about 1.70 USD of Sonnet 5.5, about 0.90 of it on the
summaries the four broken copies run (measured on 2026-10-06). `node bench/host.ts --plugin-dir <copy>`
runs the checks of the running plugin on another copy (the copy that is not
running, and the copies broken as `test/fixtures/failing/` says, are always
made from the working tree); given the copy
`test/fixtures/validate/` breaks, they fail.

`node bench/replay.ts <record.jsonl> <line> [targetPercent] [maxAfterPercent] [window] [--with-instructions]` gives one compaction of a
recorded session to the code as it is in the working tree, offline: the
conversation as it stood before the compaction reported at that line of
Claude Code's record, what `compact()` makes of it and, where that is still
too full, where the cut in place of a summary falls. The window is the one
given, else 967,000 where a request of the session sent more than 200,000
tokens, else 167,000. A compaction the record says was asked for is
replayed as a `/compact` typed without instructions unless
`--with-instructions` is given: the record does not tie the instructions to
the compaction. With it, what is left goes to the summary, as the hook hands
a `/compact` given instructions (ADR 0036). It prints sizes and counts, how many results, inputs,
middles and calls left and the target, nothing the conversation said; the store is held in memory, no model
is called and nothing is sent. What is not the conversation is taken as the
session's first request, so a size it prints is the plugin's count with that
for a breakdown, not Claude Code's own.

"Not running" is made the way it was met in #51: a copy of the working tree
whose hook file Claude Code does not load (`pass-to-import.patch` applied),
which still lists the plugin as installed. On Claude Code 2.1.288,
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` set to `0`, in the shell or in the settings
a session is started with, no longer turned function hooks off: from 2.1.287
they are on by default and the variable is ignored.

What `hooks/notice.sh` leans on that Claude Code's type declarations do not
promise: a classic hook sees a variable the module set with `$.env.set`, and is
handed `CLAUDE_PID`; it reads its input by its text (`"trigger":"manual"`,
`"source":"compact"`, `"session_id":"…"`); and a `systemMessage` from
`UserPromptSubmit` is shown and not sent to the model. The command sees the
first two: in a running session nothing is told, and in one not running, with
another process's mark handed down, the line comes and the `/compact` is held.
It also checks that every session ran on one Claude Code version and loaded
the plugin once, from the copy checked, not an installed one. What it reads is a session started with
`-p` and `--include-hook-events`. Still for a person to look at, in an
interactive session (`claude --plugin-dir .`): that the line is shown on the
screen, and is not in what the model is sent.

## Layers

The code is in three layers, and a file reads only its own and those under
it:

- **What is kept and given back**: `src/layout.ts` (where a store's files
  are), `src/files.ts` (a host's file system and command runner, as types),
  `src/blobs.ts` (a text stored under the SHA-256 of itself, written, read
  back and compared, and checked against its name before it is handed over)
  and `src/encoded.ts` (a result with images, held as text). Nothing in
  these is of Claude Code: no name a tool is called by, no directory or
  variable of its configuration, no shape of a conversation, nothing of the
  object a hook is handed. `test/layers.test.ts` holds that, by the marks it
  lists, and that they read no file outside themselves. What they still take
  from the layers above is a number, a shape and a few words: the size over
  which a text is not stored, the form of the name a stored text is filed
  under (that of a tool's name, as a ticket spells it), and what `recall`
  says when it cannot answer.
- **What leaves a conversation, and what stands in its place**: the rest of
  `src/`. `src/store.ts` words the tickets, which name the tool the model
  calls, and says where a store is under Claude Code's directory; the files
  that decide what leaves read a conversation as Claude Code hands it to a
  hook.
- **The host**: `hooks/move-out.ts`, the one file that is handed `$`.

Another host would bring its own second and third layer; the first is
written to be kept. Only the first is held by a test: the line between the
other two is where `$` is, which Claude Code itself requires (below). What
decides what leaves a conversation (`src/select.ts`, `src/compact.ts`) reads
a conversation as Claude Code hands it over, and is of the second layer:
storing is apart from the host, deciding is not yet.

## What Claude Code requires of the hook file

- `$` may be handed only to a function declared at the top of the file, and
  whole: not `$.fs` on its own.
- Every host call is written out as `$.noun.verb(...)`.
- The tool name a `tool.call` hook matches is written as a literal. A test
  holds it equal to the name the tickets carry.

## The README

The README is where a reader decides whether to install the plugin, and it
grows. `test/readme.test.ts` holds it to a page: 100 lines, 760 words, 7
headings under the title and 1 table, the words counted as `wc -w` counts
them. What does not fit goes to `docs/`, and a link stays. It is written in
Markdown alone, with no HTML and no heading made by underlining, so that
nothing in it is left out of the count.

The same test checks what a machine can: that the README's links reach a
file, and a heading where they name one; that links to its headings from
other documents do; and that the names it gives are the ones the code has
(the line that installs the plugin and the two commands for the shell in
`docs/usage.md`, the version the plugin needs, the tools, the mark of the
plugin's lines), and that it asks for no setting. The figures it gives are held
to the published units in `test/bench.test.ts`.

What a machine cannot check is read at each release. The line below names
the version the README was last read against. The test fails unless
`package.json` and `.claude-plugin/plugin.json` both name that version, so a
version is not raised without coming here. The marketplace entry names no
version: Claude Code takes it from `plugin.json` first, says nothing of a
difference when it installs (`claude plugin validate` does), and an entry
pointing at a tag would have nothing to compare it with. The test cannot tell that the README was read,
only that this line was set. `VERSION` in `src/status.ts`, which
`/lossless-status` prints, is held to the same version by
`test/status.test.ts`.

README read against version: `0.7.1`

To read it, for the release being made:

1. Go through that release's entries in the CHANGELOG. Does one make a
   sentence of the README false, or call for one that is not there?
2. Do the quick start as written, in a new session. `npm run check:host`
   shows the plugin working in the Claude Code you have; it does not type the
   line that installs it.
3. For each figure, find the measurement it is from and the model it was
   taken with. The README gives figures of the models people work with, which
   were Sonnet 5.5 and Opus 5.5 when this was written, and says so where a
   figure is of a smaller one. A figure of code that has changed since is
   measured again or taken out.
4. Then set the line above to the new version.

## Releasing

A copy installed from the marketplace is replaced only when the version in
`plugin.json` changes; a new install takes what the marketplace entry points
at. While the entry's source is `"./"`, the tip of `main`, what is merged
between two releases reaches new installs under the old number (#106). A
release points it at the release's tag
([ADR 0031](adr/0031-the-marketplace-points-at-a-release.md)), in three steps
with nothing else merged between them:

1. A pull request raises the version (`package.json` and both its places in
   `package-lock.json`, `plugin.json`, `VERSION` in `src/status.ts`, and,
   once the README is read as "The README" above says, the line naming the
   version it was read against) and dates the CHANGELOG's section. It sets
   the entry's source back to `"./"`, and the paragraph of `docs/usage.md`
   back to saying the marketplace points at the tip of `main`, where a
   release before pointed them at its tag: the tag's tree then installs as
   itself, and `#vX.Y.Z` added to the marketplace installs X.Y.Z.
2. Once it is merged: the tag `vX.Y.Z` on that commit, pushed, and the GitHub
   Release.
3. A pull request points the entry at the tag: `{"source": "url", "url":
   "https://github.com/yottayoshida/lossless-compaction.git", "ref": "vX.Y.Z",
   "sha": "<the tag's commit>"}`, rewrites the paragraph of `docs/usage.md`
   that says the marketplace points at the tip of `main` (a test holds the
   two together), and, the first time, adds a check that the entry's `ref` and
   `sha` are a tag of this repository and its commit. Until it is merged, new
   installs take the tip of `main`, which is the release's commit.

`claude plugin validate --strict` reads the marketplace too (`npm run
validate`); it cannot tell that the tag exists.
