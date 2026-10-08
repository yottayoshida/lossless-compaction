import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { WHY } from '../src/reasons.ts';
import { REASONS } from '../src/compact.ts';

// docs/troubleshooting.md has an entry for every line beginning `built-in compaction:` the plugin can print (#140). Every
// reason such a line holds is made by WHY in src/reasons.ts, which nothing else can make, so each is looked for here on
// the page, with `…` where it names a path, a count or what the system said.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
// As a reader searches it: a bar escaped to sit in a table cell is a bar. A reason that holds a backtick could not be
// written in a cell's code span as it is said, and fails here.
const PAGE = read('docs/troubleshooting.md').replaceAll('\\|', '|');

/**
 * Each reason as the page gives it: every argument `…`. Not `kinds`, which joins the names Claude Code gives the blocks
 * it sent, data and no words of the plugin's: the two it says in their place are reasons of their own.
 */
const reasons = () =>
  Object.entries(WHY)
    .filter(([name]) => name !== 'kinds')
    .map(([name, made]) => [name, (made as (...args: string[]) => string)(...Array<string>(made.length).fill('…'))] as const);

test('docs/troubleshooting.md has the words of every reason a built-in compaction line can give, and of every reason a result stayed (#140)', () => {
  const all = reasons();
  assert.ok(all.length >= 25, `${all.length} reasons`);
  for (const [name, said] of all) assert.ok(PAGE.includes(said), `${name}: ${said}`);
  // And every reason a result stayed, which a compaction's line gives after `left in place` (src/compact.ts).
  for (const [reason, said] of Object.entries(REASONS)) assert.ok(PAGE.includes(said), `${reason}: ${said}`);
});

test('docs/troubleshooting.md is 150 lines at most, so that a line is found by reading it, not only by searching it (#140)', () => {
  assert.ok(PAGE.split('\n').length - 1 <= 150, `${PAGE.split('\n').length - 1} lines`);
});

test('the opening of a built-in compaction line is written in src/reasons.ts alone: a line with a reason made elsewhere would have no entry (#140)', () => {
  const sources = [...readdirSync(join(ROOT, 'src')).map((name) => `src/${name}`), ...readdirSync(join(ROOT, 'hooks')).map((name) => `hooks/${name}`)];
  const writing = sources.filter((path) => /\.(ts|sh)$/.test(path) && read(path).includes('built-in compaction:'));
  assert.deepEqual(writing, ['src/reasons.ts']);
});
