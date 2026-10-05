import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { OLD_PLUGIN, PLUGIN } from '../src/store.ts';

// PRIVACY.md says what the plugin reads, keeps, sends and runs. It is written from the code, and the code can change under it:
// here an address the code can send to, a way to send that does not go through the one call there is, a program it runs and a
// place it writes, each has to be named on that page, so that one added to the code without the page fails here.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const PRIVACY = read('PRIVACY.md');

/** The plugin's own code: what Claude Code loads and runs, not its tests or the benchmark. */
const under = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? under(`${dir}/${entry.name}`) : /\.(ts|sh|js|mjs)$/.test(entry.name) ? [`${dir}/${entry.name}`] : []));
const CODE: string[] = [...under('src'), ...under('hooks')];
const code = (path: string) => read(path);

/** The addresses written in the code, by their scheme and host. */
function hostsIn(text: string): string[] {
  return [...text.matchAll(/\bhttps?:\/\/([a-z0-9.-]+)/gi)].map((match) => `https://${(match[1] ?? '').toLowerCase()}`);
}

/** The ways out of the process a module could use without the host's one call: a fetch of its own, a socket, a child process. */
function waysOutIn(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:from|import\(|require\()\s*['"`](node:)?(http|https|http2|net|tls|dgram|child_process|worker_threads)['"`]/g)) found.push(`import ${match[2]}`);
  // Every call of one, but the host's own, which is counted apart below.
  for (const match of text.matchAll(/(?<![\w$])(?<!\$\.http\.)(fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/g)) found.push(match[1] ?? '');
  return found;
}

/** The programs the code names to run, in each shape it names one: by name to the runner, from a list of places, or under a place. */
function programsIn(text: string): string[] {
  const shapes = [
    /\bexitOf\(\s*[\w$]+,\s*'([\w-]+)'/g, // exitOf(run, 'mkdir', …)
    /\brun\('([\w-]+)'/g, // run('mv', …) in the mover
    /\brunIn\(\s*\w+,\s*'([\w-]+)'/g, // runIn(exec, 'rm', …) in the clean-up
    /'\/(?:usr\/)?bin\/([\w-]+)'/g, // '/usr/bin/grep'
    /\$\{place\}\/([\w-]+)/g, // `${place}/sh`
  ];
  return shapes.flatMap((shape) => [...text.matchAll(shape)].map((match) => match[1] ?? ''));
}

/** The names the store writes right under its directory, wherever the code spells one. */
function placesIn(text: string): string[] {
  return [...text.matchAll(/\$\{dir\}\/([\w.]+)/g)].map((match) => match[1] ?? '');
}

/** The files hooks/notice.sh keeps in Claude Code's data directory for the plugin. */
function dataFilesIn(notice: string): string[] {
  return [...notice.matchAll(/\$CLAUDE_PLUGIN_DATA\/(\w+)/g)].map((match) => match[1] ?? '');
}

/** The function whose call `at` stands inside: back from `at` to the first bracket left open, past those opened and closed. */
function callAround(text: string, at: number): string | undefined {
  let depth = 0;
  for (let i = at - 1; i >= 0; i -= 1) {
    const ch = text[i] ?? '';
    if (')]}'.includes(ch)) depth += 1;
    else if ('([{'.includes(ch)) {
      if (depth > 0) depth -= 1;
      else if (ch === '(') return /([\w$]+)\s*$/.exec(text.slice(0, i))?.[1];
    }
  }
  return undefined;
}

/** Whether PRIVACY.md names `word` as code, as it writes every name of a file, a place or a program: a word in its prose is not the name. */
const named = (word: string) => PRIVACY.includes(`\`${word}\``);

test('every address the code can send to is named in PRIVACY.md', () => {
  const hosts = new Set(CODE.flatMap((path) => hostsIn(code(path))));
  // The two Jev providers: a code without them would make this test hold nothing.
  assert.deepEqual([...hosts].sort(), ['https://api.cloudflare.com', 'https://api.typesafe.ai']);
  for (const host of hosts) assert.ok(PRIVACY.includes(host), `PRIVACY.md does not name ${host}, which the code can send to`);
});

test('the plugin sends only through the one call the host gives it, which only find uses', () => {
  for (const path of CODE) assert.deepEqual(waysOutIn(code(path)), [], `${path} has a way out of the process that PRIVACY.md does not account for`);
  // The host's fetch is taken in one place, and handed to find alone.
  const calls = CODE.flatMap((path) => [...code(path).matchAll(/\$\.http\b/g)].map(() => path));
  assert.deepEqual(calls, ['hooks/move-out.ts']);
  const hook = code('hooks/move-out.ts');
  assert.equal(callAround(hook, hook.indexOf('$.http')), 'find', 'the host fetch is handed to something other than find');
});

test('every program the code runs is named in PRIVACY.md, and the code runs commands through the host in one place', () => {
  const programs = new Set(CODE.flatMap((path) => programsIn(code(path))));
  assert.deepEqual([...programs].sort(), ['chmod', 'grep', 'mkdir', 'mv', 'rm', 'sh']);
  for (const program of programs) assert.ok(named(program), `PRIVACY.md does not name ${program}, which the code runs`);
  // Every command goes through the hook's two runners; a third would run what the shapes above do not see.
  const runners = CODE.flatMap((path) => [...code(path).matchAll(/\$\.process\.run\(/g)].map(() => path));
  assert.deepEqual(runners, ['hooks/move-out.ts', 'hooks/move-out.ts']);
});

test('every place the plugin writes is named in PRIVACY.md', () => {
  const places = CODE.flatMap((path) => placesIn(code(path)));
  assert.deepEqual([...new Set(places)].sort(), ['blobs', 'gc.json', 'index', 'roots', 'sentinel.jsonl', 'tmp', 'trash']);
  for (const place of places) assert.ok(named(place.includes('.') ? place : `${place}/`), `PRIVACY.md does not name ${place}`);
  for (const dir of [PLUGIN, OLD_PLUGIN]) assert.ok(PRIVACY.includes(`~/.claude/${dir}/`), `PRIVACY.md does not name ~/.claude/${dir}/`);
  const data = dataFilesIn(code('hooks/notice.sh'));
  assert.deepEqual([...new Set(data)].sort(), ['held', 'told']);
  for (const file of data) assert.ok(named(file), `PRIVACY.md does not name ${file}, which hooks/notice.sh writes`);
  assert.ok(PRIVACY.includes('~/.claude/plugins/data/'), 'PRIVACY.md does not say where Claude Code keeps the plugin data');
});

test('what each check reads out of the code: the shapes it knows, and a shape it does not know shows as nothing', () => {
  assert.deepEqual(hostsIn("const a = 'https://API.example.com/v1'; // http://b.test"), ['https://api.example.com', 'https://b.test']);
  assert.deepEqual(waysOutIn("import x from 'node:https';\nawait import('node:net');\nawait fetch(url);\nglobalThis.fetch(url);\n$.http.fetch(url);\nnew WebSocket(u)"), ['import https', 'import net', 'fetch', 'fetch', 'WebSocket']);
  assert.deepEqual(programsIn("exitOf(run, 'mkdir', []); run('mv', []); runIn(exec, 'rm', []); const G = ['/usr/bin/grep']; `${place}/sh`"), ['mkdir', 'mv', 'rm', 'grep', 'sh']);
  assert.deepEqual(placesIn('export const a = (dir: string) => `${dir}/blobs`;\nconst g = (dir: string) => `${dir}/gc.json`;'), ['blobs', 'gc.json']);
  assert.deepEqual(dataFilesIn('told=$CLAUDE_PLUGIN_DATA/told\nheld=$CLAUDE_PLUGIN_DATA/held'), ['told', 'held']);
  const around = (text: string) => callAround(text, text.indexOf('$.http'));
  assert.equal(around('await find({ a: 1, http: (u, i) => $.http.fetch(u, i), b: [2] })'), 'find');
  assert.equal(around('await other({ http: (u) => g(u) }); find({}); x($.http)'), 'x');
});
