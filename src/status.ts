// What `/lossless-status` says (#108): that the plugin runs in this session,
// its version and Claude Code's, the value each number setting is used at
// and, where that is not what was set, what was set, whether the others are
// set, whether `find` was registered, and how many tickets the conversation
// holds. It is told what the hook found and opens nothing: no stored result,
// no index entry. Of the settings it prints the numbers, and `provider` where
// it is one of its three values, and of the others only whether they are set,
// so that a key, or one pasted in the wrong field, is not printed; of the
// environment it is told only which key variables are there.

import { choosesProvider, filled, type Provider } from './ask.ts';
import { CUT_AT } from './cut.ts';
import { configFrom } from './flow.ts';
import { HOST_SHOWS } from './select.ts';
import { ticketIds } from './lifetime.ts';
import type { Message } from './types.ts';

/** The plugin's version, as `.claude-plugin/plugin.json` gives it; a test holds the two together. */
export const VERSION = '0.7.1';

/**
 * What became of `find` at the start of a session: registered, asking which provider; registered with no key, looking
 * on this machine alone, and why there is none (#110); or not, and why.
 */
export type Find = { registered: true; kind: Provider['kind'] } | { registered: true; local: true; why: string } | { registered: false; why: string };

/** Why `find` is not there when the settings gave a key and Claude Code did not take the tool: what it said was said at the start. */
export const NOT_TAKEN = 'Claude Code did not take it, as a line at the start of the session said';

/** What the lookup for `find`'s key came to, as `find` would be registered from it. Undefined: the lookup failed. */
export function findFrom(provider: Provider | null | { error: string } | undefined): Find {
  if (provider === undefined) return { registered: true, local: true, why: 'looking for its key failed' };
  if (provider === null) return { registered: true, local: true, why: 'no key' };
  if ('error' in provider) return { registered: false, why: provider.error };
  return { registered: true, kind: provider.kind };
}

export type StatusInput = {
  /** Claude Code's version, null where it could not be read. */
  claudeCode: string | null;
  /** The plugin's settings as Claude Code hands them over. */
  options: Readonly<Record<string, unknown>>;
  /** What the start of this session registered; undefined where this process holds no record of it. */
  atStart: Find | undefined;
  /** What the settings give now. */
  now: Find;
  /** Which key variables hold something: never their values. */
  keysIn: { TYPESAFE_API_KEY: boolean; CLOUDFLARE_API_TOKEN: boolean };
  messages: readonly Message[];
};

const NUMBERS = ['targetPercent', 'keepTokens', 'minChars', 'maxAfterPercent'] as const;
const PROVIDERS = ['auto', 'typesafe', 'cloudflare'];
const NAMED: Record<Provider['kind'], string> = { typesafe: 'TypeSafe', cloudflare: 'Cloudflare Workers AI' };

/** A value set for a number, shown only where it is one: a key pasted in the wrong field is not printed. */
function shown(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string' && /^[0-9.eE+-]{1,16}$/.test(value)) return JSON.stringify(value);
  return 'a value that is not a number';
}

/** Each number setting with the value it is used at, and what was set where that differs. */
function numbersLine(options: StatusInput['options']): string {
  const used = configFrom(options);
  const fallback = configFrom({});
  const each = NUMBERS.map((name) => {
    const set = options[name];
    if (set === used[name]) return `${name} ${used[name]} (${used[name] === fallback[name] ? 'the default' : 'set'})`;
    if (set === undefined) return `${name} ${used[name]} (the default)`;
    return `${name} ${used[name]} (set to ${shown(set)}; ${used[name]} is used)`;
  });
  return `settings in use: ${each.join(', ')}`;
}

/** `find`'s settings, none of them by value but `provider` when it is one of the three. */
function findSettingsLine(options: StatusInput['options']): string {
  const provider = filled(options['provider']) ?? 'auto';
  const model = filled(options['model']);
  return (
    `find's settings: provider ${PROVIDERS.includes(provider) ? provider : 'set to a value that is not auto, typesafe or cloudflare'}, ` +
    `model ${model === undefined || model === 'jev-latest' ? 'the default' : 'set'}, ` +
    `apiKey ${filled(options['apiKey']) === undefined ? 'not set' : 'set'}, ` +
    `cloudflareAccountId ${filled(options['cloudflareAccountId']) === undefined ? 'none' : 'entered'}`
  );
}

/** Where a registered `find`'s key came from: the settings, or the variable of its provider. */
function keyFrom(kind: Provider['kind'], options: StatusInput['options']): string {
  if (filled(options['apiKey']) !== undefined) return 'key from your settings';
  return `key from the environment (${kind === 'typesafe' ? 'TYPESAFE_API_KEY' : 'CLOUDFLARE_API_TOKEN'})`;
}

/** Said where there is no key: a variable in the environment that the settings do not let be used (ADR 0028). */
function unusedKey(input: StatusInput): string {
  if (choosesProvider(input.options)) return '';
  // Unless a repository's settings put it there: then it is not used either (ADR 0005).
  const unless = ", unless a repository's settings put it there";
  if (input.keysIn.TYPESAFE_API_KEY) return `; TYPESAFE_API_KEY is in the environment, and is used once provider is set to typesafe${unless}`;
  if (input.keysIn.CLOUDFLARE_API_TOKEN) return `; CLOUDFLARE_API_TOKEN is in the environment, and is used once a Cloudflare account id is entered${unless}`;
  return '';
}

function findText(find: Find, input: StatusInput): string {
  if (find.registered && 'local' in find) return `looks on this machine and sends nothing (${find.why}${find.why === 'no key' ? unusedKey(input) : ''})`;
  if (find.registered) return `asks ${NAMED[find.kind]}, ${keyFrom(find.kind, input.options)}`;
  return find.why;
}

const wouldBe = (now: Find) => `with the settings now it would ${now.registered ? 'be registered' : 'not be'}`;
const same = (one: Find, other: Find) => JSON.stringify(one) === JSON.stringify(other);

/**
 * What the start of the session registered, and what the settings give now where that differs, as when a
 * repository's settings file changed since: the tool stays as it was registered. Not where Claude Code did not take
 * the tool, which the settings cannot tell. With no record of the start, as after the plugin was loaded again for a
 * change of its own settings and before a start registered anew, what they give now, said as that.
 */
function findLine(input: StatusInput): string {
  const { atStart, now } = input;
  if (atStart === undefined) return `find: not known for this session; ${wouldBe(now)}: ${findText(now, input)}`;
  const then = `find: ${atStart.registered ? 'registered in this session' : 'not registered in this session'}: ${findText(atStart, input)}`;
  const notTaken = !atStart.registered && atStart.why === NOT_TAKEN && now.registered;
  return same(atStart, now) || notTaken ? then : `${then}; ${wouldBe(now)}: ${findText(now, input)}`;
}

/** What `/lossless-status` answers. Claude Code puts the plugin's name in front of it, so it does not. */
export function statusReport(input: StatusInput): string {
  const lines = [
    `version ${VERSION} on Claude Code ${input.claudeCode ?? '(version not known)'}: running in this session`,
    findLine(input),
    numbersLine(input.options),
    findSettingsLine(input.options),
  ];
  if (input.options['keepNewest'] !== undefined) lines.push('keepNewest is set and no longer used: keepTokens is used instead');
  lines.push(`storeDir: ${filled(input.options['storeDir']) === undefined ? 'the default' : 'set'}; /lossless-store says where results are kept and how much, or why none can be`);
  // Told by their shape: of results, inputs, parts, folded calls and the middles of messages, each id once.
  const held = ticketIds(input.messages).size;
  // How near the conversation is to what Claude Code hands a plugin: cut for its length from CUT_AT on (ADR 0034).
  lines.push(
    `this conversation: ${held} ${held === 1 ? 'ticket' : 'tickets'} of what was moved out, in ${input.messages.length} of the ${HOST_SHOWS} entries Claude Code hands a plugin` +
      (input.messages.length >= CUT_AT ? '; a compaction without instructions cuts it for its length where it can' : ''),
  );
  return lines.join('\n');
}
