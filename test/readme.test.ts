import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { FIND, PLUGIN, RECALL } from '../src/store.ts';

// The README is where a reader decides whether to install the plugin, and it grows: docs/development.md, "The README", says what is done about
// that. The figures it gives are held to the published units in test/bench.test.ts; here is what can be checked of the README by itself.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const README = read('README.md');

/** What the README may come to, its words counted as `wc -w` counts them. Past any of these, a section goes to docs/ and a link stays. */
const PAGE = { lines: 100, words: 760, headings: 7, tables: 1 };

/** A document without its code blocks, where a line starting `#` is a comment and not a heading. */
const prose = (text: string) => text.replace(/^```[\s\S]*?^```$/gm, '');
/**
 * The size of a page of Markdown. Its headings are every line that is one, of any depth and indented or not, less the title a page opens with.
 * A table is counted by the row under its head: a line of bars, hyphens and colons alone.
 */
const sizeOf = (text: string) => ({
  lines: text.split('\n').length - 1,
  words: text.split(/\s+/).filter(Boolean).length,
  headings: (prose(text).match(/^ {0,3}#{1,6} /gm) ?? []).length - (text.startsWith('# ') ? 1 : 0),
  tables: (prose(text).match(/^(?=.*-)(?=.*\|)[|:\- \t]+$/gm) ?? []).length,
});
/** What would make the page larger than it counts as: HTML, a comment too, where a heading or a table can be written, and a heading made by underlining it. */
const uncounted = (text: string) => [...(prose(text).match(/<(?:!--|\/?[a-z][a-z0-9]*[\s>/])/gi) ?? []), ...(prose(text).match(/^ {0,3}(?:=+|-+)[ \t]*$/gm) ?? [])];
/** The anchors GitHub gives the headings of a document: lower case, punctuation gone, spaces to hyphens, a number after one seen before. */
function anchorsOf(text: string): Set<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const [, heading = ''] of prose(text).matchAll(/^#{1,6} +(.+)$/gm)) {
    // As it is shown: a link is its text, and hashes closing the heading are not part of it.
    const shown = heading.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/ +#+ *$/, '').trim();
    const anchor = shown.toLowerCase().replace(/[^\p{L}\p{N}\- _]/gu, '').replace(/ /g, '-');
    const times = seen.get(anchor) ?? 0;
    seen.set(anchor, times + 1);
    anchors.add(times === 0 ? anchor : `${anchor}-${times}`);
  }
  return anchors;
}
/** The targets of a document's links that are not addresses of another site: written in line, with a title or without, or as a reference defined below. */
const linksOf = (text: string) =>
  [...prose(text).matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+[^)]*)?\)/g), ...prose(text).matchAll(/^\[[^\]]+\]:\s*<?([^\s>]+)/gm)]
    .map((match) => match[1] ?? '')
    .filter((target) => !/^[a-z]+:/.test(target));
/** That every link of a document of its own reaches a file, and a heading where it names one: read from where the document is. */
function assertLinksReach(document: string): void {
  for (const target of linksOf(read(document))) {
    const [path = '', anchor] = target.split('#');
    const file = path === '' ? document : join(dirname(document), path);
    assert.ok(existsSync(join(ROOT, file)), `${document} links to ${target}: no such file`);
    if (anchor !== undefined && file.endsWith('.md')) assert.ok(anchorsOf(read(file)).has(anchor), `${document} links to ${target}: no such heading`);
  }
}
/** Every Markdown file under a directory, by its path from the root. */
const documentsUnder = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? documentsUnder(join(dir, entry.name)) : entry.name.endsWith('.md') ? [join(dir, entry.name)] : [],
  );

test('the README stays a page: its lines, words, headings and tables are within what docs/development.md says', () => {
  const size = sizeOf(README);
  for (const [what, limit] of Object.entries(PAGE) as [keyof typeof PAGE, number][]) {
    assert.ok(size[what] <= limit, `README.md has ${size[what]} ${what}, and ${limit} is the most: move a section to docs/ and leave a link (docs/development.md, "The README")`);
  }
  // Nothing in it is of a kind the count above does not see.
  assert.deepEqual(uncounted(README), [], 'README.md is written in Markdown alone, its headings with #: no HTML, and no line of --- or ===');
  // The limits are the ones the document gives, so that one is not changed without the other.
  assert.match(read('docs/development.md').replace(/\s+/g, ' '), new RegExp(`${PAGE.lines} lines, ${PAGE.words} words, ${PAGE.headings} headings under the title and ${PAGE.tables} table`));
});

test('what is counted of a page: a table however it is aligned, and nothing inside a code block; HTML and an underlined heading are seen', () => {
  const table = (rule: string) => `| a | b |\n${rule}\n| 1 | 2 |\n`;
  for (const rule of ['| --- | --- |', '|:---|---:|', '| :--: | :--: |', '--- | ---']) assert.equal(sizeOf(table(rule)).tables, 1, rule);
  assert.deepEqual(sizeOf('## One\n\n```sh\n## not a heading\n| --- | --- |\n```\n\n### Two\n'), { lines: 8, words: 15, headings: 2, tables: 0 });
  assert.deepEqual(uncounted('<table><tr><td>x</td></tr></table>\n').length, 6);
  assert.deepEqual(uncounted('<details>\n<h2>More</h2>\n'), ['<details>', '<h2>', '</h2>']);
  assert.deepEqual(uncounted('More\n----\n\nMost\n====\n\nOne more\n  ---\n\n<!-- and a comment -->\n'), ['<!--', '----', '====', '  ---']);
  // A second title, and a heading set in from the margin, are headings like the others; the title a page opens with is not counted.
  assert.equal(sizeOf('# Title\n\n## One\n\n# Another title\n\n   ### Set in\n\n    #### code, four spaces in\n').headings, 3);
  assert.equal(sizeOf(README).headings, (README.match(/^## /gm) ?? []).length);
  assert.ok(README.startsWith('# '));
  // What the README does hold: a link in angle brackets is not a tag, nor is anything in a code block.
  assert.deepEqual(uncounted('See <https://example.com>.\n\n```html\n<b>x</b>\n```\n'), []);
});

test('the README: every link of its own reaches a file, and a heading where it names one; so does every link to it from another document', () => {
  assertLinksReach('README.md');
  const headings = anchorsOf(README);
  const others = ['CHANGELOG.md', 'bench/README.md', ...documentsUnder('docs')];
  for (const document of others) {
    for (const target of linksOf(read(document))) {
      const [path = '', anchor] = target.split('#');
      if (anchor === undefined || join(dirname(document), path) !== 'README.md') continue;
      assert.ok(headings.has(anchor), `${document} links to ${target}: the README has no such heading`);
    }
  }
  assert.ok(others.length > 5 && linksOf(README).length > 10);
});

test('PRIVACY.md, which the README links to: every link of its own reaches a file, and a heading where it names one', () => {
  const page = read('PRIVACY.md');
  assertLinksReach('PRIVACY.md');
  assert.ok(linksOf(page).some((target) => target.includes('#')), 'PRIVACY.md names the sections of the docs it draws on');
});

test("every setting's description fits under 250 characters, gives its default and names the Settings section of docs/usage.md, which is there (#142)", () => {
  // What the settings dialog shows below the setting chosen, all of it, wrapped: at 100 columns a description of 766 characters took eight lines.
  const manifest = JSON.parse(read('.claude-plugin/plugin.json')) as { userConfig: Record<string, { description: string; default?: unknown }> };
  assert.ok(anchorsOf(read('docs/usage.md')).has('settings'), 'docs/usage.md has a Settings section');
  for (const [name, { description, default: fallback }] of Object.entries(manifest.userConfig)) {
    assert.ok([...description].length < 250, `${name}: ${[...description].length} characters`);
    assert.ok(description.endsWith('See "Settings" in docs/usage.md.'), name);
    if (fallback === undefined) assert.match(description, /\bUnset\b/, name);
    else assert.ok(description.includes(`Default ${typeof fallback === 'number' ? fallback.toLocaleString('en-US') : String(fallback)}.`), name);
  }
  assert.equal(Object.keys(manifest.userConfig).length, 9);
  // What a description cut short said wrong or left out, as the first review of #142 found it: with no key set, one in the
  // environment is still sent once a provider is chosen (ADR 0028); a /compact given instructions is summarized whatever is
  // in use, and one without them reaches into the newest results (ADR 0036, src/compact.ts); a directory pointed at is made
  // private, and an older one is written to.
  const said: Record<string, string[]> = {
    // Read below the API key's field, "no key" is that field: a key in the environment goes once a provider is chosen (the second review).
    provider: ['Set to one, a key in the environment is used', 'with no key at all, nothing is sent'],
    apiKey: ['a key in the environment is used once provider is typesafe or cloudflare or an account id is entered', 'with none, nothing is sent'],
    maxAfterPercent: ['after moving out', '/compact with instructions summarizes'],
    keepTokens: ['A /compact without instructions reaches into them'],
    storeDir: ['mode 700', 'jev-lossless-compaction'],
  };
  for (const [name, phrases] of Object.entries(said)) {
    for (const phrase of phrases) assert.ok(manifest.userConfig[name]?.description.includes(phrase), `${name}: ${phrase}`);
  }
});

test('docs/usage.md, which the descriptions name: every link reaches a file and a heading, and its Settings section says what the descriptions alone said before (#142)', () => {
  const page = read('docs/usage.md');
  assertLinksReach('docs/usage.md');
  const at = page.indexOf('\n## Settings\n');
  assert.ok(at >= 0, 'docs/usage.md has a Settings section');
  const section = page.slice(at);
  const flat = section.replace(/\s+/g, ' ');
  // Found in no document before the descriptions were cut down: the size a share is of when automatic compaction is off,
  // what minChars holds back besides messages, and the model asked for by default.
  for (const phrase of ["the model's window when automatic compaction is off", 'tool results, input values', 'jev-latest']) assert.ok(flat.includes(phrase), phrase);
  // Each aim the table gives says where it was measured.
  const rows = section.split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| To ') && !/^\|[\s|:-]+\|$/.test(line));
  assert.ok(rows.length >= 3, `${rows.length} rows`);
  for (const row of rows) assert.ok(row.includes('](measurements.md#'), row);
});

test('how links and headings are read: a link with a title, a reference defined below, a heading that holds a link or closes with hashes', () => {
  assert.deepEqual(linksOf('[a](docs/a.md "A") [b](<docs/b.md>) [c](https://example.com) [d][ref]\n\n[ref]: docs/d.md#x\n'), ['docs/a.md', 'docs/b.md', 'docs/d.md#x']);
  assert.deepEqual([...anchorsOf('# Setting it up\n\n## With [Opus 5.5](x.md), and 1,000,000 ##\n\n## Setting it up\n\n```sh\n# not one\n```\n')], [
    'setting-it-up',
    'with-opus-55-and-1000000',
    'setting-it-up-1',
  ]);
});

/** The repository the plugin installs from, as the marketplace source the README and docs/limits.md give. */
const SOURCE = 'yottayoshida/lossless-compaction';

test('the README names what the code names: the line that installs the plugin, the version it needs, the tools and the mark of its lines', () => {
  const plugin = (JSON.parse(read('.claude-plugin/plugin.json')) as { name: string }).name;
  const marketplace = (JSON.parse(read('.claude-plugin/marketplace.json')) as { name: string }).name;
  // Typed in a session, one line adds the marketplace and installs; from the shell it is two commands, which docs/limits.md keeps.
  assert.ok(README.includes(`\n/plugin install ${plugin} --marketplace ${SOURCE}\n`), 'the line that installs the plugin');
  const limits = read('docs/limits.md');
  assert.ok(limits.includes(`claude plugin marketplace add ${SOURCE}\n`), 'the marketplace to add from the shell');
  assert.ok(limits.includes(`claude plugin install ${plugin}@${marketplace}\n`), 'the plugin to install from the shell');
  // The version the README gives is the one the plugin itself names when it is not running. Nothing is to be set: from that
  // version on Claude Code ignores the variable early access asked for, so a page that still asked for it would cost a step.
  const version = /^version=(\d+\.\d+\.\d+)$/m.exec(read('hooks/notice.sh'))?.[1];
  assert.ok(version !== undefined && README.includes(`Claude Code ${version} or later`), 'the version the plugin needs');
  for (const page of ['README.md', 'docs/usage.md']) assert.ok(!read(page).includes('CLAUDE_CODE_ENABLE_FUNCTION_HOOKS'), `${page} asks for no setting`);
  for (const tool of [RECALL, FIND]) assert.ok(README.includes(`\`${tool}\``), tool);
  assert.ok(README.includes(`\`${PLUGIN}:\``), "the mark of the plugin's lines");
});

test('a version is not raised without coming to the README: the two files that name the version agree, the marketplace names none, and docs/development.md names it as the one the README was read against', () => {
  const versions = {
    'package.json': (JSON.parse(read('package.json')) as { version: string }).version,
    '.claude-plugin/plugin.json': (JSON.parse(read('.claude-plugin/plugin.json')) as { version: string }).version,
  };
  const version = versions['package.json'];
  assert.deepEqual(Object.values(versions), [version, version], JSON.stringify(versions));
  // Claude Code takes the version from plugin.json first and says nothing of another in the entry when it installs: one place holds it.
  const entries = (JSON.parse(read('.claude-plugin/marketplace.json')) as { plugins: Record<string, unknown>[] }).plugins;
  assert.ok(entries.every((entry) => !('version' in entry)), 'the marketplace entry names no version');
  // docs/limits.md says where new installs come from as the entry says it: the tip of main while its source is
  // "./", a release once it points at one (docs/development.md, "Releasing").
  const limits = read('docs/limits.md').replace(/\s+/g, ' ');
  const relative = typeof entries[0]?.['source'] === 'string';
  for (const said of ['The marketplace points at the tip of `main`', 'can hold changes not yet released, under the last release\'s number']) {
    assert.equal(limits.includes(said), relative, `docs/limits.md, where the entry is ${relative ? 'a path' : 'a release'}: ${said}`);
  }
  const readAt = /^README read against version: `(\d+\.\d+\.\d+)`$/m.exec(read('docs/development.md'))?.[1];
  assert.equal(readAt, version, `the version is ${version} and the README was last read against ${readAt}: read it as docs/development.md says ("The README"), then name ${version} there`);
});
