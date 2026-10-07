import assert from 'node:assert/strict';
import { test } from 'node:test';

import { closeStore, ensurePrivate, type Run } from '../src/private.ts';
import { MemoryFiles } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';

/** Commands run against `files`: mkdir makes the directory, chmod sets a mode; `missing` programs cannot be started. */
function commands(files: MemoryFiles, options: { missing?: readonly string[]; chmodExit?: number; mkdirExit?: number } = {}) {
  const ran: string[][] = [];
  const modes = new Map<string, string>();
  const run: Run = async (argv) => {
    const [program, ...args] = argv;
    if (program === undefined || options.missing?.includes(program)) throw new Error(`cannot start ${program}`);
    ran.push([...argv]);
    // As BSD getopt reads them: options stop at the first argument that is not one, and a `--` after it is a file name.
    const firstOperand = args.findIndex((arg, at) => !arg.startsWith('-') && args[at - 1] !== '-m');
    if (firstOperand >= 0 && args.indexOf('--', firstOperand) > firstOperand) return { exitCode: 1 };
    const operands = args.filter((arg, at) => arg !== '--' && !arg.startsWith('-') && args[at - 1] !== '-m');
    const target = operands[operands.length - 1] ?? '';
    if (program.endsWith('/mkdir')) {
      if (options.mkdirExit !== undefined) return { exitCode: options.mkdirExit };
      files.dirs.add(target);
      if (args[0] === '-m') modes.set(target, args[1] ?? '');
      return { exitCode: 0 };
    }
    if (program.endsWith('/chmod')) {
      if (options.chmodExit !== undefined) return { exitCode: options.chmodExit };
      modes.set(target, operands[0] ?? '');
      return { exitCode: 0 };
    }
    return { exitCode: 127 };
  };
  return { run, ran, modes };
}

test('a directory that is not there is made with mode 700, and closed again', async () => {
  const files = new MemoryFiles();
  const { run, ran, modes } = commands(files);
  assert.equal(await ensurePrivate(files, run, DIR), null);
  assert.deepEqual(ran, [
    ['/bin/mkdir', '-p', '--', '/home/u/.claude'],
    ['/bin/mkdir', '-m', '700', '--', DIR],
    ['/bin/chmod', '--', '700', DIR],
  ]);
  assert.equal(modes.get(DIR), '700');
});

test('a directory that is there, of any mode, is closed to its owner alone', async () => {
  const files = new MemoryFiles();
  files.dirs.add(DIR);
  const { run, ran, modes } = commands(files);
  assert.equal(await ensurePrivate(files, run, DIR), null);
  assert.deepEqual(ran, [['/bin/chmod', '--', '700', DIR]]);
  assert.equal(modes.get(DIR), '700');
});

test('a link where the directory should be is refused, and nothing is run', async () => {
  const files = new MemoryFiles();
  files.links.set(DIR, '/elsewhere');
  files.dirs.add('/elsewhere');
  const { run, ran } = commands(files);
  assert.match((await ensurePrivate(files, run, DIR)) ?? '', /symbolic link/);
  assert.deepEqual(ran, []);
});

test('a file where the directory should be is refused, and nothing is run', async () => {
  const files = new MemoryFiles();
  files.files.set(DIR, 'not a directory');
  const { run, ran } = commands(files);
  assert.match((await ensurePrivate(files, run, DIR)) ?? '', /not a directory/);
  assert.deepEqual(ran, []);
});

test("a directory chmod fails on, someone else's, is refused", async () => {
  const files = new MemoryFiles();
  files.dirs.add(DIR);
  const { run } = commands(files, { chmodExit: 1 });
  assert.match((await ensurePrivate(files, run, DIR)) ?? '', /not yours/);
});

test('without /bin/chmod, /usr/bin/chmod is run; with neither, it is refused', async () => {
  const files = new MemoryFiles();
  files.dirs.add(DIR);
  const nix = commands(files, { missing: ['/bin/chmod'] });
  assert.equal(await ensurePrivate(files, nix.run, DIR), null);
  assert.deepEqual(nix.ran, [['/usr/bin/chmod', '--', '700', DIR]]);

  const none = commands(files, { missing: ['/bin/chmod', '/usr/bin/chmod'] });
  assert.match((await ensurePrivate(files, none.run, DIR)) ?? '', /no chmod/);
});

test('a host that runs no commands at all is refused before anything is written', async () => {
  const files = new MemoryFiles();
  const run: Run = async () => {
    throw new Error('no process on this host');
  };
  assert.match((await ensurePrivate(files, run, DIR)) ?? '', /no mkdir/);
  assert.equal(files.dirs.has(DIR), false);
});

test('a mkdir that fails because another session made the directory first is fine', async () => {
  const files = new MemoryFiles();
  const { run } = commands(files, { mkdirExit: 1 });
  // The other session's directory appears between the two mkdirs.
  const racing: Run = async (argv) => {
    const result = await run(argv);
    if (argv.includes('700') && argv[0]?.endsWith('/mkdir')) files.dirs.add(DIR);
    return result;
  };
  assert.equal(await ensurePrivate(files, racing, DIR), null);
  // And a mkdir that fails with nothing there is refused.
  assert.match((await ensurePrivate(new MemoryFiles(), commands(new MemoryFiles(), { mkdirExit: 1 }).run, DIR)) ?? '', /could not be made/);
});

const OLD = '/home/u/.claude/jev-lossless-compaction';

test('a plain file where the old directory was is left alone, and results are written to the new one as before', async () => {
  const files = new MemoryFiles();
  files.files.set(OLD, 'not a directory');
  const { run, ran } = commands(files);
  assert.deepEqual(await closeStore(files, run, { write: DIR, read: [DIR, OLD] }), { refused: null, warnings: [] });
  assert.ok(ran.every((argv) => !argv.includes(OLD)), 'nothing is run on the old place');
});

test('an old directory that cannot be closed is said, and writing to the one that was goes on', async () => {
  const files = new MemoryFiles();
  files.dirs.add(OLD);
  const { run } = commands(files);
  const refusingOld: Run = async (argv) => (argv.includes(OLD) && argv[0]?.endsWith('/chmod') ? { exitCode: 1 } : run(argv));
  const closed = await closeStore(files, refusingOld, { write: DIR, read: [DIR, OLD] });
  assert.equal(closed.refused, null);
  assert.equal(closed.warnings.length, 1);
  assert.match(closed.warnings[0] ?? '', /jev-lossless-compaction could not be made readable/);
});

test('an old directory that is there is closed too; a link where it was is not followed', async () => {
  const files = new MemoryFiles();
  files.dirs.add(OLD);
  const { run, modes } = commands(files);
  assert.deepEqual(await closeStore(files, run, { write: DIR, read: [DIR, OLD] }), { refused: null, warnings: [] });
  assert.equal(modes.get(OLD), '700');

  const linked = new MemoryFiles();
  linked.links.set(OLD, '/elsewhere');
  linked.dirs.add('/elsewhere');
  const second = commands(linked);
  assert.deepEqual(await closeStore(linked, second.run, { write: DIR, read: [DIR, OLD] }), { refused: null, warnings: [] });
  assert.ok(second.ran.every((argv) => !argv.includes(OLD)));
});

test('the directory written to that cannot be made private refuses the whole compaction', async () => {
  const files = new MemoryFiles();
  files.links.set(DIR, '/elsewhere');
  const { run } = commands(files);
  assert.match((await closeStore(files, run, { write: DIR, read: [DIR] })).refused ?? '', /symbolic link/);
});

test('on Windows nothing is run: the profile keeps others out', async () => {
  const files = new MemoryFiles();
  const { run, ran } = commands(files);
  assert.equal(await ensurePrivate(files, run, 'C:\\Users\\u\\.claude\\lossless-compaction'), null);
  assert.deepEqual(ran, []);
});

test('a place read from as one results were kept in before is not made private: those of the settings in use alone are (#116)', async () => {
  const files = new MemoryFiles();
  files.dirs.add(OLD);
  files.dirs.add('/data/earlier');
  const { run, ran } = commands(files);
  assert.deepEqual(await closeStore(files, run, { write: DIR, read: [DIR, OLD, '/data/earlier'], owned: [DIR, OLD] }), { refused: null, warnings: [] });
  assert.ok(ran.some((argv) => argv.includes(OLD)), 'the old place of these settings is closed as before');
  assert.ok(ran.every((argv) => !argv.includes('/data/earlier')), 'nothing is run on the earlier place');
});
