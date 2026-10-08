// Where a PreCompact hook is set that a compaction the plugin makes keeps from running (#126, ADR 0043).
//
// Claude Code runs PreCompact hooks inside its own summary. When the plugin answers a compaction itself, moving
// results out, folding or cutting, the summary does not run and neither do they: a hook that copies the transcript
// first, writes notes, or holds automatic compactions back stops running once the plugin is installed. Measured on
// Claude Code 2.1.293 with a hook in a project's settings: none ran where the plugin compacted, by hand or
// automatically, and one ran where it handed the conversation to the summary; PostCompact, and SessionStart with the
// matcher `compact`, ran after either. The plugin cannot run them itself, nor read another plugin's: it names the
// settings files that hold one, once a session.

/** The settings sources `$.settings.read({ source })` reads, lowest precedence first. */
export const SETTINGS_SOURCES = ['user', 'project', 'local', 'flag', 'policy'] as const;
export type SettingsSource = (typeof SETTINGS_SOURCES)[number];

/** Each source as a person knows it: the user file is where CLAUDE_CONFIG_DIR says, so it is not named by a path. */
export const SOURCE_NAMES: Record<SettingsSource, string> = {
  user: 'your user settings',
  project: '.claude/settings.json',
  local: '.claude/settings.local.json',
  flag: '--settings',
  policy: 'managed settings',
};

/** The trigger a PreCompact matcher of exactly this name leaves out, for a compaction of `trigger`. */
const OTHER: Record<string, string> = { manual: 'auto', auto: 'manual' };

/**
 * The sources that hold a PreCompact hook, in `read`, each named once. A group whose matcher is exactly the other
 * trigger's name is left out; any other matcher counts, a pattern among them, so that a hook is named rather than
 * missed. A source is named only for a group no source before it holds, word for word: the project file of a session
 * in your home directory is your user file, and a source a Claude Code reads as the merge holds the groups of the
 * others; each is named once, as the first. A source that could not be read is absent from `read` and names nothing.
 */
export function preCompactHooksIn(read: Partial<Record<SettingsSource, unknown>>, trigger: string): string[] {
  const named: string[] = [];
  const seen = new Set<string>();
  for (const source of SETTINGS_SOURCES) {
    const groups = preCompactOf(read[source]).filter((group) => hasHook(group) && !(typeof group['matcher'] === 'string' && group['matcher'] === OTHER[trigger]));
    const unseen = groups.map((group) => JSON.stringify(group)).filter((group) => !seen.has(group));
    for (const group of unseen) seen.add(group);
    if (unseen.length > 0) named.push(SOURCE_NAMES[source]);
  }
  return named;
}

/** The line said once a session where PreCompact hooks are set in `where`. */
export function unrunLine(where: readonly string[]): string {
  return `your PreCompact hooks did not run: Claude Code runs them only before its own summary, which this compaction did not use (${where.join(', ')}). SessionStart with the matcher compact runs after either: docs/limits.md, "Other hooks at a compaction"`;
}

/** The notice of the same, short enough that a notice cut at the width of the screen still shows where (#141). */
export function unrunNotice(where: readonly string[]): string {
  return `your PreCompact hooks did not run (${where.join(', ')})`;
}

function preCompactOf(file: unknown): Record<string, unknown>[] {
  const hooks = typeof file === 'object' && file !== null ? (file as Record<string, unknown>)['hooks'] : undefined;
  const groups = typeof hooks === 'object' && hooks !== null ? (hooks as Record<string, unknown>)['PreCompact'] : undefined;
  return Array.isArray(groups) ? groups.filter((group): group is Record<string, unknown> => typeof group === 'object' && group !== null && !Array.isArray(group)) : [];
}

const hasHook = (group: Record<string, unknown>): boolean => Array.isArray(group['hooks']) && group['hooks'].length > 0;
