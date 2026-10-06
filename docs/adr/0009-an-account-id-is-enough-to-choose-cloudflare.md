# 0009. An account id is enough to choose Cloudflare

- Status: Accepted
- Date: 2026-10-01

## Context

`find` sends its key to one of two providers. Which one was decided by the
`provider` setting alone, a free-text field whose default was `typesafe`. The
key is one field for both.

On 2026-10-01 a user set the plugin up for Cloudflare Workers AI through
`/plugin configure`: the key and the account id were entered, and the
`provider` field, which showed `typesafe` already filled in, was passed over.
The settings file then held `cloudflareAccountId` and no `provider`, and the
Cloudflare key was set to go to TypeSafe. Nothing said so: `find` was
registered, and would have failed on its first call after sending the key to
the wrong party. It was caught before that call.

Measured on Claude Code 2.1.286 with a probe plugin:

- A field with a default reaches the plugin with the default filled in when
  the settings hold nothing for it. "Not set" and "set to `typesafe`" cannot
  be told apart while the default is `typesafe`.
- A field that declares `options` must have a default among them, or the
  manifest is refused and the plugin does not load. A stored value outside
  the options silently becomes the default.
- A field with no default and no options reaches the plugin as an empty
  string.

## Decision

1. The default of `provider` is `auto`. The field stays free text; the three
   values are `auto`, `typesafe` and `cloudflare`, and anything else is
   refused as before.
2. With `auto`, an account id in the plugin's settings chooses Cloudflare and
   none chooses TypeSafe. "In the settings" means not blank: an id that is
   there and is not 32 hexadecimal characters, or is not text at all in a
   settings file written by hand, is refused and nothing is sent, since
   reading it as absent would send a Cloudflare key to TypeSafe.
3. With `typesafe`, an account id in the settings is a contradiction: nothing
   is sent, and the message names both fields and what to change.
4. Only the settings' account id decides or refuses here.
   `CLOUDFLARE_ACCOUNT_ID` in the environment does neither: it is commonly
   there for other tools, and it must not start sending a conversation's
   excerpts on its own, nor does this decision stop a TypeSafe user over it.
   (One that a repository's settings file put there still stops `find` when
   the key comes from the environment, as before: ADR 0005.) Using Cloudflare
   from the environment alone still takes `provider: cloudflare`.
5. A key still goes to its own provider only: with Cloudflare chosen by the
   account id and only `TYPESAFE_API_KEY` around, nothing is sent.

## Alternatives Considered

- **Say it in the README only.** The shape that sends a key to the wrong
  party when one field is skipped stays.
- **Refuse `typesafe` with an account id, default unchanged.** Everyone who
  skipped the field is then stopped: caught, but at the same place.
- **Make `provider` a picker (`options`).** A value outside the options
  silently becomes the default, so a hand-written `cloudflar`, refused today,
  would become `auto` without a word, and ` cloudflare ` with spaces around
  it, accepted today, would stop meaning Cloudflare.
- **Remove the field.** Settings that already hold it would still have to be
  read, and the environment-only way to Cloudflare would have no switch.

## Consequences

- Entering the account id next to the key is all Cloudflare takes.
- Settings that hold `provider: cloudflare`, and TypeSafe users who set no
  provider and no account id, behave as before. (Amended by ADR 0028: those
  whose key is in the environment set `provider` to `typesafe`.)
- A TypeSafe key entered together with an account id goes to Cloudflare under
  `auto`. That includes settings from before this decision that hold a
  TypeSafe key, an account id and no `provider`: they asked TypeSafe, and
  after the update the key and the excerpts go to Cloudflare, with nothing
  said. Those settings cannot be told from the ones this decision is for. The
  account id field says that an id there sends the key to Cloudflare, and the
  changelog names the case.
- Someone whose settings hold an account id while their only key is
  `TYPESAFE_API_KEY` in the environment has no `find` any more, and is not
  told: no key for the chosen provider registers no tool, as before.
- An account id written in a repository's settings file is outside this: such
  values do not reach the plugin (ADR 0005), and the key is to be set in the
  user's own settings.
