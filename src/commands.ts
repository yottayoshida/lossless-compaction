// The host's own commands, as the plugin runs them: by an absolute path, so
// that no `PATH` a repository sets picks the program. The hook spells out the
// host call that starts one (`$.process.run`) and hands it in; what is done
// with what it returns is here.

import type { FileStat, Mover } from './types.ts';

/** `/bin` first; NixOS has only `/usr/bin`, or neither. */
export const PLACES = ['/bin', '/usr/bin'] as const;

/** Starts a command by its argument vector; rejects when it cannot be started. */
export type Start<R> = (argv: readonly string[]) => Promise<R>;

/**
 * The exit code of `program`, run from the first of `PLACES` it starts in;
 * null when it starts in neither. Any exit code ends it: one that is not 0 is
 * the program's answer, not a reason to try the next place.
 */
export async function exitOf(start: Start<{ exitCode: number }>, program: string, args: readonly string[]): Promise<number | null> {
  for (const place of PLACES) {
    try {
      return (await start([`${place}/${program}`, ...args])).exitCode;
    } catch {
      // Not there, or no commands at all on this host: the next place, then none.
    }
  }
  return null;
}

// That `mv` can be started on this host, once it has been (ADR 0008). That it could not is not kept:
// a start refused once, by load or by another hook, is asked again at the next write.
let canMove = false;

/**
 * How a stored result is moved into place with `mv`, so that a write the disk
 * refuses never cuts short what is already there (ADR 0008). `start` runs a
 * command, `stat` looks at a path without following a link.
 */
export function moverOf(start: Start<{ exitCode: number }>, stat: (path: string) => Promise<FileStat>): Mover {
  const run = (program: string, args: readonly string[]) => exitOf(start, program, args);
  return {
    // Started at all is enough: without operands `mv` only prints its usage, and exits 64 here, 1 with GNU.
    available: async () => (canMove ||= (await run('mv', [])) !== null),
    rename: async (from, to) => {
      if ((await run('mv', ['-f', '--', from, to])) !== 0) return false;
      const there = await stat(to).catch(() => null);
      if (there !== null && there.kind === 'file' && there.isLink !== true) return true;
      // A directory at `to` takes `from` inside it and still exits 0: take it out again.
      await run('rm', ['-f', '--', `${to}/${from.slice(from.lastIndexOf('/') + 1)}`]);
      return false;
    },
    makeDir: async (path) => void (await run('mkdir', ['-p', '--', path])),
    // What cannot be removed stays in tmp/.
    remove: async (path) => void (await run('rm', ['-f', '--', path])),
    // A text stored again is new to the conversation that names it now: the clean-up counts its day from this time.
    // No file is made, and a link put in its place meanwhile is not followed.
    renew: async (path) => void (await run('touch', ['-c', '-h', '--', path])),
  };
}

/** For tests: forgets that `mv` was seen to start. */
export function forgetMove(): void {
  canMove = false;
}
