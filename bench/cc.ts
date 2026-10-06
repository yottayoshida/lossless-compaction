// Starts one headless Claude Code session the way every session of the benchmark
// is started, and reads what it printed. The user's own settings are left out, so
// that no hook, memory or plugin of the machine it runs on is part of what is
// measured; signing in is not a setting and works as usual.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { KEY_VARS, problemsOf, readSession, type Arm, type Session } from './lib.ts';

/** The window a session compacts against, whatever its model's own, unless its trace names another: 200,000 less Claude Code's reserve is the 167,000 the plugin sees. */
export const AUTOCOMPACT = '200000';

/** The id Claude Code gives a plugin loaded with `--plugin-dir`. */
const PLUGIN_ID = 'lossless-compaction@inline';

export type Start = {
  /** Where the session's printed events are kept. */
  out: string;
  cwd: string;
  model: string;
  arm: Arm;
  /** The checkout of the plugin to load, in the plugin arm. */
  pluginDir?: string;
  /** Where the plugin keeps what it moves out: never the store of the person running this. */
  storeDir: string;
  /** Other settings of the plugin, as `/plugin configure` would set them. */
  pluginOptions?: Record<string, unknown>;
  allowedTools: readonly string[];
  /** The session to go on from; absent, a new conversation. */
  resume?: string;
  /** With `resume`: false goes on in that session, as a trace is built; otherwise a copy is made and the session is left as it was. */
  fork?: boolean;
  effort?: string;
  prompt: string;
  /** The version of Claude Code the run is held to, once the first session has shown it. */
  version?: string;
  /** True at a question: a refused call does not stop the run, see `Expect`. */
  refusalsCounted?: boolean;
  /** The keys `find` asks Jev with, in the sessions that compare it: handed to the session's environment, and written nowhere. */
  env?: Readonly<Record<string, string>>;
  /** False for a session nothing goes on from: Claude Code keeps no record of it, so no later session can read what it was asked and answered. */
  kept?: boolean;
  /** The window to compact against, in tokens, where the trace names one. */
  window?: number;
  /** Claude Code's classic hooks for this session alone, as a settings file holds them: what a check needs added to a message (bench/host.ts). */
  hooks?: Record<string, unknown>;
};

export type Ran = { session: Session; text: string; wallMs: number };

/** A session that has not ended by now is stopped, and the run with it. */
const LIMIT_MS = 30 * 60 * 1000;

/** The tools a session started this way has: the built-in ones named, and the plugin's in its arm. */
export const toolsOf = (start: Pick<Start, 'arm' | 'allowedTools'>): string[] => start.allowedTools.filter((tool) => start.arm === 'plugin' || !tool.startsWith('mcp__'));

export function argsOf(start: Start): string[] {
  const settings = { pluginConfigs: { [PLUGIN_ID]: { options: { storeDir: start.storeDir, ...start.pluginOptions } } }, ...(start.hooks === undefined ? {} : { hooks: start.hooks }) };
  return [
    '-p',
    start.prompt,
    '--model',
    start.model,
    // No user, project or local settings: no hooks, no enabled plugins, no permissions of the machine.
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--settings',
    JSON.stringify(settings),
    // The built-in tools there are at all: a tool left out cannot be called, where one merely
    // not allowed still runs when Claude Code takes the call for harmless (`cat`, say).
    '--tools',
    start.allowedTools.filter((tool) => !tool.startsWith('mcp__')).join(','),
    '--allowedTools',
    start.allowedTools.join(','),
    '--autocompact',
    start.window === undefined ? AUTOCOMPACT : String(start.window),
    ...(start.arm === 'plugin' && start.pluginDir !== undefined ? ['--plugin-dir', start.pluginDir] : []),
    ...(start.resume !== undefined ? ['--resume', start.resume, ...(start.fork === false ? [] : ['--fork-session'])] : []),
    ...(start.effort !== undefined ? ['--effort', start.effort] : []),
    ...(start.kept === false ? ['--no-session-persistence'] : []),
    '--output-format',
    'stream-json',
    '--verbose',
  ];
}

/** The variable early access turned function hooks on with, ignored from Claude Code 2.1.287. */
export const FUNCTION_HOOKS = 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS';

/**
 * The environment a session is started in: that of whoever runs the benchmark, without a key for `find` unless the session was
 * handed one, and without `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` unless it was handed that: from Claude Code 2.1.287 function hooks
 * run without it, which a session that runs the plugin then shows, as the README says it needs nothing set.
 */
export function envOf(start: Pick<Start, 'env'>, from: Readonly<Record<string, string | undefined>> = process.env): Record<string, string | undefined> {
  const env = { ...from };
  for (const name of [...KEY_VARS, FUNCTION_HOOKS]) delete env[name];
  return { ...env, ...start.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
}

/** Runs the session to its end. Throws when it was not the session meant: a wrong arm, other tools than those named, a refused tool, a hook of the machine. */
export async function claude(start: Start): Promise<Ran> {
  mkdirSync(dirname(start.out), { recursive: true });
  const began = Date.now();
  const text = await new Promise<string>((resolve, reject) => {
    const child = spawn('claude', argsOf(start), {
      cwd: start.cwd,
      env: envOf(start),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let stopped = false;
    const limit = setTimeout(() => {
      stopped = true;
      child.kill('SIGKILL');
    }, LIMIT_MS);
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) => {
      clearTimeout(limit);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(limit);
      if (stopped) reject(new Error(`${start.out}: the session had not ended after ${LIMIT_MS / 60000} minutes and was stopped`));
      else if (out === '') reject(new Error(`claude printed nothing (exit ${code}): ${err.slice(0, 400)}`));
      else resolve(out);
    });
  });
  const wallMs = Date.now() - began;
  writeFileSync(start.out, text);
  const session = readSession(text);
  const expect = {
    arm: start.arm,
    tools: toolsOf(start),
    ...(start.pluginDir !== undefined ? { pluginPath: start.pluginDir } : {}),
    ...(start.version !== undefined ? { version: start.version } : {}),
    ...(start.refusalsCounted ? { refusalsCounted: true } : {}),
  };
  const problems = problemsOf(session, expect);
  if (problems.length > 0) throw new Error(`${start.out}: ${problems.join('; ')}`);
  return { session, text, wallMs };
}
