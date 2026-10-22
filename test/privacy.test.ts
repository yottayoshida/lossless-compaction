import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { OLD_PLUGIN, PLUGIN } from '../src/store.ts';

// PRIVACY.md says what the plugin reads, keeps, sends and runs. It is written from the code, and the code can change under it:
// here an address the code can send to, a way to send that does not go through the one call there is, a program it runs, a
// variable it reads or sets and a place it writes, each has to be named on that page, so that one added without the page fails here.

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

/** The variables the host reads or sets by a literal name, as Claude Code requires. */
function variablesIn(text: string): string[] {
  return [...text.matchAll(/\$\.env\.(?:get|set)\s*\(\s*(['"`])([A-Za-z_]\w*)\1\s*[,)]/g)].map((match) => match[2] ?? '');
}

/** The shell's uppercase variable references, not its lowercase locals or positional parameters. */
function shellVariablesIn(text: string): string[] {
  return [...text.matchAll(/\$\{?([A-Z_][A-Z0-9_]*)\b/g)].map((match) => match[1] ?? '');
}

/** Names written as code; lowercase variants only where the prose explicitly says "in either case". */
function variablesNamedIn(text: string): Set<string> {
  const names = new Set([...text.matchAll(/`([A-Za-z_]\w*)`/g)].map((match) => match[1] ?? ''));
  for (const match of text.matchAll(/((?:`[A-Z_][A-Z0-9_]*`,?\s*)+)in either\s+case/g)) {
    for (const name of variablesNamedIn(match[1] ?? '')) names.add(name.toLowerCase());
  }
  return names;
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
  // The addresses of the plugin's own documentation are written into what the agent and the person are told, and are
  // never fetched (#143, #140): each is in the one line that names it, and nothing below hands it to the host's fetch.
  const DOCS = 'https://github.com';
  const docLines = CODE.flatMap((path) => code(path).split('\n').filter((line) => hostsIn(line).includes(DOCS)).map((line) => `${path}: ${line.trim().split(' = ')[0]}`));
  assert.deepEqual(docLines, ['src/find.ts: export const GETTING_A_KEY', 'src/status.ts: export const TROUBLESHOOTING']);
  const hosts = new Set(CODE.flatMap((path) => hostsIn(code(path))).filter((host) => host !== DOCS));
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
  assert.equal(callAround(hook, hook.indexOf('$.http')), 'findAnswer', 'the host fetch is handed to something other than find');
});

test('every program the code runs is named in PRIVACY.md, and the code runs commands through the host in one place', () => {
  const programs = new Set(CODE.flatMap((path) => programsIn(code(path))));
  assert.deepEqual([...programs].sort(), ['chmod', 'grep', 'ln', 'mkdir', 'mv', 'rm', 'sh', 'touch']);
  for (const program of programs) assert.ok(named(program), `PRIVACY.md does not name ${program}, which the code runs`);
  // Every command goes through the hook's two runners; a third would run what the shapes above do not see.
  const runners = CODE.flatMap((path) => [...code(path).matchAll(/\$\.process\.run\(/g)].map(() => path));
  assert.deepEqual(runners, ['hooks/move-out.ts', 'hooks/move-out.ts']);
});

test('every environment variable the code reads or sets is named in PRIVACY.md or its linked Limits section', () => {
  const host = CODE.flatMap((path) => variablesIn(code(path)));
  const shell = CODE.filter((path) => path.endsWith('.sh')).flatMap((path) => shellVariablesIn(code(path)));
  assert.ok(host.length > 0, 'the host variable finder found nothing');
  assert.ok(shell.length > 0, 'the shell variable finder found nothing');
  assert.ok(PRIVACY.includes('[Limits](docs/limits.md#what-a-repository-can-change)'), 'PRIVACY.md no longer links to the variable list in Limits');
  const limits = read('docs/limits.md').split('## What a repository can change\n')[1]?.split('\n## ')[0] ?? '';
  const names = variablesNamedIn(`${PRIVACY}\n${limits}`);
  for (const name of new Set([...host, ...shell])) assert.ok(names.has(name), `PRIVACY.md does not name ${name}, which the code reads or sets`);
});

test('every place the plugin writes is named in PRIVACY.md', () => {
  const places = CODE.flatMap((path) => placesIn(code(path)));
  // `.local` is this machine's id, under the home directory rather than the store (ADR 0032), named in full below.
  assert.deepEqual([...new Set(places)].sort(), ['.local', 'blobs', 'gc.json', 'index', 'machines', 'roots', 'sentinel.jsonl', 'tmp', 'trash', 'witness']);
  for (const place of places.filter((one) => one !== '.local')) assert.ok(named(place.includes('.') ? place : `${place}/`), `PRIVACY.md does not name ${place}`);
  for (const dir of [PLUGIN, OLD_PLUGIN]) assert.ok(PRIVACY.includes(`~/.claude/${dir}/`), `PRIVACY.md does not name ~/.claude/${dir}/`);
  const machine = /`\$\{dir\}\/(\.local\/[\w./-]+)`/.exec(code('src/machine.ts'))?.[1];
  assert.equal(machine, '.local/state/lossless-compaction/machine.json');
  assert.ok(PRIVACY.includes(`~/${machine}`), `PRIVACY.md does not name ~/${machine}`);
  const data = dataFilesIn(code('hooks/notice.sh'));
  assert.deepEqual([...new Set(data)].sort(), ['held', 'told']);
  for (const file of data) assert.ok(named(file), `PRIVACY.md does not name ${file}, which hooks/notice.sh writes`);
  assert.ok(PRIVACY.includes('~/.claude/plugins/data/'), 'PRIVACY.md does not say where Claude Code keeps the plugin data');
});

test('what each check reads out of the code: the shapes it knows, and a shape it does not know shows as nothing', () => {
  assert.deepEqual(hostsIn("const a = 'https://API.example.com/v1'; // http://b.test"), ['https://api.example.com', 'https://b.test']);
  assert.deepEqual(waysOutIn("import x from 'node:https';\nawait import('node:net');\nawait fetch(url);\nglobalThis.fetch(url);\n$.http.fetch(url);\nnew WebSocket(u)"), ['import https', 'import net', 'fetch', 'fetch', 'WebSocket']);
  assert.deepEqual(programsIn("exitOf(run, 'mkdir', []); run('mv', []); runIn(exec, 'rm', []); const G = ['/usr/bin/grep']; `${place}/sh`"), ['mkdir', 'mv', 'rm', 'grep', 'sh']);
  assert.deepEqual(variablesIn('$.env.get(\'HOME\'); $.env.set ( "RUNNING" , "1"); $.env.get(`https_proxy`)'), ['HOME', 'RUNNING', 'https_proxy']);
  assert.deepEqual(variablesIn('$.env.get(name); other.env.get("IGNORED"); $.env.get(`NOT_${literal}`); $.env.get("NOT_" + name)'), []);
  assert.deepEqual(shellVariablesIn('${MARK:-} $CLAUDE_PID ${CLAUDE_PLUGIN_DATA} $NAME1'), ['MARK', 'CLAUDE_PID', 'CLAUDE_PLUGIN_DATA', 'NAME1']);
  assert.deepEqual(shellVariablesIn('$pid ${mark:-} ${1:-} $1 $((lines + 1)) $(pwd) $LOCALsuffix'), []);
  assert.deepEqual([...variablesNamedIn('`PROXY`, `OTHER_PROXY` in either\ncase; `UPPER_ONLY`')].sort(), ['OTHER_PROXY', 'PROXY', 'UPPER_ONLY', 'other_proxy', 'proxy']);
  assert.deepEqual([...variablesNamedIn('PROXY, other_proxy')], []);
  assert.deepEqual(placesIn('export const a = (dir: string) => `${dir}/blobs`;\nconst g = (dir: string) => `${dir}/gc.json`;'), ['blobs', 'gc.json']);
  assert.deepEqual(dataFilesIn('told=$CLAUDE_PLUGIN_DATA/told\nheld=$CLAUDE_PLUGIN_DATA/held'), ['told', 'held']);
  const around = (text: string) => callAround(text, text.indexOf('$.http'));
  assert.equal(around('await find({ a: 1, http: (u, i) => $.http.fetch(u, i), b: [2] })'), 'find');
  assert.equal(around('await other({ http: (u) => g(u) }); find({}); x($.http)'), 'x');
});
