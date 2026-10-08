import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { fileOf, filesToCopy, inside, MUTATIONS, testsIn, verdictOf } from './mutate.ts';

// docs/invariants.md says what "lossless" holds to and names, for each promise, the tests that keep it. Here the page,
// the tests and the list of what `npm run mutate` breaks are held together: a test renamed or removed, a promise with
// nothing that breaks it, or a line of the code a mutation rests on that has changed, fails here. Whether each test
// does fail with its line broken is what `npm run mutate` runs, on a copy of the tree.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const PAGE = read('docs/invariants.md');

/** The promises of the page: each by its number, with the tests named under it. */
function promisesIn(page: string): Map<string, string[]> {
  const promises = new Map<string, string[]>();
  const body = page.slice(page.indexOf('## The promises'), page.indexOf('## What is not promised'));
  for (const block of body.split(/^(?=\*\*I\d+\. )/m).slice(1)) {
    const id = /^\*\*(I\d+)\. /.exec(block)?.[1] ?? '';
    promises.set(id, [...block.matchAll(/^- `(.+)`$/gm)].map((match) => match[1] ?? ''));
  }
  return promises;
}

/** The names of every test of the repository, as they are written in its test files: read as `npm run mutate` reads them. */
function testNames(): Set<string> {
  return new Set([...testsIn(ROOT).values()].flat());
}

test('every promise of docs/invariants.md names tests that exist, and each of them is the test a broken line has to fail', () => {
  const promises = promisesIn(PAGE);
  assert.deepEqual([...promises.keys()], ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8']);
  assert.match(PAGE, /for these eight promises/);
  const names = testNames();
  assert.ok(names.size > 400);
  for (const [id, tests] of promises) {
    assert.ok(tests.length > 0, `${id} names no test`);
    for (const name of tests) {
      assert.ok(names.has(name), `${id} names a test that is not there: ${name}`);
      // A test named on the page with nothing that breaks the code under it keeps nothing that was measured.
      assert.ok(MUTATIONS.some((one) => one.promise === id && one.killedBy === name), `${id}: nothing in test/mutate.ts is to be caught by "${name}"`);
    }
  }
  const tests = testsIn(ROOT);
  for (const mutation of MUTATIONS) {
    assert.ok(promises.get(mutation.promise)?.includes(mutation.killedBy), `test/mutate.ts: "${mutation.killedBy}" is not named under ${mutation.promise} in docs/invariants.md`);
    // `npm run mutate` runs the one file that holds it, alone.
    assert.doesNotThrow(() => fileOf(tests, mutation.killedBy));
  }
});

test('each line test/mutate.ts breaks is in the code once, and breaking it changes the code', () => {
  for (const mutation of MUTATIONS) {
    assert.equal(read(mutation.file).split(mutation.find).length - 1, 1, `${mutation.file}: ${mutation.breaks}`);
    assert.notEqual(mutation.find, mutation.replace);
    assert.match(mutation.file, /^src\//);
  }
  assert.equal(JSON.parse(read('package.json')).scripts.mutate, 'node test/mutate.ts');
  // CI runs it as the last step of the required `test` job, as this page says (#125).
  const job = read('.github/workflows/ci.yml').split('\njobs:\n')[1] ?? '';
  assert.match(job, /^  test:\n/);
  assert.match(job.trimEnd(), /\n {8}run: npm run mutate$/, 'the last step of test');
});

test('how the page is read: a promise with its tests, and nothing under what is not promised', () => {
  const page = '## The promises\n\n**I1. One.** Text.\n\n- `first test`\n- `second, with a `tick``\n\n**I2. Two.**\n\n- `third`\n\n## What is not promised\n\n- `not a test`\n';
  assert.deepEqual([...promisesIn(page)], [
    ['I1', ['first test', 'second, with a `tick`']],
    ['I2', ['third']],
  ]);
});

test('npm run mutate copies files only, takes a run that names a test neither way for a stopped one, and keeps its copy outside the tree (#125)', () => {
  // A nested repository or worktree is listed as its directory, with a slash: copying it as a file would fail.
  assert.deepEqual(filesToCopy('src/a.ts\0nested/\0.claude/worktrees/one/\0test/b.test.ts\0'), ['src/a.ts', 'test/b.test.ts']);
  assert.deepEqual(filesToCopy(''), []);

  const ran = { passed: new Set(['kept']), failed: new Set(['caught']) };
  assert.equal(verdictOf(ran, 'caught'), 'killed');
  assert.equal(verdictOf(ran, 'kept'), 'survived');
  // A run the runner was stopped in, or whose file did not load, says nothing: it is not taken for a survivor.
  assert.throws(() => verdictOf(ran, 'not in the run'), /says nothing/);

  const root = mkdtempSync(join(tmpdir(), 'lossless-inside-'));
  try {
    mkdirSync(join(root, 'tree', 'tmp'), { recursive: true });
    mkdirSync(join(root, 'tree', '..tmp'));
    mkdirSync(join(root, 'tree..beside'));
    assert.equal(inside(join(root, 'tree', 'tmp'), join(root, 'tree')), true);
    // Named with two dots, and inside all the same.
    assert.equal(inside(join(root, 'tree', '..tmp'), join(root, 'tree')), true);
    assert.equal(inside(join(root, 'tree'), join(root, 'tree')), true);
    assert.equal(inside(join(root, 'tree..beside'), join(root, 'tree')), false);
    assert.equal(inside(root, join(root, 'tree')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
