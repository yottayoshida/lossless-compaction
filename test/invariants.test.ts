import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MUTATIONS } from './mutate.ts';

// docs/invariants.md says what "lossless" holds to and names, for each promise, the tests that keep it. Here the page,
// the tests and the list of what `npm run mutate` breaks are held together: a test renamed or removed, a promise with
// nothing that breaks it, or a line of the code a mutation rests on that has changed, fails here. Whether each test
// does fail with its line broken is what `npm run mutate` runs; it takes two minutes and changes src/ while it runs.

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

/** The names of every test of the repository, as they are written in its test files. */
function testNames(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(join(ROOT, 'test')).filter((name) => name.endsWith('.test.ts'))) {
    for (const match of read(`test/${file}`).matchAll(/^test\('((?:[^'\\]|\\.)*)'/gm)) names.add((match[1] ?? '').replace(/\\(.)/g, '$1'));
  }
  return names;
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
  for (const mutation of MUTATIONS) {
    assert.ok(promises.get(mutation.promise)?.includes(mutation.killedBy), `test/mutate.ts: "${mutation.killedBy}" is not named under ${mutation.promise} in docs/invariants.md`);
  }
});

test('each line test/mutate.ts breaks is in the code once, and breaking it changes the code', () => {
  for (const mutation of MUTATIONS) {
    assert.equal(read(mutation.file).split(mutation.find).length - 1, 1, `${mutation.file}: ${mutation.breaks}`);
    assert.notEqual(mutation.find, mutation.replace);
    assert.match(mutation.file, /^src\//);
  }
  assert.equal(JSON.parse(read('package.json')).scripts.mutate, 'node test/mutate.ts');
});

test('how the page is read: a promise with its tests, and nothing under what is not promised', () => {
  const page = '## The promises\n\n**I1. One.** Text.\n\n- `first test`\n- `second, with a `tick``\n\n**I2. Two.**\n\n- `third`\n\n## What is not promised\n\n- `not a test`\n';
  assert.deepEqual([...promisesIn(page)], [
    ['I1', ['first test', 'second, with a `tick`']],
    ['I2', ['third']],
  ]);
});
