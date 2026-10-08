// What a release changed that a person on the defaults would not see coming: said once, in the first session a person
// is at after the plugin's version went up (#139). Only a release that changed a default or what a setting means has a
// line, and the line is said only where it changes what this setup does. Each line names the release it came with, so
// that it is true whichever version the person came from, one before this record was kept among them.
//
// The version last told is kept in the plugin's own store. A session nobody is at (`claude -p`, the SDK) tells nothing
// and moves nothing on, so that a script run first after an update does not use the line up; a new install is recorded
// in any session, so that a store it makes there is not taken later for one an older version made. Where the record
// already holds this version, nothing else is read: every session starts this way but the first after an update.

import { choosesProvider, filled } from './ask.ts';
import { configFrom } from './flow.ts';
import { sendTaints, type Seen, type Taint } from './trust.ts';

/** Under this key, in the plugin's own store: the version the last person was told of. */
export const TOLD_KEY = 'versionTold';

/**
 * What a line is decided on: the settings in use, and whether TypeSafe's variable holds a key 0.7.1 would have sent:
 * there, of characters a key can have, and with nothing a repository's settings put there deciding where `find` sends.
 */
export type Setup = { options: Readonly<Record<string, unknown>>; keysIn: { TYPESAFE_API_KEY: boolean } };

/** The setup from the settings, the environment and what the repository's settings hold (null: they could not be read). */
export function setupFrom(options: Seen['options'], env: Seen['env'], taints: readonly Taint[] | null): Setup {
  const key = filled(env.TYPESAFE_API_KEY);
  const sendable = key !== undefined && /^[\x21-\x7e]+$/.test(key) && taints !== null && sendTaints(taints, options).length === 0;
  return { options, keysIn: { TYPESAFE_API_KEY: sendable } };
}

export type Change = { version: string; line: string; applies: (setup: Setup) => boolean };

const CONFIGURE = '/plugin configure lossless-compaction@lossless-compaction';

/** Oldest first. A version not released yet is the one the CHANGELOG's Unreleased section is to become. */
export const CHANGES: readonly Change[] = [
  {
    version: '0.7.1',
    line: `since 0.7.1 targetPercent is 1 by default (it was 40), so everything that may leave moves out at each compaction; set it to 40 with ${CONFIGURE} for the old behaviour`,
    // Claude Code hands the default over as if set: at it, the person is on the default.
    applies: ({ options }) => configFrom(options).targetPercent === configFrom({}).targetPercent,
  },
  {
    version: '0.8.0',
    line: `since 0.8.0 TYPESAFE_API_KEY in the environment is used only once provider is set to typesafe, so find looks on this machine and sends nothing; set provider to typesafe with ${CONFIGURE} to have it send as before`,
    // Sent by 0.7.1 and not by this one (#103, ADR 0028): no key of the plugin's own, provider left on auto with no
    // account id, and a key in TypeSafe's variable that 0.7.1 sent. A key of its own is sent as before; Cloudflare's
    // variable alone was never read on auto; one a repository's settings put there was refused then as now.
    applies: ({ options, keysIn }) => filled(options['apiKey']) === undefined && !choosesProvider(options) && keysIn.TYPESAFE_API_KEY,
  },
];

/**
 * The default each setting had when the last line was written. A test holds them to the defaults in use and in
 * `.claude-plugin/plugin.json`: one changed without a line here fails it until a line is written, or it is said why
 * none is needed, and these are set anew. A change of what a setting means has nothing to hold it to.
 */
export const DEFAULTS_TOLD = { targetPercent: 1, keepTokens: 20_000, minChars: 2000, maxAfterPercent: 75, provider: 'auto', model: 'jev-latest' } as const;

const VERSION_SHAPE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Below 0 when `a` is the older, 0 when they are the same, above 0 when `a` is the newer. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [VERSION_SHAPE.exec(a), VERSION_SHAPE.exec(b)];
  if (x === null || y === null) throw new Error(`not a version: ${x === null ? a : b}`);
  for (let at = 1; at <= 3; at++) {
    const d = Number(x[at]) - Number(y[at]);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Where the record is read and written; whether a place results were kept in is there (null: no place can be
 * trusted, and nothing is decided); and the setup. The last two are asked for only where they decide something.
 */
export type Told = {
  read: () => Promise<unknown>;
  write: (version: string) => Promise<void>;
  used: () => Promise<boolean | null>;
  setup: () => Promise<Setup>;
};

/** What the start of a session says, oldest release first. */
export async function changesToTell(record: Told, now: string, interactive: boolean, changes: readonly Change[] = CHANGES): Promise<string[]> {
  const read = await record.read();
  const last = typeof read === 'string' && VERSION_SHAPE.test(read) ? read : undefined;
  if (last !== undefined && compareVersions(last, now) >= 0) {
    // The same, or gone back to an older one: nothing is said, and going up again is said from here.
    if (last !== now) await record.write(now);
    return [];
  }
  if (last === undefined) {
    // No record: a new install, where no place results were kept in is there; else a version that kept none ran before.
    const used = await record.used();
    if (used === null) return [];
    if (!used) {
      await record.write(now);
      return [];
    }
  }
  if (!interactive) return [];
  const setup = await record.setup();
  const lines = changes
    .filter((change) => compareVersions(change.version, now) <= 0 && (last === undefined || compareVersions(change.version, last) > 0))
    .filter((change) => change.applies(setup))
    .map((change) => `version ${now}: ${change.line}`);
  // Moved on once it is said, or found to be nothing to say: the next session says nothing.
  await record.write(now);
  return lines;
}

/** The notice over the lines, short enough to be read in the seconds it shows (#141). */
export const changesNotice = (now: string, count: number): string => `version ${now}: ${count === 1 ? 'a change' : `${count} changes`} that may affect you, in the transcript`;
