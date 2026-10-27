# Security

What the plugin handles, what it trusts and what it does not, and what an
organization can enforce through Claude Code. Each fact is said once, on the
page it links to; this page gathers them for a review.

## What it handles

- **The store.** Results moved out of a conversation, and the conversation
  as it stood before a summary or a cut, are kept as plain files on this
  machine, with no limit on how much, while a conversation names them
  ([what it keeps](../PRIVACY.md#what-it-keeps-and-where),
  [the files](limits.md#the-files),
  [how long](limits.md#how-long-results-are-kept)). A secret a tool printed
  is kept with the rest.
- **The key.** A key for Jev is kept by Claude Code with the plugin's other
  settings, not by the plugin. A key in the environment is used only once
  the plugin's own settings choose a provider
  ([in short](../PRIVACY.md#in-short)).
- **What `find` sends.** With no key, nothing: the plugin makes no network
  request. With a key, each call of `find` sends the provider the question
  and digests of what was moved out, from every repository you open
  ([what it sends](../PRIVACY.md#what-it-sends-and-to-whom)). Nothing is
  sent to the maintainer.
- **The commands it runs**, by an absolute path, none of which connects to
  a network ([commands](../PRIVACY.md#commands-it-runs)).

## What it defends against, and what it does not

Defends against:

- **Other users of the machine.** The places results are kept in are made
  readable by their owner alone (mode 700) before anything is written; a
  place that cannot be made so is not written to. Not on Windows. The
  plugin's file under `~/.claude/plugins/store/`, which Claude Code writes,
  holds paths and a version and was mode 644 where measured
  ([how safe the files are](../PRIVACY.md#how-safe-the-files-are)).
- **A repository's settings.** A repository's `.claude/settings.json` and
  `.claude/settings.local.json` decide neither where results are written nor
  where `find` sends: a value of theirs that would, stops the plugin and is
  named ([what a repository can change](limits.md#what-a-repository-can-change),
  [ADR 0005](adr/0005-a-repository-does-not-decide-where-results-go.md)).

Does not defend against:

- **Processes of the same user**, and what a repository you trust runs: its
  hooks, MCP servers and the plugins and mods it enables can read the files
  directly or change the environment
  ([what a repository can change](limits.md#what-a-repository-can-change)).
- **Root, and backups** of your home directory, which read the files as
  they are: they are not encrypted
  ([how safe the files are](../PRIVACY.md#how-safe-the-files-are)).
- **A `storeDir` on a synced or network drive**, which is no longer only on
  this machine ([what it keeps](../PRIVACY.md#what-it-keeps-and-where)).
- **The provider's retention.** How long Jev's provider keeps what `find`
  sends, and how long Claude Code's model provider keeps the conversation,
  with what `recall` gave back in it, is set by their terms. The shapes of secrets
  blanked before `find` sends are a courtesy, not a guarantee
  ([what it sends](../PRIVACY.md#what-it-sends-and-to-whom)).
- **A ticket handed on.** A tool call that hands on a ticket is refused,
  and the agent is told to recall it: where that tool sends on what it is
  handed, the whole value goes there instead
  ([ADR 0020](adr/0020-long-inputs-leave-and-a-ticket-is-not-handed-on.md)).

## What an organization can enforce

Each line says whether it was measured, and on which Claude Code version.
The setting names are Claude Code's
([settings](https://code.claude.com/docs/en/settings)); whether each reaches
this plugin is what is marked.

- **An organization can keep `find` from being called**, with a
  `permissions.deny` of `mcp__lossless-compaction__find` in managed
  settings, and with `allowManagedPermissionRulesOnly` keep every other
  file's rules out of effect ([stopping `find`](limits.md#stopping-find)).
  The same deny in a repository's settings was measured on Claude Code
  2.1.293. In managed settings: not checked.
- **An organization can keep the plugin's module from loading**, with
  `allowManagedModsOnly`, or turn hooks off with `disableAllHooks` or
  `allowManagedHooksOnly`: then nothing is moved out and a compaction is
  Claude Code's own ([function hooks](limits.md#function-hooks)). Not
  checked.
- **An organization can keep the plugin from being installed or enabled**,
  with `strictKnownMarketplaces` or `blockedMarketplaces`, or
  `enabledPlugins` in managed settings. Not checked.
- **An organization can set the plugin's options for everyone**, with
  `pluginConfigs` in managed settings: no key, or a `storeDir`. Not checked.
- **An organization can pin a version of the plugin.** Claude Code's
  settings name no key for a plugin's version (read on 2026-10-27); the
  marketplace points at a release's tag and commit
  ([updating](usage.md#updating)). Not checked.

## Recommended on a work machine

- Leave `find` without a key unless the provider is one your organization
  accepts; with a key, deny `find` where it should not send
  ([stopping `find`](limits.md#stopping-find)).
- Set the key and `storeDir` in your user settings, where a repository does
  not reach ([settings](usage.md#settings)).
- Keep `storeDir` on a local disk, not a synced or network drive, and leave
  the store out of backups others can read.
- A shorter `cleanupPeriodDays` in Claude Code keeps results for less long
  ([how long](limits.md#how-long-results-are-kept)).
- Run `/lossless-status` once in a work repository: it says whether `find`
  asks Jev, where its key came from, and where it is denied.

## Seeing and removing what was kept

- `/lossless-store` says where results are kept and how much;
  `/lossless-store check` names what is not whole
  ([the files](limits.md#the-files)).
- `/lossless-list` lists what left this conversation, and `/lossless-show`
  names the file one is kept in, on the screen alone
  ([using it](usage.md#using-it)).
- The plugin keeps no record of what `find` sent. Each call of `find`, with
  its question, stands in Claude Code's transcript as any tool call does;
  what goes with it is what [Usage](usage.md) lists.
- To remove all of it, and the key:
  [removing what it kept](../PRIVACY.md#removing-what-it-kept).

## Reporting a vulnerability

Report it privately, through the repository's Security tab ("Report a
vulnerability") where GitHub offers it. Where it does not, open
[an issue](https://github.com/yottayoshida/lossless-compaction/issues) that
says you have one to report, without its details, and ask for a way to send
them.
