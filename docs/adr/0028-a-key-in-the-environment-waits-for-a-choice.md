# 0028. A key in the environment waits for a choice

- Status: Accepted
- Date: 2026-10-06
- Amends [0001](0001-move-out-and-order.md), decision 12, and a consequence
  of [0009](0009-an-account-id-is-enough-to-choose-cloudflare.md)

## Context

`find` sends excerpts of a conversation to the Jev provider it is set up for.
ADR 0001, decision 12, reads the key from the plugin's settings first and
from the environment when none is set there (`TYPESAFE_API_KEY`, or
`CLOUDFLARE_API_TOKEN` once Cloudflare is chosen), so that the steps people
follow for fast-jev-compaction keep working.

The `provider` field arrives as `auto` whether or not it was touched (ADR
0009), and `auto` with no account id chooses TypeSafe. So a
`TYPESAFE_API_KEY` exported for another tool was enough for `find` to be
registered and to send excerpts at its first call, with nothing in the
plugin's settings and nothing said (#103). Someone who installs the plugin
and never opens its settings meets neither PRIVACY.md's note nor the key's
description.

ADR 0009, decision 4, already keeps `CLOUDFLARE_ACCOUNT_ID` from choosing
anything, because it "is commonly there for other tools, and it must not
start sending a conversation's excerpts on its own". A key variable kept for
another tool is in the same place.

## Decision

1. A key in the environment is used only where the plugin's own settings
   choose the provider: `provider` set to `typesafe` or `cloudflare`, or a
   Cloudflare account id entered. Left on `auto` with no account id, only a
   key in the plugin's settings is used, and nothing is sent without one.
2. Which variable is read once a provider is chosen is as before:
   `TYPESAFE_API_KEY` for TypeSafe, `CLOUDFLARE_API_TOKEN` for Cloudflare,
   and `CLOUDFLARE_ACCOUNT_ID` only with `provider: cloudflare` and the key
   from the environment (ADR 0009). A repository's settings still decide
   none of it (ADR 0005).
3. A key in the environment that is not used is not said at the start of a
   session: that would be said in every session of someone who keeps the key
   for another tool. Where `find` is and why it is not are for a command that
   says the plugin's state when asked (#108).

## Alternatives Considered

- **Keep the fallback, and say at the start of each session that `find` is
  on, which provider it asks and where the key came from.** The excerpts
  would still go at the first call: it tells, and does not ask.
- **A setting, `keyFromEnvironment`, off by default.** It stops sending the
  same way, with one more field in `/plugin configure` to find and explain;
  choosing the provider already says the same.
- **No key from the environment at all.** Rejected again for the reason
  0001 gives: setting `provider` is one step for those who keep the key
  there, where reading none would take moving the key into the settings.

## Consequences

- Someone whose only key is `TYPESAFE_API_KEY` in the environment, with
  `provider` left on `auto`, has no `find` after updating, and is not told at
  the start of a session. The changelog says how to have it again: set
  `provider` to `typesafe`. (Amended by #139: the first session a person is
  at after the update that brought this says it once, where 0.7.1 sent that
  key; decision 3 stands for every session after.)
- The benchmark is unchanged: it sets `provider` and hands the key over in
  the environment.
- #103 asked for a test that the start-up line names the environment as the
  key's source. That was for the first alternative; with this decision the
  source is to be said by the command #108 asks for, when asked.
