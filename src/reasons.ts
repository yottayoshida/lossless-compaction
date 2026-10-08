// Why a compaction went to Claude Code's own summary in place of the plugin's: the line that says so is
// `built-in compaction: <why>`, and every why it can hold, whole or as a part of another, is made here (#140).
//
// docs/troubleshooting.md has an entry for each, under its own words, and test/troubleshooting.test.ts holds the two
// together: a reason added here without an entry there fails it. A reason cannot be added elsewhere, since `Why` is
// made by these functions alone, and the line's opening is written here alone. This module reads no other, so that
// any module can read it.

declare const made: unique symbol;

/** A reason a compaction went to the built-in summary, or a part of one: made by `WHY` alone. */
export type Why = string & { readonly [made]: true };

const why = (text: string): Why => text as Why;

/** Each reason, by name; what changes from one time to the next is an argument. */
export const WHY = {
  // Where results are kept: the place is decided in hooks/move-out.ts, `storeOf`.
  decidedByRepository: (values: string) => why(`where results are kept would be decided by the repository (${values}); set storeDir in your user settings`),
  settingsUnread: () => why("the repository's settings files could not be read, so no value is known to be yours"),
  notAbsolute: () => why('the place to keep results in is not an absolute path; set storeDir to one'),

  // The place made readable by you alone, before anything is written (src/private.ts).
  notPrivate: (inner: Why) => why(`the place results are kept in cannot be made private: ${inner}`),
  link: (dir: string) => why(`${dir} is a symbolic link`),
  notDirectory: (dir: string) => why(`${dir} is not a directory`),
  noMkdir: () => why('no mkdir could be run to make it'),
  notMade: (dir: string) => why(`${dir} could not be made`),
  noChmod: () => why('no chmod could be run to make it readable by you alone'),
  notYours: (dir: string) => why(`${dir} could not be made readable by you alone (not yours?)`),
  changedMeanwhile: (dir: string) => why(`${dir} changed while it was being made private`),

  // A conversation that cannot be rebuilt (src/select.ts, src/media.ts).
  unreadBlocks: () => why('the conversation could not be read with its blocks'),
  tooManyMessages: (shown: number) => why(`the conversation has ${shown} messages or more, and older ones may not have been shown`),
  cannotCarry: (what: Why) => why(`the conversation holds what a rebuilt message cannot carry: ${what}`),
  /** The kinds of block a rebuilt message cannot carry: as Claude Code names them (`image`, `document`), else the two below. */
  kinds: (names: readonly string[]) => why(names.join(', ')),
  blockWithoutKind: () => why('a block without a kind'),
  unusualKind: () => why('a kind with an unusual name'),
  imageNotInList: () => why('an image in a tool result that is not a list of blocks'),
  imageWithoutCall: () => why('an image in a tool result without the id of its call'),
  imageBesideOther: () => why('an image in a tool result next to a block that is not text'),
  imageNotBytes: () => why('an image that is not held as its bytes'),
  imageOfAnotherKind: () => why('an image of a kind that is not kept'),

  // A result that holds an image, moved out before anything else (src/compact.ts).
  imageNotShown: () => why('a tool result that holds an image is not among the messages shown'),
  imageNotMoved: (stored: string) => why(`a tool result that holds an image could not be moved out: ${stored}`),

  // What Claude Code attached as it sent the messages (#105).
  attachedNotKept: (detail: string) => why(`what Claude Code attached to the messages could not be kept: ${detail}`),

  // Nothing could be moved out, and too much is in use (src/flow.ts).
  nothingMoved: (report: string) => why(`nothing could be moved out: ${report}`),

  // What threw while the compaction was tried: said with the words it threw, which no entry can hold.
  failed: (message: string) => why(`moving out failed: ${message}`),
} as const;

/** The line said when the built-in summary runs in place of the plugin's compaction. */
export const builtInLine = (reason: Why): string => `built-in compaction: ${reason}`;
