import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GREP, collect, liveIds, sentinelOf, writeSentinel } from '../src/lifetime.ts';
import { DAY } from '../src/layout.ts';
import { bodyTicketText, idOf, partTicketText, ticketText } from '../src/store.ts';
import type { DirEntry, Exec, Message } from '../src/types.ts';
import { checkWitnesses, newestOf, noteWitness, witnessCandidates } from '../src/witness.ts';
import { MemoryFiles } from './helpers.ts';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const DIR = '/home/u/.claude/lossless-compaction';
const ROOT = '/home/u/.claude/projects';
const PROJECT = `${ROOT}/-home-u-work`;
const SESSION = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const TRANSCRIPT = `${PROJECT}/${SESSION}.jsonl`;

/** grep as the store runs it: `-aohE` over sets of transcripts for the clean-up, `-F -q` on one file for a witness; mkdir, mv and rm. */
function commands(files: MemoryFiles) {
  const ran: string[][] = [];
  const exec: Exec = async (argv) => {
    ran.push([...argv]);
    const [program = '', ...args] = argv;
    const name = program.slice(program.lastIndexOf('/') + 1);
    const operands = args.slice(args.indexOf('--') + 1);
    if (name === 'grep' && args.includes('-F')) {
      const [needle = '', path = ''] = operands;
      const text = files.files.get(path);
      if (text === undefined) return { exitCode: 2, stdout: '', truncated: false };
      return { exitCode: text.includes(needle) ? 0 : 1, stdout: '', truncated: false };
    }
    if (name === 'grep') {
      // Only what is named `*.jsonl` is read, as `--include=*.jsonl` reads it.
      const lines: string[] = [];
      for (const [path, text] of files.files) {
        const named = operands.some((operand) => path === operand || path.startsWith(`${operand}/`));
        if (named && path.endsWith('.jsonl')) lines.push(...(text.match(/[0-9a-f]{64}/g) ?? []));
      }
      return { exitCode: lines.length > 0 ? 0 : 1, stdout: lines.map((line) => `${line}\n`).join(''), truncated: false };
    }
    if (name === 'rm') {
      for (const path of operands) files.files.delete(path);
      return { exitCode: 0, stdout: '', truncated: false };
    }
    if (name === 'mkdir') {
      for (const dir of operands) for (let cut = dir.length; cut > 0; cut = dir.lastIndexOf('/', cut - 1)) files.dirs.add(dir.slice(0, cut));
      return { exitCode: 0, stdout: '', truncated: false };
    }
    if (name === 'mv') {
      const dest = (operands.pop() ?? '').replace(/\/$/, '');
      for (const source of operands) {
        const text = files.files.get(source);
        if (text === undefined || !files.dirs.has(dest)) return { exitCode: 1, stdout: '', truncated: false };
        files.files.delete(source);
        files.files.set(`${dest}/${source.slice(source.lastIndexOf('/') + 1)}`, text);
      }
      return { exitCode: 0, stdout: '', truncated: false };
    }
    return { exitCode: 127, stdout: '', truncated: false };
  };
  const remove = async (path: string) => void (await exec(['/bin/rm', '-f', '--', path], 1000));
  return { exec, ran, remove };
}

const list = (files: MemoryFiles) => (path: string) => files.list(path);
const exists = (files: MemoryFiles) => async (path: string) => files.stat(path).then(() => true, () => false);
const held = (files: MemoryFiles) => async (id: string) => files.files.has(`${DIR}/index/${id}.json`);

/** A result kept in the store, `age` old: its id. */
async function kept(files: MemoryFiles, text: string, age: number): Promise<string> {
  const id = await idOf(text);
  await files.write(`${DIR}/blobs/${id}.txt`, text);
  await files.write(`${DIR}/index/${id}.json`, JSON.stringify({ bytes: text.length, tool: 'Read' }));
  files.mtimes.set(`${DIR}/blobs/${id}.txt`, NOW - age);
  return id;
}

/** A line of a transcript that names `id`, as Claude Code writes a ticket a tool call returned. */
const line = (id: string) => `${JSON.stringify({ message: { content: ticketText({ tool: 'Bash', bytes: 4000, id }) } })}\n`;

/** The ids of the witnesses noted. */
function witnesses(files: MemoryFiles): string[] {
  return [...files.files].filter(([path]) => path.startsWith(`${DIR}/witness/`)).map(([, text]) => (JSON.parse(text) as { id: string }).id);
}

/** What collectOnce does, in its order: search, look up the witnesses, and only then collect. */
async function cleanUp(files: MemoryFiles) {
  const { exec, remove } = commands(files);
  await writeSentinel(files, DIR);
  const live = await liveIds(files, list(files), exec, exists(files), [ROOT], sentinelOf(DIR));
  if ('stop' in live) return live;
  const unseen = await checkWitnesses(files, list(files), exec, remove, DIR, [ROOT], live.grep);
  if (unseen !== null) return unseen;
  return collect(list(files), exec, DIR, live.ids, NOW);
}

test('a witness is the newest ticket a conversation shows that the store holds, of any kind, and is not looked for on disk (ADR 0027)', async () => {
  const [a, b, c, d] = await Promise.all(['a', 'b', 'c', 'd'].map((one) => idOf(one)));
  const messages: Message[] = [
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: ticketText({ tool: 'Bash', bytes: 9000, id: a as string }), isError: false }] },
    { role: 'user', text: partTicketText({ part: 1, parts: 1, first: 1, last: 3, bytes: 4000, id: b as string }), toolUses: [] },
    { role: 'user', text: bodyTicketText({ bytes: 5000, id: c as string }), toolUses: [] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't2', text: ticketText({ tool: 'Read', bytes: 900, id: d as string }), isError: false }] },
  ];
  // Newest first, whatever the kind: the one most lately written tells a transcript written otherwise from then on.
  assert.deepEqual(witnessCandidates(messages), [d, c, b, a]);
  assert.deepEqual(witnessCandidates([{ role: 'user', text: 'nothing moved out', toolUses: [] }]), []);

  const files = new MemoryFiles();
  const older = await kept(files, 'o'.repeat(4000), DAY);
  // The newest the store does not hold: the next one is the witness. No transcript is read for it.
  assert.equal(await noteWitness(files, DIR, SESSION, [await idOf('not held'), older], held(files), NOW), older);
  assert.deepEqual(witnesses(files), [older]);
  assert.equal(files.looked.some((path) => path.startsWith(ROOT)), false, 'no transcript looked at');
  // A session id of another shape notes nothing.
  assert.equal(await noteWitness(files, DIR, '../etc', [older], held(files), NOW), null);
});

test('a clean-up stops where a conversation compacted with tickets is still there and the search does not find the ticket noted for it: renamed, compressed, spelled otherwise, or moved inside its directory (ADR 0027)', async () => {
  for (const [how, change] of [
    ['renamed', (files: MemoryFiles, id: string) => files.write(`${PROJECT}/${SESSION}.jsonl.gz`, line(id))],
    ['spelled otherwise', (files: MemoryFiles, id: string) => files.write(TRANSCRIPT, line(id).toUpperCase())],
    ['moved inside its directory', (files: MemoryFiles, id: string) => files.write(`${PROJECT}/${SESSION}/transcript.json`, line(id))],
  ] as const) {
    const files = new MemoryFiles();
    const old = await kept(files, 'o'.repeat(4000), 30 * DAY);
    await files.write(TRANSCRIPT, line(old));
    await noteWitness(files, DIR, SESSION, [old], held(files), NOW - DAY);
    // Claude Code writes it otherwise: the old file is gone, or holds the ids another way.
    files.files.delete(TRANSCRIPT);
    await change(files, old);
    const done = await cleanUp(files);
    assert.ok('stop' in done && done.kind === 'unread', `${how}: ${JSON.stringify(done)}`);
    assert.ok(files.files.has(`${DIR}/blobs/${old}.txt`), `${how}: nothing moved`);
    assert.deepEqual(witnesses(files), [old], `${how}: the witness stays, to stop the next clean-up too`);
  }
});

test('a conversation written otherwise from its start, or from some point on, stops the clean-up too: its newest ticket is its witness, wherever it was written (ADR 0027)', async () => {
  // From its start: no `<session>.jsonl` was ever there, and the ticket of its first compaction is its witness.
  const fresh = new MemoryFiles();
  const first = await kept(fresh, 'f'.repeat(4000), 3 * DAY);
  await noteWitness(fresh, DIR, SESSION, [first], held(fresh), NOW - 2 * DAY);
  await fresh.write(`${PROJECT}/${SESSION}.jsonl.gz`, line(first));
  const one = await cleanUp(fresh);
  assert.ok('stop' in one && one.kind === 'unread', JSON.stringify(one));
  assert.ok(fresh.files.has(`${DIR}/blobs/${first}.txt`));
  // From some point on: the transcript holds the older ticket as before, and the newest as it is written now.
  const turned = new MemoryFiles();
  const older = await kept(turned, 'o'.repeat(4000), 30 * DAY);
  const newer = await kept(turned, 'n'.repeat(4000), 3 * DAY);
  await turned.write(TRANSCRIPT, line(older) + line(newer).toUpperCase());
  await noteWitness(turned, DIR, SESSION, witnessCandidates([
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: ticketText({ tool: 'Bash', bytes: 4000, id: older }), isError: false }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't2', text: ticketText({ tool: 'Bash', bytes: 4000, id: newer }), isError: false }] },
  ]), held(turned), NOW - DAY);
  const two = await cleanUp(turned);
  assert.ok('stop' in two && two.kind === 'unread', JSON.stringify(two));
  assert.ok(turned.files.has(`${DIR}/blobs/${newer}.txt`));
});

test("a witness is looked for in its own conversation's transcript alone: a copy of the ticket in a subagent's or another conversation's does not pass it (ADR 0027)", async () => {
  const files = new MemoryFiles();
  const old = await kept(files, 'o'.repeat(4000), 30 * DAY);
  await noteWitness(files, DIR, SESSION, [old], held(files), NOW - DAY);
  // The conversation's own transcript is written otherwise; a subagent's and another session's still hold the id.
  await files.write(TRANSCRIPT, line(old).toUpperCase());
  await files.write(`${PROJECT}/${SESSION}/subagents/agent-a1.jsonl`, line(old));
  await files.write(`${PROJECT}/other-session.jsonl`, line(old));
  const done = await cleanUp(files);
  assert.ok('stop' in done && done.kind === 'unread', JSON.stringify(done));
});

test('a witness lets go where its conversation is gone, or reads as no witness; the folders Claude Code keeps beside a transcript and hidden files are not the conversation (ADR 0027)', async () => {
  const files = new MemoryFiles();
  const { exec, remove } = commands(files);
  const old = await kept(files, 'o'.repeat(4000), 30 * DAY);
  await files.write(TRANSCRIPT, line(old));
  await noteWitness(files, DIR, SESSION, [old], held(files), NOW - DAY);
  // Written in its transcript: it passes, and stays.
  assert.equal(await checkWitnesses(files, list(files), exec, remove, DIR, [ROOT], GREP[0]), null);
  assert.deepEqual(witnesses(files), [old]);
  // The transcript removed, its subagents' and tool results' folders and a hidden file left: the conversation is gone.
  files.files.delete(TRANSCRIPT);
  await files.write(`${PROJECT}/${SESSION}/subagents/agent-1.jsonl`, 'x');
  await files.write(`${PROJECT}/${SESSION}/tool-results/r.txt`, 'x');
  await files.write(`${PROJECT}/${SESSION}/.DS_Store`, 'x');
  assert.equal(await checkWitnesses(files, list(files), exec, remove, DIR, [ROOT], GREP[0]), null);
  assert.deepEqual(witnesses(files), [], 'let go');
  // What does not read as a witness goes, and stops nothing.
  for (const text of ['', `{"session":"../x","id":"${old}"}`, `{"session":"${SESSION}","id":"short"}`]) {
    await files.write(`${DIR}/witness/w.json`, text);
    assert.equal(await checkWitnesses(files, list(files), exec, remove, DIR, [ROOT], GREP[0]), null, text);
    assert.equal(files.files.has(`${DIR}/witness/w.json`), false, text);
  }
});

test('a place that cannot be listed, or a transcript no grep could be run on, stops the clean-up: it cannot be told (ADR 0027)', async () => {
  const files = new MemoryFiles();
  const { exec, remove } = commands(files);
  const old = await kept(files, 'o'.repeat(4000), 30 * DAY);
  await files.write(TRANSCRIPT, line(old));
  await noteWitness(files, DIR, SESSION, [old], held(files), NOW - DAY);
  const refusing = (path: string): Promise<DirEntry[]> => (path === PROJECT ? Promise.reject(new Error('EACCES')) : files.list(path));
  assert.equal((await checkWitnesses(files, refusing, exec, remove, DIR, [ROOT], GREP[0]))?.kind, 'place');
  const noGrep: Exec = async (argv) => {
    if (String(argv[0]).endsWith('grep')) throw new Error('cannot start grep');
    return exec(argv, 1000);
  };
  assert.equal((await checkWitnesses(files, list(files), noGrep, remove, DIR, [ROOT], GREP[0]))?.kind, 'unread');
  assert.deepEqual(witnesses(files), [old], 'kept: nothing could be told');
});

test('with a witness noted, a transcript renamed keeps every result; with the conversation gone, the clean-up goes on as before (ADR 0027)', async () => {
  for (const gone of [false, true]) {
    const files = new MemoryFiles();
    const old = await kept(files, 'o'.repeat(4000), 30 * DAY);
    await files.write(TRANSCRIPT, line(old));
    await noteWitness(files, DIR, SESSION, [old], held(files), NOW - DAY);
    files.files.delete(TRANSCRIPT);
    if (!gone) await files.write(`${PROJECT}/${SESSION}.jsonl.zst`, line(old));
    const done = await cleanUp(files);
    if (gone) {
      assert.ok(!('stop' in done) && done.trashed === 1, JSON.stringify(done));
      assert.deepEqual(witnesses(files), []);
    } else {
      assert.equal('stop' in done && done.kind, 'unread', JSON.stringify(done));
      assert.ok(files.files.has(`${DIR}/blobs/${old}.txt`), 'nothing moved');
    }
  }
});

test('the witness of a compaction is a ticket it put in, where it put any, before what stays behind a cut; at a start the one noted stays while the conversation shows it (ADR 0027)', async () => {
  const [old, part, later] = await Promise.all(['old', 'part', 'later'].map((one) => idOf(one)));
  const result = (id: string): Message => ({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id.slice(0, 4), text: ticketText({ tool: 'Bash', bytes: 4000, id }), isError: false }] });
  const before: Message[] = [{ role: 'user', text: 'first', toolUses: [] }, result(old as string)];
  // A cut: its part's ticket in front, what stays behind it, the older ticket among it.
  const after: Message[] = [{ role: 'user', text: 'first', toolUses: [] }, { role: 'user', text: partTicketText({ part: 1, parts: 1, first: 2, last: 9, bytes: 4000, id: part as string }), toolUses: [] }, result(old as string)];
  assert.deepEqual(newestOf(after, before), [part, old]);
  assert.deepEqual(newestOf(before, before), [old], 'nothing put in: the newest by place');

  const files = new MemoryFiles();
  for (const text of ['old', 'part', 'later']) await files.write(`${DIR}/index/${await idOf(text)}.json`, '{}');
  await noteWitness(files, DIR, SESSION, newestOf(after, before), held(files), NOW - DAY);
  assert.deepEqual(witnesses(files), [part]);
  // A resume showing the part's ticket and a later one: the one noted at the compaction stays.
  assert.equal(await noteWitness(files, DIR, SESSION, [later as string, part as string], held(files), NOW, { keepStanding: true }), part);
  assert.deepEqual(witnesses(files), [part]);
  // A resume that does not show it — never written to its transcript — notes the newest it shows.
  assert.equal(await noteWitness(files, DIR, SESSION, [later as string, old as string], held(files), NOW, { keepStanding: true }), later);
  assert.deepEqual(witnesses(files), [later]);
});

test('a transcript the grep does not read to the end in its time stops the clean-up, and no other grep is tried (#118)', async () => {
  const files = new MemoryFiles();
  const { exec, remove } = commands(files);
  const old = await kept(files, 'o'.repeat(4000), 30 * DAY);
  await files.write(TRANSCRIPT, line(old));
  await noteWitness(files, DIR, SESSION, [old], held(files), NOW - DAY);
  const started: string[] = [];
  const outOfTime: Exec = async (argv) => {
    if (String(argv[0]).endsWith('grep')) {
      started.push(String(argv[0]));
      throw new Error('still running after 30000 ms');
    }
    return exec(argv, 1000);
  };
  assert.equal((await checkWitnesses(files, list(files), outOfTime, remove, DIR, [ROOT], GREP[0]))?.kind, 'unread');
  assert.deepEqual(started, [GREP[0]], 'one grep, once');
  // One that cannot read the transcript (2) stops it too: what it holds cannot be told.
  const unreadable: Exec = async (argv) => (String(argv[0]).endsWith('grep') ? { exitCode: 2, stdout: '', truncated: false } : exec(argv, 1000));
  assert.equal((await checkWitnesses(files, list(files), unreadable, remove, DIR, [ROOT], GREP[0]))?.kind, 'unread');
  assert.deepEqual(witnesses(files), [old], 'kept: nothing could be told');
});
