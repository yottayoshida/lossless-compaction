import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// docs/development.md, "Layers": what keeps a text and gives it back knows nothing of Claude Code. Here that is held:
// the files of the store's foundation carry none of the marks of the host, and read no file that does.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** The foundation: where a store's files are, the host's file system as types, storing and reading back, and how a result with images is held as text. */
const FOUNDATION = ['src/layout.ts', 'src/files.ts', 'src/blobs.ts', 'src/encoded.ts'] as const;

/** What tells a file knows Claude Code: the names its tools are called by, its directory and variables, a conversation's messages, the object a hook is handed. */
const MARKS: readonly [string, RegExp][] = [
  ['a tool name as the model calls it', /mcp__/],
  ["Claude Code's directory", /\.claude\b/],
  ["one of Claude Code's variables", /\bCLAUDE_[A-Z]/],
  ['the shape of a conversation', /\b(?:Message|ToolUse|ToolResult|tool_result|tool_use|tool_use_id)\b/],
  ['a line Claude Code writes into a conversation', /system-reminder/],
  ['the object a hook is handed', /\$\.[a-z]/],
];

/** A file's code without its comments, where the host may be spoken of. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** The files of this repository a file reads, by their paths from the root. */
const importsOf = (path: string) => [...code(read(path)).matchAll(/(?:from|import)\s*\(?\s*['"`]([^'"`]+)['"`]/g)].map((match) => (/^\.\/[\w-]+\.ts$/.test(match[1] ?? '') ? `src/${(match[1] ?? '').slice(2)}` : (match[1] ?? '')));
const marksIn = (text: string) => MARKS.filter(([, mark]) => mark.test(code(text))).map(([what]) => what);

test('the foundation of the store carries no mark of Claude Code, and reads no file outside itself', () => {
  for (const path of FOUNDATION) {
    assert.deepEqual(marksIn(read(path)), [], `${path} knows the host`);
    for (const read of importsOf(path)) assert.ok((FOUNDATION as readonly string[]).includes(read), `${path} reads ${read}, which is not of the foundation`);
  }
  // What is kept and given back is there, not in the file that words the tickets.
  const blobs = read('src/blobs.ts');
  for (const name of ['async function put(', 'async function writeOnce(', 'export async function store(', 'export async function recall(', 'export async function idOf(']) {
    assert.ok(blobs.includes(name), `src/blobs.ts: ${name}`);
    assert.ok(!read('src/store.ts').includes(name), `src/store.ts still defines ${name}`);
  }
  // The control: the file on the host's side does carry the marks, so the check sees one where there is one.
  assert.deepEqual(marksIn(read('src/store.ts')), ['a tool name as the model calls it', "Claude Code's directory", "one of Claude Code's variables", 'the shape of a conversation']);
  assert.equal(new Set(FOUNDATION).size, 4);
  assert.deepEqual(marksIn(read('hooks/move-out.ts')).at(-1), 'the object a hook is handed');
});

test('what a mark is: in code, not in a comment; a template of a path is not the object a hook is handed', () => {
  assert.deepEqual(marksIn("// as Claude Code's Message says\nconst a = `${dir}/blobs`;\n/** mcp__x */\n"), []);
  assert.deepEqual(marksIn("const t = 'mcp__p__recall';\nconst d = `${home}/.claude`;\nenv.CLAUDE_CONFIG_DIR;\nconst m: Message[] = [];\nconst n = /^<system-reminder>/;\nawait $.fs.read(p);\n"), MARKS.map(([what]) => what));
  assert.deepEqual(importsOf('src/blobs.ts').sort(), ['src/encoded.ts', 'src/files.ts', 'src/layout.ts']);
  // Whatever way a file is read, it is seen: from another directory, in double quotes, when it is asked for at run time, a module of the platform.
  assert.deepEqual([...`import a from "../hooks/move-out.ts";\nconst b = await import('./store.ts');\nimport './x.ts';\nimport { homedir } from 'node:os';`.matchAll(/(?:from|import)\s*\(?\s*['"`]([^'"`]+)['"`]/g)].map((match) => match[1]), ['../hooks/move-out.ts', './store.ts', './x.ts', 'node:os']);
  // The file that reads an image out of a conversation carries the marks, where it carried them in the foundation before it was split.
  assert.deepEqual(marksIn(read('src/media.ts')), ['the shape of a conversation', 'a line Claude Code writes into a conversation']);
  // The page names the same files.
  for (const path of FOUNDATION) assert.ok(read('docs/development.md').includes(`\`${path}\``), `docs/development.md does not name ${path}`);
});
