// What the store keeps and gives back: a text under the SHA-256 of itself, written, read back and compared before
// it counts as stored, and checked against its name again before it is handed over. Nothing here is of Claude Code:
// no tool's name, no place of its configuration, no shape of a conversation (test/layers.test.ts). The lines that stand
// for what is stored, and where a store is, are src/store.ts.

import { blobPath, blobsDir, entryPath, indexDir, tmpDir } from './layout.ts';
import { decodeMedia, textOf, type MediaPart } from './encoded.ts';
import type { Files } from './files.ts';

/** The most one text may come to: the host this was written for refuses a read or write over 4 MiB, and this stays under it with room to spare. */
export const MAX_BYTES = 4 * 1024 * 1024 - 4096;

export const ID = /^[0-9a-f]{64}$/;
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
/** What was stored: its size in bytes, and the id it is stored under. */
export type Stored = { bytes: number; id: string };

export type NotMoved = {
  reason: 'tool-name' | 'too-large' | 'symlink' | 'not-a-file' | 'differs' | 'write-failed';
  /** For a failed write, what the host said: an error code such as ENOSPC where it gave one. */
  code?: string;
};

const UTF8 = new TextEncoder();

export function bytesOf(text: string): number {
  return UTF8.encode(text).length;
}

export async function idOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', UTF8.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type Found = 'missing' | 'file' | 'symlink' | 'not-a-file';

export async function look(files: Files, path: string): Promise<Found> {
  let stat;
  try {
    stat = await files.stat(path);
  } catch {
    return 'missing';
  }
  if (stat.isLink === true) return 'symlink';
  return stat.kind === 'file' ? 'file' : 'not-a-file';
}

/** A directory the store writes into: there as a plain directory, or not there yet. */
async function plainDirectory(files: Files, path: string): Promise<boolean> {
  let stat;
  try {
    stat = await files.stat(path);
  } catch {
    return true;
  }
  return stat.isLink !== true && stat.kind === 'dir';
}

/** What the host said when a write failed: its error code, or the first line of its message without paths. */
export function codeOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = /failed: (E[A-Z0-9]+)\s*$/.exec(message)?.[1] ?? /^(E[A-Z0-9]{2,})\b/.exec(message)?.[1];
  if (code !== undefined) return code;
  return (message.split('\n')[0] ?? '').replace(/(?:[A-Za-z]:)?[\\/][^\s'")]*/g, '<path>').slice(0, 120) || 'unknown';
}

const failed = (error: unknown): NotMoved => ({ reason: 'write-failed', code: codeOf(error) });

/**
 * Puts `text` at `path`. With a mover, it is written beside it under `tmp/`,
 * read back, and moved into place, so that what stands at `path` is always
 * whole: the host's write cuts a file short when it fails (ADR 0008). Without
 * one, it is written in place.
 */
async function put(files: Files, path: string, text: string, tmp: string): Promise<NotMoved | null> {
  const mover = files.move !== undefined && (await files.move.available()) ? files.move : null;
  if (mover === null) {
    try {
      await files.write(path, text);
      return null;
    } catch (error) {
      return failed(error);
    }
  }
  const name = path.slice(path.lastIndexOf('/') + 1);
  const part = `${tmp}/${name}.${crypto.randomUUID()}.part`;
  try {
    await files.write(part, text);
    if ((await files.read(part)) !== text) {
      await mover.remove(part);
      return { reason: 'differs' };
    }
  } catch (error) {
    await mover.remove(part);
    return failed(error);
  }
  if (await mover.rename(part, path)) return null;
  // A move makes no directory, and the host's write only made the one the part is in: make it, and move once more.
  await mover.makeDir(path.slice(0, path.lastIndexOf('/')));
  if (await mover.rename(part, path)) return null;
  await mover.remove(part);
  return { reason: 'write-failed', code: 'the move into place failed' };
}

/**
 * Writes `text` at `path` unless the same text is already there, then reads it
 * back. The host's write follows symbolic links, so a link is refused before
 * anything is written. A file there that `repair` says is broken is written
 * over: a blob is named by the hash of its text, so other text under that name
 * is what a write that failed partway left; an entry that is not JSON is the
 * same.
 */
async function writeOnce(files: Files, path: string, text: string, tmp: string, repair: (there: string) => boolean): Promise<NotMoved | null> {
  const found = await look(files, path);
  if (found === 'symlink') return { reason: 'symlink' };
  if (found === 'not-a-file') return { reason: 'not-a-file' };
  if (found === 'missing') {
    const notPut = await put(files, path, text, tmp);
    if (notPut) return notPut;
  }
  let back;
  try {
    back = await files.read(path);
  } catch (error) {
    return failed(error);
  }
  if (back === text) return null;
  if (found === 'missing' || !repair(back)) return { reason: 'differs' };
  // Looked at again: what is written over is a plain file, or nothing, not a link put there meanwhile.
  const again = await look(files, path);
  if (again === 'symlink' || again === 'not-a-file') return { reason: again };
  const notPut = await put(files, path, text, tmp);
  if (notPut) return notPut;
  try {
    return (await files.read(path)) === text ? null : { reason: 'differs' };
  } catch (error) {
    return failed(error);
  }
}

const notJson = (text: string): boolean => {
  try {
    JSON.parse(text);
    return false;
  } catch {
    return true;
  }
};

/**
 * Stores one text under the hash of it, with the name of what it came from, and returns its size and id, or why
 * it could not be stored. It is stored only once it has been read back and found equal.
 */
export async function store(files: Files, dir: string, tool: string, text: string): Promise<Stored | NotMoved> {
  if (!TOOL_NAME.test(tool)) return { reason: 'tool-name' };
  const bytes = bytesOf(text);
  if (bytes > MAX_BYTES) return { reason: 'too-large' };
  for (const path of [dir, blobsDir(dir), indexDir(dir), tmpDir(dir)]) {
    if (!(await plainDirectory(files, path))) return { reason: 'symlink' };
  }
  const id = await idOf(text);
  const tmp = tmpDir(dir);
  const blob = await writeOnce(files, blobPath(dir, id), text, tmp, () => true);
  if (blob) return blob;
  const entry = await writeOnce(files, entryPath(dir, id), JSON.stringify({ bytes, tool }), tmp, notJson);
  // An entry written for another tool that returned the same text differs, and that is fine.
  if (entry && entry.reason !== 'differs') return entry;
  return { bytes, id };
}

export const dirsOf = (dirs: string | readonly string[]): readonly string[] => (typeof dirs === 'string' ? [dirs] : dirs);

/** Whether anything is stored under `id` in any of `dirs`: its entry is there. Says nothing of the text. */
export async function holds(files: Files, dirs: string | readonly string[], id: string): Promise<boolean> {
  if (!ID.test(id)) return false;
  for (const dir of dirsOf(dirs)) {
    if ((await look(files, entryPath(dir, id))) === 'file') return true;
  }
  return false;
}

/** What the entry under `id` says was stored, in the first of `dirs` that holds one: null where none does or it cannot be read. */
export async function storedAs(files: Files, dirs: readonly string[], id: string): Promise<string | null> {
  for (const dir of dirs) {
    if ((await look(files, entryPath(dir, id))) !== 'file') continue;
    try {
      const entry: unknown = JSON.parse(await files.read(entryPath(dir, id)));
      const tool = typeof entry === 'object' && entry !== null ? (entry as { tool?: unknown }).tool : undefined;
      return typeof tool === 'string' ? tool : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** What is stored under an id. For a result that held images, `text` is its text without their bytes, and `parts` is all of it in order. */
export type Recalled = { text: string; parts?: MediaPart[] } | { error: string };

/** The text behind an id, from the first of `dirs` that holds it, checked against the id before it is handed over. */
export async function recall(files: Files, dirs: string | readonly string[], id: unknown): Promise<Recalled> {
  if (typeof id !== 'string' || !ID.test(id)) {
    return { error: 'That id is not 64 hexadecimal characters. Copy it from the ticket in the conversation.' };
  }
  for (const dir of dirsOf(dirs)) {
    if ((await look(files, entryPath(dir, id))) !== 'file' || (await look(files, blobPath(dir, id))) !== 'file') continue;
    let text;
    try {
      text = await files.read(blobPath(dir, id));
    } catch {
      return { error: 'The stored result could not be read.' };
    }
    if ((await idOf(text)) !== id) return { error: 'The stored result has changed on disk and is not returned.' };
    // Told by how the stored text begins, never by its entry: the bytes of an image
    // are not handed on as text to anything that reads through here.
    const media = decodeMedia(text);
    return media === null ? { text } : { text: textOf(media), parts: media };
  }
  return { error: 'Nothing is stored under that id on this machine.' };
}
