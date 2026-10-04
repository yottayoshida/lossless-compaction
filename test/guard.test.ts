import assert from 'node:assert/strict';
import { test } from 'node:test';

import { guarded, placedTicketIds, refusal, refused, ticketIdsIn } from '../src/guard.ts';
import { FIND_TOOL, RECALL_TOOL, inputTicketText, partTicketText, ticketText } from '../src/store.ts';

const ID = 'a'.repeat(64);
const OTHER = `${'b'.repeat(63)}c`;
const result = ticketText({ tool: 'Read', bytes: 83261, id: ID });
const knows =
  (...ids: string[]) =>
  async (id: string) =>
    ids.includes(id);

/** `value` under `depth` objects, one inside the other. */
const nested = (depth: number, value: unknown): unknown => (depth === 0 ? value : { inner: nested(depth - 1, value) });

// One line each: an input a tool could be handed, holding the ticket of ID.
const HELD: [string, unknown][] = [
  ['a ticket that is the whole value', { tool: 'Write', file_path: '/work/out.ts', content: result }],
  ['an indented ticket', { content: `export const x = 1;\n    ${result}\n` }],
  ['a ticket behind a comment mark', { content: `// ${result}\nconst y = 2;` }],
  ['a ticket in a quoted string', { content: `const lines = ["${result}",\n];` }],
  ['a ticket in the middle of a line', { content: `see ${result} for the rest` }],
  ['a ticket in the second edit of several', { tool: 'MultiEdit', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: result }] }],
  ['a ticket in a here-document', { tool: 'Bash', command: `cat > out.ts <<'EOF'\n${result}\nEOF` }],
  ['a ticket as the key of an object', { [result]: 1 }],
  ['a ticket nine objects down', nested(9, result)],
  ['the ticket of an input', { content: inputTicketText({ tool: 'Write', field: 'content', bytes: 9120, id: ID }) }],
  ['the ticket of a kept part', { content: partTicketText({ part: 1, parts: 3, first: 1, last: 14, bytes: 39000, id: ID }) }],
  [
    'the ticket of the middle of a message',
    { content: `Read this.\n[moved out] the middle of this message; recall returns the whole message, 31204 bytes, head and tail included, with ${RECALL_TOOL} id ${ID}\nThe end.` },
  ],
  ['a ticket in the wording of 0.2.0', { content: `[moved out] Read result, 10 bytes; recall with mcp__jev-lossless-compaction__recall id ${ID}` }],
  [
    'a ticket in the wording of 0.1.0',
    {
      content: `[jev-lossless-compaction] This Read result (10 bytes) was moved out of the conversation and is kept unchanged on disk. To read it, call the tool mcp__jev-lossless-compaction__recall with id ${ID}.`,
    },
  ],
];

for (const [name, input] of HELD) {
  test(`a call is refused for ${name}`, async () => {
    assert.deepEqual([...ticketIdsIn(input)], [ID]);
    assert.equal(await refused(input, knows(ID)), refusal(ID));
    // What refuses it is that the id is known: the same input goes through where nothing knows the id.
    assert.equal(await refused(input, knows(OTHER)), null);
  });
}

// One line each: an input that holds no ticket, whatever it looks like.
const PASSED: [string, unknown][] = [
  ['an id alone', { content: `the result is kept under ${ID}` }],
  ['the words of a ticket with no id', { content: '[moved out] the couch, 2 boxes; recall with the movers' }],
  ['a ticket whose id is a character short', { content: result.slice(0, -1) }],
  ['a ticket whose id runs on', { content: `${result}0` }],
  ['a ticket whose id is in capitals', { content: result.replace(ID, ID.toUpperCase()) }],
  ['a ticket cut in two by a line break', { content: result.replace('; recall', ';\nrecall') }],
  ['a bracket and, 500 characters on, the end of a ticket', { content: `[moved out] ${'x'.repeat(500)} recall with ${RECALL_TOOL} id ${ID}` }],
  ['numbers, flags and nothing', { limit: 5, offset: 10, flags: [true, null, undefined] }],
];

for (const [name, input] of PASSED) {
  test(`a call goes through with ${name}`, async () => {
    assert.deepEqual([...ticketIdsIn(input)], []);
    // Whatever is known: nothing was found to ask about.
    assert.equal(await refused(input, async () => true), null);
  });
}

test('every tool is looked at but the plugin\'s own, under either name, and those known only to read', () => {
  for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Agent', 'Task', 'mcp__notion__notion-update-page', 'ATool2027']) {
    assert.equal(guarded(tool), true, tool);
  }
  for (const tool of [RECALL_TOOL, FIND_TOOL, 'mcp__jev-lossless-compaction__recall', 'mcp__jev-lossless-compaction__find', 'Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'ToolSearch']) {
    assert.equal(guarded(tool), false, tool);
  }
  // A tool of another's that only ends as one of these does is looked at.
  assert.equal(guarded('mcp__files__Read'), true);
  assert.equal(guarded('mcp__other__recall'), true);
});

test('with two tickets in an input, the one that is known refuses the call', async () => {
  const input = { content: `${ticketText({ tool: 'Read', bytes: 5, id: OTHER })}\n${result}` };
  assert.deepEqual([...ticketIdsIn(input)].sort(), [ID, OTHER].sort());
  assert.equal(await refused(input, knows(ID)), refusal(ID));
  assert.equal(await refused(input, knows(OTHER)), refusal(OTHER));
});

test('when an id cannot be looked up, the shape of a ticket is enough to refuse', async () => {
  const cannot = async () => {
    throw new Error('the store could not be read');
  };
  assert.equal(await refused({ content: result }, cannot), refusal(ID));
  // And an input with no ticket still goes through: nothing was looked up.
  assert.equal(await refused({ content: 'plain' }, cannot), null);
});

test('what the model is told is fixed wording and the id, and nothing of the input', async () => {
  const told = await refused({ file_path: '/secret/place.txt', content: `PRIVATE ${result}` }, knows(ID));
  assert.equal(
    told,
    `[lossless-compaction] Not run: the input holds the ticket of something moved out of this conversation, not what it stands for. Call ${RECALL_TOOL} with id ${ID} and use what it returns.`,
  );
  assert.equal(String(told).includes('PRIVATE'), false);
  assert.equal(String(told).includes('/secret'), false);
});

test('the tickets the plugin put in a conversation are told from a ticket\'s shape the agent wrote', () => {
  const [result, input, part, written, self] = ['1', '2', '3', '4', '5'].map((seed) => seed.repeat(64)) as [string, string, string, string, string];
  const messages = [
    { role: 'assistant' as const, text: '', toolUses: [
      { tool_use_id: 'a', tool: 'Write', input: { file_path: 'x.ts', content: inputTicketText({ tool: 'Write', field: 'content', bytes: 9, id: input }) } },
      { tool_use_id: 'b', tool: 'Write', input: { file_path: 'doc.md', content: `see ${ticketText({ tool: 'Read', bytes: 9, id: written })}` } },
      { tool_use_id: 'c', tool: 'Bash', input: { command: inputTicketText({ tool: 'Bash', field: 'command', bytes: 9, id: self }) } },
    ] },
    { role: 'user' as const, text: '', toolUses: [], toolResults: [{ tool_use_id: 'a', text: ticketText({ tool: 'Read', bytes: 9, id: result }), isError: false }] },
    { role: 'user' as const, text: `[lossless-compaction] kept\n${partTicketText({ part: 1, parts: 1, first: 1, last: 2, bytes: 9, id: part })}`, toolUses: [] },
  ];
  assert.deepEqual([...placedTicketIds(messages, 'c')].sort(), [result, input, part].sort());
  // The call being looked at counts when it is not the one being looked at.
  assert.ok(placedTicketIds(messages).has(self));
});
