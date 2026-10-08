import assert from 'node:assert/strict';
import { test } from 'node:test';

import { encodeMedia } from '../src/encoded.ts';
import { blobPath } from '../src/layout.ts';
import { briefOf } from '../src/find.ts';
import { LISTED, READ_ONLY, cellsOf, listedOf, plain, showOf, sizeOf } from '../src/list.ts';
import { moveBodyOut, moveInputOut, moveOut, partTicketText } from '../src/store.ts';
import type { Message } from '../src/types.ts';
import { MemoryFiles, conversation, output, type Call } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';
const WIDE = 200;
const always = () => true;

const call = (label: string, lines = 30): Call => ({ tool: 'Bash', input: { command: `show ${label}` }, text: output(label, lines) });

/** A conversation whose every result was moved out into `dir`: the store holds the text, both sides of the call the ticket. */
async function compacted(files: MemoryFiles, calls: readonly Call[], dir = DIR): Promise<{ messages: Message[]; ids: string[] }> {
  const messages = conversation(calls);
  const ids: string[] = [];
  for (const [index, entry] of calls.entries()) {
    const stored = await moveOut(files, dir, entry.tool, entry.text);
    assert.ok(!('reason' in stored));
    ids.push(stored.id);
    for (const message of messages) {
      for (const use of message.toolUses) if (use.tool_use_id === `toolu_${index + 1}`) use.text = stored.text;
      for (const result of message.toolResults ?? []) if (result.tool_use_id === `toolu_${index + 1}`) result.text = stored.text;
    }
  }
  return { messages, ids };
}

const HEX = /[0-9a-f]{12}/;

test('/lossless-list gives a line a result, the newest last: id, size, lines, call and first line; its answer names none of them (#138)', async () => {
  const files = new MemoryFiles();
  const { messages, ids } = await compacted(files, [call('alpha'), call('beta', 3), call('gamma', 1)]);
  const listed = await listedOf(files, [DIR], messages, '', WIDE, always);
  assert.equal(listed.lines[0], '3 of 3 results moved out of this conversation, those inside kept parts first, the newest last');
  const rows = listed.lines.slice(1);
  assert.deepEqual(rows.map((row) => row.slice(0, 12)), ids.map((id) => id.slice(0, 12)));
  assert.match(rows[0] ?? '', /^[0-9a-f]{12} {2,}\d+ (B|KB) {2}30 lines {5}Bash show alpha — alpha line 1: value 0$/);
  assert.match(rows[2] ?? '', / 1 line {7}Bash show gamma — gamma line 1: value 0$/);
  // What the model reads names no result: no id, no call, nothing of what a result held.
  assert.equal(listed.text, '3 results listed for you alone; nothing of them is sent to the model');
  assert.doesNotMatch(listed.text, HEX);
  // Nothing moved out: said, with nothing on the screen.
  assert.deepEqual(await listedOf(files, [DIR], conversation([call('none')]), '', WIDE, always), { lines: [], text: 'nothing has left this conversation yet: a compaction moves results out' });
});

test('/lossless-list lists the newest 50, every one with all, and those whose line holds a word with it (#138)', async () => {
  const files = new MemoryFiles();
  const calls = Array.from({ length: LISTED + 5 }, (_, at) => call(`call${at + 1}`, 2));
  const { messages, ids } = await compacted(files, calls);
  const newest = await listedOf(files, [DIR], messages, '', WIDE, always);
  assert.equal(newest.lines[0], `${LISTED} of ${LISTED + 5} results moved out of this conversation, those inside kept parts first, the newest last; 5 before them: /lossless-list all`);
  assert.deepEqual(newest.lines.slice(1).map((row) => row.slice(0, 12)), ids.slice(5).map((id) => id.slice(0, 12)));
  assert.equal((await listedOf(files, [DIR], messages, 'all', WIDE, always)).lines.length, LISTED + 5 + 1);
  const word = await listedOf(files, [DIR], messages, 'CALL7 ', WIDE, always);
  assert.equal(word.lines[0], `1 of ${LISTED + 5} results moved out of this conversation hold "CALL7", in the same order`);
  assert.match(word.lines[1] ?? '', /Bash show call7 — call7 line 1/);
  // Out of time: a row not read says so, and still names its result.
  let left = 1;
  const once = await listedOf(files, [DIR], messages, '', WIDE, () => left-- > 0);
  assert.match(once.lines[2] ?? '', /^[0-9a-f]{12} .*not read: the time for this ran out$/);
});

test('/lossless-list draws nothing that moves the cursor or colours the screen, and no line wider than the screen (#138)', async () => {
  const files = new MemoryFiles();
  const escape = String.fromCharCode(27);
  const { messages } = await compacted(files, [{ tool: 'Bash', input: { command: `paint\nred` }, text: `${escape}[31mred${escape}[0m and more\nsecond line` }]);
  const [, row = ''] = (await listedOf(files, [DIR], messages, '', WIDE, always)).lines;
  assert.ok(!row.includes(escape), JSON.stringify(row));
  assert.match(row, /Bash paint red — \[31mred \[0m and more$/);
  for (const line of (await listedOf(files, [DIR], messages, '', 60, always)).lines.slice(1)) assert.ok([...line].length <= 40, line);
  assert.equal(plain(`a${String.fromCharCode(0x200b)}b${String.fromCharCode(0x7)}c`), 'a b c');
  assert.deepEqual([sizeOf(900), sizeOf(83_212), sizeOf(3 * 1024 * 1024)], ['900 B', '81 KB', '3.0 MB']);
});

test('/lossless-show takes every id /lossless-list shows, by its 12 characters, and names the file it is kept in, on a line of its own (#138)', async () => {
  const files = new MemoryFiles();
  const { messages, ids } = await compacted(files, [call('alpha'), call('beta')]);
  const rows = (await listedOf(files, [DIR], messages, '', WIDE, always)).lines.slice(1);
  for (const [at, row] of rows.entries()) {
    const id = ids[at] as string;
    const shown = await showOf(files, [DIR], messages, row.slice(0, 12));
    assert.deepEqual(shown.lines, [blobPath(DIR, id), `${id} · 30 lines · ${output(at === 0 ? 'alpha' : 'beta', 30).length} bytes`, READ_ONLY]);
    // What the model reads names neither the file nor the result.
    assert.equal(shown.text, 'the file is named for you alone; nothing of it is sent to the model');
  }
  assert.equal((await showOf(files, [DIR], messages, 'ffffffff')).text, 'nothing /lossless-list can show begins ffffffff');
  assert.match((await showOf(files, [DIR], messages, 'abc')).text, /^give an id \/lossless-list shows/);
});

test('/lossless-show names the place it was found in, says a result holds images, and says a file that is not what was stored (#138)', async () => {
  const files = new MemoryFiles();
  const EARLIER = '/data/earlier';
  const { messages, ids } = await compacted(files, [call('alpha')], EARLIER);
  assert.equal((await showOf(files, [DIR, EARLIER], messages, ids[0] as string)).lines[0], blobPath(EARLIER, ids[0] as string));

  const png = `iVBORw0KGgo${'Qk1G'.repeat(50)}`;
  const pictured = await compacted(files, [{ tool: 'Read', input: { file_path: 'shot.png' }, text: encodeMedia([{ type: 'text', text: 'a screenshot' }, { type: 'image', media_type: 'image/png', data: png }]) }]);
  const shown = await showOf(files, [DIR], pictured.messages, pictured.ids[0] as string);
  assert.match(shown.lines[1] ?? '', / · 1 line · \d+ bytes · 1 image: the file is a line of the plugin's, then JSON with each image's bytes in base64$/);
  assert.match((await listedOf(files, [DIR], pictured.messages, '', WIDE, always)).lines[1] ?? '', /1 line, 1 image {2}Read shot\.png — a screenshot$/);

  // Changed on disk after it was stored: named as not what was stored, with no path to open.
  const changed = new MemoryFiles();
  const again = await compacted(changed, [call('alpha')]);
  await changed.write(blobPath(DIR, again.ids[0] as string), 'changed by hand');
  assert.deepEqual((await showOf(changed, [DIR], again.messages, again.ids[0] as string)).lines, [`${again.ids[0]}: its file is not what was stored, and recall refuses it`]);
});

test('/lossless-list puts each where its ticket stands: the middle of the newest message comes last, after the results before it (#138)', async () => {
  const files = new MemoryFiles();
  const { messages, ids } = await compacted(files, Array.from({ length: LISTED + 5 }, (_, at) => call(`call${at + 1}`, 2)));
  const middle = await moveBodyOut(files, DIR, 'assistant', output('said', 40));
  assert.ok(!('reason' in middle));
  messages.push({ role: 'assistant', text: `The head paragraph.\n\n${middle.text}\n\nThe tail paragraph.`, toolUses: [] });
  const listed = await listedOf(files, [DIR], messages, '', WIDE, always);
  const rows = listed.lines.slice(1);
  assert.equal(rows.length, LISTED);
  assert.equal(rows.at(-1)?.slice(0, 12), middle.id.slice(0, 12), 'the newest, last');
  assert.deepEqual(rows.slice(0, -1).map((row) => row.slice(0, 12)), ids.slice(6).map((id) => id.slice(0, 12)));
  assert.match(listed.lines[0] ?? '', /; 6 before them: \/lossless-list all$/);
});

test('/lossless-list cuts a line by the cells a terminal draws, two for a wide character (#138)', async () => {
  const files = new MemoryFiles();
  const { messages } = await compacted(files, [{ tool: 'Bash', input: { command: 'cat 日本語.txt' }, text: `${'日本語の一行目です。'.repeat(12)}\nsecond line` }]);
  const [, row = ''] = (await listedOf(files, [DIR], messages, '', 100, always)).lines;
  assert.match(row, /Bash cat 日本語\.txt — 日本語の一行目.*…$/);
  assert.ok(cellsOf(row) <= 76 && cellsOf(row) > 70, `${cellsOf(row)} cells`);
  assert.equal(cellsOf('日本 ab'), 7);
});

test('a call whose value left is named by its next field, never by the ticket where the value was (#138)', async () => {
  const files = new MemoryFiles();
  const moved = await moveInputOut(files, DIR, 'Bash', 'command', output('script', 80));
  assert.ok(!('reason' in moved));
  assert.equal(briefOf('Bash', { command: moved.text, description: 'print the script' }), 'Bash print the script');
  assert.equal(briefOf('Bash', { command: moved.text }), 'Bash');
  assert.equal(briefOf('Read', { file_path: 'src/app.ts', limit: 20 }), 'Read src/app.ts');
  // What a search looked for says more than where it looked.
  assert.equal(briefOf('Grep', { path: 'src', pattern: 'TODO' }), 'Grep TODO');
});

test('a word is looked for in what each result is, and the rows not read for lack of time are counted, not matched (#138)', async () => {
  const files = new MemoryFiles();
  const { messages } = await compacted(files, Array.from({ length: 5 }, (_, at) => call(`call${at + 1}`, 2)));
  let left = 2;
  const some = await listedOf(files, [DIR], messages, 'time', WIDE, () => left-- > 0);
  assert.deepEqual(some.lines, ['0 of 5 results moved out of this conversation hold "time", in the same order; 3 not read, as the time for this ran out']);
  let again = 2;
  const found = await listedOf(files, [DIR], messages, 'call2', WIDE, () => again-- > 0);
  assert.equal(found.lines.length, 2);
  assert.match(found.lines[1] ?? '', /Bash show call2 — call2 line 1/);
});

test("a result inside a kept part stays before the conversation's own when the agent recalls it later: an id written in a recall is no ticket standing there (#138)", async () => {
  const files = new MemoryFiles();
  const old = await moveOut(files, DIR, 'Bash', output('old', 30));
  assert.ok(!('reason' in old));
  const part = `--- assistant\n[call Bash toolu_o] {"command":"show old"}\n--- user\n[result toolu_o]\n${old.text}\n`;
  const kept = await moveOut(files, DIR, 'conversation', part);
  assert.ok(!('reason' in kept));
  const { messages, ids } = await compacted(files, [call('new1'), call('new2')]);
  messages.unshift({ role: 'user', text: `[lossless-compaction] kept\n${partTicketText({ part: 1, parts: 1, first: 1, last: 2, bytes: kept.bytes, id: kept.id })}`, toolUses: [] });
  // The agent recalls the old result by its id: the id then stands in the call, and the result in what came back.
  messages.push({ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'toolu_r', tool: 'mcp__lossless-compaction__recall', input: { id: old.id } }] });
  messages.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'toolu_r', text: output('old', 30), isError: false }] });
  const rows = (await listedOf(files, [DIR], messages, '', WIDE, always)).lines.slice(1);
  assert.deepEqual(rows.map((row) => row.slice(0, 12)), [old.id, kept.id, ...ids].map((id) => id.slice(0, 12)));
  // Named by the call the part holds, as the conversation's own are.
  assert.match(rows[0] ?? '', /Bash show old — old line 1: value 0$/);
});

test('a symbol drawn as an emoji is two cells, and a path that names the plugin is a path like any other (#138)', () => {
  assert.equal(cellsOf('✅❌✨⏳⭐🚀🟢🫠'), 16);
  assert.equal(briefOf('Read', { file_path: '/w/jev-lossless-compaction/src/list.ts' }), 'Read /w/jev-lossless-compaction/src/list.ts');
});
