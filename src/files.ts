// The part of a host's file system and command runner the store is written against. Nothing here is of Claude Code:
// src/blobs.ts and src/layout.ts, which keep and read back what is stored, know a host by these types alone.

export type FileStat = {
  kind: 'file' | 'dir' | 'other';
  size: number;
  isLink?: boolean;
};

/** The part of the host's file system the store uses. Text is UTF-8. */
export type Files = {
  read(path: string): Promise<string>;
  /** Writes in place: a write that fails can leave the file cut short (measured, ADR 0008). */
  write(path: string, text: string): Promise<void>;
  /** Rejects when nothing is at the path. */
  stat(path: string): Promise<FileStat>;
  /** Moving a file into place in one step, where the host can (ADR 0008). Absent, files are written in place. */
  move?: Mover;
};

export type Mover = {
  /** Whether a move can be made at all on this host; asked once before each write. */
  available(): Promise<boolean>;
  /** Puts `from` at `to` in one step, over what is there. False when it did not end with a file at `to`. */
  rename(from: string, to: string): Promise<boolean>;
  /** Removes a file, as far as it can; what it cannot remove stays. */
  remove(path: string): Promise<void>;
  /** Makes a directory and those above it, as far as it can: a move makes none. */
  makeDir(path: string): Promise<void>;
};

/** One entry of a directory, as it stands: a link is not followed. */
/** One entry of a directory, as the host lists it; `size` is in bytes, absent where a caller made the entry up without one. */
export type DirEntry = { name: string; kind: 'file' | 'dir' | 'other'; mtimeMs: number; isLink: boolean; size?: number };

/** Runs a command by its argument vector, no shell; rejects when it cannot be started or runs past `timeoutMs`. */
export type Exec = (
  argv: readonly string[],
  timeoutMs: number,
) => Promise<{ exitCode: number; stdout: string; truncated: boolean }>;
