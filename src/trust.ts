// What a repository's own settings may not decide: where moved-out results are
// written, and where `find` sends what it sends (ADR 0005).
//
// A repository you open brings `.claude/settings.json` and can bring
// `.claude/settings.local.json`. Claude Code puts the `env` of both into the
// process, and a value there that reaches this plugin is the repository's
// choice. Measured on Claude Code 2.1.286: `HOME`, `USERPROFILE` and
// `CLAUDE_CONFIG_DIR` from those files did not reach it, nor did their
// `pluginConfigs`; a key variable and `HTTPS_PROXY` did. So a value counts as
// the repository's only when one of those files holds it and the plugin sees
// that same value, and it stops something only where it would be used.
// Certificate variables are judged too: whether the host's requests read
// them was not measured.

import { filled } from './ask.ts';
import { PLUGIN } from './store.ts';

/** The settings files a repository can bring, as Claude Code names them. */
export type RepoSource = 'project' | 'local';

const FILE: Record<RepoSource, string> = { project: '.claude/settings.json', local: '.claude/settings.local.json' };

/** The variables the default place is built from. */
export const PLACE_VARIABLES = ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR'] as const;
/** The variables a key and a Cloudflare account are read from, when the plugin's settings hold no key and choose the provider (ask.ts). */
export const KEY_VARIABLES = ['TYPESAFE_API_KEY', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'] as const;
/** The variables that change where a request goes, or which certificate it trusts, while the process runs. */
export const ROUTE_VARIABLES = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
] as const;
/** The plugin's own settings that decide where results are written, and where `find` sends. */
const PLACE_OPTIONS = ['storeDir'] as const;
const SEND_OPTIONS = ['apiKey', 'provider', 'cloudflareAccountId', 'model'] as const;

export type Variable = (typeof PLACE_VARIABLES)[number] | (typeof KEY_VARIABLES)[number] | (typeof ROUTE_VARIABLES)[number];

/** One value the plugin sees that a repository's settings file holds. */
export type Taint = { kind: 'env' | 'option'; name: string; source: RepoSource };

/** What the plugin sees: the environment, by the names above, and its settings as Claude Code hands them over. */
export type Seen = { env: Partial<Record<Variable, string | undefined>>; options: Readonly<Record<string, unknown>> };

/** The two files, and the user's own to tell them apart from, as `$.settings.read({ source })` returns them; null when they could not be read. */
export type RepoSettings = Partial<Record<RepoSource | 'user', unknown>> | null;

const objectAt = (value: unknown, key: string): Record<string, unknown> | undefined => {
  const inner = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
  return typeof inner === 'object' && inner !== null && !Array.isArray(inner) ? (inner as Record<string, unknown>) : undefined;
};

/** A settings file may write a variable as a number or a boolean; Claude Code hands it over as text. */
const asText = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;

/** The options a file holds for this plugin, under any id Claude Code gives it (`lossless-compaction@…`, or the name alone). */
function optionsIn(file: unknown): Record<string, unknown>[] {
  const configs = objectAt(file, 'pluginConfigs');
  if (!configs) return [];
  return Object.entries(configs)
    .filter(([id]) => id === PLUGIN || id.startsWith(`${PLUGIN}@`))
    .map(([, config]) => objectAt(config, 'options'))
    .filter((options): options is Record<string, unknown> => options !== undefined);
}

/**
 * Every value the plugin sees that a repository's settings file holds. Null
 * when the files could not be read: then nothing tells the repository's values
 * from yours, and the callers treat every value as the repository's.
 */
export function taintsFrom(repo: RepoSettings, seen: Seen): Taint[] | null {
  if (repo === null) return null;
  const taints: Taint[] = [];
  for (const source of ['project', 'local'] as const) {
    const file = repo[source];
    // Started in your home directory, the project file is ~/.claude/settings.json: yours, not a repository's.
    if (source === 'project' && repo.user !== undefined && JSON.stringify(file) === JSON.stringify(repo.user)) continue;
    const env = objectAt(file, 'env') ?? {};
    for (const name of [...PLACE_VARIABLES, ...KEY_VARIABLES, ...ROUTE_VARIABLES]) {
      const value = asText(env[name]);
      if (value !== undefined && value !== '' && seen.env[name] === value) taints.push({ kind: 'env', name, source });
    }
    for (const options of optionsIn(file)) {
      for (const name of [...PLACE_OPTIONS, ...SEND_OPTIONS]) {
        const value = options[name];
        if (filled(value) !== undefined && seen.options[name] === value) taints.push({ kind: 'option', name, source });
      }
    }
  }
  return taints;
}

const has = (taints: readonly Taint[], kind: Taint['kind'], names: readonly string[]) =>
  taints.filter((taint) => taint.kind === kind && names.includes(taint.name));

/**
 * The repository's values of the variables a default place is built from, whatever `storeDir` is: where they are set,
 * the defaults are not read beside a `storeDir` of your own (#116).
 */
export function variableTaints(taints: readonly Taint[]): Taint[] {
  return has(taints, 'env', PLACE_VARIABLES);
}

/** The repository's values that would decide where results are written. */
export function placeTaints(taints: readonly Taint[], options: Seen['options']): Taint[] {
  const setting = has(taints, 'option', PLACE_OPTIONS);
  if (setting.length > 0) return setting;
  // A storeDir of your own is used as it is; the variables then build nothing.
  if (filled(options['storeDir']) !== undefined) return [];
  return has(taints, 'env', PLACE_VARIABLES);
}

/** The repository's values that would decide where `find` sends, or with what key. */
export function sendTaints(taints: readonly Taint[], options: Seen['options']): Taint[] {
  const found = [...has(taints, 'option', SEND_OPTIONS), ...has(taints, 'env', ROUTE_VARIABLES)];
  // A key of your own is sent with an account of your own; the key variables then decide nothing (ask.ts). Without one, they
  // count only once ask.ts found a key in them, which takes the settings to choose the provider: this is asked only then.
  if (filled(options['apiKey']) === undefined) found.push(...has(taints, 'env', KEY_VARIABLES));
  return found;
}

/** Names the values and the files they came from, for the line that says why something was not done. */
export function describeTaints(taints: readonly Taint[] | null): string {
  if (taints === null) return "the repository's settings files could not be read, so no value is known to be yours";
  return taints.map((taint) => `${taint.kind === 'env' ? `env.${taint.name}` : taint.name} from ${FILE[taint.source]}`).join(', ');
}
