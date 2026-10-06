import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  KEY_VARS,
  OUTCOMES,
  conversationAfter,
  fetchedOf,
  gapsOf,
  holdsAll,
  keysIn,
  lexicalPick,
  lookedOutside,
  median,
  needed,
  outcomeOf,
  ownUsage,
  problemsOf,
  readLine,
  readSession,
  retrievalOf,
  shuffled,
  spread,
  summarizedBy,
  tellsIn,
  type Line,
  type ToolCall,
} from '../bench/lib.ts';
import { cutLine } from '../src/cut.ts';
import { saidBy, saidIn, type Conversation } from '../bench/build.ts';
import { FUNCTION_HOOKS, argsOf, envOf, toolsOf } from '../bench/cc.ts';
import { MISSED, VERSIONS, batchName, currentOf, itemsOf, keyOf, promptOf, published, scrubbed, summed, unitsUnder, verdictsIn, versionsIn, type Grades } from '../bench/grade.ts';
import { MIN_CHARS, pick, pickTable, readAnswer, resultsOf, staged, wentOf, type Pick } from '../bench/pick.ts';
import { chains, estimates, fetches, finds, graderOf, outcomesOf, overruled, report, verdictOf, whole } from '../bench/report.ts';
import { FETCHED, QUOTE, armsOf, leaf, staleness, variantsOf, type Unit } from '../bench/run.ts';
import { replay, triggerAt, windowOf } from '../bench/replay.ts';
import { BUILT, FOUND, LARGE, PROBED, TRACES, described, unnamed, type Question } from '../bench/traces.ts';
import { unnumbered } from '../src/changed.ts';
import { find, lineHolds, valuesOf } from '../src/find.ts';
import { termsOf } from '../src/select.ts';
import { reportLine, undoneLine, type Report } from '../src/compact.ts';
import { ID_LEAST } from '../src/store.ts';
import type { Http } from '../src/types.ts';
import { TOLD, ok, optionsAsked, questionsOf, recordingHttp, trusting, type Sent } from './helpers.ts';

// Sessions recorded on Claude Code 2.1.287 with Haiku 4.5, the user's settings left
// out: one trace of six reads, compacted by each arm, and one question asked of each.
// The results of the tool calls are taken out, the home directory is renamed, and what a
// session prints of the account it ran under is left out. They were recorded before the
// tools of a session were narrowed to the ones named, so each still lists them all.
const recorded = (name: string) => readSession(readFileSync(new URL(`./fixtures/bench/${name}.jsonl`, import.meta.url), 'utf8'));
const base = recorded('base');
const compactPlugin = recorded('compact-plugin');
const compactBuiltin = recorded('compact-builtin');
const questionPlugin = recorded('question-plugin');
const questionBuiltin = recorded('question-builtin');

test('a recorded session is read: what it ran with, each request once, the calls it made', () => {
  assert.equal(base.model, 'claude-haiku-4-5-20251001');
  assert.equal(base.version, '2.1.287');
  assert.deepEqual(base.plugins, []);
  assert.deepEqual(base.mcp, []);
  assert.equal(base.memory, null);
  assert.equal(base.answer, 'done');
  assert.equal(base.isError, false);
  assert.deepEqual(base.toolCalls.map((call) => call.name), ['Read', 'Read', 'Read', 'Read', 'Read', 'Read']);
  // Seven responses, though the stream prints one twice when it holds thinking and a call.
  assert.deepEqual(base.requests, [18257, 25453, 32524, 39587, 46649, 53712, 60777]);
  assert.equal(base.compaction, null);
});

test('a call printed again is the call it was: counted once by its id, whatever response carries it', () => {
  const said = (id: string, callId: string) =>
    JSON.stringify({ type: 'assistant', message: { id, usage: { input_tokens: 10 }, content: [{ type: 'tool_use', id: callId, name: 'Read', input: {} }] } });
  // The second response is the first printed again after a compaction; the third is a call of its own.
  const session = readSession([said('msg_1', 'toolu_1'), said('msg_2', 'toolu_1'), said('msg_3', 'toolu_2')].join('\n'));
  assert.deepEqual(session.toolCalls.map((call) => call.name), ['Read', 'Read']);
  // A call that carries no id cannot be told from another, and is kept.
  const bare = JSON.stringify({ type: 'assistant', message: { id: 'msg_4', content: [{ type: 'tool_use', name: 'Grep', input: {} }] } });
  assert.equal(readSession([bare, bare.replace('msg_4', 'msg_5')].join('\n')).toolCalls.length, 2);
});

test('a compaction is read from each arm: the plugin\'s line and no request, the summary\'s seconds and its own usage', () => {
  assert.deepEqual(compactPlugin.plugins, [{ source: 'lossless-compaction@inline', path: '/home/u/lossless-compaction' }]);
  assert.deepEqual(compactPlugin.mcp, ['lossless-compaction']);
  assert.deepEqual(compactPlugin.compaction, { trigger: 'manual', preTokens: 60882, postTokens: 13704, durationMs: 101, preserved: false, at: 0 });
  assert.equal(compactPlugin.uiLog.length, 1);
  assert.deepEqual(readLine(compactPlugin.uiLog[0] ?? ''), {
    outcome: 'moved',
    moved: 3,
    results: 6,
    images: 0,
    charsBefore: 108144,
    charsAfter: 54793,
    estimate: 44333,
    window: 167000,
    ms: 55,
  });
  assert.deepEqual(compactPlugin.requests, []);

  assert.deepEqual(compactBuiltin.plugins, []);
  assert.equal(compactBuiltin.compaction?.durationMs, 25730);
  assert.equal(compactBuiltin.compaction?.preserved, true);
  assert.deepEqual(compactBuiltin.uiLog, []);
});

test('what a session used by itself is its usage less its parent\'s: the plugin\'s compaction costs nothing, the summary its request', () => {
  // The figure a session prints is cumulative: the plugin's compaction shows the whole trace's cost.
  assert.equal(compactPlugin.modelUsage['claude-haiku-4-5-20251001']?.costUSD, base.modelUsage['claude-haiku-4-5-20251001']?.costUSD);
  const plugin = ownUsage(compactPlugin, base);
  assert.equal(plugin.costUSD, 0);
  assert.equal(plugin.outputTokens, 0);

  const builtin = ownUsage(compactBuiltin, base);
  assert.ok(Math.abs(builtin.costUSD - 0.0290912) < 1e-6, `${builtin.costUSD}`);
  assert.equal(builtin.outputTokens, 3928 - 890);
  assert.equal(builtin.thinkingTokens, 1572 - 391);
  // With no parent, a session's usage is all its own.
  assert.equal(ownUsage(base, null).costUSD, base.modelUsage['claude-haiku-4-5-20251001']?.costUSD);
});

test('a session that is not the one meant is told from its start, and why', () => {
  const had = { base: base.tools, builtin: compactBuiltin.tools, plugin: compactPlugin.tools };
  assert.deepEqual(problemsOf(base, { arm: 'builtin', tools: had.base, version: '2.1.287' }), []);
  assert.deepEqual(problemsOf(compactBuiltin, { arm: 'builtin', tools: had.builtin }), []);
  assert.deepEqual(problemsOf(compactPlugin, { arm: 'plugin', tools: had.plugin, pluginPath: '/home/u/lossless-compaction' }), []);

  assert.deepEqual(problemsOf(compactPlugin, { arm: 'builtin', tools: had.plugin }), [
    'the plugin is loaded in the built-in arm',
    'hooks ran in the built-in arm: SessionStart:compact',
  ]);
  assert.deepEqual(problemsOf(compactBuiltin, { arm: 'plugin', tools: had.builtin }), ['the plugin is not loaded once in the plugin arm']);
  // Two checkouts carry the same version: the arm is told by where the plugin was loaded from.
  assert.deepEqual(problemsOf(compactPlugin, { arm: 'plugin', tools: had.plugin, pluginPath: '/home/u/v0.5.2' }), ['the plugin was loaded from /home/u/lossless-compaction']);
  assert.deepEqual(problemsOf(base, { arm: 'builtin', tools: had.base, version: '2.1.286' }), ['Claude Code is 2.1.287, not 2.1.286']);

  // A session has the tools it was started with and no other: one more is a way to an answer the other arm may not have, one fewer a way it lacks.
  const asking = { ...base, tools: ['Read', 'Grep', 'Glob', 'ToolSearch'] };
  assert.deepEqual(problemsOf(asking, { arm: 'builtin', tools: ['Glob', 'Grep', 'Read', 'ToolSearch'] }), [], 'the order they are listed in is not looked at');
  assert.deepEqual(problemsOf({ ...asking, tools: [...asking.tools, 'Bash'] }, { arm: 'builtin', tools: asking.tools }), ["the session's tools are Bash, Glob, Grep, Read, ToolSearch, not Glob, Grep, Read, ToolSearch"]);
  assert.deepEqual(problemsOf({ ...asking, tools: [...asking.tools, 'mcp__lossless-compaction__find'] }, { arm: 'builtin', tools: asking.tools }).length, 1, 'a tool the plugin registered by itself');
  assert.deepEqual(problemsOf({ ...asking, tools: ['Read'] }, { arm: 'builtin', tools: asking.tools }), ["the session's tools are Read, not Glob, Grep, Read, ToolSearch"]);
  assert.deepEqual(problemsOf({ ...asking, tools: [] }, { arm: 'builtin', tools: [] }), [], 'the grader has none');
  // The plugin's tools are there in its arm only.
  const named = ['Read', 'ToolSearch', 'mcp__lossless-compaction__recall'];
  assert.deepEqual(toolsOf({ arm: 'plugin', allowedTools: named }), named);
  assert.deepEqual(toolsOf({ arm: 'builtin', allowedTools: named }), ['Read', 'ToolSearch']);

  const meddled = { ...base, memory: { auto: '/somewhere' }, mcp: ['notion'], denials: [{ tool_name: 'Write' }], hooks: ['Stop:lang-gate'], plugins: [{ source: 'other@market', path: '/p' }] };
  assert.deepEqual(problemsOf(meddled, { arm: 'builtin', tools: had.base }), [
    'other plugins are loaded: other@market',
    'other MCP servers are connected: notion',
    'automatic memory is on',
    '1 tool call(s) were refused',
    'hooks ran in the built-in arm: Stop:lang-gate',
    "hooks ran that are not the plugin's: Stop:lang-gate",
  ]);
  assert.ok(problemsOf(readSession(''), { arm: 'builtin', tools: [] }).includes('the session did not start'));
  // At a question a refused call is what the agent tried: counted, and no reason to stop.
  assert.deepEqual(problemsOf({ ...base, denials: [{ tool_name: 'Bash' }] }, { arm: 'builtin', tools: had.base, refusalsCounted: true }), []);
});

test('a figure a session did not give is not read as nought: the session is not used', () => {
  assert.deepEqual(gapsOf(compactPlugin, 'compaction'), []);
  assert.deepEqual(gapsOf(compactBuiltin, 'compaction'), []);
  assert.deepEqual(gapsOf(questionPlugin, 'question'), []);
  assert.deepEqual(gapsOf(questionBuiltin, 'question'), []);
  assert.deepEqual(gapsOf(base, 'compaction'), ['nothing was compacted']);
  // The plugin's compaction makes no request, which is not a gap; a question without one is.
  assert.deepEqual(compactPlugin.requests, []);
  assert.deepEqual(gapsOf({ ...questionPlugin, requests: [] }, 'question'), ['the question made no request']);
  assert.deepEqual(gapsOf({ ...questionPlugin, requests: [41176, 0], durationMs: 0, modelUsage: {} }, 'question'), [
    'a request did not say what it was sent',
    'the question did not say how long it took',
    'the question did not say what it used',
  ]);
  // A boundary printed without its figures: read, they are not numbers, and none is taken for zero.
  const bare = readSession(JSON.stringify({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual' } }));
  assert.ok(Number.isNaN(bare.compaction?.durationMs) && Number.isNaN(bare.compaction?.preTokens));
  assert.equal(gapsOf(bare, 'compaction').length, 3);
  // A compaction that took no time at all is a figure; one that says nothing of what was in use is not.
  const instant = readSession(JSON.stringify({ type: 'system', subtype: 'compact_boundary', compact_metadata: { pre_tokens: 60882, post_tokens: 13704, duration_ms: 0 } }));
  assert.deepEqual(gapsOf(instant, 'compaction'), []);
  assert.ok(problemsOf({ ...base, version: '' }, { arm: 'builtin', tools: base.tools }).includes('the session did not say which Claude Code it is'));
});

test('the plugin\'s line is read in every form it has, and from the function that writes it', () => {
  const report: Report = { results: 21, candidates: 9, moved: 6, inputs: 0, folded: 0, images: 2, charsBefore: 844544, charsAfter: 548237, tokensAfter: 52357, counted: true, window: 167000, notMoved: {}, writeErrors: [], ms: 61 };
  assert.deepEqual(readLine(`lossless-compaction: ${reportLine(report)}`), {
    outcome: 'moved', moved: 6, results: 21, images: 2, charsBefore: 844544, charsAfter: 548237, estimate: 52357, window: 167000, ms: 61,
  });
  // No count of tokens when the plugin could not stand behind one, and seconds for a slow one.
  const plain = readLine(reportLine({ ...report, images: 0, counted: false, ms: 2400 }));
  assert.equal(plain?.estimate, undefined);
  assert.equal(plain?.window, undefined);
  assert.equal(plain?.ms, 2400);
  assert.equal(readLine(`built-in compaction on what is left, too much is still in use: ${reportLine(report)}`)?.outcome, 'too-much');
  assert.equal(readLine(`built-in compaction: nothing could be moved out (${reportLine({ ...report, moved: 0 })})`)?.outcome, 'nothing');
  assert.equal(readLine('lossless-compaction: built-in compaction: the conversation holds what a rebuilt message cannot carry: image')?.outcome, 'other');
  // A `/compact` left undone (ADR 0015): what was in use where Claude Code gave the figure, and no figure where it did not.
  assert.deepEqual(readLine(`lossless-compaction: ${undoneLine(28425, 167000)}`), {
    outcome: 'undone', moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, inUse: 28425, window: 167000, ms: 0,
  });
  assert.deepEqual(readLine(`lossless-compaction: ${undoneLine(null, 167000)}`), { outcome: 'undone', moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, ms: 0 });
  // And with what takes the room named (ADR 0023): read the same.
  assert.deepEqual(readLine(`lossless-compaction: ${undoneLine(28425, 167000, { fixed: 12100, first: 15700 })}`), {
    outcome: 'undone', moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, inUse: 28425, window: 167000, ms: 0,
  });
  assert.equal(readLine('something else'), null);
});

test('a conversation cut in place of a summary is read as one the summary did not run on, with how much was kept (ADR 0019)', () => {
  const report: Report = { results: 21, candidates: 0, moved: 0, inputs: 0, folded: 0, images: 0, charsBefore: 440000, charsAfter: 330000, tokensAfter: 118000, counted: true, window: 167000, notMoved: {}, writeErrors: [], ms: 48 };
  // From the function that writes it: the sizes are those of what was handed back.
  const cut = readLine(`lossless-compaction: ${cutLine(report, { first: 2, last: 5, of: 16, parts: 3, over: false })}`);
  assert.deepEqual(cut, {
    outcome: 'cut', moved: 0, results: 21, images: 0, charsBefore: 440000, charsAfter: 330000, estimate: 118000, window: 167000, ms: 48, cut: { first: 2, last: 5, of: 16, parts: 3 },
  });
  assert.equal(readLine(cutLine(report, { first: 1, last: 2, of: 9, parts: 1, over: true }))?.outcome, 'cut', 'one part, and still over what may stay');
  const rebuilt = readLine(`lossless-compaction: ${cutLine(report, null)}`);
  assert.equal(rebuilt?.outcome, 'rebuilt');
  assert.equal(rebuilt?.cut, undefined);
  assert.equal(rebuilt?.estimate, 118000);

  // The summary ran where the plugin handed over, whatever for, and nowhere else.
  const of = (outcome: Line['outcome']): Line => ({ outcome, moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, ms: 0 });
  assert.deepEqual((['too-much', 'nothing', 'other'] as const).map((outcome) => summarizedBy(of(outcome))), [true, true, true]);
  assert.deepEqual((['moved', 'undone', 'cut', 'rebuilt'] as const).map((outcome) => summarizedBy(of(outcome))), [false, false, false, false]);
});

test('a compaction a hook skipped is read as not carried out, with what Claude Code said of it', () => {
  const why = `lossless-compaction: ${undoneLine(28425, 167000)}`;
  const skipped = readSession(
    [
      { type: 'system', subtype: 'status', status: 'compacting' },
      { type: 'system', subtype: 'status', status: null, compact_result: 'failed', compact_error: `skipped: ${why}` },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n'),
  );
  assert.equal(skipped.compaction, null);
  assert.equal(skipped.skipped, `skipped: ${why}`);
  // The plugin shows no line of its own beside it: what it left undone is read from the reason.
  assert.deepEqual(skipped.uiLog, []);
  assert.equal(readLine(skipped.skipped ?? '')?.inUse, 28425);
  // A compaction that went through is not one, nor is a session that compacted nothing.
  assert.equal(compactPlugin.skipped, null);
  assert.equal(base.skipped, null);
  assert.equal(readSession(JSON.stringify({ type: 'system', subtype: 'status', status: null, compact_result: 'success' })).skipped, null);
});

test('an exact answer is right when it holds every part asked for, whatever its spacing, case and Markdown', () => {
  const line = 'record 2-0150: station 1325 reported 664 units at step 150';
  assert.ok(holdsAll(`The line said:\n\n> Record 2-0150:  station 1325 reported 664 units\n  at step 150`, [line]));
  assert.ok(!holdsAll('record 2-0150: station 1325 reported 646 units at step 150', [line]));
  assert.ok(holdsAll('port 8443, and never add left-pad', ['8443', 'left-pad']));
  assert.ok(!holdsAll('port 8443', ['8443', 'left-pad']));
  assert.ok(!holdsAll('anything', []), 'nothing to look for is not a match');
  // The same text in bold, in code marks, or laid out in a table is the same answer.
  assert.ok(holdsAll('The line was **record 2-0150: station 1325 reported `664` units at step 150**.', [line]));
  assert.ok(holdsAll('| record | checksum |\n| --- | --- |\n| batch 07: 9 warnings, | checksum deadbeef |', ['batch 07: 9 warnings, checksum deadbeef']));
  assert.ok(!holdsAll('**checksum deadbeee**', ['checksum deadbeef']));
  // The marks sit against the punctuation of what they wrap, and a quoted line is folded.
  const whole = 'batch 07: 9 warnings, checksum deadbeef';
  for (const answer of ['**batch 07**: 9 warnings, checksum deadbeef', 'batch 07: **9 warnings**, checksum deadbeef', 'batch 07: 9 warnings, checksum _deadbeef_', '`batch 07: 9 warnings, checksum deadbeef`.', '> batch 07: 9 warnings,\n> checksum deadbeef']) {
    assert.ok(holdsAll(answer, [whole]), answer);
  }
  assert.ok(!holdsAll('batch 07: 9 warnings, checksum dead beef', [whole]), 'a space inside the text is not layout');
});

test('the two recorded answers do not hold the line, and neither brought anything back', () => {
  for (const [session, arm] of [[questionPlugin, 'plugin'], [questionBuiltin, 'builtin']] as const) {
    assert.ok(!holdsAll(session.answer, ['record 2-0150: station 1325 reported 664 units at step 150']), arm);
    assert.deepEqual(retrievalOf(session.toolCalls), { recalls: 0, finds: 0, searches: 0, reads: 0 }, arm);
    assert.equal(outcomeOf('abstained', session.toolCalls), 'abstained');
  }
  // What each was sent first after its compaction: the plugin's arm holds the newest results still.
  assert.equal(questionPlugin.requests[0], 41176);
  assert.equal(questionBuiltin.requests[0], 21665);
  // Each answer says what became of the result: words that tell the arm, counted so that grading can be shown not to turn on them.
  assert.ok(tellsIn(questionPlugin.answer) > 0);
  assert.ok(tellsIn(questionBuiltin.answer) > 0);
  assert.equal(tellsIn('Line 150 reads: station 1325 reported 664 units.'), 0);
  assert.equal(tellsIn('The oldest ticket is T-1271, of 17 open tickets.'), 0, 'a word of a trace\'s own files tells no arm');
});

test('how a question went is told from the verdict and the calls: what was brought back counts before what was read again', () => {
  const call = (name: string): ToolCall => ({ name, input: {} });
  const recall = call('mcp__lossless-compaction__recall');
  const find = call('mcp__lossless-compaction__find');
  assert.equal(outcomeOf('correct', []), 'correct from context');
  assert.equal(outcomeOf('correct', [call('ToolSearch'), recall]), 'correct after recall');
  assert.equal(outcomeOf('correct', [find, recall]), 'correct after find');
  assert.equal(outcomeOf('correct', [call('Read')]), 'correct after reading again');
  assert.equal(outcomeOf('correct', [call('Read'), recall]), 'correct after recall');
  assert.equal(outcomeOf('correct', [call('Glob')]), 'correct from context', 'listing files reads none');
  assert.equal(outcomeOf('incorrect', []), 'incorrect without retrieval');
  assert.equal(outcomeOf('incorrect', [call('ToolSearch')]), 'incorrect without retrieval', 'loading a tool brings nothing back');
  assert.equal(outcomeOf('incorrect', [recall]), 'incorrect after retrieval');
  assert.equal(outcomeOf('incorrect', [call('Grep')]), 'incorrect after reading again');
  assert.equal(outcomeOf('abstained', [recall]), 'abstained');
  // Digging what was dropped out of Claude Code's own record is not reading a file of the work again.
  assert.equal(outcomeOf('correct', [call('Grep'), call('Read')], true), 'correct after reading outside the working directory');
  assert.equal(outcomeOf('incorrect', [call('Grep')], true), 'incorrect after reading outside the working directory');
  assert.equal(outcomeOf('correct', [call('Read'), recall], true), 'correct after recall', 'what the plugin brought back counts first');
  assert.equal(outcomeOf('incorrect', [recall], true), 'incorrect after retrieval');
  assert.equal(outcomeOf('abstained', [call('Grep')], true), 'abstained');
  assert.equal(new Set(OUTCOMES).size, 10);
  assert.deepEqual(retrievalOf([call('ToolSearch'), recall, recall, find, call('Read'), call('Grep'), call('Glob')]), { recalls: 2, finds: 1, searches: 1, reads: 2 });
});

test('a session that read outside its working directory is told apart', () => {
  const read = (file_path: string): ToolCall => ({ name: 'Read', input: { file_path } });
  const cwd = '/home/u/bench/work/t1';
  assert.ok(!lookedOutside([read('/home/u/bench/work/t1/log2.txt'), read('log2.txt'), { name: 'Grep', input: { pattern: 'x', path: 'src' } }], cwd));
  assert.ok(lookedOutside([read('/home/u/.claude/projects/x/session.jsonl')], cwd));
  assert.ok(lookedOutside([read('/home/u/bench/store/blobs/abc.txt')], cwd));
  assert.ok(lookedOutside([read('../../store/blobs/abc.txt')], cwd));
  assert.ok(lookedOutside([{ name: 'Glob', input: { pattern: '*', path: '~/.claude' } }], cwd));
  assert.ok(!lookedOutside([{ name: 'Bash', input: { command: 'cat /etc/hosts' } }], cwd), 'only the file tools are looked at: Bash is not allowed at all');
});

test('a few runs are shown as they are, more as their median and range', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.ok(Number.isNaN(median([])));
  assert.equal(spread([55, 6, 4]), '55, 6, 4');
  assert.equal(spread([1, 2, 3, 4, 100]), '3 (1–100)');
  assert.equal(spread([0.0291, 0.03], 3), '0.029, 0.030');
  assert.equal(spread([]), '—');
});

test('the plain baseline picks the entry sharing the most words with the question', () => {
  const entries = [
    { id: 'a', text: 'record 1-0001: station 12 reported 3 units' },
    { id: 'b', text: 'error: the kernel refused the call with ENOSYS on this platform' },
    { id: 'c', text: 'error: disk full' },
  ];
  assert.equal(lexicalPick('which result reported that the kernel refused a call?', entries)?.id, 'b');
  assert.equal(lexicalPick('nothing in common here', entries)?.id, 'a', 'a tie goes to the first');
  assert.equal(lexicalPick('anything', []), null);
});

test('the order answers are graded in is not the order they were given in, and can be made again', () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const once = shuffled(items, 28);
  assert.deepEqual(shuffled(items, 28), once);
  assert.notDeepEqual(once, items);
  assert.notDeepEqual(shuffled(items, 29), once);
  assert.deepEqual([...once].sort((a, b) => a - b), items);
});

// --- the traces, the grading and the tables ---

test('every trace asks the same nine kinds of question, and each exact answer is in the file or output it is about', () => {
  assert.equal(TRACES.length, 6);
  assert.equal(new Set(TRACES.map((trace) => trace.name)).size, 6);
  for (const trace of TRACES) {
    assert.deepEqual(
      trace.questions.map((question) => question.kind),
      ['exact-gone', 'exact-gone', 'exact-unchanged', 'exact-then', 'exact-now', 'continuity', 'continuity', 'constraint', 'constraint'],
      trace.name,
    );
    const file = (path: string) => trace.files.find((one) => one.path === path)?.text ?? '';
    const regenerated = trace.beforeCompaction.find((step): step is { write: string; text: string } => 'write' in step);
    assert.ok(regenerated, `${trace.name}: one file is regenerated before the compaction`);
    assert.ok(trace.beforeCompaction.some((step) => 'remove' in step && step.remove === 'report.sh'), `${trace.name}: the script is gone before the compaction`);
    const [gone1, gone2, unchanged, then, now] = trace.questions;
    for (const question of [gone1, gone2]) for (const needle of question?.needles ?? []) assert.ok(file('report.sh').includes(needle), `${trace.name} ${question?.id}`);
    const kept = trace.files.find((one) => one.path.startsWith('kept-'));
    for (const needle of unchanged?.needles ?? []) assert.ok(kept?.text.includes(needle), `${trace.name} unchanged`);
    // What the file said then is not what it says now: an answer from the old reading is wrong for "now", and the other way round.
    for (const needle of then?.needles ?? []) {
      assert.ok(file(regenerated.write).includes(needle), `${trace.name} then`);
      assert.ok(!regenerated.text.includes(needle), `${trace.name} then is not now`);
    }
    for (const needle of now?.needles ?? []) {
      assert.ok(regenerated.text.includes(needle), `${trace.name} now`);
      assert.ok(!file(regenerated.write).includes(needle), `${trace.name} now is not then`);
    }
    for (const question of trace.questions.filter((one) => one.kind === 'continuity' || one.kind === 'constraint')) {
      assert.ok(question.rubric && question.right && question.wrong, `${trace.name} ${question.id}: a rubric and both controls`);
      assert.ok(question.kind !== 'constraint' || !question.ask.includes(question.reference), `${trace.name} ${question.id}`);
    }
    // A rule is stated in the first message and nowhere else: no file, no later message and no question holds the phrase that marks it.
    const [opening, ...later] = trace.steps;
    const pieces = [...trace.files.map((one) => one.text), ...[...later, ...trace.beforeCompaction].map((step) => ('say' in step ? step.say : 'write' in step ? step.text : ''))];
    assert.equal(trace.marks.length, 2, trace.name);
    assert.equal(new Set(trace.marks).size, 2, trace.name);
    for (const mark of trace.marks) {
      assert.equal(opening !== undefined && 'say' in opening ? opening.say.split(mark).length - 1 : 0, 1, `${trace.name}: "${mark}" is said once in the first message`);
      assert.equal(pieces.filter((text) => text.includes(mark)).length, 0, `${trace.name}: "${mark}" is in a file or a later message`);
      assert.deepEqual(trace.questions.filter((question) => question.ask.includes(mark)).map((question) => question.id), [], `${trace.name}: "${mark}" is in a question`);
    }
    const rules = trace.questions.filter((question) => question.kind === 'constraint');
    assert.ok(rules.every((question, at) => question.reference.includes(trace.marks[at] ?? '\0')), `${trace.name}: each mark is of the rule its question asks for`);
    // No question names a tool or says what to do when the answer is not at hand.
    for (const question of [...trace.questions, ...trace.finds]) {
      assert.ok(!/recall|find tool|Read tool|cannot|do not read|don't read/i.test(question.ask), `${trace.name} ${question.id}: ${question.ask}`);
    }
    for (const find of trace.finds) {
      const everything = [...trace.files.map((one) => one.text), ...trace.steps.map((step) => ('say' in step ? step.say : ''))].join('\n');
      assert.ok(everything.includes(find.target) || trace.name === 'writes', `${trace.name} ${find.id}`);
    }
  }
});

test('bench/questions.json is the traces written out: what is asked is fixed in the repository, apart from the code that runs it', () => {
  const written = JSON.parse(readFileSync(new URL('../bench/questions.json', import.meta.url), 'utf8'));
  assert.deepEqual(written, JSON.parse(JSON.stringify(described())));
});

test('every session of the benchmark is started without the user\'s settings, with its tools named, in a fixed window', () => {
  const args = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'plugin', pluginDir: '/p', storeDir: '/s', allowedTools: ['Read', 'Grep'], resume: 'abc', prompt: 'hello' });
  const at = (flag: string) => args[args.indexOf(flag) + 1];
  assert.equal(at('--setting-sources'), '');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(at('--allowedTools'), 'Read,Grep');
  assert.equal(at('--tools'), 'Read,Grep', 'the built-in tools there are, not only the ones allowed');
  assert.equal(at('--autocompact'), '200000');
  // A trace that names a window of its own has every session of it started in that one.
  const wide = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'builtin', storeDir: '/s', allowedTools: ['Read'], prompt: 'hello', window: 1_000_000 });
  assert.equal(wide[wide.indexOf('--autocompact') + 1], '1000000');
  assert.equal(at('--plugin-dir'), '/p');
  assert.deepEqual(JSON.parse(at('--settings') ?? ''), { pluginConfigs: { 'lossless-compaction@inline': { options: { storeDir: '/s' } } } });
  assert.deepEqual(args.slice(args.indexOf('--resume'), args.indexOf('--resume') + 3), ['--resume', 'abc', '--fork-session']);
  // Building a trace goes on in one session; the built-in arm loads no plugin.
  const going = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'builtin', pluginDir: '/p', storeDir: '/s', allowedTools: [], resume: 'abc', fork: false, prompt: 'next' });
  assert.ok(!going.includes('--fork-session') && !going.includes('--plugin-dir'));
  // The plugin's tool is allowed by name; it is not one of the built-in tools.
  const asking = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'plugin', pluginDir: '/p', storeDir: '/s', allowedTools: ['Read', 'ToolSearch', 'mcp__lossless-compaction__recall'], prompt: 'q' });
  assert.equal(asking[asking.indexOf('--tools') + 1], 'Read,ToolSearch');
  assert.equal(asking[asking.indexOf('--allowedTools') + 1], 'Read,ToolSearch,mcp__lossless-compaction__recall');
  // The grader has no tool at all.
  const grading = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'builtin', storeDir: '/s', allowedTools: [], prompt: 'grade' });
  assert.equal(grading[grading.indexOf('--tools') + 1], '');
  // A session nothing goes on from leaves no record for a later one to read; the others are kept, to be forked.
  assert.ok(argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'builtin', storeDir: '/s', allowedTools: [], resume: 'abc', prompt: 'q', kept: false }).includes('--no-session-persistence'));
  assert.ok(!args.includes('--no-session-persistence') && !going.includes('--no-session-persistence'));
});

const unitOf = (arm: 'plugin' | 'builtin', run: number, questions: Unit['questions'], over: Partial<Unit['compaction']> = {}): Unit => ({
  trace: 'results',
  version: 1,
  base: 'base-session',
  plugin: arm === 'plugin' ? 'abc1234' : null,
  pluginCommit: arm === 'plugin' ? 'c0ffee1' : null,
  model: 'haiku',
  run,
  arm,
  first: (run % 2 === 1) === (arm === 'plugin'),
  variant: 'default',
  mode: 'ask',
  at: '2026-10-02T00:00:00Z',
  claudeCode: '2.1.287',
  compaction: {
    sessionId: 's',
    durationMs: arm === 'plugin' ? 55 : 25730,
    wallMs: 0,
    preTokens: 60882,
    postTokens: arm === 'plugin' ? 13704 : 2462,
    line: null,
    summarized: arm === 'builtin',
    own: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: arm === 'plugin' ? 0 : 0.0291, thinkingTokens: 0 },
    ...over,
  },
  questions,
});

const answered = (id: string, kind: Unit['questions'][number]['kind'], answer: string, calls: string[], verdict?: 'correct'): Unit['questions'][number] => ({
  id,
  kind,
  answer,
  calls,
  retrieval: { recalls: calls.filter((name) => name.endsWith('__recall')).length, finds: 0, searches: 0, reads: calls.filter((name) => name === 'Read').length },
  outside: false,
  refused: 0,
  tells: 0,
  requests: [41176],
  durationMs: 4951,
  wallMs: 5200,
  own: { inputTokens: 10, outputTokens: 330, cacheReadInputTokens: 15196, cacheCreationInputTokens: 25970, costUSD: 0.0551, thinkingTokens: 0 },
  ...(verdict !== undefined ? { verdict } : {}),
});

test('a unit whose /compact was left undone is tabled as that: no summary, and a row of its own only where there is one', () => {
  const asked = [answered('next', 'continuity', 'Next is log13 to log16.', [], 'correct')];
  // Units measured before a `/compact` could be left undone make the tables they made.
  assert.ok(!report([unitOf('plugin', 1, asked), unitOf('builtin', 1, asked)], null).includes('Left as it was'));
  const undone = unitOf('plugin', 1, asked, { undone: true, summarized: false, durationMs: 52, preTokens: 28425, postTokens: 28425 });
  const tables = report([undone, unitOf('builtin', 1, asked)], null);
  assert.ok(tables.includes('| Built-in summary ran | 0 of 1 | 1 of 1 |'));
  assert.ok(tables.includes('| Left as it was, nothing compacted | 1 of 1 | 0 of 1 |'));
  assert.ok(tables.includes('| Compaction, ms | 52 | 25730 |'));
  // It estimated nothing, so it has no row where estimates are set against what was in use; one that compacted has.
  const line = { outcome: 'undone' as const, moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, ms: 0, inUse: 28425, window: 167000 };
  const moved = { outcome: 'moved' as const, moved: 6, results: 21, images: 0, charsBefore: 9, charsAfter: 5, ms: 61, estimate: 52357, window: 167000 };
  const rows = estimates([{ ...undone, compaction: { ...undone.compaction, line } }, unitOf('plugin', 2, asked, { line: moved })]).split('\n').slice(2);
  assert.deepEqual(rows.map((row) => row.split(' | ')[4]), ['moved']);
});

test('the grader is sent a number, the question, the facts, the rubric and the answer: nothing of the arm, the model or the run', () => {
  const units = [
    unitOf('plugin', 1, [answered('next', 'continuity', 'Next is log13 to log16.', []), answered('gone-1', 'exact-gone', 'batch 07: …', [], 'correct')]),
    unitOf('builtin', 1, [answered('next', 'continuity', 'I do not know.', []), answered('gone-1', 'exact-gone', 'I cannot run it again, but it was batch 07: 3 warnings.', [])]),
  ];
  const items = itemsOf(units);
  // The exact answer the program found right is not sent. The one it did not is: only to say whether something else was given or nothing.
  const toGrade = items.filter((item) => item.expected === undefined);
  const [first, second] = units;
  assert.ok(first !== undefined && second !== undefined);
  assert.deepEqual(toGrade.map((item) => item.key), [
    keyOf(first, 'next', 'Next is log13 to log16.'),
    keyOf(second, 'next', 'I do not know.'),
    keyOf(second, 'gone-1', 'I cannot run it again, but it was batch 07: 3 warnings.'),
  ]);
  // A verdict is filed under the answer it is on: the same question answered otherwise is another key.
  assert.match(keyOf(first, 'next', 'Next is log13 to log16.'), /^results\|haiku\|1\|plugin\|default\|next\|[0-9a-f]{12}$/);
  assert.notEqual(keyOf(first, 'next', 'Next is log13 to log16.'), keyOf(first, 'next', 'Next is log13 to log17.'));
  assert.deepEqual(toGrade.map((item) => item.rubric === MISSED), [false, false, true]);
  // For each of the 28 questions a model grades: a right and a wrong answer, each plain and with two openings that tell an arm.
  // For each trace's first exact question: another line and a plain "cannot tell", each plain and with the two openings, and the other line behind a hedge.
  const controls = items.filter((item) => item.expected !== undefined);
  // Of the seven conversations asked their own questions: the six, and the large one.
  assert.equal(controls.length, 28 * 2 * 3 + 7 * 7);
  assert.equal(controls.filter((item) => item.expected === 'correct').length, 28 * 3);
  assert.equal(controls.filter((item) => item.expected === 'abstained').length, 7 * 3);
  assert.equal(controls.filter((item) => item.rubric === MISSED && item.key.includes('|told-')).length, 7 * 4);
  assert.ok(controls.filter((item) => item.rubric === MISSED).every((item) => item.expected !== 'correct'), 'no answer under that rubric is right');
  // Only the units that asked a trace's questions are graded: a probe asks nothing of the conversation.
  assert.equal(itemsOf(units.map((unit) => ({ ...unit, mode: 'probe' as const }))).filter((item) => item.expected === undefined).length, 0);
  // Asked one after another, they are graded as well: an answer word for word the same as one asked of a fresh copy shares its key, and its verdict.
  assert.equal(itemsOf(units.map((unit) => ({ ...unit, mode: 'chain' as const }))).filter((item) => item.expected === undefined).length, items.filter((item) => item.expected === undefined).length);

  const prompt = promptOf(shuffled(items, 28).slice(0, 20));
  assert.ok(!/\b(plugin|builtin|built-in arm|haiku|sonnet|run-\d|default)\b/i.test(prompt.replace(/Dana Whitlock|default settings/g, '')), 'no arm, model or run in what the grader reads');
  assert.ok(!prompt.includes('results|') && !prompt.includes('control|'), 'nor the key an answer is filed under');
  assert.match(prompt, /=== Item 20 ===/);
});

test('a grader\'s reply is read by position, and what it left out is not guessed', () => {
  const verdicts = verdictsIn('1 correct\n2. incorrect\n 3: Abstained\n4 maybe\n6 correct\n2 correct\n', 5);
  assert.deepEqual([...verdicts], [[1, 'correct'], [2, 'incorrect'], [3, 'abstained']]);
  assert.equal(verdictsIn('I think they are all fine.', 3).size, 0);
});

test('the grader is measured on what was mixed in: answers known right and wrong, and whether words that tell an arm changed its verdict', () => {
  const items = itemsOf([unitOf('plugin', 1, [answered('next', 'continuity', 'Next is log13 to log16.', [])])]);
  // A grader that is right on every plain control, and marks down every answer that opens with a tell.
  const biased = new Map(items.map((item) => [item.key, item.expected === undefined ? ('correct' as const) : item.key.includes('|told-') ? ('incorrect' as const) : item.expected]));
  const fair = new Map(items.map((item) => [item.key, item.expected ?? ('correct' as const)]));
  const marked = summed(items, [biased, fair], 'a-model');
  assert.equal(marked.model, 'a-model');
  assert.equal(marked.controls.count, 217);
  assert.equal(marked.controls.graded, 217);
  assert.equal(marked.controls.asExpected, 56 + 56 + 7 + 7 + 14 + 7, 'the plain ones; the wrong answers that open with a tell; of the exact ones the hedged line, the other line however it opens, and the plain "cannot tell"');
  assert.equal(marked.controls.toldPairs, 112 + 28);
  assert.equal(marked.controls.toldPairsGraded, 140);
  assert.equal(marked.controls.toldPairsSame, 56 + 14, 'the right answers, and "cannot tell", were marked down for how they open');
  assert.equal(summed(items, [fair, fair]).controls.toldPairsSame, 140);
  assert.equal(summed(items, [fair, fair]).disagreements, 0);
  const answer = items.find((item) => item.expected === undefined)?.key ?? '';
  assert.match(answer, /\|next\|/);
  const differing = new Map(fair).set(answer, 'incorrect');
  assert.equal(summed(items, [fair, differing]).disagreements, 1);
  assert.deepEqual(summed(items, [fair, new Map()]).ungraded.length, items.length);
  assert.equal(summed(items, [fair, new Map()]).disagreements, 0, 'a pass that gave no grade disagrees with nothing');
  // A grader that said nothing was not unmoved by the words: no pair was graded, and none is counted as alike.
  const silent = summed(items, [new Map(), fair]);
  assert.deepEqual([silent.controls.graded, silent.controls.asExpected, silent.controls.toldPairsGraded, silent.controls.toldPairsSame], [0, 0, 0, 0]);
  // One of a pair left out: that pair says nothing either.
  const half = new Map(fair);
  half.delete('control|results|next|right');
  assert.deepEqual([summed(items, [half]).controls.toldPairsGraded, summed(items, [half]).controls.toldPairsSame], [138, 138]);
  // A pass keeps its place: the first pass giving no grade is not replaced by the second.
  assert.deepEqual(silent.verdicts[answer], [null, 'correct']);
  assert.match(graderOf(marked), /Graded by a-model.*Of 217 answers mixed in.*graded 217, 147 as expected.*both of 140, 70 alike/);
  assert.match(graderOf(null), /Nothing has been graded/);
});

test('a reply is kept for the very prompt it answered: another batch, grader or pass is another name', () => {
  const name = batchName(1, 'haiku', 'prompt A');
  assert.equal(batchName(1, 'haiku', 'prompt A'), name);
  assert.match(name, /^pass-1-[0-9a-f]{16}$/);
  assert.notEqual(batchName(1, 'haiku', 'prompt A, and one more answer'), name, 'more units measured since: other batches');
  assert.notEqual(batchName(1, 'sonnet', 'prompt A'), name);
  assert.notEqual(batchName(2, 'haiku', 'prompt A'), name);
});

test('a unit measured against something else is not taken for this one: another version, another building, another commit', () => {
  const measured = { version: 1, base: 'base-session', plugin: 'abc1234' };
  assert.equal(staleness(measured, { version: 1 }, { sessionId: 'base-session' }, 'abc1234'), null);
  assert.match(staleness(measured, { version: 2 }, { sessionId: 'base-session' }, 'abc1234') ?? '', /version 1 of the trace, which is now 2/);
  assert.match(staleness(measured, { version: 1 }, { sessionId: 'another' }, 'abc1234') ?? '', /built again/);
  assert.match(staleness(measured, { version: 1 }, { sessionId: 'base-session' }, 'def5678') ?? '', /the plugin's code abc1234, which is now def5678/);
  assert.equal(staleness({ ...measured, plugin: null }, { version: 1 }, { sessionId: 'base-session' }, null), null, 'the built-in arm runs no plugin');
  // A unit written before these were recorded is not this one either.
  assert.notEqual(staleness({ version: 1 } as never, { version: 1 }, { sessionId: 'base-session' }, null), null);
  // What is graded and tabled is the traces as they are now.
  const old = { ...unitOf('plugin', 1, []), version: 0 };
  assert.deepEqual(currentOf([unitOf('plugin', 1, []), old, unitOf('builtin', 1, [])]).older, 1);
  assert.equal(currentOf([old]).units.length, 0);
  assert.equal(currentOf([{ ...old, version: 1, trace: 'no-such-trace' }]).units.length, 0);
  assert.equal(currentOf([{ run: 1 } as never]).units.length, 0, 'a file that says neither trace nor version is not a current unit');
});

test('probes alone are tabled without the tables of questions, and a checkout can be probed at another share of the window', () => {
  const line = { outcome: 'moved' as const, moved: 3, results: 6, images: 0, charsBefore: 108144, charsAfter: 54793, estimate: 44333, window: 167000, ms: 55 };
  const probe = { ...unitOf('plugin', 1, [answered('probe', 'continuity', 'ok', [])], { line }), mode: 'probe' as const, variant: 'v0.6.0' };
  const alone = whole([probe], null);
  assert.ok(alone.startsWith('### What the plugin estimated against what was in use\n'), alone.slice(0, 80));
  assert.ok(!alone.includes('graded'));
  assert.match(whole([{ ...probe, version: 0 }].filter(() => false), null, 2), /^2 unit\(s\) measured an older version of their trace and are left out\.\n/);
  // The control: one unit that asked questions, and the tables of questions are there.
  assert.ok(whole([probe, unitOf('plugin', 1, [])], null).includes('### results, haiku'));

  assert.equal(variantsOf(undefined, undefined, '/here'), undefined);
  assert.deepEqual(variantsOf(undefined, '100', '/here'), [{ name: 'max-after-100', pluginDir: '/here', options: { maxAfterPercent: 100 } }]);
  assert.deepEqual(variantsOf('new=/a,v0.6.0=/b', undefined, '/here'), [{ name: 'new', pluginDir: '/a' }, { name: 'v0.6.0', pluginDir: '/b' }]);
  assert.deepEqual(variantsOf('v0.6.0=/b', '100', '/here'), [{ name: 'v0.6.0-max-after-100', pluginDir: '/b', options: { maxAfterPercent: 100 } }]);
  assert.throws(() => variantsOf('v0.6.0', undefined, '/here'), /name=path/);
  // The share a compaction aims at, alone or with the share that may stay.
  assert.deepEqual(variantsOf(undefined, undefined, '/here', '50'), [{ name: 'target-50', pluginDir: '/here', options: { targetPercent: 50 } }]);
  assert.deepEqual(variantsOf('new=/a', '75', '/here', '1'), [{ name: 'new-max-after-75-target-1', pluginDir: '/a', options: { maxAfterPercent: 75, targetPercent: 1 } }]);
});

test('what came back to a call is read with it, by the call\'s id: the first time it is printed, as text however it is held', () => {
  const call = (id: string, callId: string, name = 'mcp__plugin_lossless-compaction_lossless-compaction__recall') =>
    JSON.stringify({ type: 'assistant', message: { id, usage: { input_tokens: 10 }, content: [{ type: 'tool_use', id: callId, name, input: { id: 'a'.repeat(64) } }] } });
  const back = (callId: string, content: unknown) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: callId, content }] } });
  const session = readSession(
    [call('m1', 'toolu_1'), back('toolu_1', 'batch 07: 8 warnings'), call('m2', 'toolu_2', 'Read'), back('toolu_2', [{ type: 'text', text: 'one' }, { type: 'image' }, { type: 'text', text: 'two' }]), back('toolu_1', 'printed again')].join('\n'),
  );
  assert.deepEqual(
    session.toolCalls.map((one) => [one.id, one.result]),
    [
      ['toolu_1', 'batch 07: 8 warnings'],
      ['toolu_2', 'one\ntwo'],
    ],
  );
  // A call no result came back to has none, and one that carries no id is never given another's.
  const bare = JSON.stringify({ type: 'assistant', message: { id: 'm3', content: [{ type: 'tool_use', name: 'Grep', input: {} }] } });
  assert.deepEqual(readSession([call('m1', 'toolu_9'), bare, back('', 'stray')].join('\n')).toolCalls.map((one) => one.result), [undefined, undefined]);
});

test('where the answer went and how far the agent got: each step is counted from what it is, and a failure at one is told from one at the next', () => {
  const RECALL = 'mcp__plugin_lossless-compaction_lossless-compaction__recall';
  const FIND = 'mcp__plugin_lossless-compaction_lossless-compaction__find';
  const [holder, other] = ['1'.repeat(64), '2'.repeat(64)];
  const stored = new Map([
    [holder, 'build log\nbatch 07: 8 warnings, checksum 5384f20e\n'],
    [other, 'another log\n'],
  ]);
  const needles = ['8 warnings', '5384f20e'];
  const recall = (id: string, result?: string): ToolCall => ({ name: RECALL, input: { id }, id: `t-${id.slice(0, 4)}`, ...(result !== undefined ? { result } : {}) });
  // Fetched as meant: every step.
  assert.deepEqual(fetchedOf(needles, '[moved out] Bash result ...', stored, [recall(holder, stored.get(holder))]), { holders: [holder], inContext: false, tried: true, chose: true, restored: true });
  // The wrong piece: tried, chose none that holds it, nothing came back that holds it.
  assert.deepEqual(fetchedOf(needles, '', stored, [recall(other, 'another log')]), { holders: [holder], inContext: false, tried: true, chose: false, restored: false });
  // An id copied wrong that recall took for the one meant: what came back holds it, though the id given was not the holder's.
  assert.deepEqual(fetchedOf(needles, '', stored, [recall(`${holder.slice(0, 16)}${'0'.repeat(48)}`, stored.get(holder))]), { holders: [holder], inContext: false, tried: true, chose: false, restored: true });
  // Refused, the answer naming tickets with what they stand for, here one whose call holds what was asked: nothing came back (#107).
  const refusedNaming = `[lossless-compaction] Nothing is stored under that id on this machine.\nThe tickets of this conversation it may stand for:\n- Bash called with {"command":"grep \x278 warnings\x27 log | grep 5384f20e"}; 40 bytes; recall with x id ${holder}`;
  assert.deepEqual(fetchedOf(needles, '', stored, [recall(`${holder.slice(0, 63)}0`, refusedNaming)]), { holders: [holder], inContext: false, tried: true, chose: false, restored: false });
  // `find` gave the holder as its answer, with its text under the line it opens with: chosen, and it came back, with no `recall`.
  const finding = (result: string): ToolCall => ({ name: FIND, input: { question: 'which batch warned?' }, result });
  assert.deepEqual(fetchedOf(needles, '', stored, [finding(`[found] Bash result, 40 bytes; id ${holder}; probability 0.9\n\n${stored.get(holder)}`)]), { holders: [holder], inContext: false, tried: true, chose: true, restored: true });
  // It gave another: neither. And an id it only lists when it is not sure, or that stands in the text it gave, is no choice.
  assert.deepEqual(fetchedOf(needles, '', stored, [finding(`[found] Bash result, 12 bytes; id ${other}; probability 0.9\n\nanother log, which names ${holder}`)]), { holders: [holder], inContext: false, tried: true, chose: false, restored: false });
  assert.deepEqual(fetchedOf(needles, '', stored, [finding(`[not sure] the likeliest:\n- Bash result; id ${holder}\n- Bash result; id ${other}`)]), { holders: [holder], inContext: false, tried: true, chose: false, restored: false });
  // Nothing called.
  assert.deepEqual(fetchedOf(needles, '', stored, [{ name: 'Read', input: {} }]), { holders: [holder], inContext: false, tried: false, chose: false, restored: false });
  // Left in the conversation: nothing had to be fetched, whatever was moved out holds it too.
  const left = fetchedOf(needles, 'the agent said: batch 07: 8 warnings, checksum 5384f20e', stored, []);
  assert.equal(left.inContext, true);
  assert.equal(needed(left), false);
  // Held by nothing moved out, and not in the conversation either (a summary dropped it): nothing to fetch it from.
  const gone = fetchedOf(needles, 'a summary', new Map([[other, 'another log']]), []);
  assert.deepEqual([gone.holders, needed(gone)], [[], false]);
  assert.equal(needed(fetchedOf(needles, '', stored, [])), true);
  // The kinds it is recorded for: an answer no file holds any more.
  assert.deepEqual(FETCHED, ['exact-gone', 'exact-then']);
});

test('the conversation a compaction left is read from the record after its last boundary, every message but a subagent\'s', () => {
  const row = (value: Record<string, unknown>) => JSON.stringify(value);
  const record = [
    row({ type: 'user', message: { role: 'user', content: 'before the first' } }),
    row({ type: 'system', subtype: 'compact_boundary' }),
    row({ type: 'user', message: { role: 'user', content: 'between the two' } }),
    row({ type: 'system', subtype: 'compact_boundary' }),
    row({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'said after' }] } }),
    row({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'sh show.sh' } }] } }),
    row({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: 'batch 07' }] }] } }),
    row({ type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: 'a subagent' }] } }),
    'not json',
  ].join('\n');
  assert.equal(conversationAfter(record), ['said after', JSON.stringify({ command: 'sh show.sh' }), 'sh show.sh', 'batch 07'].join('\n'));
  // With no boundary, as where the plugin left a /compact undone: all of it.
  assert.equal(conversationAfter(row({ type: 'user', message: { role: 'user', content: 'all' } })), 'all');
});

test('the table of fetching: per setting, all runs together, each step counted of the questions whose answer had to be fetched', () => {
  const fetched = (inContext: boolean, steps: number) => ({ holders: inContext ? [] : ['h'], inContext, tried: steps >= 1, chose: steps >= 2, restored: steps >= 3 });
  const question = (id: string, kind: Unit['questions'][number]['kind'], f: ReturnType<typeof fetched> | undefined, right: boolean) => ({
    ...answered(id, kind, 'x', [], right ? 'correct' : undefined),
    ...(f !== undefined ? { fetched: f } : {}),
  });
  const one = unitOf('plugin', 1, [question('gone-1', 'exact-gone', fetched(false, 3), true), question('gone-2', 'exact-gone', fetched(false, 3), false), question('then', 'exact-then', fetched(true, 0), true), question('rule-1', 'constraint', undefined, true)]);
  const two = unitOf('plugin', 2, [question('gone-1', 'exact-gone', fetched(false, 1), false), question('gone-2', 'exact-gone', fetched(false, 2), true), question('then', 'exact-then', fetched(false, 0), false)]);
  const cut = { ...unitOf('plugin', 1, [question('gone-1', 'exact-gone', fetched(false, 3), true)]), variant: 'v070-max-after-10' };
  const rows = fetches([one, two, cut, unitOf('builtin', 1, [question('gone-1', 'exact-gone', fetched(false, 0), false)])]).split('\n').slice(2);
  assert.deepEqual(rows, [
    // runs, questions, left in, had to be fetched, called, chose, came back, right, came back and wrong
    '| results | haiku | default | 2 | 6 | 1 | 5 | 4 | 3 | 2 | 2 | 1 |',
    '| results | haiku | v070-max-after-10 | 1 | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 0 |',
  ]);
  // Where no question carries the steps, as in every unit measured before they were recorded, there is no such table.
  assert.ok(!whole([unitOf('plugin', 1, [answered('gone-1', 'exact-gone', 'x', [])])], null).includes('how far the agent got in fetching'));
  assert.ok(whole([one], null).includes('### Where the answer went, and how far the agent got in fetching it'));
});

test('two conversations are built and probed and asked nothing: they are no part of the questions, the grading or the comparison', () => {
  assert.deepEqual(PROBED.map((trace) => trace.name), ['mixed', 'japanese']);
  assert.deepEqual(BUILT, [...TRACES, ...PROBED, ...FOUND, ...LARGE]);
  assert.equal(new Set(BUILT.map((trace) => trace.name)).size, 10);
  const written = described().map((one) => one.trace);
  assert.ok(PROBED.every((trace) => !written.includes(trace.name)));
  // A probe of one is a current unit; a unit that asked its questions would have nothing to be graded by.
  const probed = { ...unitOf('plugin', 1, []), trace: 'mixed', mode: 'probe' as const };
  assert.equal(currentOf([probed]).units.length, 1);
  assert.equal(itemsOf([probed]).length, itemsOf([]).length);
  // What each is for: prose that stays with results that can leave, and Japanese that stays with ASCII that leaves.
  const chars = (trace: (typeof BUILT)[number], test: (char: string) => boolean) =>
    trace.steps.reduce((sum, step) => sum + ('say' in step ? [...step.say].filter(test).length : 0), 0);
  const [mixed, japanese] = PROBED;
  assert.ok(mixed !== undefined && japanese !== undefined);
  assert.ok(chars(mixed, () => true) > 300_000 && mixed.files.filter((file) => file.text.length > 15_000).length >= 6);
  assert.ok(chars(japanese, (char) => char > '\x7f') > 50_000 && japanese.files.filter((file) => file.text.length > 15_000).length >= 6);
  assert.ok(japanese.files.every((file) => !/[^\x00-\x7f]/.test(file.text)), 'what is read, and can leave, is ASCII');
});

test('within a trace and model the arms take turns at going first from run to run', () => {
  for (let traceAt = 0; traceAt < TRACES.length; traceAt += 1) {
    for (let modelAt = 0; modelAt < 2; modelAt += 1) {
      const firsts = [1, 2, 3, 4].map((run) => armsOf(run, traceAt, modelAt)[0]);
      assert.deepEqual(new Set([firsts[0], firsts[1]]).size, 2, `trace ${traceAt}, model ${modelAt}: ${firsts.join(' ')}`);
      assert.deepEqual([firsts[2], firsts[3]], [firsts[0], firsts[1]]);
    }
  }
  // And in one run the traces do not all start with the same arm.
  assert.equal(new Set(TRACES.map((_, traceAt) => armsOf(1, traceAt, 0)[0])).size, 2);
  assert.deepEqual([...armsOf(1, 0, 0)].sort(), ['builtin', 'plugin']);
});

test('the tables keep the arms apart, show a few runs as they are, and say how each question went', () => {
  const plugin = (run: number, right: boolean) =>
    unitOf('plugin', run, [
      answered('gone-1', 'exact-gone', 'batch 07', ['ToolSearch', 'mcp__lossless-compaction__recall'], right ? 'correct' : undefined),
      answered('unchanged', 'exact-unchanged', 'x', ['Read'], 'correct'),
      answered('next', 'continuity', 'Next is log13 to log16.', []),
    ]);
  const builtin = (run: number) =>
    unitOf('builtin', run, [
      answered('gone-1', 'exact-gone', 'I cannot tell.', []),
      answered('unchanged', 'exact-unchanged', 'x', ['Read'], 'correct'),
      answered('next', 'continuity', 'Next is log13 to log16.', []),
    ]);
  const units = [plugin(1, true), builtin(1), plugin(2, false), builtin(2)];
  // The grader calls every answer it is sent right but the built-in arm's "cannot tell". Of an exact answer the program
  // found not to hold the text it has no say on right: the plugin's second run stays wrong.
  const graded = new Map(itemsOf(units).map((item) => [item.key, item.expected ?? (item.key.includes('|builtin|') && item.key.includes('|gone-1|') ? ('abstained' as const) : ('correct' as const))]));
  const grades = summed(itemsOf(units), [graded]);
  const missed = units[2]?.questions[0];
  assert.ok(units[2] !== undefined && missed !== undefined && missed.verdict === undefined);
  assert.equal(grades.verdicts[keyOf(units[2], 'gone-1', missed.answer)]?.[0], 'correct');
  assert.equal(verdictOf(units[2], missed, grades), 'incorrect');
  assert.equal(verdictOf(units[2], missed, null), undefined);
  // That the grader would have passed it is kept in sight: it is how a right answer the program's matching missed shows.
  assert.ok(overruled(units[2], missed, grades));
  assert.ok(units[0]?.questions[0] !== undefined && !overruled(units[0], units[0].questions[0], grades), 'not an answer the program found right');
  // The unit measured again answers otherwise: the verdict on the old answer is on nothing, and the new one is ungraded.
  const again = { ...missed, answer: 'batch 07: 4 warnings' };
  assert.equal(verdictOf(units[2], again, grades), undefined);
  assert.ok(!overruled(units[2], again, grades));

  assert.deepEqual(
    Object.entries(outcomesOf(units.filter((unit) => unit.arm === 'plugin'), grades)).filter(([, count]) => count > 0),
    [['correct from context', 2], ['correct after recall', 1], ['correct after reading again', 2], ['incorrect after retrieval', 1]],
  );
  assert.deepEqual(
    Object.entries(outcomesOf(units.filter((unit) => unit.arm === 'builtin'), grades)).filter(([, count]) => count > 0),
    [['correct from context', 2], ['correct after reading again', 2], ['abstained', 2]],
  );
  assert.equal(outcomesOf(units, null).ungraded, 4 + 3, 'without grades the answers a program cannot grade are counted as such: four on the standing, three exact ones that do not hold the text');

  const text = report(units, grades, 2);
  assert.match(text, /### results, haiku/);
  assert.match(text, /Runs: plugin 2, first in 1; builtin 2, first in 1\. The plugin's code: abc1234 \(commit c0ffee1\)\./);
  assert.match(text, /\| Exact answers the program found wrong and the grader called right \| 0, 1 \| 0, 0 \|/);
  assert.match(text, /\| Words that tell the arm, in all answers \| 0, 0 \| 0, 0 \|/);
  // Units that are not one comparison can sit side by side in the box: the table says so.
  assert.ok(!text.includes('different buildings') && !text.includes('different states'));
  assert.match(report(units.map((unit) => (unit.run === 2 ? { ...unit, base: 'another-session' } : unit)), grades), /measured on 2 different buildings of the trace/);
  assert.match(report(units.map((unit) => (unit.run === 2 && unit.arm === 'plugin' ? { ...unit, plugin: 'def5678' } : unit)), grades), /measured on 2 different states of the plugin's code/);
  // The same code at another commit, one that touched only the benchmark, is one state: both commits are named.
  const later = report(units.map((unit) => (unit.run === 2 && unit.arm === 'plugin' ? { ...unit, pluginCommit: 'beef123' } : unit)), grades);
  assert.ok(!later.includes('different states'));
  assert.match(later, /The plugin's code: abc1234 \(commit c0ffee1, beef123\)\./);
  assert.match(text, /2 unit\(s\) measured an older version of their trace and are left out\./);
  assert.ok(!report(units, grades).includes('older version'));
  assert.match(text, /\| Compaction: tokens read from cache \| 0, 0 \| 0, 0 \|/);
  assert.match(text, /\| Compaction: cost, USD \| 0\.0000, 0\.0000 \| 0\.0291, 0\.0291 \|/);
  // What a session tried and was refused, and an answer from outside the working directory, are shown per arm.
  const strayed = units.map((unit) => (unit.arm === 'builtin' && unit.run === 1 ? { ...unit, questions: unit.questions.map((one, at) => (at === 0 ? { ...one, outside: true, refused: 2 } : one)) } : unit));
  assert.match(report(strayed, grades), /\| Calls refused at a question \| 0, 0 \| 2, 0 \|/);
  assert.match(report(strayed, grades), /\| Answers after reading outside the working directory \| 0, 0 \| 1, 0 \|/);
  // That answer was "cannot tell": it stays so. A right answer got that way is shown apart from one read from a file of the work.
  const dug = units.map((unit) => (unit.arm === 'builtin' ? { ...unit, questions: unit.questions.map((one) => (one.id === 'unchanged' ? { ...one, outside: true } : one)) } : unit));
  assert.match(report(dug, grades), /\| correct after reading outside the working directory \| 0 \| 2 \|/);
  assert.match(report(dug, grades), /\| correct after reading again \| 2 \| 0 \|/);
  assert.match(text, /\| correct after reading outside the working directory \| 0 \| 0 \|/);
  const cached = units.map((unit) => (unit.arm === 'builtin' ? { ...unit, compaction: { ...unit.compaction, own: { ...unit.compaction.own, cacheReadInputTokens: 53704, cacheCreationInputTokens: 900, inputTokens: 10, outputTokens: 3038 } } } : unit));
  assert.match(report(cached, grades), /\| Compaction: tokens read from cache \| 0, 0 \| 53704, 53704 \|/);
  assert.match(report(cached, grades), /\| Compaction: tokens written to cache or sent fresh \| 0, 0 \| 910, 910 \|/);
  assert.match(report(cached, grades), /\| Compaction: tokens written out \| 0, 0 \| 3038, 3038 \|/);
  assert.match(text, /\| Compaction, ms \| 55, 55 \| 25730, 25730 \|/);
  assert.match(text, /\| Built-in summary ran \| 0 of 2 \| 2 of 2 \|/);
  assert.match(text, /\| Exact, source gone \| 1\/1, 0\/1 \| 0\/1, 0\/1 \|/);
  assert.match(text, /\| Where the work stands \| 1\/1, 1\/1 \| 1\/1, 1\/1 \|/);
  assert.match(text, /\| abstained \| 0 \| 2 \|/);
  // The arms swapped in what was measured swap in the table.
  const swapped = report(units.map((unit) => ({ ...unit, arm: unit.arm === 'plugin' ? ('builtin' as const) : ('plugin' as const) })), null);
  assert.match(swapped, /\| Compaction, ms \| 25730, 25730 \| 55, 55 \|/);
});

test('what the plugin estimated is set against what the next request was sent', () => {
  const line = { outcome: 'moved' as const, moved: 3, results: 6, images: 0, charsBefore: 108144, charsAfter: 54793, estimate: 44333, window: 167000, ms: 55 };
  const probe = { ...unitOf('plugin', 1, [answered('probe', 'continuity', 'ok', [])], { line }), mode: 'probe' as const };
  const text = estimates([probe, { ...probe, variant: 'v0.5.2', compaction: { ...probe.compaction, line: { ...line, estimate: 91829 } } }, unitOf('builtin', 1, [])]);
  assert.match(text, /\| results \| haiku \| default \(abc1234\) \| 1 \| moved \| 44333 \| 41176 sent next \| 7\.7 % \|/);
  assert.match(text, /\| results \| haiku \| v0\.5\.2 \(abc1234\) \| 1 \| moved \| 91829 \| 41176 sent next \| 123\.0 % \|/);
  assert.ok(!text.includes('builtin'));
  // Where the plugin moved nothing and handed over, nothing had changed: its estimate is of what was in use before, not of what the summary left.
  const untouched = estimates([{ ...probe, compaction: { ...probe.compaction, line: { ...line, outcome: 'nothing' as const } } }]);
  assert.match(untouched, /\| nothing \| 44333 \| 60882 in use before \| -27\.2 % \|/);
  // No rebuilt message carries thinking: where the unit says how much of what was in use was thinking, the estimate is set against the rest.
  const thought = estimates([{ ...probe, compaction: { ...probe.compaction, thinkingBefore: 15882, line: { ...line, outcome: 'nothing' as const } } }]);
  assert.match(thought, /\| nothing \| 44333 \| 45000 in use before, without 15882 of thinking \| -1\.5 % \|/);
  // Where results were moved out, what was sent next is the measure, whatever the thinking was.
  assert.match(estimates([{ ...probe, compaction: { ...probe.compaction, thinkingBefore: 15882 } }]), /\| moved \| 44333 \| 41176 sent next \| 7\.7 % \|/);
  // Where it moved some and still handed over, what it left was never sent: there is nothing to set the estimate against.
  const stillTooMuch = estimates([{ ...probe, compaction: { ...probe.compaction, line: { ...line, outcome: 'too-much' as const } } }]);
  assert.match(stillTooMuch, /\| too-much \| 44333 \| — \| — \|/);
  assert.match(estimates([{ ...probe, compaction: { ...probe.compaction, line: { outcome: 'other' as const, moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, ms: 0 } } }]), /\| other \| none stated \| — \| — \|/);
});

test('a session whose model refused and was replaced says by which: the answer is then not that of the model asked for, and the table of find counts it', () => {
  const events = [
    { type: 'system', subtype: 'init', session_id: 'abc', model: 'claude-opus-5-5', claude_code_version: '2.1.288' },
    { type: 'system', subtype: 'model_refusal_fallback', trigger: 'refusal', original_model: 'claude-opus-5-5', fallback_model: 'claude-opus-4-8', api_refusal_category: 'cyber' },
    { type: 'result', result: 'None of the earlier results covered that.', is_error: false },
  ];
  const printed = (kept: readonly object[]) => kept.map((event) => JSON.stringify(event)).join('\n');
  assert.equal(readSession(printed(events)).fellBackTo, 'claude-opus-4-8');
  assert.equal(readSession(printed(events.filter((event) => event.subtype !== 'model_refusal_fallback'))).fellBackTo, null);
  // An event that names no model is still one: the answer is counted as another model's.
  assert.equal(readSession(printed(events.map((event) => (event.subtype === 'model_refusal_fallback' ? { type: 'system', subtype: 'model_refusal_fallback' } : event)))).fellBackTo, 'unknown');
  // The column is in the table only where it happened: a table of units in which no model was replaced is as it was.
  const asked = (fellBack: boolean) => ({
    ...unitOf('plugin', 1, [{ ...answered('find-doc-1', 'exact-gone', 'None of them.', []), ...(fellBack ? { fellBackTo: 'claude-opus-4-8' } : {}) }, answered('find-doc-2', 'exact-gone', 'the line', [], 'correct')]),
    mode: 'find' as const,
  });
  assert.match(finds([asked(true)]), /\| Right \| Answered by another model after a refusal \| `find` calls \|/);
  assert.match(finds([asked(true)]), /\| 1\/2 \| 1 \| 0 \|/);
  assert.ok(!finds([asked(false)]).includes('another model'));
  assert.match(finds([asked(false)]), /\| Right \| `find` calls \|/);
  // The table of a trace's own questions has the row on the same terms.
  const own = (arm: 'plugin' | 'builtin', fellBack: boolean) =>
    unitOf(arm, 1, [{ ...answered('next', 'continuity', 'Next is log13 to log16.', []), ...(fellBack ? { fellBackTo: 'claude-opus-4-8' } : {}) }]);
  assert.match(report([own('plugin', true), own('builtin', false)], null), /\| Answered by another model after a refusal \| 1 \| 0 \|/);
  assert.ok(!report([own('plugin', false), own('builtin', false)], null).includes('another model'));
});

/**
 * The versions of the traces before `full` and `thinking` were given the shape they have at Sonnet 5.5's counts: what
 * every directory of results published before then measured, and what the conversations in bench/bases were built from.
 */
const BEFORE_SONNET: ReadonlyMap<string, number> = new Map([...VERSIONS, ['full', 1], ['thinking', 1]]);

test('a trace changed since results were published leaves them as they were: read at the versions of then, and by the newest each holds', () => {
  assert.deepEqual([...VERSIONS].filter(([name, version]) => BEFORE_SONNET.get(name) !== version), [['full', 2], ['thinking', 2]]);
  const before = unitsUnder(RESULTS);
  assert.ok(before.length > 0);
  assert.equal(currentOf(before).units.filter((unit) => unit.trace === 'full' || unit.trace === 'thinking').length, 0);
  assert.equal(currentOf(before, BEFORE_SONNET).older, 0);
  assert.deepEqual(currentOf(before, versionsIn(before)), currentOf(before, BEFORE_SONNET));
});

test('one conversation is built in a window of 1,000,000: the questions of the six, and two about logs that are gone, one read early and one read last', () => {
  assert.deepEqual(LARGE.map((trace) => trace.name), ['large']);
  const [large] = LARGE;
  assert.ok(large !== undefined);
  // The others name no window but `full`: they are built and compacted in the 200,000 a session is started with, and
  // `full` in 264,000, where Sonnet 5.5's count of it fills what the plugin sees as Haiku 4.5's filled 200,000.
  assert.deepEqual([...TRACES, ...PROBED, ...FOUND].filter((trace) => trace.window !== undefined).map((trace) => [trace.name, trace.window]), [['full', 264_000]]);
  assert.equal(large.window, 1_000_000);
  assert.equal(described().find((one) => one.trace === 'large')?.window, 1_000_000);
  // Taken by name only: with no trace named a `run` asks the six, and a `build` builds every conversation but this one.
  assert.ok(!TRACES.includes(large));
  assert.deepEqual(unnamed('run'), TRACES);
  assert.deepEqual(unnamed('probe'), [...TRACES, ...PROBED]);
  assert.deepEqual(unnamed('build'), BUILT.filter((trace) => trace !== large));
  assert.equal(unnamed('build').length, 9);
  assert.deepEqual(large.questions.map((question) => question.id), [...(TRACES[0]?.questions.map((question) => question.id) ?? []), 'gone-early', 'gone-last']);
  // Thirty-two logs read four at a time; the fifth and the last are removed before the compaction, with the script every trace removes.
  const reads = saidBy(large).filter((say) => say.startsWith('Read log'));
  assert.equal(reads.length, 8);
  assert.ok(reads[1]?.includes('log5.txt') && reads.at(-1)?.includes('log32.txt'));
  assert.deepEqual(large.beforeCompaction.flatMap((step) => ('remove' in step ? [step.remove] : [])), ['report.sh', 'log5.txt', 'log32.txt']);
  for (const [id, log] of [['gone-early', 5], ['gone-last', 32]] as const) {
    const question: (typeof large.questions)[number] | undefined = large.questions.find((one) => one.id === id);
    assert.ok(question !== undefined && question.kind === 'exact-gone');
    assert.ok(question.ask.includes(`log${log}.txt has been deleted`) && question.ask.includes(`record ${log}-0412`), question.ask);
    // What a right answer holds is on that line of that log, and in no other file of the trace: no file still there gives it.
    const needle: string = question.needles?.[0] ?? '';
    assert.match(needle, /^station \d+ reported \d+ units$/);
    assert.deepEqual(large.files.filter((file) => file.text.includes(needle)).map((file) => file.path), [`log${log}.txt`]);
    assert.ok(large.files.find((file) => file.path === `log${log}.txt`)?.text.includes(`record ${log}-0412: ${needle} at step 412\n`));
  }
});

test('the conversations published in bench/bases are the traces they were built from: what was said, in order, at a size the trace accepts', () => {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../bench/bases/${name}`, import.meta.url), 'utf8'));
  for (const trace of BUILT) {
    const built = read(`${trace.name}.json`) as { trace: string; version: number; tokens: number; thinkingTokens: number };
    assert.equal(built.trace, trace.name);
    // `full` and `thinking` were built at their versions before Sonnet 5.5's counts changed them: what said them then is
    // no longer in traces.ts, and what was measured on them is read at those versions.
    assert.equal(built.version, BEFORE_SONNET.get(trace.name), `${trace.name}: built from another version of the trace`);
    if (built.version !== trace.version) continue;
    assert.ok(built.tokens >= trace.accept.minTokens && built.tokens <= trace.accept.maxTokens, `${trace.name}: ${built.tokens} tokens`);
    assert.ok(built.thinkingTokens >= (trace.accept.minThinkingTokens ?? 0), `${trace.name}: ${built.thinkingTokens} thinking tokens`);
    const conversation = read(`${trace.name}.conversation.json`) as { role: string; blocks: { type: string; text?: string }[] }[];
    // A trace changed since it was built says something else: the conversation beside it would no longer be the one measured.
    assert.deepEqual(saidIn(conversation), saidBy(trace), trace.name);
    assert.ok(saidBy(trace).length >= 5, trace.name);
    // Nothing of the machine it was built on: the working directory is written <work>, and no home directory is named.
    const text = JSON.stringify(conversation);
    assert.ok(!/\/Users\/|\/home\/|\.cctmp|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(text), `${trace.name}: a path or an id of the machine`);
    assert.ok(conversation.every((message) => message.blocks.every((block) => block.type !== 'thinking' || !('thinking' in block || 'signature' in block))), `${trace.name}: thinking is kept as a length only`);
  }
});

// --- find ---

const builtConversation = (name: string) => JSON.parse(readFileSync(new URL(`../bench/bases/${name}.conversation.json`, import.meta.url), 'utf8')) as Conversation;

test('the questions find is for: by a value or by what the result was, each about one result of the built conversation', async () => {
  for (const trace of TRACES) {
    const { stored } = await staged(resultsOf(builtConversation(trace.name)));
    assert.ok(stored.length >= 3 && stored.every((one) => one.text.length >= MIN_CHARS), trace.name);
    assert.equal(new Set(trace.finds.map((find) => find.id)).size, trace.finds.length, trace.name);
    assert.ok(trace.finds.filter((find) => find.by === 'meaning').length >= 3 && trace.finds.filter((find) => find.by === 'value').length >= 2, trace.name);
    for (const find of trace.finds) {
      const right = stored.filter((one) => one.text.includes(find.target));
      // One result holds the line, and so is the answer; what confirms an edit is too short to be an option at all.
      assert.equal(right.length, find.id === 'find-edit' ? 0 : 1, `${trace.name} ${find.id}`);
      // Asked by what the result was, a question holds no number and nothing in quotes: no word of it is the answer's own.
      if (find.by === 'meaning') assert.ok(!/[0-9"]/.test(find.ask), `${trace.name} ${find.id}: ${find.ask}`);
    }
  }
  // Results under the plugin's size to move out are no option: the short trace has thirty-eight results and three options.
  assert.equal(resultsOf(builtConversation('short'), 0).length, 38);
  assert.equal(resultsOf(builtConversation('short')).length, 3);
  // An agent asked the same question is told how to show which result it means, so that a program can check it.
  assert.deepEqual(QUOTE, { value: 'Quote that line in full.', meaning: 'Quote its first line in full.' });
});

test('the conversation asked only what find is for: no call says what came back, and what came back is in the results alone', () => {
  assert.deepEqual(FOUND.map((trace) => trace.name), ['opaque']);
  const [opaque] = FOUND;
  assert.ok(opaque !== undefined);
  assert.deepEqual(opaque.questions, []);
  assert.deepEqual(opaque.marks, []);
  // One file, the script, and it is gone before any question: nothing on disk answers one.
  assert.deepEqual(opaque.files.map((file) => file.path), ['show.sh']);
  assert.deepEqual(opaque.beforeCompaction, [{ remove: 'show.sh' }]);
  const script = opaque.files[0]?.text ?? '';
  const outputs = script.split(/\n\d\d\) cat <<'SHOWN'\n/).slice(1).map((part) => part.split('SHOWN\n;;')[0] ?? '');
  assert.equal(outputs.length, 20);
  // Thirteen documents, then station logs that may leave once the documents have, then logs the newest results keep (60,000 characters).
  assert.ok(outputs.slice(0, 13).every((text) => text.length > 6_000 && text.length < 8_000));
  assert.ok(outputs.slice(13, 17).every((text) => text.length > 20_000 && text.length < 30_000));
  assert.ok(outputs.slice(17).reduce((sum, text) => sum + text.length, 0) <= 20_000 * 3);
  const said = opaque.steps.map((step) => ('say' in step ? step.say : '')).join('\n');
  assert.equal(opaque.finds.filter((find) => find.by === 'meaning').length, 7);
  assert.equal(opaque.finds.filter((find) => find.by === 'value').length, 3);
  for (const find of opaque.finds) {
    // One output holds what the question is about, and nothing that is said does.
    assert.equal(outputs.filter((text) => text.includes(find.target)).length, 1, find.id);
    assert.ok(outputs.slice(0, 13).some((text) => text.includes(find.target)), find.id);
    assert.ok(!said.includes(find.target), find.id);
    assert.ok(!/recall|find tool|Read tool|cannot|do not read|don't read/i.test(find.ask), find.id);
    if (find.by === 'meaning') assert.ok(!/[0-9"]/.test(find.ask), `${find.id}: ${find.ask}`);
  }
  // A question by what a result was shares no word of five letters or more with that result's first two lines.
  const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]{5,}/g) ?? []);
  for (const find of opaque.finds.filter((one) => one.by === 'meaning')) {
    const head = outputs.find((text) => text.startsWith(find.target))?.split('\n').slice(0, 2).join(' ') ?? '';
    const shared = [...words(find.ask)].filter((word) => words(head).has(word) && !['which', 'earlier', 'result'].includes(word));
    assert.deepEqual(shared, [], find.id);
  }
  // Results leave sharing the least with the last three things said first (ruleOrder): every document shares fewer of their words than any station log, so the documents leave before the logs do.
  const goal = termsOf(opaque.steps.flatMap((step) => ('say' in step ? [step.say] : [])).slice(-3).join('\n\n'));
  const sharing = outputs.map((text, at) => {
    const mentioned = termsOf(`${JSON.stringify({ command: `sh show.sh ${String(at + 1).padStart(2, '0')}` })}\n${text.slice(0, 4000)}`);
    return [...goal].filter((term) => mentioned.has(term)).length;
  });
  assert.ok(Math.max(...sharing.slice(0, 13)) < Math.min(...sharing.slice(13)), sharing.join(' '));
  // The calls name a number and nothing else: no subject of a document is in what is said.
  for (const text of outputs.slice(0, 13)) assert.ok(!said.includes(text.split('\n')[0] ?? '\0'));
  assert.ok(opaque.steps.slice(1, 6).every((step) => 'say' in step && /^Run (`sh show\.sh \d\d`(, )?)+ with Bash/.test(step.say)));
});

const JEV = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as const;
const keysAsked = (sent: Sent) => Object.keys((questionsOf(sent)['q'] as { criteria?: Record<string, string> } | undefined)?.criteria ?? {});
/** Jev answering with `winner` at probability `p`, the rest sharing what is left. */
const jev = (winner: string | null, p = 0.95) =>
  recordingHttp((sent) => {
    const keys = keysAsked(sent);
    const rest = winner === null ? 1 / keys.length : (1 - p) / (keys.length - 1);
    return ok({ answers: { q: { type: 'choice', choice: winner ?? keys[0], probabilities: Object.fromEntries(keys.map((key) => [key, key === winner ? p : rest])) } } });
  });
/** Of how many results Jev was told that a line of them holds the values. */
const toldIn = (sent: Sent) => optionsAsked(sent).filter(([, text]) => TOLD.test(text)).length;

test('find is asked as the tool asks it, and what it answers is read: one result, a few to choose from, none, or no answer', async () => {
  const trace = TRACES.find((one) => one.name === 'results');
  const seventh = trace?.finds.find((find) => find.id === 'find-seventh');
  assert.ok(trace !== undefined && seventh !== undefined);
  const conversation = builtConversation('results');
  const { stored } = await staged(resultsOf(conversation));
  const right = stored.findIndex((one) => one.text.includes(seventh.target));
  assert.ok(right >= 0);

  // Jev sure of the right one: `find` gives that result.
  const sure = jev(`t${right + 1}`);
  const [gave] = await pick('results', [seventh], conversation, JEV, sure.http);
  assert.ok(gave !== undefined);
  assert.deepEqual([gave.jev.kind, gave.jev.ids, gave.right], ['gave', [stored[right]?.id], [stored[right]?.id]]);
  assert.equal(wentOf(gave), 'gave the right one');
  assert.equal(gave.options, 15);
  assert.equal(gave.by, 'meaning');
  // What was sent: the question, and for each option the call that made it and a few hundred characters, not the result.
  assert.equal(sure.sent.length, 1);
  const body = JSON.stringify(sure.sent[0]?.body);
  assert.ok(body.includes('the seventh of the station logs') && body.includes('log7.txt'));
  assert.ok(body.length < 15 * 1200, `${body.length} characters for fifteen results of up to eighteen thousand each`);
  assert.equal(keysAsked(sure.sent[0] as Sent).length, 16, 'the fifteen results, and that it is none of them');

  // Jev sure of another: `find` gives that one, and it is wrong.
  const [wrong] = await pick('results', [seventh], conversation, JEV, jev(`t${((right + 1) % 15) + 1}`).http);
  assert.ok(wrong !== undefined);
  assert.equal(wentOf(wrong), 'gave a wrong one');
  // Jev not sure: the likeliest few are listed, and the right one may or may not be among them.
  const [listed] = await pick('results', [seventh], conversation, JEV, jev(null).http);
  assert.ok(listed !== undefined);
  assert.equal(listed.jev.kind, 'listed');
  assert.ok(listed.jev.ids.length >= 1 && listed.jev.ids.length <= 3);
  assert.match(wentOf(listed), /^listed/);
  // Jev sure it is none of them.
  const [none] = await pick('results', [seventh], conversation, JEV, jev('none').http);
  assert.ok(none !== undefined);
  assert.equal(wentOf(none), 'said none');
  // Jev not reached: no answer, and nothing is made of it.
  const refused: Http = async () => ({ status: 500, ok: false, text: 'no' });
  const [failed] = await pick('results', [seventh], conversation, JEV, refused);
  assert.ok(failed !== undefined);
  assert.deepEqual([failed.jev.kind, failed.jev.ids, wentOf(failed)], ['failed', [], 'did not answer']);

  // The word match reads the call and the whole text: a number in the question finds its line, another way of saying it does not.
  const byValue = trace.finds.find((find) => find.id === 'find-log-a');
  assert.ok(byValue !== undefined);
  const [valued] = await pick('results', [byValue], conversation, JEV, jev(null).http);
  assert.ok(valued !== undefined && valued.words !== null && valued.right.includes(valued.words));
  assert.ok(gave.words === null || !gave.right.includes(gave.words), 'the seventh log is not found by its words');
  // It is given the call that made each result, as Jev is: a file named in the question finds the read of it.
  const [named] = await pick('results', [{ id: 'by-name', by: 'meaning', ask: 'Which earlier result came from reading log7.txt?', target: seventh.target }], conversation, JEV, jev(null).http);
  assert.ok(named !== undefined && named.words !== null && named.right.includes(named.words));
});

test('the held questions of the value match: the one result that holds a value is found, and what is given is what Jev takes (#55)', async () => {
  // Written before any rule was built (held-out.json: not unseen by the rule as it is, which was chosen after one kind of them showed the
  // rule before it giving a wrong result), three after the first review (after-review.json), and six after the rule was settled and before
  // they were put to Jev, whose value another result holds than the one asked for (misleading.json): on three conversations.
  type Held = { trace: string; kind: string; ask: string; target: string; must: 'give' | 'not-wrong' };
  const fixture = (name: string) => JSON.parse(readFileSync(new URL(`fixtures/values/${name}.json`, import.meta.url), 'utf8')) as Held[];
  const held = [...fixture('held-out'), ...fixture('after-review'), ...fixture('misleading')];
  assert.equal(held.length, 30);
  const MISLEADING = new Set(['value of another result', 'value said not to be it']);
  // Two Jevs that are not Jev: one says none whatever it is shown, one takes the result it is told holds the values and says none otherwise (`trusting`).
  const by: Record<string, { none: string; trusting: string; told: number }[]> = {};
  for (const one of held) {
    const question = [{ id: one.kind, by: 'value' as const, ask: one.ask, target: one.target }];
    const refusing = jev('none', 0.9);
    const [withNone] = await pick(one.trace, question, builtConversation(one.trace), JEV, refusing.http);
    const trusted = trusting();
    const [withTrust] = await pick(one.trace, question, builtConversation(one.trace), JEV, trusted.http);
    assert.ok(withNone !== undefined && withTrust !== undefined);
    // Jev is asked every time: the match decides nothing by itself.
    assert.deepEqual([refusing.sent.length, trusted.sent.length], [1, 1], `${one.trace} ${one.kind}`);
    const told = toldIn(trusted.sent[0] as Sent);
    // The match gives no result by itself: a Jev that says none is given none. What a Jev that takes the result it is told of is given
    // is that result, and it is the wrong one only where the question was written to be about another.
    assert.notEqual(wentOf(withNone), 'gave a wrong one', `${one.trace} ${one.kind}`);
    assert.equal(wentOf(withTrust) === 'gave a wrong one', MISLEADING.has(one.kind), `${one.trace} ${one.kind}`);
    if (one.must === 'give') assert.equal(wentOf(withTrust), 'gave the right one', `${one.trace} ${one.kind}`);
    (by[one.kind] ??= []).push({ none: wentOf(withNone), trusting: wentOf(withTrust), told });
  }
  const all = (kind: string, none: string, trust: string, told: number) => assert.deepEqual(by[kind], Array.from({ length: 3 }, () => ({ none, trusting: trust, told })), kind);
  // A record's number, and one number no other result holds: Jev is told of the one result, and it is given; a Jev that says none gets it named.
  all('record id', 'listed, the right one first', 'gave the right one', 1);
  all('one number', 'listed, the right one first', 'gave the right one', 1);
  // Not found this way: two values on two lines, the head of a value, another letter case. Nothing is told, and none is none.
  all('two lines', 'said none', 'said none', 0);
  all('head of a value', 'said none', 'said none', 0);
  all('letter case', 'said none', 'said none', 0);
  // A number many results hold on a line: Jev is told of none of them, and they are named when it says none.
  all('line number', 'listed, the right one further down', 'listed, the right one further down', 0);
  assert.ok(by['meaning with a number']?.every((one) => one.told === 0 && one.none.startsWith('listed') && one.trusting.startsWith('listed')));
  // A count in a question by meaning is no value: nothing is looked for.
  all('small number', 'said none', 'said none', 0);
  // A value another result holds than the one asked for: Jev is told of that other result. Saying none, it gets it named and not given;
  // taking it, it is given it. What comes back is Jev's choice (asked of Jev itself: `picks-misleading.json`, held by the test of the figures).
  for (const kind of MISLEADING) all(kind, 'listed without it', 'gave a wrong one', 1);
});

test('the head of what find says is read, whatever follows it', () => {
  const id = 'a'.repeat(64);
  const other = 'b'.repeat(64);
  assert.deepEqual(readAnswer(`[found] Read result, 6170 bytes; id ${id}; probability 0.95\n\nrecord … id ${other}`), { kind: 'gave', ids: [id] });
  assert.deepEqual(readAnswer(`[not sure] The likeliest results, most likely first:\n- Read called with x; 9 bytes; probability 0.40; recall with mcp__lossless-compaction__recall id ${id}\n- Bash called with y; 9 bytes; probability 0.30; recall with mcp__lossless-compaction__recall id ${other}\n- or none of them; probability 0.20`), { kind: 'listed', ids: [id, other] });
  assert.deepEqual(readAnswer('[not found] None of the moved-out results seems to be about that: it may still be in the conversation, or was never moved out.'), { kind: 'none', ids: [] });
  assert.deepEqual(readAnswer('[lossless-compaction] Jev could not be asked: 500.'), { kind: 'failed', ids: [] });
  assert.deepEqual(readAnswer(''), { kind: 'failed', ids: [] });
});

test('the table of picks keeps the two kinds of question apart, and a question with no answer among the options apart from both', () => {
  const one = (question: string, by: Pick['by'], right: string[], words: string | null, kind: Pick['jev']['kind'], ids: string[]): Pick => ({
    trace: 'writes', question, by, options: 3, right, words, jev: { kind, ids, ms: 900, said: '' },
  });
  const text = pickTable([
    one('find-report', 'value', ['r'], 'r', 'gave', ['r']),
    one('find-kept', 'value', ['k'], 'k', 'listed', ['r', 'k']),
    one('find-edit', 'value', [], 'r', 'none', []),
    one('find-script', 'meaning', ['r'], 'k', 'gave', ['k']),
    one('find-stays', 'meaning', ['k'], 'k', 'listed', ['k', 'r']),
    one('find-changes', 'meaning', ['c'], 'k', 'listed', ['r', 'k']),
  ]);
  const rows = text.split('\n').slice(2).map((row) => row.split('|').map((cell) => cell.trim()).slice(1, -1));
  // Trace, kind, options, questions with an answer, word match right, then: gave right, gave wrong, listed first, listed further, listed without, none, no answer; and the unanswerable.
  assert.deepEqual(rows, [
    ['writes', 'value', '3', '2', '2', '1', '0', '0', '1', '0', '0', '0', '1 of 1'],
    ['writes', 'meaning', '3', '3', '1', '0', '1', '1', '0', '1', '0', '0', '0 of 0'],
  ]);
});

test('a key for find is in a session only when it was handed one, and in nothing that is written', () => {
  const file = "# the key for Jev\nexport CLOUDFLARE_API_TOKEN='made-up-token'\nCLOUDFLARE_ACCOUNT_ID = 0123456789abcdef0123456789abcdef\nHOME=/somewhere\nTYPESAFE_API_KEY=\n";
  const keys = keysIn(file);
  assert.deepEqual(keys, { CLOUDFLARE_API_TOKEN: 'made-up-token', CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef' });
  assert.deepEqual(keysIn('nothing of the kind'), {});
  assert.deepEqual([...KEY_VARS].sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'TYPESAFE_API_KEY']);

  // Whoever runs the benchmark may have a key in the environment: no session gets it by that.
  const around = { PATH: '/bin', TYPESAFE_API_KEY: 'lying-around', CLOUDFLARE_API_TOKEN: 'lying-around', CLOUDFLARE_ACCOUNT_ID: 'lying-around' };
  const plain = envOf({}, around);
  assert.equal(plain['PATH'], '/bin');
  assert.ok(KEY_VARS.every((name) => !(name in plain)));
  assert.equal(plain['CLAUDE_CODE_DISABLE_AUTO_MEMORY'], '1');
  // The variant that compares find is handed the keys of the file, and only those.
  const handed = envOf({ env: keys }, around);
  assert.equal(handed['CLOUDFLARE_API_TOKEN'], 'made-up-token');
  assert.ok(!('TYPESAFE_API_KEY' in handed));
  // On the command line, which any process of the machine can read, there is no key: the plugin is told where to ask, not with what.
  const args = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'plugin', pluginDir: '/p', storeDir: '/s', pluginOptions: { provider: 'cloudflare' }, allowedTools: ['Read'], prompt: 'q', env: keys });
  assert.ok(!args.join(' ').includes('made-up-token') && !args.join(' ').includes('0123456789abcdef'));
  assert.ok(args.join(' ').includes('"provider":"cloudflare"'));
});

test('a session is started without the variable early access turned function hooks on with, unless it was handed one', () => {
  // Whoever runs the benchmark may still have it set, as the quick start once asked: a session that runs the plugin
  // then shows nothing about what the README now says, that nothing is to be set.
  const around = { PATH: '/bin', [FUNCTION_HOOKS]: '1' };
  assert.equal(FUNCTION_HOOKS, 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS');
  assert.ok(!(FUNCTION_HOOKS in envOf({}, around)));
  assert.equal(envOf({}, around)['PATH'], '/bin');
  // check:host hands one session the value that turned them off before 2.1.287, to show that it no longer does.
  assert.equal(envOf({ env: { [FUNCTION_HOOKS]: '0' } }, around)[FUNCTION_HOOKS], '0');
});

test('the questions find is for, asked of an agent, are tabled per unit: with recall alone and with find', () => {
  const asked = (variant: string, right: boolean, calls: string[]): Unit => ({
    ...unitOf('plugin', 1, [answered('find-script', 'exact-gone', 'batch 01', calls, right ? 'correct' : undefined), answered('find-stays', 'exact-gone', 'x', calls)]),
    mode: 'find',
    variant,
  });
  const found = asked('find', true, ['ToolSearch', 'mcp__lossless-compaction__find']);
  found.questions.forEach((one) => (one.retrieval = { recalls: 0, finds: 1, searches: 1, reads: 0 }));
  const text = finds([found, asked('default', false, ['ToolSearch', 'mcp__lossless-compaction__recall']), unitOf('plugin', 1, [])]);
  const rows = text.split('\n').slice(2);
  assert.equal(rows.length, 2, 'the units that asked the trace\'s own questions are not in it');
  assert.match(rows[0] ?? '', /\| results \| haiku \| 1 \| `recall` only \| — \| 0\/2 \| 0 \| 2 \| 0 \|/);
  assert.match(rows[1] ?? '', /\| results \| haiku \| 1 \| `recall` and `find` \| — \| 1\/2 \| 2 \| 0 \| 0 \|/);
});

// --- what was published ---

test('published, an answer names no path of the machine it ran on, and keeps its verdict', () => {
  const said = 'I read /Users/someone/box/work/short-abc/kept-4.log and /Users/someone/.claude/projects/x/y.jsonl: station 12 reported 3 units.';
  const units = [unitOf('builtin', 1, [answered('next', 'continuity', said, []), answered('gone-1', 'exact-gone', 'batch 07', [], 'correct')])];
  const [unit] = units;
  assert.ok(unit !== undefined);
  const grades = summed(itemsOf(units), [new Map(itemsOf(units).map((item) => [item.key, item.expected ?? ('incorrect' as const)]))], 'a-model');
  const out = published(units, grades, { box: '/Users/someone/box', home: '/Users/someone' });
  const [clean] = out.units;
  assert.ok(clean !== undefined && clean.questions[0] !== undefined && out.grades !== null);
  assert.equal(clean.questions[0].answer, 'I read <box>/work/short-abc/kept-4.log and <home>/.claude/projects/x/y.jsonl: station 12 reported 3 units.');
  assert.ok(!JSON.stringify(out).includes('/Users/someone'));
  // The verdict was on the answer as it was given; it is found under the answer as published, and no longer under the other.
  assert.equal(verdictOf(clean, clean.questions[0], out.grades), 'incorrect');
  assert.equal(out.grades.verdicts[keyOf(unit, 'next', said)], undefined);
  assert.equal(Object.keys(out.grades.verdicts).length, Object.keys(grades.verdicts).length);
  // What was given is not changed by publishing it.
  assert.equal(unit.questions[0]?.answer, said);
  assert.deepEqual(published(units, null, { box: '/b', home: '/h' }).grades, null);

  // Claude Code names its record of a session after the working directory, every character that is no letter or digit made a dash: an answer that read one names it so.
  const machine = { box: '/Users/some.one/.tmp/box', home: '/Users/some.one' };
  const record = 'from `/Users/some.one/.claude/projects/-Users-some-one--tmp-box-work-results-abc/1b5642a2.jsonl`';
  assert.equal(scrubbed({ said: record }, machine).said, 'from `<home>/.claude/projects/<box>-work-results-abc/1b5642a2.jsonl`');
  assert.equal(scrubbed({ said: 'under -Users-some-one-elsewhere' }, machine).said, 'under <home>-elsewhere');
  // What `find` said of each pick goes the same way.
  assert.deepEqual(scrubbed({ picks: [{ said: 'Read called with /Users/some.one/.tmp/box/x' }] }, machine), { picks: [{ said: 'Read called with <box>/x' }] });
  // Only paths are replaced: a home directory named like a word, or like a field, changes no word and no field.
  const wordy = { box: '/home/right/box', home: '/home/right' };
  assert.deepEqual(scrubbed({ right: ['a'], words: 'the right one is in /home/right/box/work, not in /home/right' }, wordy), { right: ['a'], words: 'the right one is in <box>/work, not in <home>' });
});

const RESULTS = fileURLToPath(new URL('../bench/results/2026-10-02', import.meta.url));

test('the results in the repository: of the traces as they are, of the conversations beside them, every answer graded, and the tables made from them', () => {
  assert.ok(existsSync(RESULTS));
  const all = unitsUnder(RESULTS);
  const { units, older } = currentOf(all, BEFORE_SONNET);
  assert.equal(older, 0);
  const grades = JSON.parse(readFileSync(`${RESULTS}/grades.json`, 'utf8')) as Grades;
  const picks = existsSync(`${RESULTS}/picks.json`) ? (JSON.parse(readFileSync(`${RESULTS}/picks.json`, 'utf8')) as { picks: Pick[] }).picks : null;
  // The tables are these units and grades and nothing else: made again, they are the file.
  assert.equal(whole(units, grades, older, picks), readFileSync(`${RESULTS}/report.md`, 'utf8'));

  // Each unit is of the conversation published beside it, and of one state of the plugin's code.
  const built = new Map(TRACES.map((trace) => [trace.name, (JSON.parse(readFileSync(new URL(`../bench/bases/${trace.name}.json`, import.meta.url), 'utf8')) as { sessionId: string }).sessionId]));
  for (const unit of units) assert.equal(unit.base, built.get(unit.trace), `${unit.trace} ${unit.model} run ${unit.run} ${unit.arm}`);
  // Two checkouts were measured: this code, and v0.5.2 in the probes that set its estimate beside this one's.
  assert.equal(new Set(units.filter((unit) => unit.arm === 'plugin' && unit.variant !== 'v0.5.2').map((unit) => unit.plugin)).size, 1);
  assert.equal(new Set(units.filter((unit) => unit.variant === 'v0.5.2').map((unit) => unit.plugin)).size, 1);

  // What was run: six traces three times on Haiku, three once on Sonnet, both arms each time.
  const asked = units.filter((unit) => unit.mode === 'ask' && unit.variant === 'default');
  const count = (model: RegExp, arm: string) => asked.filter((unit) => model.test(unit.model) && unit.arm === arm).length;
  assert.deepEqual([count(/haiku/, 'plugin'), count(/haiku/, 'builtin'), count(/sonnet/, 'plugin'), count(/sonnet/, 'builtin')], [18, 18, 3, 3]);
  assert.ok(asked.every((unit) => unit.questions.length === 9));
  // In each trace and model both arms went first at least once where there were three runs.
  for (const trace of TRACES) {
    const firsts = asked.filter((unit) => unit.trace === trace.name && /haiku/.test(unit.model) && unit.first).map((unit) => unit.arm);
    assert.deepEqual([...new Set(firsts)].sort(), ['builtin', 'plugin'], trace.name);
  }
  // Every answer has a verdict, and the grader was right on every answer whose grade was known.
  assert.equal(outcomesOf(asked, grades).ungraded, 0);
  assert.equal(grades.controls.asExpected, grades.controls.count);
  assert.equal(grades.controls.toldPairsSame, grades.controls.toldPairs);

  // Nothing of the machine: no home directory in either form a path of it takes, no key.
  const text = JSON.stringify(all) + JSON.stringify(grades) + JSON.stringify(picks) + readFileSync(`${RESULTS}/report.md`, 'utf8');
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(text));
});

const ESTIMATE = fileURLToPath(new URL('../bench/results/2026-10-02-estimate', import.meta.url));

test('the probes in the repository: the size the plugin counts against what was in use, with the count of ADR 0013 and with 0.6.0', () => {
  assert.ok(existsSync(ESTIMATE));
  const all = unitsUnder(ESTIMATE);
  const { units, older } = currentOf(all, BEFORE_SONNET);
  assert.equal(older, 0);
  assert.ok(units.every((unit) => unit.mode === 'probe' && unit.arm === 'plugin' && unit.questions.length === 1));
  // The table is these units and nothing else: made again, it is the file.
  assert.equal(whole(units, null, older, null), readFileSync(`${ESTIMATE}/report.md`, 'utf8'));

  // Each unit is of a conversation in the repository: the one beside the traces, or, for the one Opus built, the one beside these results.
  const built = (path: string) => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { sessionId: string; model: string }) : null);
  const baseOf = (unit: Unit) => {
    const shared = built(fileURLToPath(new URL(`../bench/bases/${unit.trace}.json`, import.meta.url)));
    const own = built(`${ESTIMATE}/bases/${unit.trace}.json`);
    return [shared, own].find((base) => base?.sessionId === unit.base) ?? null;
  };
  for (const unit of units) assert.ok(baseOf(unit) !== null, `${unit.trace} ${unit.model} ${unit.variant}`);
  // Two states of the plugin's code: the count of ADR 0013, and 0.6.0, also made to compact what it handed over.
  const of = (...variants: string[]) => units.filter((unit) => variants.includes(unit.variant));
  assert.equal(units.length, of('adr-0013', 'v0.6.0', 'v0.6.0-max-after-100').length);
  assert.equal(new Set(of('adr-0013').map((unit) => unit.plugin)).size, 1);
  assert.equal(new Set(of('v0.6.0', 'v0.6.0-max-after-100').map((unit) => unit.plugin)).size, 1);
  // What was probed: every conversation with Haiku, two of them compacted by Sonnet, the Japanese one built and compacted by Opus.
  const short = (model: string) => /haiku|sonnet|opus/.exec(model)?.[0] ?? model;
  const probed = (variant: string) => of(variant).map((unit) => `${unit.trace} ${short(unit.model)}`).sort();
  const eleven = [...[...TRACES, ...PROBED].map((trace) => `${trace.name} haiku`), 'results sonnet', 'mixed sonnet', 'japanese opus'].sort();
  assert.deepEqual(probed('adr-0013'), eleven);
  assert.deepEqual(probed('v0.6.0'), eleven);
  assert.deepEqual(probed('v0.6.0-max-after-100'), ['mixed haiku', 'mixed sonnet']);

  // How far the size was off what was in use: against what was sent next where results were moved out, else
  // against what was in use before, less the thinking.
  const off = (unit: Unit): number => {
    const line = unit.compaction.line;
    assert.ok(line !== null && line.estimate !== undefined && unit.compaction.thinkingBefore !== undefined, `${unit.trace} ${unit.model} ${unit.variant}`);
    const against = line.outcome === 'moved' ? (unit.questions[0]?.requests[0] ?? NaN) : unit.compaction.preTokens - unit.compaction.thinkingBefore;
    assert.ok(line.outcome === 'moved' || line.outcome === 'nothing');
    return (line.estimate - against) / against;
  };
  const sameModel = (unit: Unit) => baseOf(unit)?.model === unit.model;
  // What docs/limits.md says of the count, compacted by the model that built the conversation. Where results were moved out,
  // within 20 % of what was sent next and no more than 5 % under; where nothing could be, up to 7 % under what was in use less the thinking.
  const own = of('adr-0013').filter(sameModel);
  const movedOut = own.filter((unit) => unit.compaction.line?.outcome === 'moved').map(off);
  const untouched = own.filter((unit) => unit.compaction.line?.outcome === 'nothing').map(off);
  assert.deepEqual([movedOut.length, untouched.length], [4, 5]);
  assert.ok(Math.max(...movedOut) <= 0.2 && Math.min(...movedOut) >= -0.05, movedOut.map((e) => (e * 100).toFixed(1)).join(' '));
  assert.ok(Math.max(...untouched) <= 0 && Math.min(...untouched) >= -0.07, untouched.map((e) => (e * 100).toFixed(1)).join(' '));
  // Compacted by another model before it has answered, the size is the other model's count: under by its tokenizer's share where the prose stays.
  const others = of('adr-0013').filter((unit) => !sameModel(unit));
  assert.deepEqual(others.map((unit) => `${unit.trace} ${short(unit.model)}`).sort(), ['mixed sonnet', 'results sonnet']);
  const [mixedBySonnet] = others.filter((unit) => unit.trace === 'mixed').map(off);
  assert.ok(mixedBySonnet !== undefined && mixedBySonnet < -0.15 && mixedBySonnet > -0.25, String(mixedBySonnet));
  // What #37 was filed for: 0.6.0 handed `mixed` to the summary at a size 39 % over what it had left, and this count compacts it.
  const mixed = (variant: string) => of(variant).find((unit) => unit.trace === 'mixed' && /haiku/.test(unit.model));
  assert.equal(mixed('v0.6.0')?.compaction.line?.outcome, 'too-much');
  assert.equal(mixed('v0.6.0')?.compaction.summarized, true);
  assert.equal(mixed('adr-0013')?.compaction.line?.outcome, 'moved');
  const forced = mixed('v0.6.0-max-after-100');
  assert.ok(forced !== undefined && off(forced) > 0.35);
  // And 0.6.0 was outside what this count keeps to, either way, on the same conversations.
  const before = of('v0.6.0').filter(sameModel).filter((unit) => unit.compaction.line?.outcome !== 'too-much').map(off);
  assert.ok(Math.max(...before) > 0.4 && Math.min(...before) < -0.19, before.map((e) => (e * 100).toFixed(1)).join(' '));

  // Nothing of the machine: no home directory in either form a path of it takes, no key.
  const read = (name: string) => readFileSync(`${ESTIMATE}/${name}`, 'utf8');
  const text = JSON.stringify(all) + read('report.md') + read('bases/japanese.json') + read('bases/japanese.conversation.json');
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(text));
  // The conversation Opus built is the trace as it is now, as the ones beside the traces are held to be.
  const japanese = BUILT.find((trace) => trace.name === 'japanese');
  assert.ok(japanese !== undefined);
  assert.deepEqual(saidIn(JSON.parse(read('bases/japanese.conversation.json')) as Conversation), saidBy(japanese));
  assert.equal(built(`${ESTIMATE}/bases/japanese.json`)?.model, 'claude-opus-5-5');
});

test('the tables are of the plugin as it is set by default, or of the one other variant measured where there is no default', () => {
  const changed = { ...unitOf('plugin', 1, []), variant: 'changed' };
  const alone = report([changed], null);
  assert.ok(alone.includes('### ') && alone.includes(' Variant: changed.'), alone.slice(0, 300));
  // The default among them: it is what is tabled, and nothing says a variant.
  const mixed = report([changed, unitOf('plugin', 1, [])], null);
  assert.ok(mixed.includes('### ') && !mixed.includes('Variant:'));
  assert.ok(mixed.includes('plugin 1,'), 'one run of the plugin, not two');
  // Two variants and no default: they are not one comparison, and none is tabled.
  assert.ok(!report([changed, { ...changed, variant: 'other' }], null).includes('### '));
  // A probe asks no question of a trace and decides nothing.
  assert.ok(report([changed, { ...changed, variant: 'probed', mode: 'probe' as const }], null).includes(' Variant: changed.'));
  // What the plugin estimated is tabled for the same units: no table of no rows under the heading.
  const line = { outcome: 'moved' as const, moved: 3, results: 6, images: 0, charsBefore: 108144, charsAfter: 54793, estimate: 44333, window: 167000, ms: 55 };
  const said = { ...unitOf('plugin', 1, [answered('next', 'continuity', 'ok', [])], { line }), variant: 'changed' };
  assert.match(whole([said], null), /\| changed \([0-9a-z ]+\) \| 1 \| moved \| 44333 \|/);
  assert.ok(!whole([said, unitOf('plugin', 1, [])], null).includes('| changed ('));
});

const CHANGED = fileURLToPath(new URL('../bench/results/2026-10-02-changed', import.meta.url));
/** The calls to `recall` in those units, as docs/measurements.md states them. */
const RECALLS = 92;

test('the units in the repository measured with the line after a summary: the reading is fetched where it was not, and nothing else moves (#14)', () => {
  assert.ok(existsSync(CHANGED));
  const all = unitsUnder(CHANGED);
  const { units, older } = currentOf(all, BEFORE_SONNET);
  assert.equal(older, 0);
  const grades = JSON.parse(readFileSync(`${CHANGED}/grades.json`, 'utf8')) as Grades;
  // The tables are these units and grades and nothing else: made again, they are the file.
  assert.equal(whole(units, grades, older, null), readFileSync(`${CHANGED}/report.md`, 'utf8'));
  assert.equal(outcomesOf(units, grades).ungraded, 0);

  // What was run: the plugin's arm of the five conversations that go to the summary, three times on Haiku, and two of them once on Sonnet.
  assert.ok(units.every((unit) => unit.arm === 'plugin' && unit.variant === 'changed' && unit.mode === 'ask' && unit.questions.length === 9));
  assert.ok(units.every((unit) => unit.compaction.summarized));
  assert.equal(new Set(units.map((unit) => unit.plugin)).size, 1);
  const SHOWN = ['full', 'prose', 'short', 'thinking'];
  const of = (set: readonly Unit[], model: RegExp, traces: readonly string[]) => set.filter((unit) => model.test(unit.model) && traces.includes(unit.trace));
  assert.deepEqual(of(units, /haiku/, [...SHOWN, 'writes']).map((unit) => `${unit.trace} ${unit.run}`).sort(), [...SHOWN, 'writes'].flatMap((trace) => [1, 2, 3].map((run) => `${trace} ${run}`)).sort());
  assert.deepEqual(of(units, /sonnet/, TRACES.map((trace) => trace.name)).map((unit) => unit.trace).sort(), ['prose', 'writes']);

  // What they are set against: the plugin's arm of the results of 2026-10-02, on the same buildings of the conversations.
  const earlier = currentOf(unitsUnder(RESULTS), BEFORE_SONNET).units.filter((unit) => unit.arm === 'plugin' && unit.mode === 'ask' && unit.variant === 'default');
  const earlierGrades = JSON.parse(readFileSync(`${RESULTS}/grades.json`, 'utf8')) as Grades;
  for (const unit of units) assert.ok(earlier.some((one) => one.trace === unit.trace && one.base === unit.base), `${unit.trace} ${unit.model}`);

  const answers = (set: readonly Unit[], id: string) => set.map((unit) => ({ unit, one: unit.questions.find((question) => question.id === id) as Unit['questions'][number] }));
  const right = (set: readonly Unit[], id: string, g: Grades) => answers(set, id).filter(({ unit, one }) => verdictOf(unit, one, g) === 'correct').length;
  const noCall = (set: readonly Unit[], id: string) => answers(set, id).filter(({ one }) => one.calls.length === 0).length;
  const recalls = (set: readonly Unit[], id: string) => answers(set, id).reduce((sum, { one }) => sum + one.retrieval.recalls, 0);

  // What the file said when it was read, where Claude Code shows the file again: none right of twelve, and six with the line.
  assert.equal(right(of(earlier, /haiku/, SHOWN), 'then', earlierGrades), 0);
  assert.equal(noCall(of(earlier, /haiku/, SHOWN), 'then'), 12);
  assert.deepEqual(SHOWN.map((trace) => right(of(units, /haiku/, [trace]), 'then', grades)), [3, 0, 2, 1]);
  // Every call to recall in these units, as the document counts them.
  assert.equal(units.flatMap((unit) => unit.questions).reduce((sum, one) => sum + one.retrieval.recalls, 0), RECALLS);
  // Each right answer came after one recall, and each miss called nothing.
  assert.equal(recalls(of(units, /haiku/, SHOWN), 'then'), 6);
  assert.equal(noCall(of(units, /haiku/, SHOWN), 'then'), 6);
  // Where the file is not shown again, right as before, with one recall an answer where there were two.
  assert.deepEqual([right(of(earlier, /haiku/, ['writes']), 'then', earlierGrades), right(of(units, /haiku/, ['writes']), 'then', grades)], [3, 3]);
  assert.deepEqual([recalls(of(earlier, /haiku/, ['writes']), 'then'), recalls(of(units, /haiku/, ['writes']), 'then')], [6, 3]);
  // A file that did not change is not named: answered right with no call, as before. What the changed file says now: right as before.
  for (const [set, g] of [[earlier, earlierGrades], [units, grades]] as const) {
    assert.deepEqual([right(of(set, /haiku/, SHOWN), 'unchanged', g), noCall(of(set, /haiku/, SHOWN), 'unchanged')], [12, 12]);
    assert.equal(right(of(set, /haiku/, [...SHOWN, 'writes']), 'now', g), 15);
  }
  // The script's output that no file holds: 29 of 30, where it was 26.
  const gone = (set: readonly Unit[], g: Grades) => right(of(set, /haiku/, [...SHOWN, 'writes']), 'gone-1', g) + right(of(set, /haiku/, [...SHOWN, 'writes']), 'gone-2', g);
  assert.deepEqual([gone(earlier, earlierGrades), gone(units, grades)], [26, 29]);
  // Sonnet: all three right in both conversations, with the line as without it.
  for (const id of ['then', 'now', 'unchanged']) {
    assert.equal(right(of(units, /sonnet/, ['prose', 'writes']), id, grades), 2, id);
    assert.equal(right(of(earlier, /sonnet/, ['prose', 'writes']), id, earlierGrades), 2, id);
  }

  // Nothing of the machine: no home directory in either form a path of it takes, no key.
  const text = JSON.stringify(all) + JSON.stringify(grades) + readFileSync(`${CHANGED}/report.md`, 'utf8');
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(text));
});

const AGAIN = fileURLToPath(new URL('../bench/results/2026-10-02-v0.6.1', import.meta.url));

/** A row of the published tables of a trace and model, as the documents quote it: the plugin's cell, then the built-in compaction's. */
const rowOf = (tables: string, trace: string, label: string, model = 'claude-haiku-4-5-20251001'): string[] => {
  const section = tables.split('\n### ').find((part) => part.startsWith(`${trace}, ${model}\n`)) ?? '';
  const line = section.split('\n').find((one) => one.startsWith(`| ${label} |`)) ?? '';
  return line.split('|').slice(2, 4).map((cell) => cell.trim());
};

/** Right answers of those asked, over the runs of some traces, in one arm: 0 the plugin's, 1 the built-in compaction's. */
const rightOf = (tables: string, traces: readonly string[], label: string, arm: 0 | 1): [number, number] => {
  let [got, asked] = [0, 0];
  for (const trace of traces) {
    for (const one of (rowOf(tables, trace, label)[arm] ?? '').matchAll(/(\d+)\/(\d+)/g)) {
      got += Number(one[1]);
      asked += Number(one[2]);
    }
  }
  return [got, asked];
};

const KIND_ROWS = ['Exact, source gone', 'Exact, file unchanged', 'Exact, file changed: what it said then', 'Exact, file changed: what it says now', 'Where the work stands', 'A rule stated early'];

/** Every kind of question together, over some traces, in one arm. */
const everyOf = (tables: string, traces: readonly string[], arm: 0 | 1): [number, number] =>
  KIND_ROWS.map((kind) => rightOf(tables, traces, kind, arm)).reduce<[number, number]>(([got, asked], [g, a]) => [got + g, asked + a], [0, 0]);

test('the benchmark run again on 0.6.1: of conversations built again, every answer graded, the tables made from them, and what the documents say of them', () => {
  assert.ok(existsSync(AGAIN));
  const all = unitsUnder(AGAIN);
  const { units, older } = currentOf(all, BEFORE_SONNET);
  assert.equal(older, 0);
  const grades = JSON.parse(readFileSync(`${AGAIN}/grades.json`, 'utf8')) as Grades;
  const tables = readFileSync(`${AGAIN}/report.md`, 'utf8');
  // The tables are these units and grades and nothing else: made again, they are the file.
  assert.equal(whole(units, grades, older, null), tables);

  // Each unit is of a conversation built again from the traces as they are, which the file beside the results names, and of one state of the plugin's code.
  const bases = TRACES.map((trace) => readFileSync(`${AGAIN}/bases/${trace.name}.json`, 'utf8'));
  const built = new Map(TRACES.map((trace, at) => [trace.name, JSON.parse(bases[at] as string) as { sessionId: string; version: number }]));
  for (const unit of units) {
    assert.equal(unit.base, built.get(unit.trace)?.sessionId, `${unit.trace} ${unit.model} run ${unit.run} ${unit.arm}`);
    assert.equal(unit.version, built.get(unit.trace)?.version, unit.trace);
  }
  assert.equal(new Set(units.filter((unit) => unit.arm === 'plugin').map((unit) => unit.plugin)).size, 1);

  // What was run: as the first time, six traces three times on Haiku, three once on Sonnet, both arms each time, and nothing else.
  assert.ok(units.every((unit) => unit.mode === 'ask' && unit.variant === 'default' && unit.questions.length === 9));
  const count = (model: RegExp, arm: string) => units.filter((unit) => model.test(unit.model) && unit.arm === arm).length;
  assert.deepEqual([count(/haiku/, 'plugin'), count(/haiku/, 'builtin'), count(/sonnet/, 'plugin'), count(/sonnet/, 'builtin')], [18, 18, 3, 3]);
  // Sonnet, the one run: every question right in both arms. The plugin compacted `results` by itself and handed the other two to the summary,
  // so `results` is where its compaction is set against the built-in one, and its nine questions are the count the README gives.
  const sonnet = (arm: string, traces: readonly string[]) => units.filter((unit) => /sonnet/.test(unit.model) && unit.arm === arm && traces.includes(unit.trace));
  const answered = (set: readonly Unit[]) => set.flatMap((unit) => unit.questions.map((asked) => verdictOf(unit, asked, grades))).filter((verdict) => verdict === 'correct').length;
  const three = ['results', 'writes', 'prose'];
  assert.deepEqual([answered(sonnet('plugin', three)), answered(sonnet('builtin', three))], [27, 27]);
  assert.deepEqual(sonnet('plugin', three).map((unit) => `${unit.trace} ${unit.compaction.line?.outcome}`).sort(), ['prose nothing', 'results moved', 'writes nothing']);
  const nine = [answered(sonnet('plugin', ['results'])), answered(sonnet('builtin', ['results']))];
  assert.deepEqual(nine, [9, 9]);
  // Every answer has a verdict, and the grader was right on every answer whose grade was known.
  assert.equal(outcomesOf(units, grades).ungraded, 0);
  assert.equal(grades.controls.asExpected, grades.controls.count);
  assert.equal(grades.controls.toldPairsSame, grades.controls.toldPairs);

  // What docs/measurements.md and the README say of them, read off the tables: the plugin's cell, then the built-in compaction's.
  const row = (trace: string, label: string) => rowOf(tables, trace, label);
  const right = (traces: readonly string[], label: string, arm: 0 | 1) => rightOf(tables, traces, label, arm);
  assert.deepEqual(row('results', 'Built-in summary ran'), ['0 of 3', '3 of 3']);
  assert.deepEqual(row('results', 'Tokens sent on the next request'), ['43995, 43995, 43995', '8246, 8313, 8353']);
  assert.deepEqual(row('results', 'Exact, source gone'), ['2/2, 2/2, 2/2', '1/2, 1/2, 0/2']);
  const handed = ['writes', 'prose', 'short', 'full', 'thinking'];
  for (const trace of handed) assert.deepEqual(row(trace, 'Built-in summary ran'), ['3 of 3', '3 of 3'], trace);
  assert.deepEqual([right(handed, 'Exact, source gone', 0), right(handed, 'Exact, source gone', 1)], [[26, 30], [10, 30]]);
  const six = TRACES.map((trace) => trace.name);
  assert.deepEqual([right(six, 'Exact, file changed: what it said then', 0), right(six, 'Exact, file changed: what it said then', 1)], [[5, 18], [0, 18]]);
  // Every kind of question together: 143 and 118 of 162, where the first run had 139 and 114.
  assert.deepEqual([everyOf(tables, six, 0), everyOf(tables, six, 1)], [[143, 162], [118, 162]]);

  // Where the conversation was handed over, the summary in the plugin's arm against the built-in one's, pair by pair: this run, and the first.
  const pairsOf = (of: readonly Unit[]) =>
    handed.flatMap((trace) =>
      [1, 2, 3].map((run) => {
        const one = (arm: string) => of.find((unit) => unit.trace === trace && /haiku/.test(unit.model) && unit.run === run && unit.arm === arm && unit.mode === 'ask' && unit.variant === 'default')?.compaction;
        const [plugin, builtin] = [one('plugin'), one('builtin')];
        assert.ok(plugin !== undefined && builtin !== undefined, `${trace} run ${run}`);
        return { plugin, builtin };
      }),
    );
  // Of fifteen: the eighth.
  const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[(values.length - 1) / 2] as number;
  const told = (of: readonly Unit[]) => {
    const pairs = pairsOf(of);
    return {
      longer: pairs.filter(({ plugin, builtin }) => plugin.durationMs > builtin.durationMs).length,
      of: pairs.length,
      seconds: Math.round(median(pairs.map(({ plugin, builtin }) => plugin.durationMs - builtin.durationMs)) / 100) / 10,
      tokens: median(pairs.map(({ plugin, builtin }) => plugin.own.outputTokens - builtin.own.outputTokens)),
    };
  };
  assert.deepEqual(told(units), { longer: 14, of: 15, seconds: 7.7, tokens: 793 });
  assert.deepEqual(told(currentOf(unitsUnder(RESULTS), BEFORE_SONNET).units), { longer: 10, of: 15, seconds: 1.4, tokens: 268 });
  // About 10 ms for a token the summary wrote out, in both arms, and 6 ms or less for the plugin to look for what to move.
  const rate = (arm: 'plugin' | 'builtin') => median(pairsOf(units).map((pair) => pair[arm].durationMs / pair[arm].own.outputTokens));
  for (const arm of ['plugin', 'builtin'] as const) assert.ok(rate(arm) > 9.5 && rate(arm) < 11, `${arm} ${rate(arm)}`);
  for (const { plugin } of pairsOf(units)) assert.ok(plugin.line !== null && plugin.line.ms <= 6);

  // Nothing of the machine: no home directory in either form a path of it takes, no key.
  const text = JSON.stringify(all) + JSON.stringify(grades) + tables + bases.join('');
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(text));
});

const LEFT = fileURLToPath(new URL('../bench/results/2026-10-03', import.meta.url));

test('the benchmark with a /compact left undone (ADR 0015): the plugin measured again on the conversations of the run on 0.6.1, beside its built-in arm', () => {
  assert.ok(existsSync(LEFT));
  const all = unitsUnder(LEFT);
  const { units, older } = currentOf(all, BEFORE_SONNET);
  assert.equal(older, 0);
  const grades = JSON.parse(readFileSync(`${LEFT}/grades.json`, 'utf8')) as Grades;
  const tables = readFileSync(`${LEFT}/report.md`, 'utf8');
  // The tables are these units and grades and nothing else: made again, they are the file.
  assert.equal(whole(units, grades, older, null), tables);

  // The conversations are those of the run on 0.6.1, and its built-in arm is here unchanged: the plugin's arm alone was measured again, on another state of its code.
  const again = currentOf(unitsUnder(AGAIN), BEFORE_SONNET).units;
  const builtOn = new Map(again.map((unit) => [unit.trace, unit.base]));
  for (const unit of units) assert.equal(unit.base, builtOn.get(unit.trace), `${unit.trace} ${unit.model} run ${unit.run} ${unit.arm}`);
  const counterpart = (unit: Unit) => again.find((one) => one.trace === unit.trace && one.model === unit.model && one.run === unit.run && one.arm === unit.arm && one.mode === unit.mode);
  for (const unit of units.filter((one) => one.arm === 'builtin')) assert.deepEqual(unit, counterpart(unit), `${unit.trace} ${unit.model} run ${unit.run}`);
  const plugin = units.filter((unit) => unit.arm === 'plugin');
  assert.equal(new Set(plugin.map((unit) => unit.plugin)).size, 1);
  assert.notEqual(plugin[0]?.plugin, again.find((unit) => unit.arm === 'plugin')?.plugin);

  // What was run: the six traces three times on Haiku; on Sonnet `results` and `writes`, `prose` being left out (its question about what a file
  // said before it changed was refused twice by Sonnet's safeguards); and, with the line at 1 %, a probe of each of the four left undone, three times.
  const asked = units.filter((unit) => unit.mode === 'ask' && unit.variant === 'default');
  const count = (model: RegExp, arm: string) => asked.filter((unit) => model.test(unit.model) && unit.arm === arm).length;
  assert.deepEqual([count(/haiku/, 'plugin'), count(/haiku/, 'builtin'), count(/sonnet/, 'plugin'), count(/sonnet/, 'builtin')], [18, 18, 2, 3]);
  assert.deepEqual(asked.filter((unit) => /sonnet/.test(unit.model) && unit.arm === 'plugin').map((unit) => unit.trace).sort(), ['results', 'writes']);
  assert.ok(asked.every((unit) => unit.questions.length === 9));
  const four = ['writes', 'prose', 'short', 'thinking'];
  const probes = units.filter((unit) => unit.mode === 'probe');
  assert.deepEqual(probes.map((unit) => `${unit.trace} ${unit.run}`).sort(), four.flatMap((trace) => [1, 2, 3].map((run) => `${trace} ${run}`)).sort());
  assert.ok(probes.every((unit) => unit.variant === 'max-after-1' && unit.arm === 'plugin' && unit.compaction.summarized && unit.compaction.line?.outcome === 'nothing'));
  assert.equal(units.length, asked.length + probes.length);
  // Every answer has a verdict, and the grader was right on every answer whose grade was known.
  assert.equal(outcomesOf(asked, grades).ungraded, 0);
  assert.equal(grades.controls.asExpected, grades.controls.count);
  assert.equal(grades.controls.toldPairsSame, grades.controls.toldPairs);

  // The four with nothing to move out and room left are left as they were every time; `results` is compacted and `full` summarized as before.
  for (const unit of asked.filter((one) => one.arm === 'plugin')) assert.equal(unit.compaction.undone === true, four.includes(unit.trace), `${unit.trace} ${unit.model} run ${unit.run}`);

  // What docs/measurements.md and the README say of them, read off the tables.
  for (const trace of four) {
    assert.deepEqual(rowOf(tables, trace, 'Built-in summary ran'), ['0 of 3', '3 of 3'], trace);
    assert.deepEqual(rowOf(tables, trace, 'Left as it was, nothing compacted'), ['3 of 3', '0 of 3'], trace);
    assert.ok((rowOf(tables, trace, 'Compaction, ms')[0] ?? '').split(', ').every((ms) => Number(ms) < 100), trace);
  }
  assert.deepEqual(rowOf(tables, 'full', 'Built-in summary ran'), ['3 of 3', '3 of 3']);
  assert.deepEqual(rowOf(tables, 'results', 'Built-in summary ran'), ['0 of 3', '3 of 3']);
  const sixTraces = ['results', 'writes', 'prose', 'short', 'full', 'thinking'];
  const middle = (cell: string) => cell.split(', ').map(Number).sort((a, b) => a - b)[1];
  const nextRequest = (arm: 0 | 1) => sixTraces.map((trace) => middle(rowOf(tables, trace, 'Tokens sent on the next request')[arm] ?? ''));
  assert.deepEqual(nextRequest(0), [43995, 69039, 59893, 29343, 14671, 33098]);
  assert.deepEqual(nextRequest(1), [8313, 26034, 12573, 13157, 12557, 12781]);
  // Over every run of the four: what the next request carried left as it was, and after a summary.
  const span = (arm: 0 | 1) => {
    const all = four.flatMap((trace) => (rowOf(tables, trace, 'Tokens sent on the next request')[arm] ?? '').split(', ').map(Number));
    return [Math.min(...all), Math.max(...all)];
  };
  assert.deepEqual([span(0), span(1)], [[29343, 69039], [12522, 26318]]);
  // The script's output that no file holds any more, right of six, per trace: the README's table.
  assert.deepEqual(sixTraces.map((trace) => rightOf(tables, [trace], 'Exact, source gone', 0)[0]), [6, 5, 4, 6, 6, 6]);
  assert.deepEqual(sixTraces.map((trace) => rightOf(tables, [trace], 'Exact, source gone', 1)[0]), [2, 1, 4, 1, 3, 1]);
  // Every kind of question, Haiku over the six: the plugin's arm, then the built-in one's.
  const kinds = KIND_ROWS.map((kind) => [rightOf(tables, sixTraces, kind, 0), rightOf(tables, sixTraces, kind, 1)]);
  assert.deepEqual(kinds, [[[33, 36], [12, 36]], [[18, 18], [18, 18]], [[15, 18], [0, 18]], [[18, 18], [18, 18]], [[34, 36], [34, 36]], [[34, 36], [36, 36]]]);
  assert.deepEqual([everyOf(tables, sixTraces, 0), everyOf(tables, sixTraces, 1)], [[152, 162], [118, 162]]);
  // What a file said before it changed, in the four left as they were: 12 of 12, with no tool, from the conversation that was still there.
  const then = asked.filter((unit) => unit.arm === 'plugin' && /haiku/.test(unit.model) && four.includes(unit.trace)).map((unit) => unit.questions.find((one) => one.id === 'then'));
  assert.equal(then.filter((one) => one?.verdict === 'correct' && one.calls.length === 0).length, 12);
  // The nine questions' cost, sending the whole conversation each time: the first run wrote it to the cache, the two after it read it.
  assert.deepEqual(rowOf(tables, 'writes', 'All questions: cost, USD'), ['1.1160, 0.0802, 0.0809', '0.4245, 0.4375, 0.5103']);
  assert.deepEqual(rowOf(tables, 'writes', 'Tokens sent on the next request', 'claude-sonnet-5-5'), ['86799', '28400']);
  assert.deepEqual(rowOf(tables, 'writes', 'All questions: cost, USD', 'claude-sonnet-5-5'), ['2.8051', '0.9990']);
  // What the compaction and the nine questions cost on the four, as the README gives it: left as they were with the cache warm (runs 2 and 3,
  // which read what run 1 wrote) and cold (run 1), against a summary and its nine; and the files read again a unit.
  const haikuOn = (arm: string, runs: readonly number[]) => asked.filter((unit) => /haiku/.test(unit.model) && unit.arm === arm && four.includes(unit.trace) && runs.includes(unit.run));
  const costOf = (unit: Unit) => unit.compaction.own.costUSD + unit.questions.reduce((sum, one) => sum + one.own.costUSD, 0);
  const spanOf = (values: readonly number[], digits: number) => [Math.min(...values), Math.max(...values)].map((value) => Number(value.toFixed(digits)));
  assert.deepEqual(spanOf(haikuOn('plugin', [2, 3]).map(costOf), 2), [0.04, 0.08]);
  assert.deepEqual(spanOf(haikuOn('plugin', [1]).map(costOf), 2), [0.4, 1.12]);
  assert.deepEqual(spanOf(haikuOn('builtin', [1, 2, 3]).map(costOf), 2), [0.18, 0.61]);
  const readsOf = (unit: Unit) => unit.questions.reduce((sum, one) => sum + one.retrieval.reads, 0);
  assert.deepEqual(spanOf(haikuOn('builtin', [1, 2, 3]).map(readsOf), 0), [1, 22]);
  assert.ok(haikuOn('plugin', [1, 2, 3]).every((unit) => readsOf(unit) === 1));

  // Nothing of the machine: no home directory in either form a path of it takes, no key.
  const text = JSON.stringify(all) + JSON.stringify(grades) + tables;
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(text));
});

const FOUND_AT = fileURLToPath(new URL('../bench/results/2026-10-03-find', import.meta.url));
/** The plugin's code the published units of the plugin as it now is were measured with (`checkoutOf`): this change on `e792fad`, before #48. */
const MEASURED_CODE = '3b4bdf93e529';

// docs/limits.md, docs/comparison.md and README.md give the figures of the plugin as it now is: the test of #54 below holds those.
test('the units in the repository measured where the calls say nothing: every figure docs/measurements.md and CHANGELOG.md give of it (#38)', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const measurements = read('../docs/measurements.md');
  const changelog = read('../CHANGELOG.md');
  const has = (text: string, phrase: string, what: string) => assert.ok(text.replace(/\s+/g, ' ').includes(phrase), `${what}: ${phrase}`);
  const of = (dir: string) => {
    const { units, older } = currentOf(unitsUnder(`${FOUND_AT}/${dir}`), BEFORE_SONNET);
    assert.equal(older, 0, dir);
    assert.ok(units.every((unit) => unit.arm === 'plugin' && unit.mode === 'find'), dir);
    assert.equal(new Set(units.map((unit) => unit.plugin)).size, 1, dir);
    return units;
  };
  const counts = (units: readonly Unit[], trace: string, model: RegExp, variant: string) => {
    const these = units.filter((unit) => unit.trace === trace && model.test(unit.model) && unit.variant === variant).sort((a, b) => a.run - b.run);
    const meaningOf = (unit: Unit) => unit.questions.filter((one) => one.id.startsWith('find-doc-'));
    const questions = these.flatMap((unit) => unit.questions);
    return {
      runs: these.map((unit) => unit.run),
      calls: these.reduce((sum, unit) => sum + meaningOf(unit).filter((one) => one.retrieval.finds > 0).length, 0),
      perRun: these.map((unit) => meaningOf(unit).filter((one) => one.retrieval.finds > 0).length),
      meaning: questions.filter((one) => one.id.startsWith('find-doc-') && one.verdict === 'correct').length,
      code: questions.filter((one) => one.id.startsWith('find-code-') && one.verdict === 'correct').length,
      right: these.map((unit) => unit.questions.filter((one) => one.verdict === 'correct').length),
      finds: these.map((unit) => unit.questions.reduce((sum, one) => sum + one.retrieval.finds, 0)),
    };
  };
  const and = (list: readonly number[]) => `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;

  const rows: [dir: string, label: string][] = [
    ['before', 'Before this change'],
    ['named-in-recall', "`recall`'s description names `find`"],
    ['named-and-none', 'and `find`\'s "none" says what Jev saw'],
  ];
  const by: Record<string, Record<'default' | 'find', ReturnType<typeof counts>>> = {};
  for (const [dir, label] of rows) {
    const units = of(dir);
    // Every unit moved all thirteen documents out: sixteen results of twenty.
    assert.ok(units.filter((unit) => unit.trace === 'opaque').every((unit) => unit.compaction.line?.moved === 16), dir);
    const entry = { default: counts(units, 'opaque', /haiku/, 'default'), find: counts(units, 'opaque', /haiku/, 'find') };
    by[dir] = entry;
    for (const [variant, key] of [['default', 'no'], ['find', 'yes']] as const) {
      const n = entry[variant];
      assert.deepEqual(n.runs, [1, 2, 3], `${dir} ${variant}`);
      const row = new RegExp(`\\| ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} +\\| ${key} +\\| +${n.calls} of 21 \\| +${n.meaning} of 21 \\| +${n.code} of 9 \\|`);
      assert.match(measurements, row, `${dir} ${variant}`);
    }
  }
  const [before, named, now] = [by['before'], by['named-in-recall'], by['named-and-none']] as const;
  assert.ok(before && named && now);
  // The rule set before measuring: 11 of 21. The plugin before this change falls short of it; the plugin as it now is reaches it.
  assert.ok(before.find.calls < 11 && now.find.calls >= 11);
  assert.equal(new Set(of('named-and-none').map((unit) => unit.plugin)).values().next().value, MEASURED_CODE);
  has(measurements, `fell short of the rule, ${before.find.calls} of 21 (${and(before.find.perRun)} in the three runs)`, 'measurements');
  has(measurements, `the agent called it for ${named.find.calls} of 21`, 'measurements');
  has(measurements, `said the code was not there: ${named.find.code} of 9`, 'measurements');
  has(measurements, `with that, ${now.find.calls} of 21 (${and(now.find.perRun)}), and ${now.find.code} of 9 codes`, 'measurements');
  const noKey = [before.default.code, named.default.code, now.default.code];
  has(measurements, `its codes went from ${Math.min(...noKey)} to ${Math.max(...noKey)} of 9`, 'measurements');
  // "with it", not "now": the same release lists the two tools in front of the agent (#54), and the figure is from before that.
  has(changelog, `for ${before.find.calls} of 21 questions about what a result was about before this change, and for ${now.find.calls} of 21 with it`, 'CHANGELOG');
  // Over the text with its white space folded, as `has` reads it: a line wrapped in the middle of the phrase would pass this otherwise.
  assert.ok(!changelog.replace(/\s+/g, ' ').includes("it still answers by the ticket's id"), 'said of the plugin before the tools were listed, in the past');
  has(changelog, "it still answered by the ticket's id", 'CHANGELOG');
  has(changelog, `0 of 9 right, against ${before.find.code} of 9 before this change; with this answer, ${now.find.code} of 9 (with no key, ${Math.min(...noKey)} to ${Math.max(...noKey)} of 9 in the same runs)`, 'CHANGELOG');
  assert.equal(named.find.code, 0);

  // Sonnet 5.5, one run of the plugin as it now is.
  const units = of('named-and-none');
  const sonnet = counts(units, 'opaque', /sonnet/, 'find');
  const sonnetNoKey = counts(units, 'opaque', /sonnet/, 'default');
  has(changelog, `(Sonnet 5.5, one run: ${sonnet.calls} of 7)`, 'CHANGELOG');
  has(measurements, `with a key it called \`find\` for ${sonnet.calls} of the 7 questions by meaning and was right on ${sonnet.meaning}, and on ${sonnet.code} of the 3 codes; with no key, right on ${sonnetNoKey.meaning} and on ${sonnetNoKey.code}.`, 'measurements');

  // Where the calls name what they read: three runs of each arm.
  const results = { find: counts(units, 'results', /haiku/, 'find'), none: counts(units, 'results', /haiku/, 'default') };
  const short = { find: counts(units, 'short', /haiku/, 'find'), none: counts(units, 'short', /haiku/, 'default') };
  has(measurements, `\`results\` ${and(results.find.right)} of 8 with a key and ${and(results.none.right)} without`, 'measurements');
  has(measurements, `calling \`find\` ${and(results.find.finds)} times in eight questions`, 'measurements');
  has(measurements, `\`short\` ${and(short.find.right)} of 5 with a key and ${and(short.none.right)} without`, 'measurements');
  assert.deepEqual(short.find.finds, [0, 0, 0]);
});

const VALUES_AT = fileURLToPath(new URL('../bench/results/2026-10-03-values', import.meta.url));
/** The plugin's code the units of the value match were measured with (`checkoutOf`): #55 on `f88ed31`. */
const VALUES_CODE = 'b6736911384a';

test('the units and picks in the repository measured with the value match: every figure the documents give of them (#55)', async () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const [measurements, comparison, changelog] = [read('../docs/measurements.md'), read('../docs/comparison.md'), read('../CHANGELOG.md')];
  const has = (text: string, phrase: string, what: string) => assert.ok(text.replace(/\s+/g, ' ').includes(phrase), `${what}: ${phrase}`);
  const and = (list: readonly number[]) => `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  /** A row of a table in the measurements, whatever its padding. */
  const row = (...cells: string[]) =>
    assert.match(measurements, new RegExp(`\\| ${cells.map((cell) => cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' +\\| +')} +\\|`), cells.join(' | '));
  const picksOf = (path: string) => (JSON.parse(readFileSync(path, 'utf8')) as { picks: Pick[] }).picks;
  const answerable = (picks: readonly Pick[]) => picks.filter((one) => one.by === 'value' && one.right.length > 0);
  const counted = (picks: readonly Pick[]) => {
    const meaning = picks.filter((one) => one.by === 'meaning');
    return {
      value: answerable(picks).length,
      valueGiven: answerable(picks).filter((one) => wentOf(one) === 'gave the right one').length,
      meaning: meaning.length,
      meaningGiven: meaning.filter((one) => wentOf(one) === 'gave the right one').length,
      meaningListed: meaning.filter((one) => wentOf(one).startsWith('listed')).length,
    };
  };

  // The tables published beside them are these units and picks and nothing else.
  const { units, older } = currentOf(unitsUnder(VALUES_AT), BEFORE_SONNET);
  const picks = picksOf(`${VALUES_AT}/picks.json`);
  assert.equal(older, 0);
  assert.equal(whole(units, null, older, picks), read('../bench/results/2026-10-03-values/report.md'));
  assert.ok(units.every((unit) => unit.arm === 'plugin' && unit.mode === 'find' && unit.variant === 'find' && /haiku/.test(unit.model) && unit.plugin === VALUES_CODE));
  assert.deepEqual(units.map((unit) => `${unit.trace} ${unit.run}`).sort(), ['opaque', 'results'].flatMap((trace) => [1, 2, 3].map((run) => `${trace} ${run}`)));

  // With no agent: every question by a value whose result is an option is given, and it is Jev that gives it, told of the one result with a line holding the value.
  const earlier = picksOf(fileURLToPath(new URL('../bench/results/2026-10-02/picks.json', import.meta.url)));
  const picksBefore = [...earlier, ...picksOf(`${FOUND_AT}/named-and-none/picks.json`)];
  const [now, before] = [counted(picks), counted(picksBefore)];
  assert.deepEqual([now.value, now.meaning], [before.value, before.meaning]);
  assert.equal(now.valueGiven, now.value);
  assert.ok(answerable(picks).every((one) => one.jev.said.includes('; the one result with a line holding "')));
  assert.deepEqual(picks.filter((one) => one.by === 'value' && one.right.length === 0).map(wentOf), ['said none']);
  row('A value, its result among the options', `${now.value}`, `${before.valueGiven}`, `${now.valueGiven}`);
  row('Meaning', `${now.meaning}`, `${before.meaningGiven}, and listed ${before.meaningListed}`, `${now.meaningGiven}, and listed ${now.meaningListed}`);
  has(measurements, `Each of the ${now.value} was Jev's choice, told of the one result with a line holding the value.`, 'measurements');
  // By meaning, where the right result stood among those listed, before and now. These questions name no value, so nothing sent for them changed.
  const asks = new Map([...TRACES, ...FOUND].flatMap((trace) => trace.finds.map((one): [string, string] => [`${trace.name} ${one.id}`, one.ask])));
  const meant = (set: readonly Pick[]) => set.filter((one) => one.by === 'meaning');
  assert.ok(meant(picks).length > 0 && meant(picks).every((one) => valuesOf(asks.get(`${one.trace} ${one.question}`) ?? 'not a question of the traces: 123').length === 0));
  const listedIn = (set: readonly Pick[]) => ['listed, the right one first', 'listed, the right one further down', 'listed without it'].map((went) => meant(set).filter((one) => wentOf(one) === went).length);
  const [listedBefore, listedNow] = [listedIn(picksBefore), listedIn(picks)];
  has(
    measurements,
    `Of those listed, the right result was first for ${listedBefore[0]} before and ${listedNow[0]} now, further down for ${listedBefore[1]} and ${listedNow[1]}, and not among them for ${listedBefore[2]} and ${listedNow[2]}.`,
    'measurements',
  );
  // What it said before: of the questions of 2026-10-02, and with the three of `opaque`.
  const first = answerable(earlier);
  const saidNone = first.filter((one) => wentOf(one) === 'said none').length;
  assert.equal(now.value - first.length, 3);
  has(comparison, `it said ${saidNone} times of ${first.length} that none was about that`, 'comparison');
  has(comparison, `and gave the right one ${now.valueGiven} times of ${now.value};`, 'comparison');
  has(changelog, `${saidNone} times of ${first.length} in the benchmark. On those questions and three more it now gives the right result ${now.valueGiven} times of ${now.value}.`, 'CHANGELOG');

  // Questions the rule was not made from, asked of Jev: what Jev is told (by the code as it is) and what `find` did (as published), on the three conversations.
  type Held = { trace: string; kind: string; ask: string; target: string };
  const fixture = (name: string) => JSON.parse(read(`fixtures/values/${name}.json`)) as Held[];
  const real = (file: string, questions: readonly Held[]) => {
    const got = picksOf(`${VALUES_AT}/${file}`);
    assert.deepEqual(got.map((one) => [one.trace, one.question]), questions.map((one) => [one.trace, one.kind]), file);
    return questions.map((one, at) => ({ ...one, went: wentOf(got[at] as Pick), said: (got[at] as Pick).jev.said }));
  };
  const held = fixture('held-out');
  const third = [...real('picks-held-out.json', held), ...real('picks-after-review.json', fixture('after-review')), ...real('picks-misleading.json', fixture('misleading'))];
  /** What Jev is told for a question, by the code as it is: of no result, of the one asked for, or of another (a stand-in that takes the result it is told of is given that one). */
  const told = async (one: Held) => {
    const trusted = trusting();
    const [got] = await pick(one.trace, [{ id: one.kind, by: 'value', ask: one.ask, target: one.target }], builtConversation(one.trace), JEV, trusted.http);
    assert.ok(got !== undefined);
    const count = toldIn(trusted.sent[0] as Sent);
    if (count === 0) return valuesOf(one.ask).length > 0 ? 'nothing' : 'nothing: it names no value';
    return count > 1 ? 'of several results' : wentOf(got) === 'gave the right one' ? 'of the one result' : 'of another result';
  };
  const did: Record<string, string> = {
    'gave the right one': 'Gave the right result',
    'said none': 'Said none',
    'listed without it': 'Listed other results, giving none as the answer',
    'listed, the right one first': 'Listed the right result first',
  };
  const kinds: [string, string][] = [
    ['record id', "A record's number (`2-0077`)"],
    ['one number', 'One number no other result holds (a station)'],
    ['two lines', 'Two values that stand on two lines'],
    ['head of a value', 'The first five characters of a checksum'],
    ['letter case', 'A checksum in capitals'],
    ['line number', 'A number many results hold, meant as the number of a line (`250`)'],
    ['small number', 'A count in a question by meaning ("the 2 log files")'],
    ['meaning with a number', 'A number in a question by meaning ("all 120 batches of it")'],
    ['value of another result', 'A value another result holds, in a question by meaning ("run before record 2-0077 was looked at")'],
    ['value said not to be it', 'A value of a result said not to be it ("Not the output with checksum 9e3817e8")'],
  ];
  assert.deepEqual([...new Set(third.map((one) => one.kind))], kinds.map(([kind]) => kind));
  for (const [kind, label] of kinds) {
    const three = third.filter((one) => one.kind === kind);
    const tolds = new Set<string>();
    for (const one of three) tolds.add(await told(one));
    assert.deepEqual([three.length, tolds.size], [3, 1], kind);
    // What `find` did: the same on the three, or how many went each way, the most first.
    const tally = [...new Set(three.map((one) => one.went))].map((went) => [did[went] ?? 'not in the table', three.filter((one) => one.went === went).length] as const).sort((a, b) => b[1] - a[1]);
    const cell = tally.length === 1 ? (tally[0]?.[0] ?? '') : tally.map(([what, n], at) => `${at === 0 ? what : what.toLowerCase()} on ${n === 2 ? 'two' : 'one'}`).join('; ');
    row(label, [...tolds][0] ?? '', cell);
  }
  assert.ok(third.every((one) => one.went !== 'gave a wrong one'));
  has(measurements, 'No answer gave a wrong result.', 'measurements');
  // Told of a result that is not the one asked for, Jev did not give it: five times of six it gave the one asked for.
  const misled = third.filter((one) => one.kind === 'value of another result' || one.kind === 'value said not to be it');
  const given = misled.filter((one) => one.went === 'gave the right one').length;
  assert.deepEqual([misled.length, misled.length - given], [6, misled.filter((one) => one.went === 'listed, the right one first').length]);
  has(measurements, `It gave the result asked for ${given} times of ${misled.length} and listed it first the other time.`, 'measurements');
  has(read('../docs/limits.md'), `asked ${misled.length} such questions it gave the result asked for ${given} times and listed it first once`, 'limits');

  // The rule as it was first rebuilt told Jev of every result with a line holding the larger value: of two values on two lines it gave a wrong result, twice of three.
  const each = real('told-of-each/picks-held-out.json', held).filter((one) => one.kind === 'two lines');
  assert.deepEqual(each.map((one) => [one.trace, one.went]), [['results', 'gave a wrong one'], ['mixed', 'listed without it'], ['japanese', 'gave a wrong one']]);
  const holders: number[] = [];
  for (const one of each) {
    const larger = valuesOf(one.ask).find((value) => value.length >= 3) ?? '\0';
    assert.ok(one.said.includes(`one of its lines holds "${larger}"`), one.trace);
    const { stored } = await staged(resultsOf(builtConversation(one.trace)));
    const holding = stored.filter((result) => lineHolds(result.tool === 'Read' ? (unnumbered(result.text) ?? result.text) : result.text, [larger]));
    holders.push(holding.length);
    // The wrong one it gave was the first of those it was told of.
    if (one.went === 'gave a wrong one') assert.ok(one.said.startsWith('[found]') && one.said.includes(`; id ${holding[0]?.id};`), one.trace);
  }
  assert.deepEqual(holders, [4, 3, 2]);
  const at = (said: string | undefined) => /probability (\d\.\d\d)/.exec(said ?? '')?.[1] ?? '?';
  assert.ok(each[0]?.ask.includes('395 units at step 78'));
  has(
    measurements,
    `("395 units at step 78"), four results of \`results\` had a line holding 395, and Jev, told so of each, gave the first of them as the answer at probability ${at(each[0]?.said)}; ` +
      `in \`japanese\`, told of two, it gave the first at ${at(each[2]?.said)}; in \`mixed\`, told of three, it listed results without the one asked for`,
    'measurements',
  );
  assert.deepEqual(third.filter((one) => one.kind === 'two lines').map((one) => one.went), ['said none', 'said none', 'said none']);

  // With an agent in between, against the units of #51 (the plugin as it was then, with a key and without).
  const was = currentOf(unitsUnder(`${FOUND_AT}/named-and-none`), BEFORE_SONNET).units.filter((unit) => /haiku/.test(unit.model));
  const of = (set: readonly Unit[], trace: string, variant: string) => set.filter((unit) => unit.trace === trace && unit.variant === variant).sort((a, b) => a.run - b.run);
  type Asked = Unit['questions'][number];
  const right = (one: Asked) => one.verdict === 'correct';
  const called = (set: readonly Asked[]) => set.filter((one) => one.retrieval.finds > 0);
  const under = (set: readonly Unit[], prefix: string) => set.flatMap((unit) => unit.questions).filter((one) => one.id.startsWith(prefix));
  const [opaque, opaqueWas, opaqueNoKey] = [of(units, 'opaque', 'find'), of(was, 'opaque', 'find'), of(was, 'opaque', 'default')];
  const [codes, codesWas] = [under(opaque, 'find-code-'), under(opaqueWas, 'find-code-')];
  const [docs, docsWas] = [under(opaque, 'find-doc-'), under(opaqueWas, 'find-doc-')];
  row('`opaque`, a code in the middle of a document: right', `${codesWas.filter(right).length} of 9 (${under(opaqueNoKey, 'find-code-').filter(right).length} of 9 with no key)`, `${codes.filter(right).length} of ${codes.length}`);
  row('`opaque`, by meaning: called `find`', `${called(docsWas).length} of 21`, `${called(docs).length} of 21`);
  row('`opaque`, by meaning: right', `${docsWas.filter(right).length} of 21`, `${docs.filter(right).length} of 21`);
  const rightIn = (set: readonly Unit[]) => set.map((unit) => unit.questions.filter(right).length);
  const findsIn = (set: readonly Unit[]) => set.map((unit) => unit.questions.reduce((sum, one) => sum + one.retrieval.finds, 0));
  const [results, resultsWas] = [of(units, 'results', 'find'), of(was, 'results', 'find')];
  row('`results`, eight questions: right', and(rightIn(resultsWas)), and(rightIn(results)));
  has(measurements, `three runs do not tell ${called(docs).length} of 21 from ${called(docsWas).length}.`, 'measurements');

  // The change: a code in the middle of a document, asked for through an agent. Where it called `find` it was right; once it called no tool.
  assert.deepEqual([codes.length, called(codes).length, called(codes).filter(right).length], [9, 8, 8]);
  assert.deepEqual(codes.filter((one) => one.retrieval.finds === 0).map((one) => [one.calls.length, right(one)]), [[0, false]]);
  has(
    measurements,
    `the agent called \`find\` for ${called(codes).length} of the 9 codes, each time with the code alone as its question, and was right on all ${called(codes).filter(right).length}; for the other it called no tool, and was not right.`,
    'measurements',
  );
  assert.ok(called(codes).every((one) => one.findQuestions?.length === 1 && /^RX-\d{4}-[A-Z]$/.test(one.findQuestions[0] ?? '')));
  const found = `Haiku 4.5 found a code in the middle of a document ${codes.filter(right).length} times of ${codes.length}, where it had found ${codesWas.filter(right).length}.`;
  has(comparison, `asked through an agent, ${found}`, 'comparison');
  has(changelog, `With an agent in between, ${found}`, 'CHANGELOG');
  const trace = TRACES.find((one) => one.name === 'results');
  assert.ok(trace !== undefined);
  const valueIds = new Set(trace.finds.filter((one) => one.by === 'value').map((one) => one.id));
  const byValue = results.flatMap((unit) => unit.questions).filter((one) => valueIds.has(one.id));
  const uncalled = byValue.filter((one) => one.retrieval.finds === 0);
  const callsOf = (set: readonly Asked[]) => set.reduce((sum, one) => sum + one.retrieval.finds, 0);
  has(
    measurements,
    `it called \`find\` ${and(findsIn(results))} times in the three runs, where there were ${and(findsIn(resultsWas))}: for ${called(byValue).length} of the ${byValue.length} questions by a value, right on all ${called(byValue).filter(right).length}, ` +
      `and ${callsOf(results.flatMap((unit) => unit.questions)) - callsOf(byValue)} times for a question by meaning; of the ${uncalled.length} by a value it did not call \`find\` for, it was right on ${uncalled.filter(right).length}.`,
    'measurements',
  );
  assert.equal(called(byValue).filter(right).length, called(byValue).length);

  // What the agent asked find, put to find again where it names a value, with a stand-in for Jev that takes the result it is told of:
  // the result the question is about comes back. Jev is asked once and told of that one result, but where a phrase the agent quoted settles it.
  let again = 0;
  let put = 0;
  for (const name of ['opaque', 'results']) {
    const questions = new Map([...TRACES, ...FOUND].find((one) => one.name === name)?.finds.map((one) => [one.id, one]));
    const { files, messages, stored } = await staged(resultsOf(builtConversation(name)));
    for (const one of of(units, name, 'find').flatMap((unit) => unit.questions)) {
      for (const question of one.findQuestions ?? []) {
        if (valuesOf(question).length === 0) continue;
        const trusted = trusting();
        const said = await find({ files, dirs: ['/bench/store'], messages, provider: JEV, http: trusted.http, question });
        const target = questions.get(one.id)?.target ?? '\0';
        assert.deepEqual(readAnswer(said), { kind: 'gave', ids: stored.filter((result) => result.text.includes(target)).map((result) => result.id) }, `${name} ${one.id}: ${question}`);
        assert.equal(said.includes('matched the quoted phrase'), trusted.sent.length === 0, `${name} ${one.id}: ${question}`);
        if (trusted.sent.length > 0) assert.deepEqual([trusted.sent.length, toldIn(trusted.sent[0] as Sent)], [1, 1], `${name} ${one.id}: ${question}`);
        again += 1;
        put += trusted.sent.length;
      }
    }
  }
  assert.ok(again >= called(codes).length + called(byValue).length && put >= again - 1);
  has(
    measurements,
    `a test puts each of the ${again} that name a value to \`find\` again, with a stand-in for Jev that takes the result it is told of: the right result comes back each time. ` +
      `Jev, asked for ${put} of them, is told of one result each time, the right one; the other ${again - put === 1 ? 'one is' : `${again - put} are`} settled by a phrase the agent quoted.`,
    'measurements',
  );
});

const OPUS_AT = fileURLToPath(new URL('../bench/results/2026-10-03-opus', import.meta.url));

test('the units in the repository measured with Opus 5.5, three conversations and one in a window of 1,000,000: every figure the documents give of them (#57)', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const [measurements, readme, changelog, limits] = [read('../docs/measurements.md'), read('../README.md'), read('../CHANGELOG.md'), read('../docs/limits.md')];
  const comparison = read('../docs/comparison.md');
  const has = (text: string, phrase: string, what: string) => assert.ok(text.replace(/\s+/g, ' ').includes(phrase), `${what}: ${phrase}`);
  /** A row of a table in the section on Opus, whatever its padding. */
  const section = measurements.slice(measurements.indexOf('## With Opus 5.5, and in a window of 1,000,000'), measurements.indexOf('## A compaction, and a result read back'));
  const row = (...cells: string[]) => assert.match(section, new RegExp(`\\| ${cells.map((cell) => cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(' +\\| +')} +\\|`), cells.join(' | '));
  const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
  const seconds = (ms: number) => (ms / 1000).toFixed(ms < 1000 ? 2 : 1);
  const usd = (value: number) => (value === 0 ? '0' : value.toFixed(2));
  const thousands = (value: number) => value.toLocaleString('en-US');
  const listed = (values: readonly number[]) => `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;

  // What is published is what the tables beside it are made of, and every answer in it has a verdict: the program's, or the grader's.
  const { units, older } = currentOf(unitsUnder(OPUS_AT), BEFORE_SONNET);
  const grades = JSON.parse(read('../bench/results/2026-10-03-opus/grades.json')) as Grades;
  assert.equal(older, 0);
  assert.equal(whole(units, grades, older, null), read('../bench/results/2026-10-03-opus/report.md'));
  assert.deepEqual(
    units.map((unit) => `${unit.trace} ${leaf(unit.arm, unit.variant, unit.mode)}`).sort(),
    ['large builtin', 'large plugin', 'opaque plugin-find', 'opaque plugin-find-find', 'prose builtin', 'prose plugin', 'results builtin', 'results plugin'],
  );
  // One run of Opus 5.5, with the plugin's code as the units of the value match were measured with it.
  assert.ok(units.every((unit) => unit.model === 'claude-opus-5-5' && unit.run === 1 && unit.plugin === (unit.arm === 'plugin' ? VALUES_CODE : null)));
  assert.deepEqual([grades.ungraded.length, grades.disagreements, grades.controls.asExpected], [0, 0, grades.controls.count]);
  const of = (trace: string, arm: 'plugin' | 'builtin') => {
    const unit = units.find((one) => one.trace === trace && one.arm === arm && one.mode === 'ask');
    assert.ok(unit !== undefined, `${trace} ${arm}`);
    return unit;
  };
  const THREE = ['results', 'prose', 'large'] as const;
  const [ours, theirs] = [THREE.map((trace) => of(trace, 'plugin')), THREE.map((trace) => of(trace, 'builtin'))];
  for (const unit of [...ours, ...theirs]) for (const asked of unit.questions) assert.ok(verdictOf(unit, asked, grades) !== undefined, `${unit.trace} ${unit.arm} ${asked.id}`);
  // The large one was built and compacted in its own window: the plugin read it as that less Claude Code's reserve.
  const large = of('large', 'plugin');
  assert.equal(LARGE[0]?.window, 1_000_000);
  assert.equal(large.compaction.line?.window, 967_000);
  assert.ok(THREE.slice(0, 2).every((trace) => of(trace, 'plugin').compaction.line?.window === 167_000));
  has(section, `thirty-two logs of 700 lines read, ${thousands(large.compaction.preTokens)} tokens when it was compacted`, 'measurements');

  // The compaction: each cell the plugin's figure, then the built-in's.
  const cells = (cell: (unit: Unit) => string) => THREE.map((trace) => `${cell(of(trace, 'plugin'))} · ${cell(of(trace, 'builtin'))}`);
  const next = (unit: Unit) => unit.questions[0]?.requests[0] ?? 0;
  const asked = (unit: Unit) => sum(unit.questions.map((one) => one.own.costUSD));
  row('The summary ran', ...cells((unit) => (unit.compaction.summarized ? 'yes' : 'no')));
  row('`/compact` took, s', ...cells((unit) => seconds(unit.compaction.durationMs)));
  row('The compaction cost, USD', ...cells((unit) => usd(unit.compaction.own.costUSD)));
  row('The next request, tokens', ...cells((unit) => thousands(next(unit))));
  row('Its questions cost, USD', ...cells((unit) => usd(asked(unit))));
  const [resultsLine, largeLine] = [of('results', 'plugin').compaction.line, large.compaction.line];
  has(
    section,
    `In \`results\` the plugin moved ${resultsLine?.moved} of ${resultsLine?.results} results out, and in \`large\` ${largeLine?.moved} of ${largeLine?.results}, ` +
      `in a window it read as ${thousands(largeLine?.window ?? 0)} tokens: it estimated ${thousands(largeLine?.estimate ?? 0)} tokens in use afterwards, and ${thousands(next(large))} were sent next.`,
    'measurements',
  );
  assert.equal(of('prose', 'plugin').compaction.undone, true);
  has(section, '`prose` holds nothing to move out and had room, and was left as it was.', 'measurements');

  // The answers: right as the program and the grader have it.
  const rightOf = (unit: Unit, ids: readonly string[]) => unit.questions.filter((one) => ids.includes(one.id) && verdictOf(unit, one, grades) === 'correct').length;
  const kinds: [label: string, ids: string[], onlyLarge?: true][] = [
    ["A script's output, the script gone, of 2", ['gone-1', 'gone-2']],
    ['A line of a deleted log read early, moved out', ['gone-early'], true],
    ['A line of a deleted log read last, kept', ['gone-last'], true],
    ['A file that is unchanged', ['unchanged']],
    ['What a file said before it changed', ['then']],
    ['What that file says now', ['now']],
    ['Where the work stands, of 2', ['next', 'decided']],
    ['A rule stated once, of 2', ['rule-1', 'rule-2']],
  ];
  for (const [label, ids, onlyLarge] of kinds) row(label, ...THREE.map((trace) => (onlyLarge && trace !== 'large' ? '—' : `${rightOf(of(trace, 'plugin'), ids)} · ${rightOf(of(trace, 'builtin'), ids)}`)));
  assert.deepEqual(kinds.flatMap(([, ids]) => ids).sort(), large.questions.map((one) => one.id).sort());

  // The exact answers counted wrong that hold the right line once the prefix a rule of the conversation asks for is taken off the station's id.
  const written = new Map(BUILT.flatMap((trace) => trace.questions.map((question): [string, Question] => [`${trace.name} ${question.id}`, question])));
  const exact = (unit: Unit) => unit.questions.filter((one) => one.kind.startsWith('exact'));
  const prefixed = (unit: Unit) =>
    exact(unit).filter((one) => {
      const needles = written.get(`${unit.trace} ${one.id}`)?.needles ?? [];
      const bare = one.answer.replace(/\bS[TN]-(\d)/g, '$1');
      return one.verdict === undefined && needles.length > 0 && needles.every((needle) => bare.includes(needle) && !one.answer.includes(needle));
    });
  const count = (set: readonly Unit[], those: (unit: Unit) => readonly unknown[]) => sum(set.map((unit) => those(unit).length));
  assert.equal(count(ours, prefixed) + count(theirs, prefixed), 6);
  has(section, 'Six answers are counted wrong for how they write a station.', 'measurements');
  // In the two conversations whose first message states that rule, and not in the third.
  assert.deepEqual(THREE.filter((trace) => prefixed(of(trace, 'plugin')).length + prefixed(of(trace, 'builtin')).length > 0), ['results', 'large']);
  assert.ok(['results', 'large'].every((name) => /A station id is always written with the prefix S[TN]-/.test(saidBy(BUILT.find((trace) => trace.name === name) ?? { steps: [] })[0] ?? '')));
  has(section, "The first message of `results` and of `large` states a rule, that a station's id is written with a prefix (ST-1325, SN-2044)", 'measurements');
  const byProgram = (set: readonly Unit[]) => count(set, (unit) => exact(unit).filter((one) => one.verdict === 'correct'));
  assert.deepEqual([count(ours, exact), count(theirs, exact)], [17, 17]);
  has(
    section,
    `${count(ours, prefixed)} in the plugin's arm and ${count(theirs, prefixed)} in the built-in arm are counted wrong, which leaves ${byProgram(ours)} of ${count(ours, exact)} questions about an exact text right ` +
      `in the plugin's arm and ${byProgram(theirs)} in the built-in arm. With the prefix taken off, a count made after the answers were seen, all ${count(ours, exact)} are right in both.`,
    'measurements',
  );
  // Every exact answer is right by the program or is one of those: none was wrong otherwise, in either arm.
  for (const set of [ours, theirs]) assert.equal(count(set, exact), byProgram(set) + count(set, prefixed));
  assert.ok(of('results', 'plugin').questions.some((one) => one.answer.includes('station ST-6303 reported 985 units')));
  has(section, '`station ST-6303 reported 985 units`', 'measurements');

  // Where the answers came from.
  const outside = (unit: Unit) => unit.questions.filter((one) => one.outside);
  assert.equal(count(ours, outside), 0);
  assert.ok(theirs.every((unit) => outside(unit).every((one) => one.verdict === 'correct' || prefixed(unit).includes(one))));
  has(
    section,
    `${count(theirs, outside)} of its answers came after reading outside the working directory (${listed(theirs.map((unit) => outside(unit).length))}), ` +
      `all of them holding the right line, ${count(theirs, (unit) => outside(unit).filter((one) => prefixed(unit).includes(one)))} with the prefix.`,
    'measurements',
  );
  // Set beside Haiku on the questions Haiku's figure is of: a script's output, the script gone.
  const scripts = (unit: Unit) => unit.questions.filter((one) => one.id === 'gone-1' || one.id === 'gone-2');
  assert.equal(count(theirs, scripts), count(theirs, (unit) => scripts(unit).filter((one) => one.outside)));
  // Haiku on the same questions, in its three runs on the six conversations: how often it read that record, and how often it was then right.
  const haiku = currentOf(unitsUnder(fileURLToPath(new URL('../bench/results/2026-10-02', import.meta.url))), BEFORE_SONNET).units.filter((unit) => /haiku/.test(unit.model) && unit.arm === 'builtin' && unit.mode === 'ask');
  const readOutside = (set: readonly Unit[]) => count(set, (unit) => scripts(unit).filter((one) => one.outside));
  const rightOutside = (set: readonly Unit[]) => count(set, (unit) => scripts(unit).filter((one) => one.outside && one.verdict === 'correct'));
  assert.equal(count(haiku, scripts), 36);
  has(
    section,
    `Of the questions about a script's output it read that record for all ${readOutside(theirs)} and was right on all ${rightOutside(theirs)}, ` +
      `where Haiku read it for ${readOutside(haiku)} of ${count(haiku, scripts)} and was right on ${rightOutside(haiku)}.`,
    'measurements',
  );
  const recalls = (unit: Unit) => sum(unit.questions.map((one) => one.retrieval.recalls));
  has(section, `\`recall\` was called ${recalls(of('results', 'plugin'))} times in \`results\` and ${recalls(large)} in \`large\`, and the line of the log read last was given with no tool.`, 'measurements');
  const last = large.questions.find((one) => one.id === 'gone-last');
  assert.ok(last !== undefined && last.calls.length === 0 && last.verdict === 'correct');
  const slowest = Math.max(...ours.map((unit) => unit.compaction.durationMs));
  assert.ok(ours.every((unit) => unit.compaction.own.costUSD === 0 && !unit.compaction.summarized));
  const summary = of('large', 'builtin');
  has(
    section,
    `It took ${seconds(slowest)} s or less and called no model, where the summary of \`large\` took ${seconds(summary.compaction.durationMs)} s and cost ${usd(summary.compaction.own.costUSD)} USD. ` +
      `Then every request carried what the plugin had left, ${thousands(next(large))} tokens in \`large\` against ${thousands(next(summary))} after a summary, ` +
      `and the eleven questions cost ${usd(asked(large))} USD against ${usd(asked(summary))}: ` +
      `with the compaction, ${usd(asked(large) + large.compaction.own.costUSD)} against ${usd(asked(summary) + summary.compaction.own.costUSD)}.`,
    'measurements',
  );
  assert.equal(large.questions.length, 11);

  // `find`, on `opaque`: with `recall` alone, and with `find` as well. Where Opus 5.5 was stopped, another model answered.
  const found = (variant: string) => {
    const unit = units.find((one) => one.trace === 'opaque' && one.variant === variant);
    assert.ok(unit !== undefined && unit.mode === 'find' && unit.questions.length === 10);
    return unit;
  };
  const pair = [found('default'), found('find')];
  const replaced = (unit: Unit) => unit.questions.filter((one) => one.fellBackTo !== undefined);
  const right = (unit: Unit) => unit.questions.filter((one) => one.verdict === 'correct');
  row('Right, of 10', ...pair.map((unit) => `${right(unit).length}`));
  row('Answered by another model after Opus 5.5 was stopped', ...pair.map((unit) => `${replaced(unit).length}`));
  row('Right, of those Opus 5.5 answered', ...pair.map((unit) => `${right(unit).filter((one) => one.fellBackTo === undefined).length} of ${unit.questions.length - replaced(unit).length}`));
  row('`find` calls', ...pair.map((unit) => `${sum(unit.questions.map((one) => one.retrieval.finds))}`));
  row('`recall` calls', ...pair.map((unit) => `${sum(unit.questions.map((one) => one.retrieval.recalls))}`));
  row('The ten questions cost, USD', ...pair.map((unit) => usd(asked(unit))));
  const fell = pair.flatMap(replaced);
  assert.ok(fell.length > 0 && fell.every((one) => one.fellBackTo === 'claude-opus-4-8' && one.verdict !== 'correct'));
  has(section, `In ${fell.length} of the ${count(pair, (unit) => unit.questions)} sessions Opus 5.5's safeguards stopped the response and Claude Code went on with Opus 4.8`, 'measurements');
  has(section, `None of the ${fell.length} answers was right, and they are not Opus 5.5's`, 'measurements');
  assert.equal(count([...ours, ...theirs], replaced), 0);
  has(section, 'In `results`, `prose` and `large` it happened in no session.', 'measurements');
  // The two columns were not stopped at the same questions, which the section says of the one that differs.
  const stopped = pair.map((unit) => replaced(unit).map((one) => one.id));
  assert.deepEqual((stopped[0] ?? []).filter((id) => !(stopped[1] ?? []).includes(id)), ['find-code-6']);
  assert.ok((stopped[1] ?? []).every((id) => (stopped[0] ?? []).includes(id)));
  assert.equal(pair[1]?.questions.find((one) => one.id === 'find-code-6')?.verdict, 'correct');
  has(section, '`find-code-6` was stopped with `recall` alone and answered with `find`.', 'measurements');

  // What the other documents say of it.
  // The promise names what was set against what: against the built-in compaction where both arms were measured, and `find` against none where they were not.
  const compared = [...new Set(units.filter((unit) => unit.arm === 'builtin').map((unit) => unit.trace))];
  assert.deepEqual(compared.sort(), [...THREE].sort());
  assert.deepEqual(compared.filter((name) => BUILT.find((trace) => trace.name === name)?.window === undefined).length, 2);
  assert.deepEqual([...new Set(pair.map((unit) => unit.trace))], ['opaque']);
  assert.ok(pair.every((unit) => unit.arm === 'plugin'));
  has(
    limits,
    `It is measured with Opus 5.5 as well, at the settings that were the defaults then (\`targetPercent\` 40), in one run: on \`${THREE[0]}\`, \`${THREE[1]}\` and \`${THREE[2]}\`, a conversation built in a window of 1,000,000, ` +
      "against Claude Code's own compaction on the same; and on `opaque` with `find` and without",
    'limits',
  );
  has(
    limits,
    `Of ${count(ours, exact)} questions about an exact text, ${byProgram(ours)} are counted right in the plugin's arm and ${byProgram(theirs)} in the built-in arm; ` +
      `the other ${count(ours, prefixed) + count(theirs, prefixed)} answers hold the right line with a station's id written with the prefix`,
    'limits',
  );
  has(
    comparison,
    `of ${count(ours, exact)} questions about an exact text, ${byProgram(ours)} were counted right with the plugin and ${byProgram(theirs)} without, which one run does not tell apart. ` +
      `The plugin's \`/compact\` of ${thousands(large.compaction.preTokens)} tokens took ${seconds(large.compaction.durationMs)} s against ${seconds(summary.compaction.durationMs)} s ` +
      `and left more to send, ${thousands(next(large))} tokens a request against ${thousands(next(summary))}`,
    'comparison',
  );
  // The two conversations the plugin compacted by itself, which the README compared by until the run of every kind (2026-10-04).
  for (const [trace, questions] of [['results', 9], ['large', 11]] as const) {
    const [mine, built] = [of(trace, 'plugin'), of(trace, 'builtin')];
    assert.ok(mine.compaction.line?.outcome === 'moved' && !mine.compaction.summarized && built.compaction.summarized, trace);
    assert.equal(mine.questions.length, questions, trace);
  }
  // The plugin's own compaction cost nothing, which the README says by "calls no model".
  for (const trace of ['results', 'large']) assert.equal(of(trace, 'plugin').compaction.own.costUSD, 0, trace);
  // Under the table, of the larger conversation: the plugin's questions took longer, and cost more than the summary with its questions.
  const asking = (unit: Unit) => sum(unit.questions.map((one) => one.durationMs));
  assert.ok(asking(large) > asking(summary) && asked(large) > summary.compaction.own.costUSD + asked(summary));
  // The time with the compaction counted, which the measurements give beside the cost.
  const took = (unit: Unit) => ((unit.compaction.durationMs + asking(unit)) / 1000).toFixed(1);
  const [small, smallBuilt] = [of('results', 'plugin'), of('results', 'builtin')];
  has(
    measurements,
    `Those questions took ${(asking(large) / 1000).toFixed(1)} s against ${(asking(summary) / 1000).toFixed(1)}; with the compaction, ${took(large)} s against ${took(summary)}, and in \`results\` ${took(small)} s against ${took(smallBuilt)}.`,
    'measurements',
  );
  // The answers where the plugin compacted, which leaves `prose` out: what the program counts, and that every answer it does not count holds the line with the prefix.
  const compacted = (set: readonly Unit[]) => set.filter((unit) => unit.trace !== 'prose');
  for (const set of [compacted(ours), compacted(theirs)]) assert.equal(count(set, exact), byProgram(set) + count(set, prefixed));
  has(
    changelog,
    `of ${count(ours, exact)} questions about an exact text, ${byProgram(ours)} were counted right in the plugin's arm and ${byProgram(theirs)} in the built-in arm, ` +
      `and the other ${count(ours, prefixed) + count(theirs, prefixed)} answers held the right line with a station's id written with the prefix a rule of the conversation asks for. ` +
      `The plugin's \`/compact\` of ${thousands(large.compaction.preTokens)} tokens took ${seconds(large.compaction.durationMs)} s and cost nothing ` +
      `where the summary took ${seconds(summary.compaction.durationMs)} s and ${usd(summary.compaction.own.costUSD)} USD; it then left ${thousands(next(large))} tokens for the next request against ${thousands(next(summary))}, ` +
      `and its eleven questions cost ${usd(asked(large))} USD against ${usd(asked(summary))}.`,
    'CHANGELOG',
  );
  has(changelog, `as it did in ${fell.length} of the ${count(pair, (unit) => unit.questions)} questions asked of \`opaque\``, 'CHANGELOG');
});

const LISTED_AT = fileURLToPath(new URL('../bench/results/2026-10-03-listed', import.meta.url));
/** The plugin's code the units of `listed` were measured with: a checkout of `44f410f` with the two `tool.describe` hooks. */
const LISTED_CODE = 'd2a561d53d84';
/** And the units of `merged`: `d43ffeb`, which has #55, with the two hooks. */
const MERGED_CODE = '64c6e33e3f11';

test('the units in the repository measured the tools listed in front of the agent: every figure docs/measurements.md, docs/limits.md, docs/comparison.md and CHANGELOG.md give of it (#54)', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const measurements = read('../docs/measurements.md');
  const limits = read('../docs/limits.md');
  const comparison = read('../docs/comparison.md');
  const has = (text: string, phrase: string, what: string) => assert.ok(text.includes(phrase), `${what}: ${phrase}`);
  type Asked = Unit['questions'][number];
  type Key = 'default' | 'find';
  const of = (dir: string) => {
    const { units, older } = currentOf(unitsUnder(`${LISTED_AT}/${dir}`), BEFORE_SONNET);
    assert.equal(older, 0, dir);
    assert.ok(units.every((unit) => unit.arm === 'plugin' && unit.mode === 'find'), dir);
    assert.equal(new Set(units.map((unit) => unit.plugin)).size, 1, dir);
    return units;
  };
  const all = { baseline: of('baseline'), listed: of('listed'), line: of('line'), merged: of('merged') };
  type Dir = keyof typeof all;
  assert.equal(all.listed[0]?.plugin, LISTED_CODE);
  assert.equal(all.merged[0]?.plugin, MERGED_CODE);
  // With a key only: with none there is no find, and #55 changes nothing.
  assert.ok(all.merged.every((unit) => unit.variant === 'find'));
  // All four were asked of the same building of each conversation: what differs between them is the plugin.
  for (const trace of ['opaque', 'results', 'full']) {
    assert.equal(new Set(Object.values(all).flatMap((units) => units.filter((unit) => unit.trace === trace).map((unit) => unit.base))).size, 1, trace);
  }
  const asked = (dir: Dir, trace: string, key: Key, prefix = 'find-', model = /haiku/): Asked[] => {
    const these = all[dir].filter((unit) => unit.trace === trace && unit.variant === key && model.test(unit.model));
    assert.deepEqual(these.map((unit) => unit.run).sort(), model.source === 'haiku' ? [1, 2, 3] : [1], `${dir} ${trace} ${key}`);
    return these.flatMap((unit) => unit.questions).filter((one) => one.id.startsWith(prefix));
  };
  const fetched = (one: Asked) => one.retrieval.finds > 0 || one.retrieval.recalls > 0;
  const found = (one: Asked) => one.retrieval.finds > 0;
  const searched = (one: Asked) => one.retrieval.searches > 0;
  const count = (list: readonly Asked[], which: (one: Asked) => boolean) => list.filter(which).length;
  const right = (list: readonly Asked[]) => count(list, (one) => one.verdict === 'correct');
  const sum = (list: readonly number[]) => list.reduce((total, one) => total + one, 0);
  const meaning = (dir: Dir, key: Key = 'find') => asked(dir, 'opaque', key, 'find-doc-');
  const codes = (dir: Dir, key: Key = 'find') => asked(dir, 'opaque', key, 'find-code-');
  const keys = [['default', 'no'], ['find', 'yes']] as const;
  const others = (dir: Dir) => (['results', 'full'] as const).flatMap((trace) => keys.map(([key]) => right(asked(dir, trace, key))));

  // The two tables.
  for (const [dir, label] of [['baseline', 'Baseline'], ['listed', 'Listed'], ['line', 'A line']] as const) {
    for (const [key, word] of keys) {
      assert.equal(meaning(dir, key).length, 21, `${dir} ${key}`);
      assert.equal(codes(dir, key).length, 9, `${dir} ${key}`);
      has(measurements, `| ${label} | ${word} | ${count(meaning(dir, key), fetched)} of 21 | ${right(meaning(dir, key))} of 21 | ${right(codes(dir, key))} of 9 |`, `${dir} ${key}`);
      assert.equal(asked(dir, 'results', key).length, 24, `${dir} ${key}`);
      assert.equal(asked(dir, 'full', key).length, 15, `${dir} ${key}`);
    }
    has(measurements, `| ${label} | ${others(dir).join(' | ')} |`, `${dir}, results and full`);
  }

  // The rule set before measuring: 7 more questions with a call and 7 more right, by meaning with a key, and no more than 2 lost elsewhere.
  const against = (dir: Dir) => {
    const calls = count(meaning(dir), fetched) - count(meaning('baseline'), fetched);
    const more = right(meaning(dir)) - right(meaning('baseline'));
    const lost = Math.min(...others(dir).map((n, at) => n - (others('baseline')[at] ?? NaN)));
    return { calls, more, reached: calls >= 7 && more >= 7 && lost >= -2 };
  };
  const [listed, line] = [against('listed'), against('line')];
  assert.ok(listed.reached && !line.reached);
  has(measurements, `Listed reached the rule, with ${listed.calls} more questions that had a call and ${listed.more} more right`, 'the rule');
  has(measurements, `A line fell one short of it on both, ${line.calls} and ${line.more}.`, 'the rule');
  assert.deepEqual([line.calls, line.more], [6, 6]);

  // What the baseline did not fetch, and what listing the tools changed.
  has(
    measurements,
    `the baseline called neither \`recall\` nor \`find\` for ${21 - count(meaning('baseline'), fetched)} of the 21 questions by meaning with a key, and for ${21 - count(meaning('baseline', 'default'), fetched)} of 21 without`,
    'no call',
  );
  for (const dir of ['baseline', 'listed', 'line'] as const) assert.equal(count(meaning(dir), fetched), count(meaning(dir), found), `${dir}: with a key, every question with a call had one to find`);
  const brought = meaning('listed').filter(found);
  assert.equal(right(brought), brought.length);
  has(measurements, `with the tools listed each of those ${brought.length} was answered right`, 'find, then right');
  const haiku = (dir: Dir) => all[dir].filter((unit) => /haiku/.test(unit.model)).flatMap((unit) => unit.questions);
  assert.equal(count(haiku('listed'), searched), 0);
  has(measurements, `none of the ${haiku('listed').length} questions had a call to Claude Code's tool search, where ${count(haiku('baseline'), searched)} of the baseline's ${haiku('baseline').length} had one`, 'tool search');
  has(
    measurements,
    `by meaning it called for ${count(meaning('listed', 'default'), fetched)} questions where the baseline called for ${count(meaning('baseline', 'default'), fetched)}, and was right on ${right(meaning('listed', 'default'))} where the baseline was on ${right(meaning('baseline', 'default'))}`,
    'no key',
  );
  has(
    measurements,
    `calls \`find\` for ${count(codes('listed'), found)} of 9 and is right on ${right(codes('listed'))}, where the baseline called it for ${count(codes('baseline'), found)} and was right on ${right(codes('baseline'))}`,
    'a code',
  );
  const opaque = (dir: Dir) => asked(dir, 'opaque', 'find');
  const first = (dir: Dir) => median(opaque(dir).map((one) => one.requests[0] ?? NaN)).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const seconds = (dir: Dir) => (sum(opaque(dir).map((one) => one.durationMs)) / 1000).toFixed(0);
  const usd = (dir: Dir) => sum(opaque(dir).map((one) => one.own.costUSD)).toFixed(2);
  const recalls = (dir: Dir) => sum(opaque(dir).map((one) => one.retrieval.recalls));
  has(
    measurements,
    `a median ${first('listed')} tokens against ${first('baseline')}, in \`opaque\` with a key. The ${opaque('listed').length} questions there took ${seconds('listed')} seconds and ${usd('listed')} USD, where the baseline took ${seconds('baseline')} and ${usd('baseline')}; \`recall\` was called ${recalls('listed')} times in them, where the baseline called it ${recalls('baseline')} times.`,
    'what it costs',
  );

  // Sonnet 5.5, one run of the baseline and one with the tools listed: the same either way.
  const sonnetOn = (dir: Dir, key: Key, prefix: string) => asked(dir, 'opaque', key, prefix, /sonnet/);
  /** With a key: questions by meaning with a call to find, those right, and the codes right. */
  const sonnetWithKey = (dir: Dir) => [count(sonnetOn(dir, 'find', 'find-doc-'), found), right(sonnetOn(dir, 'find', 'find-doc-')), right(sonnetOn(dir, 'find', 'find-code-'))];
  const sonnet = (dir: 'baseline' | 'listed') => [...sonnetWithKey(dir), right(sonnetOn(dir, 'default', 'find-doc-')), right(sonnetOn(dir, 'default', 'find-code-'))];
  assert.deepEqual(sonnet('listed'), sonnet('baseline'));
  const [calls, yes, code, no, noCode] = sonnet('listed');
  has(
    measurements,
    `came out the same either way: with a key it called \`find\` for ${calls} of the 7 questions by meaning and was right on ${yes}, and on ${code} of the 3 codes; with no key, right on ${no} and on ${noCode}.`,
    'Sonnet',
  );
  const sonnetAsked = (dir: Dir) => all[dir].filter((unit) => /sonnet/.test(unit.model)).flatMap((unit) => unit.questions);
  assert.equal(count(sonnetAsked('listed'), searched), 0);
  has(measurements, `in each of the baseline's ${count(sonnetAsked('baseline'), searched)} questions and in none with the tools listed`, 'Sonnet, tool search');
  assert.equal(sonnetAsked('baseline').length, count(sonnetAsked('baseline'), searched));

  // The code that is merged, measured once more with a key: the table, and what docs/limits.md and README.md say of the plugin as it now is.
  const named = asked('merged', 'results', 'find');
  const full = asked('merged', 'full', 'find');
  for (const [label, list] of [['`opaque`, by meaning', meaning('merged')], ['`opaque`, by a code', codes('merged')], ['`results`', named], ['`full`', full]] as const) {
    has(measurements, `| ${label} | ${count(list, found)} of ${list.length} | ${right(list)} of ${list.length} |`, `merged, ${label}`);
  }
  assert.equal(count(haiku('merged'), searched), 0);
  has(measurements, `None of the ${haiku('merged').length} questions had a call to the tool search, and`, 'merged, tool search');
  has(
    measurements,
    `The codes, ${right(codes('listed'))} of 9 right with the tools listed and \`find\` as it was, are ${right(codes('merged'))} of 9 with the tools listed and \`find\` as it now is.`,
    'merged, codes',
  );
  const sonnetMerged = sonnetWithKey('merged');
  has(measurements, `Sonnet 5.5, one run: \`find\` for ${sonnetMerged[0]} of the 7 questions by meaning and ${sonnetMerged[1]} right, and ${sonnetMerged[2]} of the 3 codes.`, 'merged, Sonnet');
  assert.equal(sonnetMerged[0], calls, 'Sonnet calls find as often, listed or not, merged or not');
  has(
    limits,
    `about what a result was about: ${count(meaning('merged'), found)} of 21, in a made-up conversation of thirteen such results, all moved out. ` +
      `With the two behind the search it called it for ${count(meaning('baseline'), found)} of 21, and for ${count(meaning('listed'), found)} with them listed and \`find\` as it was before it looked for a value (Sonnet 5.5, one run: ${calls} of 7, listed or not)`,
    'limits',
  );
  const namedBefore = asked('baseline', 'results', 'find');
  has(
    limits,
    `it calls \`find\` for most as well, ${count(named, found)} of ${named.length} questions, where it called it for ${count(namedBefore, found)} with the two behind the search. So with a key set more is sent to the provider than before`,
    'limits',
  );
  has(
    comparison,
    `Haiku 4.5 called \`find\` for ${count(named, found)} of ${named.length} questions where each call named its file, and for ${count(meaning('merged'), found)} of 21 about what a result was about where the calls said nothing of what came back, finding the code ${right(codes('merged'))} times of 9. Each call sends the provider what [Usage](usage.md) lists.`,
    'comparison',
  );

  // The sentence that sums them up: of the two conversations where results were moved out, which is what it is about (`full` goes to the summary).
  const moved = [...asked('merged', 'opaque', 'find'), ...named];
  assert.ok(all.merged.filter((unit) => unit.trace !== 'full').every((unit) => unit.compaction.line?.outcome === 'moved'));
  assert.ok(all.merged.filter((unit) => unit.trace === 'full').every((unit) => unit.compaction.line?.outcome !== 'moved'));
  has(comparison, `Asked about a result that was moved out, Haiku 4.5 with a key set called \`find\` for ${count(moved, found)} of ${moved.length} questions`, 'comparison');

  // Calling find more often is sending more often: said where the change is said, with the figures.
  const withKey = (dir: Dir) => all[dir].filter((unit) => /haiku/.test(unit.model) && unit.variant === 'find').flatMap((unit) => unit.questions);
  const sent = (dir: Dir) => ({ questions: count(withKey(dir), found), of: withKey(dir).length, calls: sum(withKey(dir).map((one) => one.retrieval.finds)) });
  const [was, listedSent, mergedSent] = [sent('baseline'), sent('listed'), sent('merged')];
  assert.deepEqual([was.of, listedSent.of, mergedSent.of], [69, 69, 69]);
  const namedListed = asked('listed', 'results', 'find');
  const fewer = `in ${count(namedListed, found)} of ${namedListed.length}`;
  has(measurements, `\`find\` was called in ${listedSent.questions} of 69 questions with the tools listed, where the baseline called it in ${was.questions}, and ${fewer} in \`results\`, where every call names the file it read and the baseline called it in ${count(namedBefore, found)}.`, 'sent, listed');
  has(measurements, `and ${mergedSent.questions} had one to \`find\` (${mergedSent.calls} calls, where the baseline made ${was.calls}), ${count(named, found)} of the ${named.length} in \`results\`.`, 'sent, merged');
  // What is still not fetched: with no key (the tools listed, which no key and #55 have nothing to do with), and with one as merged.
  has(
    limits,
    `Haiku was right on ${right(meaning('listed', 'default'))} questions of 21 and called \`recall\` for ${count(meaning('listed', 'default'), fetched)}. With a key it was right on ${right(meaning('merged'))} of 21.`,
    'limits, not fetched',
  );
  // Sonnet did not ask every time either: one question of seven had no call, in every plugin measured.
  assert.equal(sonnetMerged[0], 6);
  has(limits, `Sonnet 5.5 called \`find\` for ${sonnetMerged[0]} of 7 results asked for by what they were about`, 'limits, Sonnet');
  const changelog = read('../CHANGELOG.md');
  has(
    changelog,
    `called \`find\` for ${count(meaning('baseline'), found)} of 21 questions about what a result was about and was right on ${right(meaning('baseline'))}; with the two listed, for ${count(meaning('listed'), found)} and right on ${right(meaning('listed'))}; ` +
      `and as merged, with \`find\` looking for a value as well (#55), for ${count(meaning('merged'), found)} and right on ${right(meaning('merged'))}, and right on ${right(codes('merged'))} of 9 codes further down a document`,
    'CHANGELOG',
  );
  has(
    changelog,
    `Haiku called \`find\` in ${mergedSent.questions} of 69 questions where it had in ${was.questions}, and in ${count(named, found)} of ${named.length} where every call names the file it read, where it had in ${count(namedBefore, found)}`,
    'CHANGELOG, sent',
  );
  has(changelog, `Sonnet 5.5 called \`find\` for ${calls} of 7 either way`, 'CHANGELOG');
  has(changelog, `right on ${right(meaning('listed', 'default'))} of 21, where it was on ${right(meaning('baseline', 'default'))}`, 'CHANGELOG');

  // The record of the decision gives the figures it was taken on.
  const adr = read('../docs/adr/0017-recall-and-find-are-listed-in-front-of-the-agent.md');
  for (const [dir, label] of [['baseline', 'Baseline'], ['listed', '`recall` and `find` listed'], ['line', 'A line after a compaction by the plugin']] as const) {
    has(adr, `| ${label} | ${count(meaning(dir), fetched)} of 21 | ${right(meaning(dir))} of 21 |`, `ADR 0017, ${dir}`);
  }
  has(adr, `for ${21 - count(meaning('baseline'), fetched)} of 21 questions about a result that had been moved out`, 'ADR 0017');
  has(adr, `still searched for the tool (${count(asked('line', 'opaque', 'find'), searched)} of 30 questions)`, 'ADR 0017');
  has(
    adr,
    `(${right(asked('line', 'results', 'find'))} of 24 and ${right(asked('line', 'full', 'find'))} of 15 right with a key, against ${right(asked('baseline', 'results', 'find'))} and ${right(asked('baseline', 'full', 'find'))})`,
    'ADR 0017',
  );
  has(adr, `(right on ${right(meaning('listed', 'default'))} of 21 questions, where it was on ${right(meaning('baseline', 'default'))})`, 'ADR 0017');
  has(
    adr,
    `it was called in ${listedSent.questions} of 69 questions, where the baseline called it in ${was.questions}, and ${fewer} where every call names the file it read, where the baseline called it in ${count(namedBefore, found)}; ` +
      `and in ${mergedSent.questions} of 69 as merged, with \`find\` looking for a value as well (#55)`,
    'ADR 0017, sent',
  );

  // Nothing of the machine in what was published.
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(JSON.stringify(all)));
});

const SHOWN_AT = fileURLToPath(new URL('../bench/results/2026-10-03-shown-again', import.meta.url));
/** The plugin's code the units of `narrowed` were measured with: `1d8dec8` with the `prompt.attachment` hook. */
const NARROWED_CODE = '3757bbe9a7c2';

test('the units in the repository measured a note in place of a file shown again after a summary: every figure the documents give of it (#54)', () => {
  // Each document with its white space folded, so that a phrase is found where a line breaks in the middle of it.
  const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const [measurements, limits, changelog, adr] = [text('../docs/measurements.md'), text('../docs/limits.md'), text('../CHANGELOG.md'), text('../docs/adr/0018-a-changed-file-shown-again-gives-way-to-a-line.md')];
  const has = (phrase: string, what: string) => assert.ok(measurements.includes(phrase), `${what}: ${phrase}`);
  type Asked = Unit['questions'][number];
  const of = (dir: string) => {
    const { units, older } = currentOf(unitsUnder(`${SHOWN_AT}/${dir}`), BEFORE_SONNET);
    assert.equal(older, 0, dir);
    // The plugin's arm, asked the benchmark's questions with maxAfterPercent at 1: every one went to the summary, which is where a file is shown again.
    assert.ok(units.every((unit) => unit.arm === 'plugin' && unit.mode === 'ask' && unit.variant === 'max-after-1' && unit.compaction.summarized), dir);
    assert.equal(new Set(units.map((unit) => unit.plugin)).size, 1, dir);
    return units;
  };
  const all = { baseline: of('baseline'), note: of('note'), merged: of('merged'), narrowed: of('narrowed') };
  type Dir = keyof typeof all;
  const dirs = ['baseline', 'note', 'merged', 'narrowed'] as const;
  // `merged` is the code the change that listed the tools merged, with no note; `narrowed`, the code the change that built the note merged.
  assert.equal(all.merged[0]?.plugin, MERGED_CODE);
  assert.equal(all.narrowed[0]?.plugin, NARROWED_CODE);
  const traces = ['writes', 'prose', 'short', 'thinking'];
  // All four were asked of the same building of each conversation.
  for (const trace of traces) {
    assert.equal(new Set(Object.values(all).flatMap((units) => units.filter((unit) => unit.trace === trace).map((unit) => unit.base))).size, 1, trace);
  }
  const asked = (dir: Dir, ids: readonly string[], on: readonly string[] = traces, model = /haiku/): Asked[] => {
    const these = all[dir].filter((unit) => on.includes(unit.trace) && model.test(unit.model));
    assert.equal(these.length, on.length * (model.source === 'haiku' ? 3 : 1), `${dir} ${on.join()}`);
    return these.flatMap((unit) => unit.questions).filter((one) => ids.includes(one.id));
  };
  const right = (list: readonly Asked[]) => list.filter((one) => one.verdict === 'correct').length;

  // The table. Each of these is graded by the program: the text asked for is in the answer.
  const rows = [
    ['What the file said when it was read, of 12', ['then']],
    ['What it says now, of 12', ['now']],
    ['A file that is unchanged, of 12', ['unchanged']],
    ["The script's output no file holds any more, of 24", ['gone-1', 'gone-2']],
  ] as const;
  for (const [label, ids] of rows) {
    for (const dir of dirs) assert.equal(asked(dir, ids).length, ids.length * 12, `${dir}, ${label}`);
    has(`| ${label} | ${right(asked('baseline', ids))} | ${right(asked('note', ids))} | ${right(asked('merged', ids))} |`, label);
  }

  // The rule set before measuring, the note against the baseline it was built on: 4 more and at least 10 of 12 for the reading, the two other questions about files no worse.
  const then = { baseline: right(asked('baseline', ['then'])), note: right(asked('note', ['then'])), merged: right(asked('merged', ['then'])) };
  assert.ok(then.note - then.baseline >= 4 && then.note >= 10);
  for (const id of ['now', 'unchanged']) assert.ok(right(asked('note', [id])) >= right(asked('baseline', [id])), id);

  // Where the changed file is not shown again, and where it is.
  const shown = ['prose', 'short', 'thinking'];
  for (const dir of dirs) assert.equal(right(asked(dir, ['then'], ['writes'])), 3, dir);
  const shownRight = (dir: Dir) => right(asked(dir, ['then'], shown));
  const noted = asked('note', ['then']);
  assert.ok(noted.every((one) => one.retrieval.recalls === 1 && one.retrieval.reads === 0));
  has(
    `in the other three the baseline was right ${shownRight('baseline')} times of 9 and the code as merged ${shownRight('merged')} times of 9, each miss an answer with no call that gave another text, ` +
      `and with the note each of the ${noted.length} answers came after one \`recall\` and no reading of the file`,
    'where it is shown again',
  );
  // Each miss: nothing called, and another text given, which the grader called wrong and not unable to tell.
  const missedIn = (dir: 'baseline' | 'merged') => {
    const grades = JSON.parse(readFileSync(`${SHOWN_AT}/${dir}/grades.json`, 'utf8')) as Grades;
    const missed = all[dir]
      .filter((unit) => /haiku/.test(unit.model))
      .flatMap((unit) => unit.questions.filter((one) => one.id === 'then' && one.verdict !== 'correct').map((one) => ({ unit, one })));
    assert.ok(missed.every(({ unit, one }) => shown.includes(unit.trace) && one.calls.length === 0 && verdictOf(unit, one, grades) === 'incorrect'), dir);
    return missed.length;
  };
  assert.equal(missedIn('baseline'), 9 - shownRight('baseline'));

  // The note as it is built, narrowed, against the code as merged: by the rule set again before it was measured,
  // 11 of 12 or more for the reading, and the two other questions about files at 12.
  const narrowedPart = measurements.slice(measurements.indexOf('### The note, narrowed'));
  assert.ok(narrowedPart.length < measurements.length, 'the section is there');
  for (const [label, ids] of rows) {
    assert.ok(narrowedPart.includes(`| ${label} | ${right(asked('merged', ids))} | ${right(asked('narrowed', ids))} |`), `narrowed, ${label}`);
  }
  const built = { then: asked('narrowed', ['then']), now: asked('narrowed', ['now']), unchanged: asked('narrowed', ['unchanged']) };
  assert.ok(right(built.then) >= 11 && right(built.now) === 12 && right(built.unchanged) === 12);
  has(`since 4 more than the ${then.merged} of 12 of the code as merged cannot be reached`, 'the rule, set again');
  // Where the note stands the agent recalls the reading, and reads the file for what it says now: which is how it is told the note stood there.
  assert.ok(built.then.every((one) => one.retrieval.recalls === 1 && one.retrieval.reads === 0));
  assert.ok(built.now.every((one) => one.retrieval.reads === 1));
  has(
    `Each of the ${built.then.length} readings came after one \`recall\` and no reading of the file, and each of the ${built.now.length} answers on what the file says now after one reading of it`,
    'narrowed, what was called',
  );
  assert.deepEqual(
    [asked('narrowed', ['then'], ['short'], /sonnet/).map((one) => one.retrieval.recalls), asked('narrowed', ['now'], ['short'], /sonnet/).map((one) => one.retrieval.reads)],
    [[1], [1]],
  );
  has('Sonnet 5.5 on `short`, one run: right on all three, with one `recall` for the reading and one reading of the file for what it says now.', 'narrowed, Sonnet');
  // What was missed beside it has nothing of the note in it: the script's output, in the conversation where no file is shown again.
  const outputMissed = (dir: Dir) =>
    all[dir].filter((unit) => /haiku/.test(unit.model)).flatMap((unit) => unit.questions.filter((one) => one.id.startsWith('gone-') && one.verdict !== 'correct').map(() => unit.trace));
  assert.deepEqual([outputMissed('narrowed'), outputMissed('merged')], [['writes', 'writes'], ['writes']]);
  has("The script's output was missed twice, both times in `writes`, where no file is shown again and no note stood; the code as merged missed it once there the same way", 'narrowed, the output');

  // What docs/limits.md, CHANGELOG.md and the record of the decision say of it.
  assert.ok(
    limits.includes(
      `answered right ${shownRight('narrowed')} times of 9 in the [three conversations sent to the summary](measurements.md#the-note-narrowed) where the file is shown again, each after one \`recall\`, ` +
        `where it was right ${shownRight('merged')} times of 9 with the file shown as it is now (${right(built.then)} of 12 against ${then.merged} with a fourth, where the file is not shown again); ` +
        `asked what the file says now, it read the file again and was right ${right(built.now)} times of 12`,
    ),
    'limits, the note',
  );
  // Handed over with an @, nothing stands in the file's place: what is fetched then is what the code without the note fetched.
  assert.ok(limits.includes(`Haiku fetched that reading ${shownRight('merged')} times of 9, and the other ${missedIn('merged')} times called nothing and gave another text`), 'limits, handed over');
  assert.ok(
    changelog.includes(
      `answered right ${then.merged} times of 12 in four conversations sent to the summary, and ${right(built.then)} of 12 with the note, each after one \`recall\` ` +
        `(${shownRight('merged')} of 9 and ${shownRight('narrowed')} of 9 in the three where the file is shown again and the note stands); ` +
        `asked what the file says now, it read the file again, ${right(built.now)} of 12`,
    ),
    'CHANGELOG, the note',
  );
  assert.ok(changelog.includes(`the note brought ${then.baseline} right of 12 to ${then.note}`), 'CHANGELOG, as first measured');
  for (const [label, n] of [['The line after the summary alone, the tools behind the search', then.baseline], ['and the two tools listed (0017)', then.merged], ["and a line in the file's place", right(built.then)]] as const) {
    assert.ok(adr.includes(`| ${label} | ${n} of 12 |`), `ADR 0018, ${label}`);
  }
  assert.ok(adr.includes(`it is ${then.merged} of 12, and ${shownRight('merged')} of 9 in the three where the file is shown again`), 'ADR 0018');
  assert.ok(adr.includes(`once in each of ${built.now.length} answers, all right`), 'ADR 0018, read again');
  // Where the line stood, and where no file is shown again and none did.
  assert.ok(
    adr.includes(`The 12 are ${shownRight('narrowed')} in the three conversations where the file is shown again and the line stood, and ${right(asked('narrowed', ['then'], ['writes']))} in the one where it is not`),
    'ADR 0018, where the line stood',
  );

  // Sonnet 5.5, `short` once: no worse.
  for (const dir of dirs) {
    assert.equal(right(asked(dir, ['then', 'now', 'unchanged'], ['short'], /sonnet/)), 3, dir);
    assert.deepEqual(asked(dir, ['then'], ['short'], /sonnet/).map((one) => one.retrieval.recalls), [1], dir);
  }
  has('Sonnet 5.5 on `short`, one run: right on all three with the note, without it and as merged, with one `recall` for the reading each time.', 'Sonnet');
  assert.ok(limits.includes('and fetched the reading of a changed file'), 'limits, Sonnet');

  // Every call to `recall` in the units measured for #54, these and those of the tools listed: how many of them were refused is of the records.
  const recalls = (units: readonly Unit[]) => units.flatMap((unit) => unit.questions).reduce((total, one) => total + one.retrieval.recalls, 0);
  const total = recalls(Object.values(all).flat()) + recalls(['baseline', 'listed', 'line', 'merged'].flatMap((dir) => currentOf(unitsUnder(`${LISTED_AT}/${dir}`), BEFORE_SONNET).units));
  has(`Over every unit above \`recall\` was called ${total} times.`, 'recall, counted');
  // Those are the calls from before `recall` took an id by its first characters: what it refused then is what the documents count.
  assert.ok(limits.includes(`refused 15 times in ${total} calls before this, over every plugin measured for it`), 'limits, recall');
  assert.ok(changelog.includes(`refused 15 times in ${total} calls where this was measured`), 'CHANGELOG, recall');

  // Nothing of the machine in what was published.
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(JSON.stringify(all)));
});

/** The plugin's code the units of `meant` were measured with: `5f65834` with `recall` taking the id that was meant. */
const MEANT_CODE = '31d05644cbdf';

test('the units in the repository measured with recall taking the id that was meant: every figure the documents give of them (#54)', () => {
  // Each document with its white space folded, so that a phrase is found where a line breaks in the middle of it.
  const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const [measurements, limits, changelog, usage] = [text('../docs/measurements.md'), text('../docs/limits.md'), text('../CHANGELOG.md'), text('../docs/usage.md')];
  // What is said of this measurement stands in a section of its own: the tables before it hold some of the same rows.
  const section = measurements.slice(measurements.indexOf('### The id that was meant'), measurements.indexOf('### Where the units are, and what this does not show'));
  assert.ok(section.length > 0 && section.length < measurements.length, 'the section is there');
  const has = (phrase: string, what: string) => assert.ok(section.includes(phrase), `${what}: ${phrase}`);
  type Asked = Unit['questions'][number];
  const under = (path: string) => {
    const { units, older } = currentOf(unitsUnder(path), BEFORE_SONNET);
    assert.equal(older, 0, path);
    assert.ok(units.every((unit) => unit.arm === 'plugin'), path);
    return units;
  };
  const by = (model: RegExp) => (units: readonly Unit[]) => units.filter((unit) => model.test(unit.model));
  const [haiku, sonnet] = [by(/haiku/), by(/sonnet/)];
  const right = (list: readonly Asked[]) => list.filter((one) => one.verdict === 'correct').length;
  const recalls = (units: readonly Unit[]) => units.flatMap((unit) => unit.questions).reduce((total, one) => total + one.retrieval.recalls, 0);

  // The four conversations sent to the summary, with the note alone and with `recall` taking the id that was meant as well;
  // and the questions `find` is for with no key, with the tools listed and `recall` as it was, and with this change.
  const sent = { before: under(`${SHOWN_AT}/narrowed`), meant: under(`${SHOWN_AT}/meant`) };
  const asked = { before: under(`${LISTED_AT}/listed`).filter((unit) => unit.variant === 'default'), meant: under(`${LISTED_AT}/meant`) };
  for (const units of [sent.meant, asked.meant]) assert.deepEqual([...new Set(units.map((unit) => unit.plugin))], [MEANT_CODE]);
  assert.ok(sent.meant.every((unit) => unit.mode === 'ask' && unit.variant === 'max-after-1' && unit.compaction.summarized));
  assert.ok(asked.meant.every((unit) => unit.mode === 'find' && unit.variant === 'default'));
  // Each pair was asked of the same building of each conversation: what differs between the two is the plugin.
  for (const pair of [sent, asked]) {
    for (const trace of new Set(pair.meant.map((unit) => unit.trace))) {
      assert.equal(new Set([...pair.before, ...pair.meant].filter((unit) => unit.trace === trace).map((unit) => unit.base)).size, 1, trace);
    }
  }
  assert.deepEqual([haiku(sent.meant).length, haiku(asked.meant).length, sonnet(sent.meant).length, sonnet(asked.meant).length], [12, 9, 1, 1]);

  // The first table, and what was set before measuring: 11 of 12 or more for the reading, 12 of 12 for the two other questions about files.
  const about = (units: readonly Unit[], ids: readonly string[]) =>
    haiku(units)
      .flatMap((unit) => unit.questions)
      .filter((one) => ids.includes(one.id));
  const files = [
    ['What the file said when it was read, of 12', ['then']],
    ['What it says now, of 12', ['now']],
    ['A file that is unchanged, of 12', ['unchanged']],
    ["The script's output no file holds any more, of 24", ['gone-1', 'gone-2']],
  ] as const;
  for (const [label, ids] of files) {
    assert.equal(about(sent.meant, ids).length, ids.length * 12, label);
    has(`| ${label} | ${right(about(sent.before, ids))} | ${right(about(sent.meant, ids))} |`, label);
  }
  assert.ok(right(about(sent.meant, ['then'])) >= 11 && right(about(sent.meant, ['now'])) === 12 && right(about(sent.meant, ['unchanged'])) === 12);

  // The second table, its sum, and the line drawn before measuring: no more than 2 right answers lost.
  const found = (units: readonly Unit[], trace: string, prefix: string) =>
    haiku(units)
      .filter((unit) => unit.trace === trace)
      .flatMap((unit) => unit.questions)
      .filter((one) => one.id.startsWith(prefix));
  const rows = [
    ['`opaque`, by meaning, of 21', 'opaque', 'find-doc-'],
    ['`opaque`, by a code, of 9', 'opaque', 'find-code-'],
    ['`results`, of 24', 'results', 'find-'],
    ['`full`, of 15', 'full', 'find-'],
  ] as const;
  const sums = { before: 0, meant: 0, of: 0 };
  for (const [label, trace, prefix] of rows) {
    const [was, now] = [found(asked.before, trace, prefix), found(asked.meant, trace, prefix)];
    assert.ok(was.length === now.length && label.endsWith(`of ${now.length}`), label);
    has(`| ${label} | ${right(was)} | ${right(now)} |`, label);
    sums.before += right(was);
    sums.meant += right(now);
    sums.of += now.length;
  }
  has(`${sums.meant} of ${sums.of} where it was ${sums.before}.`, 'the sum');
  assert.ok(sums.meant >= sums.before - 2);

  // The codes, with no key: mostly not looked for, before this change and with it.
  const codes = { before: found(asked.before, 'opaque', 'find-code-'), meant: found(asked.meant, 'opaque', 'find-code-') };
  const calling = (list: readonly Asked[], times: number) => list.filter((one) => one.retrieval.recalls === times).length;
  assert.deepEqual([calling(codes.meant, 0), calling(codes.before, 0), calling(codes.meant, 12)], [5, 3, 3]);
  has('five of the nine were answered with no call to `recall`, where three were with the tools listed, and three after twelve calls each', 'the codes');
  assert.ok(
    limits.includes(
      `it was right on ${right(codes.before)} of 9 in one set of three runs and on ${right(codes.meant)} of 9 in another; for ${calling(codes.before, 0)} and for ${calling(codes.meant, 0)} of the nine it did not call \`recall\` at all`,
    ),
    'limits, a code with no key',
  );

  // How often `recall` was called is of the units; which of the calls gave an id copied wrong is of the records.
  has(`In these units \`recall\` was called ${recalls(haiku(sent.meant)) + recalls(haiku(asked.meant))} times.`, 'recall, counted');

  // Sonnet 5.5, one run each: as before this change.
  const asSonnet = (units: readonly Unit[]) => sonnet(units).flatMap((unit) => unit.questions);
  for (const units of [sent.before, sent.meant]) {
    const short = asSonnet(units);
    assert.equal(right(short.filter((one) => ['then', 'now', 'unchanged'].includes(one.id))), 3);
    assert.deepEqual(short.filter((one) => one.id === 'then').map((one) => one.retrieval.recalls), [1]);
    assert.deepEqual(short.filter((one) => one.id === 'now').map((one) => one.retrieval.reads), [1]);
  }
  const ofOpaque = (units: readonly Unit[]) => {
    const [meaning, code] = ['find-doc-', 'find-code-'].map((prefix) => asSonnet(units).filter((one) => one.id.startsWith(prefix))) as [Asked[], Asked[]];
    return [right(meaning), meaning.length, right(code), code.length];
  };
  assert.deepEqual(ofOpaque(asked.meant), ofOpaque(asked.before));
  const [meaning, , code] = ofOpaque(asked.meant);
  has(`right on ${meaning} of the 7 questions by meaning and on ${code} of the 3 codes. It called \`recall\` ${recalls(sonnet(sent.meant)) + recalls(sonnet(asked.meant))} times in the two`, 'Sonnet');

  // What the documents say `recall` does now, with the fewest characters the code tells an id by (#107); and what this
  // measurement was taken with, which the CHANGELOG of its release and the section keep.
  const taken = `the one id written in the conversation that shares the most characters with it from the first, ${ID_LEAST} or more`;
  for (const [name, document] of [['limits', limits], ['usage', usage], ['CHANGELOG', changelog]] as const) assert.ok(document.includes(taken), name);
  const then = 'the one id written in the conversation that begins with its first 16 characters';
  for (const [name, document] of [['CHANGELOG', changelog], ['measurements', section]] as const) assert.ok(document.includes(then), name);

  // Nothing of the machine in what was published.
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(JSON.stringify([sent.meant, asked.meant])));
});

test('the questions asked one after another are tabled by how much the context grew, both arms alike', () => {
  const chained = (arm: 'plugin' | 'builtin', right: number, after: number | undefined, calls: string[]): Unit => {
    const unit = unitOf(arm, 1, [
      { ...answered('gone', 'exact-gone', 'cd8', calls, 'correct'), requests: [right, right + 4000] },
      { ...answered('rule', 'constraint', 'kept', []), requests: [right + 4000] },
    ]);
    return { ...unit, mode: 'chain', ...(after !== undefined ? { afterQuestions: after } : {}) };
  };
  const plugin = chained('plugin', 13704, 30000, ['mcp__lossless-compaction__recall']);
  const builtin = chained('builtin', 2462, 9000, ['Read']);
  const table = chains([plugin, builtin, chained('plugin', 1, undefined, [])], null).split('\n');

  assert.equal(table.length, 4, 'a chain whose last request was not measured is left out');
  assert.match(table[0] as string, /^\| Trace \| Model \| Run \| Arm \| In use before \| Right after \| After the questions \| Grew by \| Of the room made, taken again \|/);
  // 30,000 - 13,704 came back of 60,882 - 13,704 made: 35 %. 9,000 - 2,462 of 60,882 - 2,462: 11 %.
  assert.equal(table[2], '| results | haiku | 1 | builtin | 60882 | 2462 | 9000 | 6538 | 11 % | 0 | 1 | 0 | 1 of 1 graded |');
  assert.equal(table[3], '| results | haiku | 1 | plugin | 60882 | 13704 | 30000 | 16296 | 35 % | 1 | 0 | 0 | 1 of 1 graded |');

  // The tables of the questions asked each of its own copy hold no unit of a chain, and the whole report names the chain's.
  const all = whole([plugin, builtin], null);
  assert.ok(all.includes('### The questions asked one after another: how much the context grew'));
  assert.ok(!report([plugin, builtin], null).includes('### results, haiku'));
});

const EVERY_KIND = fileURLToPath(new URL('../bench/results/2026-10-04-every-kind', import.meta.url));

test('the run of every kind with Sonnet 5.5: of the traces as they are, every answer graded, the tables made from it, and every figure the README and docs/measurements.md give of it', () => {
  const read = (path: string) => readFileSync(path, 'utf8');
  const flat = (text: string) => text.replace(/\s+/g, ' ');
  const [readme, measurements] = [read(fileURLToPath(new URL('../README.md', import.meta.url))), read(fileURLToPath(new URL('../docs/measurements.md', import.meta.url)))];
  const section = measurements.slice(measurements.indexOf('## Every kind of conversation, with Sonnet 5.5'), measurements.indexOf('## The benchmark\n'));
  const has = (text: string, phrase: string, what: string) => assert.ok(flat(text).includes(phrase), `${what}: ${phrase}`);
  const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
  const n = (value: number) => value.toLocaleString('en-US');
  const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Of the traces as they are now, and the tables are these units and grades and nothing else.
  const { units, older } = currentOf(unitsUnder(EVERY_KIND));
  assert.equal(older, 0);
  const grades = JSON.parse(read(`${EVERY_KIND}/grades.json`)) as Grades;
  assert.equal(whole(units, grades, older, null), read(`${EVERY_KIND}/report.md`));
  // The six, both arms: asked of fresh copies once, one after another twice; with Sonnet 5.5, the plugin's arm with one state of its code.
  const expected = TRACES.flatMap((trace) => ['1 builtin', '1 builtin-chain', '1 plugin', '1 plugin-chain', '2 builtin-chain', '2 plugin-chain'].map((one) => `${trace.name} ${one}`));
  assert.deepEqual(units.map((unit) => `${unit.trace} ${unit.run} ${leaf(unit.arm, unit.variant, unit.mode)}`).sort(), expected.sort());
  assert.ok(units.every((unit) => unit.model === 'claude-sonnet-5-5' && unit.variant === 'default' && unit.questions.length === 9));
  assert.ok(units.every((unit) => unit.plugin === (unit.arm === 'plugin' ? '214978c94372' : null)));
  // Each unit is of the conversation published beside it, which is the trace as it is now, at a size it accepts, and nothing of the machine.
  for (const trace of TRACES) {
    const built = JSON.parse(read(`${EVERY_KIND}/bases/${trace.name}.json`)) as { sessionId: string; version: number; tokens: number; thinkingTokens: number; model: string };
    assert.equal(built.version, trace.version, trace.name);
    assert.equal(built.model, 'claude-sonnet-5-5', trace.name);
    assert.ok(built.tokens >= trace.accept.minTokens && built.tokens <= trace.accept.maxTokens && built.thinkingTokens >= (trace.accept.minThinkingTokens ?? 0), trace.name);
    const conversation = JSON.parse(read(`${EVERY_KIND}/bases/${trace.name}.conversation.json`)) as Conversation;
    assert.deepEqual(saidIn(conversation), saidBy(trace), trace.name);
    assert.ok(!/\/Users\/|\/home\/|\.cctmp|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(JSON.stringify(conversation)), trace.name);
    for (const unit of units.filter((one) => one.trace === trace.name)) assert.equal(unit.base, built.sessionId, `${trace.name} ${unit.arm} ${unit.mode} ${unit.run}`);
  }
  has(section, `its ${n(JSON.parse(read(`${EVERY_KIND}/bases/full.json`)).tokens)} tokens fill 85 %`, 'measurements');
  // Every answer has a verdict; the grader's, as docs/measurements.md gives them.
  assert.deepEqual([outcomesOf(units, grades).ungraded, grades.ungraded.length, grades.controls.asExpected, grades.controls.count], [0, 0, 217, 217]);
  has(section, `The grader graded ${grades.disagreements} answers differently in its two passes`, 'measurements');
  has(section, `Of ${grades.controls.count} answers of known grade mixed in, it graded every one as expected.`, 'measurements');

  const of = (trace: string, arm: 'plugin' | 'builtin', mode: 'ask' | 'chain', run = 1) => {
    const unit = units.find((one) => one.trace === trace && one.arm === arm && one.mode === mode && one.run === run);
    assert.ok(unit !== undefined, `${trace} ${arm} ${mode} ${run}`);
    return unit;
  };
  const right = (unit: Unit) => unit.questions.filter((asked) => verdictOf(unit, asked, grades) === 'correct').length;
  const cost = (unit: Unit) => unit.compaction.own.costUSD + sum(unit.questions.map((asked) => asked.own.costUSD));
  const next = (unit: Unit) => unit.questions[0]?.requests[0] ?? NaN;
  const after = (unit: Unit) => unit.afterQuestions ?? NaN;
  const chains = (arm: 'plugin' | 'builtin', run?: 1 | 2) => units.filter((unit) => unit.mode === 'chain' && unit.arm === arm && (run === undefined || unit.run === run));
  const fresh = (arm: 'plugin' | 'builtin') => units.filter((unit) => unit.mode === 'ask' && unit.arm === arm);
  const [ours, theirs] = [chains('plugin'), chains('builtin')];
  const [first, firstThen] = [chains('plugin', 1), chains('builtin', 1)];

  // The README's table: the six asked one after another, twice, each cell the range or the sum of them; the cost, of the first run.
  const range = (values: readonly number[], form: (value: number) => string) => `${form(Math.min(...values))}–${form(Math.max(...values))}`;
  const row = (label: string, mine: string, built: string) => assert.match(readme, new RegExp(`\\| ${escaped(label)} +\\| +${mine} \\| +${built} \\|`), label);
  assert.ok(ours.every((unit) => !unit.compaction.summarized && unit.compaction.line?.outcome === 'moved') && theirs.every((unit) => unit.compaction.summarized));
  row('A summary was written', `0 of ${ours.length}`, `${theirs.length} of ${theirs.length}`);
  row('`/compact` took', `${range(ours.map((unit) => unit.compaction.durationMs), (ms) => (ms / 1000).toFixed(2))} s`, `${range(theirs.map((unit) => unit.compaction.durationMs), (ms) => String(Math.round(ms / 1000)))} s`);
  row('The next request carried, tokens', range(ours.map(next), n), range(theirs.map(next), n));
  row('After the nine questions, tokens', range(ours.map(after), n), range(theirs.map(after), n));
  row(`Right answers, of ${ours.length * 9}`, String(sum(ours.map(right))), String(sum(theirs.map(right))));
  row('The first run cost', `${sum(first.map(cost)).toFixed(2)} USD`, `${sum(firstThen.map(cost)).toFixed(2)} USD`);
  // Under it: larger in five of six and smaller in the one of many short calls, in both runs; the cost, of the first run.
  for (const run of [1, 2] as const) {
    assert.deepEqual(TRACES.filter((trace) => next(of(trace.name, 'plugin', 'chain', run)) < next(of(trace.name, 'builtin', 'chain', run))).map((trace) => trace.name), ['short'], `run ${run}`);
  }
  has(readme, 'At 40 the next request was larger in five kinds of six;', 'README');
  assert.deepEqual(TRACES.filter((trace) => cost(of(trace.name, 'plugin', 'chain')) > cost(of(trace.name, 'builtin', 'chain'))).map((trace) => trace.name), ['full']);
  has(readme, 'the plugin cost less in five kinds, and more in the one that fills the window, where Claude Code wrote it to the cache again at four questions', 'README');
  // Those four: the questions after the first, in the first run's `full` and the second's `prose`, each wrote what the plugin left to the cache again.
  const rewrote = (unit: Unit) => unit.questions.map((asked, at) => (at > 0 && asked.own.cacheCreationInputTokens > next(unit) / 2 ? asked.id : null)).filter((id) => id !== null);
  assert.deepEqual(rewrote(of('full', 'plugin', 'chain', 1)), ['gone-2', 'unchanged', 'then', 'now']);
  assert.deepEqual(rewrote(of('prose', 'plugin', 'chain', 2)), ['gone-2', 'unchanged', 'then', 'now']);
  assert.deepEqual(ours.filter((unit) => rewrote(unit).length > 0).map((unit) => `${unit.trace} ${unit.run}`).sort(), ['full 1', 'prose 2']);
  // The second run's first questions of the plugin's arm read what the first run's wrote: nothing of what was left written again.
  assert.ok(chains('plugin', 2).every((unit) => (unit.questions[0]?.own.cacheCreationInputTokens ?? Infinity) < next(unit) / 2));
  assert.ok(first.every((unit) => (unit.questions[0]?.own.cacheCreationInputTokens ?? 0) > next(unit) / 2));

  // docs/measurements.md: a row a conversation and a table a run, the plugin's figure first, and what is said under them.
  const KINDS = [['results', 'Large tool results'], ['writes', 'Files the agent wrote'], ['prose', 'Text pasted into messages'], ['short', 'Many short calls'], ['full', 'Text filling most of the window'], ['thinking', 'Thinking']] as const;
  const seconds = (ms: number) => (ms < 1000 ? (ms / 1000).toFixed(2) : (ms / 1000).toFixed(1));
  const second = section.slice(section.indexOf('The second run:'));
  for (const run of [1, 2] as const) {
    const where = run === 1 ? section.slice(0, section.indexOf('The second run:')) : second;
    for (const [trace, label] of KINDS) {
      const [mine, built] = [of(trace, 'plugin', 'chain', run), of(trace, 'builtin', 'chain', run)];
      const cells = [
        `${n(mine.compaction.preTokens)} · ${n(built.compaction.preTokens)}`,
        `${seconds(mine.compaction.durationMs)} · ${seconds(built.compaction.durationMs)}`,
        `${n(next(mine))} · ${n(next(built))}`,
        `${n(after(mine))} · ${n(after(built))}`,
        `${right(mine)} · ${right(built)}`,
        ...(run === 1 ? [`${cost(mine).toFixed(2)} · ${cost(built).toFixed(2)}`] : []),
      ];
      assert.match(where, new RegExp(`\\| ${label} +\\| +${cells.map(escaped).join(' \\| +')} \\|`), `${label}, run ${run}`);
    }
  }
  const grew = (unit: Unit) => after(unit) - next(unit);
  has(section, `the plugin's context grew by ${range(ours.map(grew), n).replace('–', ' to ')} tokens over the nine questions, the built-in's by ${range(theirs.map(grew), n).replace('–', ' to ')}:`, 'measurements');
  const calls = (set: readonly Unit[], name: string) => sum(set.map((unit) => sum(unit.questions.map((asked) => asked.calls.filter((call) => call === name).length))));
  const outside = (set: readonly Unit[]) => sum(set.map((unit) => unit.questions.filter((asked) => asked.outside).length));
  // Files read again, as the table of the questions asked one after another counts them: its eleventh cell.
  const chainRows = read(`${EVERY_KIND}/report.md`).split('\n').filter((line) => / \| claude-sonnet-5-5 \| [12] \| (plugin|builtin) \| /.test(line));
  const readAgain = (arm: string) => sum(chainRows.filter((line) => line.includes(` | ${arm} | `)).map((line) => Number(line.split('|')[11])));
  assert.equal(chainRows.length, 24);
  assert.equal(outside(ours), 0);
  has(section, `with the plugin the agent called \`recall\` ${calls(ours, 'mcp__lossless-compaction__recall')} times and read or searched files ${readAgain('plugin')} times; after a summary it read or searched files ${readAgain('builtin')} times, and ${outside(theirs)} of its questions did so outside the working directory`, 'measurements');
  const [paid, paidThen] = [sum(first.map(cost)).toFixed(2), sum(firstThen.map(cost)).toFixed(2)];
  const summaries = sum(firstThen.map((unit) => unit.compaction.own.costUSD));
  // The parts add up to the whole as written: the questions after the summaries are the whole less them, both rounded.
  const afterSummaries = (Number(paidThen) - Number(summaries.toFixed(2))).toFixed(2);
  assert.equal(afterSummaries, (sum(firstThen.map(cost)) - summaries).toFixed(2));
  has(section, `${paid} USD in all for the plugin, against ${paidThen}, of which the summaries were ${summaries.toFixed(2)} and the questions after them ${afterSummaries}.`, 'measurements');
  const [fullMine, fullBuilt] = [of('full', 'plugin', 'chain'), of('full', 'builtin', 'chain')];
  has(section, `more in \`full\`, ${cost(fullMine).toFixed(2)} against ${cost(fullBuilt).toFixed(2)}:`, 'measurements');
  assert.ok(fullBuilt.compaction.own.cacheReadInputTokens < 10_000);
  has(section, `in \`full\` it wrote ${n(fullBuilt.compaction.own.cacheCreationInputTokens)} tokens afresh.`, 'measurements');
  const [paidFresh, paidFreshThen] = [sum(fresh('plugin').map(cost)).toFixed(2), sum(fresh('builtin').map(cost)).toFixed(2)];
  has(section, `Each of a fresh copy, where no question reads what another wrote to the cache: ${paidFresh} against ${paidFreshThen}.`, 'measurements');
  has(section, `${sum(ours.map(right))} of ${ours.length * 9} right against ${sum(theirs.map(right))} one after another, ${sum(fresh('plugin').map(right))} of 54 against ${sum(fresh('builtin').map(right))} each of a fresh copy.`, 'measurements');

  // The same figures where docs/comparison.md opens and in the CHANGELOG.
  const [comparison, changelog] = [read(fileURLToPath(new URL('../docs/comparison.md', import.meta.url))), read(fileURLToPath(new URL('../CHANGELOG.md', import.meta.url)))];
  const took = (set: readonly Unit[], form: (ms: number) => string) => range(set.map((unit) => unit.compaction.durationMs), form).replace('–', ' to ');
  const [ourTook, theirTook] = [took(ours, (ms) => (ms / 1000).toFixed(2)), took(theirs, (ms) => String(Math.round(ms / 1000)))];
  has(comparison, `a \`/compact\` took ${ourTook} s against ${theirTook} s, and left the next request larger in five of them.`, 'comparison');
  has(comparison, `answered right ${sum(ours.map(right))} times of ${ours.length * 9} against ${sum(theirs.map(right))}, and in the first run the \`/compact\`s and their questions cost ${paid} USD against ${paidThen}; asked each of a fresh copy, where no question reads what another wrote to the prompt cache, ${paidFresh} against ${paidFreshThen}`, 'comparison');
  has(
    changelog,
    `the \`/compact\` took ${ourTook} s against ${theirTook} s; the next request carried ${range(ours.map(next), n).replace('–', ' to ')} tokens against ${range(theirs.map(next), n).replace('–', ' to ')}, ` +
      `and ${range(ours.map(after), n).replace('–', ' to ')} once the nine questions had been asked, against ${range(theirs.map(after), n).replace('–', ' to ')}; ` +
      `${sum(ours.map(right))} answers of ${ours.length * 9} were right against ${sum(theirs.map(right))}; and in the first run the \`/compact\`s with their questions cost ${paid} USD against ${paidThen}, the plugin less in five kinds and more in the one that fills the window, where Claude Code wrote what it left to the prompt cache again at four questions. ` +
      `Asked each of a fresh copy, the \`/compact\`s with their questions cost ${paidFresh} USD against ${paidFreshThen}.`,
    'CHANGELOG',
  );
});

const LARGE_AT = fileURLToPath(new URL('../bench/results/2026-10-04-large', import.meta.url));

test('large in a window of 1,000,000 with Sonnet 5.5, on the code of every kind: graded apart, the tables made from it, and every figure the documents give of it', () => {
  const read = (path: string) => readFileSync(path, 'utf8');
  const flat = (text: string) => text.replace(/\s+/g, ' ');
  const has = (text: string, phrase: string, what: string) => assert.ok(flat(text).includes(phrase), `${what}: ${phrase}`);
  const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
  const n = (value: number) => value.toLocaleString('en-US');
  const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const doc = (name: string) => read(fileURLToPath(new URL(`../${name}`, import.meta.url)));
  const [readme, measurements, comparison, changelog] = [doc('README.md'), doc('docs/measurements.md'), doc('docs/comparison.md'), doc('CHANGELOG.md')];

  const { units, older } = currentOf(unitsUnder(LARGE_AT));
  assert.equal(older, 0);
  const grades = JSON.parse(read(`${LARGE_AT}/grades.json`)) as Grades;
  assert.equal(whole(units, grades, older, null), read(`${LARGE_AT}/report.md`));
  assert.deepEqual(units.map((unit) => leaf(unit.arm, unit.variant, unit.mode)).sort(), ['builtin', 'builtin-chain', 'plugin', 'plugin-chain']);
  const [large] = LARGE;
  assert.ok(large !== undefined);
  assert.ok(units.every((unit) => unit.trace === 'large' && unit.model === 'claude-sonnet-5-5' && unit.run === 1 && unit.questions.length === 11 && unit.plugin === (unit.arm === 'plugin' ? '214978c94372' : null)));
  // Of the conversation published beside it, built again from the trace as it is, and nothing of the machine.
  const built = JSON.parse(read(`${LARGE_AT}/bases/large.json`)) as { sessionId: string; version: number; tokens: number; model: string };
  assert.ok(built.version === large.version && built.model === 'claude-sonnet-5-5' && built.tokens >= large.accept.minTokens && built.tokens <= large.accept.maxTokens);
  const conversation = JSON.parse(read(`${LARGE_AT}/bases/large.conversation.json`)) as Conversation;
  assert.deepEqual(saidIn(conversation), saidBy(large));
  assert.ok(!/\/Users\/|\/home\/|\.cctmp|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(JSON.stringify(conversation)));
  assert.ok(units.every((unit) => unit.base === built.sessionId && !/\/Users\/|\.cctmp/.test(JSON.stringify(unit))));
  assert.equal(outcomesOf(units, grades).ungraded, 0);
  has(measurements, `built again with Sonnet 5.5 (${n(built.tokens)} tokens)`, 'measurements');

  const of = (arm: 'plugin' | 'builtin', mode: 'ask' | 'chain') => {
    const unit = units.find((one) => one.arm === arm && one.mode === mode);
    assert.ok(unit !== undefined, `${arm} ${mode}`);
    return unit;
  };
  const right = (unit: Unit) => unit.questions.filter((asked) => verdictOf(unit, asked, grades) === 'correct').length;
  const cost = (unit: Unit) => unit.compaction.own.costUSD + sum(unit.questions.map((asked) => asked.own.costUSD));
  const next = (unit: Unit) => unit.questions[0]?.requests[0] ?? NaN;
  const seconds = (ms: number) => (ms < 1000 ? (ms / 1000).toFixed(2) : (ms / 1000).toFixed(1));
  const [freshMine, freshBuilt, chainMine, chainBuilt] = [of('plugin', 'ask'), of('builtin', 'ask'), of('plugin', 'chain'), of('builtin', 'chain')];
  assert.ok(!freshMine.compaction.summarized && !chainMine.compaction.summarized && freshBuilt.compaction.summarized && chainBuilt.compaction.summarized);

  // docs/measurements.md: the table, each cell the plugin's figure first.
  const section = measurements.slice(measurements.indexOf('In a window of 1,000,000: `large`'), measurements.indexOf('## The benchmark\n'));
  const row = (label: string, cells: readonly string[]) => assert.match(section, new RegExp(`\\| ${escaped(label)} +\\| +${cells.map(escaped).join(' \\| +')} \\|`), label);
  const pair = (mine: Unit, built: Unit, cell: (unit: Unit) => string) => `${cell(mine)} · ${cell(built)}`;
  row('Tokens before', [pair(freshMine, freshBuilt, (unit) => n(unit.compaction.preTokens)), pair(chainMine, chainBuilt, (unit) => n(unit.compaction.preTokens))]);
  row('`/compact` took, s', [pair(freshMine, freshBuilt, (unit) => seconds(unit.compaction.durationMs)), pair(chainMine, chainBuilt, (unit) => seconds(unit.compaction.durationMs))]);
  row('The next request, tokens', [pair(freshMine, freshBuilt, (unit) => n(next(unit))), pair(chainMine, chainBuilt, (unit) => n(next(unit)))]);
  assert.match(section, new RegExp(`\\| After the eleven, tokens +\\| +\\| +${escaped(pair(chainMine, chainBuilt, (unit) => n(unit.afterQuestions ?? NaN)))} \\|`));
  row('Right, of 11', [pair(freshMine, freshBuilt, (unit) => String(right(unit))), pair(chainMine, chainBuilt, (unit) => String(right(unit)))]);
  row('Cost, USD', [pair(freshMine, freshBuilt, (unit) => cost(unit).toFixed(2)), pair(chainMine, chainBuilt, (unit) => cost(unit).toFixed(2))]);
  // One after another, the first question wrote what was left to the cache and the others read it; each of a fresh copy, every question wrote it.
  const wrote = chainMine.questions.map((asked) => asked.own.cacheCreationInputTokens);
  assert.ok((wrote[0] ?? 0) > next(chainMine) * 0.9 && wrote.slice(1).every((one) => one < next(chainMine) / 10));
  assert.ok(freshMine.questions.every((asked) => asked.own.cacheCreationInputTokens > next(freshMine) * 0.9));
  has(section, `the plugin's first question wrote the ${n(wrote[0] ?? 0)} tokens the compaction left to the prompt cache`, 'measurements');
  const recalls = (unit: Unit) => sum(unit.questions.map((asked) => asked.calls.filter((call) => call === 'mcp__lossless-compaction__recall').length));
  const outside = (unit: Unit) => unit.questions.filter((asked) => asked.outside).length;
  assert.equal(outside(freshBuilt), outside(chainBuilt));
  has(section, `With the plugin the agent called \`recall\` ${recalls(freshMine)} and ${recalls(chainMine)} times; after a summary, ${outside(freshBuilt)} of its answers each way came after reading outside the working directory.`, 'measurements');

  // The README's line, the opening of docs/comparison.md and the CHANGELOG: one after another, with the time of both ways.
  const took = (mine: readonly Unit[], form: (ms: number) => string, joint: string) => {
    const values = mine.map((unit) => unit.compaction.durationMs);
    return `${form(Math.min(...values))}${joint}${form(Math.max(...values))}`;
  };
  const tokens = n(Math.round(freshMine.compaction.preTokens / 1000) * 1000);
  const [ourTook, theirTook] = [took([freshMine, chainMine], (ms) => (ms / 1000).toFixed(2), '–'), took([freshBuilt, chainBuilt], (ms) => String(Math.round(ms / 1000)), '–')];
  has(readme, `In a window of 1,000,000**, at 40 and ${tokens} tokens: \`/compact\` ${ourTook} s against ${theirTook} s; eleven questions in a row, ${right(chainMine)} right against ${right(chainBuilt)}, ${cost(chainMine).toFixed(2)} USD against ${cost(chainBuilt).toFixed(2)}.`, 'README');
  const spoken = (text: string) => text.replace('–', ' to ');
  has(comparison, `In a window of 1,000,000, at ${tokens} tokens, a \`/compact\` took ${spoken(ourTook)} s against ${spoken(theirTook)} s; one after another the eleven questions were answered right ${right(chainMine)} times against ${right(chainBuilt)} and cost ${cost(chainMine).toFixed(2)} USD against ${cost(chainBuilt).toFixed(2)}, and each of a fresh copy ${cost(freshMine).toFixed(2)} against ${cost(freshBuilt).toFixed(2)}.`, 'comparison');
  has(
    changelog,
    `at ${tokens} tokens a \`/compact\` took ${spoken(ourTook)} s against ${spoken(theirTook)} s; asked one after another, the eleven questions were right ${right(chainMine)} times against ${right(chainBuilt)} and cost ${cost(chainMine).toFixed(2)} USD against ${cost(chainBuilt).toFixed(2)}; ` +
      `asked each of a fresh copy, where every question writes the 270,000 tokens the plugin left to the prompt cache again, ${cost(freshMine).toFixed(2)} USD against ${cost(freshBuilt).toFixed(2)}, ${right(freshMine)} right against ${right(freshBuilt)}.`,
    'CHANGELOG',
  );
});

const FETCHED_AT = fileURLToPath(new URL('../bench/results/2026-10-05-fetched', import.meta.url));

test('the run that tells fetching from answering: the tables made from its units, and every figure docs/measurements.md gives of it', () => {
  const read = (path: string) => readFileSync(path, 'utf8');
  const flat = (text: string) => text.replace(/\s+/g, ' ');
  const measurements = read(fileURLToPath(new URL('../docs/measurements.md', import.meta.url)));
  const section = flat(measurements.slice(measurements.indexOf('## Where the answer went, and whether the agent fetched it')));
  assert.ok(section.length > 1000);
  const has = (phrase: string) => assert.ok(section.includes(phrase), phrase);

  const units = unitsUnder(FETCHED_AT);
  assert.equal(whole(units, null, 0, null), read(`${FETCHED_AT}/report.md`));
  // Three runs of each: four conversations as compacted by default, two of them cut, and the one asked what `find` is for, with no key.
  const settings = ['opaque default find', 'results v070 ask', 'results v070-max-after-10 ask', 'short v070 ask', 'thinking v070 ask', 'writes v070 ask', 'writes v070-max-after-10 ask'];
  assert.deepEqual(units.map((unit) => `${unit.trace} ${unit.variant} ${unit.mode} ${unit.run}`).sort(), settings.flatMap((one) => [1, 2, 3].map((run) => `${one} ${run}`)).sort());
  assert.ok(units.every((unit) => unit.arm === 'plugin' && unit.model === 'claude-sonnet-5-5' && unit.plugin === '23ff90df6625' && unit.claudeCode === '2.1.289'));
  has('(code `23ff90df6625`) and Claude Code 2.1.289');
  // No summary ran: moved out, or cut where the share that may stay was 10 %; and no `find` was there to call.
  for (const unit of units) assert.equal(unit.compaction.line?.outcome, unit.variant === 'v070-max-after-10' ? 'cut' : 'moved', `${unit.trace} ${unit.variant}`);
  assert.ok(units.every((unit) => !unit.compaction.summarized && unit.questions.every((one) => one.retrieval.finds === 0)));
  // Nothing of the machine it ran on.
  assert.ok(!/\/Users\/|\/home\/|\.cctmp/.test(JSON.stringify(units)));

  // The table: a row a setting, as `fetches` counts them.
  const rows = new Map<string, number[]>(fetches(units).split('\n').slice(2).map((row) => {
    const cells = row.split(' | ').map((cell) => cell.replace(/^\| | \|$/g, ''));
    return [`${cells[0]} ${cells[2]}`, cells.slice(3).map(Number)] as [string, number[]];
  }));
  const named: [string, string][] = [
    ['results v070', '| `results` | moved 10 of 15 results out |'],
    ['short v070', '| `short` | moved 3 results out, folded 26 calls |'],
    ['thinking v070', '| `thinking` | moved 3 of 3 results out |'],
    ['writes v070', "| `writes` | moved 3 results, 7 inputs, 2 messages' middles out |"],
    ['results v070-max-after-10', '| `results`, cut | moved 10 out, then kept messages 2 to 39 of 44 in 1 part |'],
    ['writes v070-max-after-10', '| `writes`, cut | moved out as above, then kept messages 2 to 39 of 54 in 2 parts |'],
    ["opaque default, find's questions", '| `opaque`, the questions `find` is for | moved 16 of 20 results out |'],
  ];
  assert.equal(rows.size, named.length);
  let [had, back] = [0, 0];
  for (const [key, label] of named) {
    // runs, questions, left in the conversation, had to be fetched, called, chose, came back, right, came back and wrong
    const [runs, questions, left, needs, called, chose, restored, right, wrongAfter] = rows.get(key) as number[];
    assert.deepEqual([runs, left, wrongAfter, needs], [3, 0, 0, questions], key);
    has(`${label} ${needs} | ${called} | ${chose} | ${restored} | ${right} |`);
    had += needs as number;
    back += restored as number;
  }
  assert.deepEqual([had, back], [84, 81]);
  has(`${back} of ${had} answers that had to be fetched were, ${Math.round((back / had) * 100)} %`);
  has('In every one of the 84 questions the answer had left the conversation');
  has('the agent fetched the answer 54 times of 54');
  // What the compactions did, as their lines say.
  const line = (trace: string, variant: string) => units.find((unit) => unit.trace === trace && unit.variant === variant)?.compaction.line;
  assert.deepEqual([line('results', 'v070')?.moved, line('results', 'v070')?.results, line('short', 'v070')?.folded, line('writes', 'v070')?.inputs, line('writes', 'v070')?.bodies], [10, 15, 26, 7, 2]);
  assert.deepEqual([line('results', 'v070-max-after-10')?.cut, line('writes', 'v070-max-after-10')?.cut], [{ first: 2, last: 39, of: 44, parts: 1 }, { first: 2, last: 39, of: 54, parts: 2 }]);
  assert.deepEqual([line('opaque', 'default')?.moved, line('opaque', 'default')?.results], [16, 20]);
  // The next request after a cut, against after moving out alone.
  const next = (trace: string, variant: string) => units.find((unit) => unit.trace === trace && unit.variant === variant && unit.run === 1)?.questions[0]?.requests[0];
  const n = (value: number | undefined) => (value as number).toLocaleString('en-US');
  has(`carried ${n(next('results', 'v070-max-after-10'))} and ${n(next('writes', 'v070-max-after-10'))} tokens, against ${n(next('results', 'v070'))} and ${n(next('writes', 'v070'))}`);
  // `opaque`: the three not fetched are one question a run, answered by another model after a refusal; the calls and the cost.
  const opaque = units.filter((unit) => unit.trace === 'opaque');
  const missed = opaque.flatMap((unit) => unit.questions.filter((one) => one.fetched?.tried !== true));
  assert.deepEqual(missed.map((one) => [one.id, one.fellBackTo !== undefined, one.calls.length]), [1, 2, 3].map(() => ['find-doc-1', true, 0]));
  assert.ok(opaque.every((unit) => unit.questions.filter((one) => one.fellBackTo !== undefined).length === 1));
  const perQuestion = opaque.flatMap((unit) => unit.questions.filter((one) => one.fetched?.tried === true).map((one) => one.retrieval.recalls));
  has(`${Math.min(...perQuestion)} to ${Math.max(...perQuestion)} calls a question`);
  const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
  const calls = (unit: Unit) => sum(unit.questions.map((one) => one.retrieval.recalls));
  const cost = (unit: Unit) => sum(unit.questions.map((one) => one.own.costUSD));
  const others = units.filter((unit) => unit.trace !== 'opaque');
  has(
    `made ${Math.min(...opaque.map(calls))} to ${Math.max(...opaque.map(calls))} calls to \`recall\` and cost ${Math.min(...opaque.map(cost)).toFixed(2)} to ${Math.max(...opaque.map(cost)).toFixed(2)} USD, where a run of nine elsewhere made ${Math.min(...others.map(calls))} to ${Math.max(...others.map(calls))} and cost ${Math.min(...others.map(cost)).toFixed(2)} to ${Math.max(...others.map(cost)).toFixed(2)}`,
  );
});

const TARGETS_AT = fileURLToPath(new URL('../bench/results/2026-10-05-targets', import.meta.url));

test('the six conversations at 40 and at 1: the tables made from them, and every figure the documents give of them', () => {
  const read = (path: string) => readFileSync(path, 'utf8');
  const flat = (text: string) => text.replace(/\s+/g, ' ');
  const measurements = read(fileURLToPath(new URL('../docs/measurements.md', import.meta.url)));
  const section = flat(measurements.slice(measurements.indexOf('## The six kinds of conversation, at 40 and at 1')));
  const readme = flat(read(fileURLToPath(new URL('../README.md', import.meta.url))));
  const has = (text: string, phrase: string) => assert.ok(text.includes(phrase), phrase);
  const units = unitsUnder(TARGETS_AT);
  const grades = JSON.parse(read(`${TARGETS_AT}/grades.json`)) as Grades;
  assert.equal(whole(units, grades, 0, null), read(`${TARGETS_AT}/report.md`));
  assert.deepEqual(units.map((unit) => `${unit.trace} ${unit.variant}`).sort(), TRACES.flatMap((trace) => [`${trace.name} target-1`, `${trace.name} target-40`]).sort());
  assert.ok(units.every((unit) => unit.arm === 'plugin' && unit.run === 1 && unit.mode === 'ask' && unit.plugin === '8b7ba0e05d26' && unit.claudeCode === '2.1.289' && unit.compaction.line?.outcome === 'moved'));
  assert.ok(!/\/Users\/|\/home\/|\.cctmp/.test(JSON.stringify(units)));
  // Of the same conversations as the run of every kind, whose built-in arm is set beside them.
  const builtin = unitsUnder(EVERY_KIND).filter((unit) => unit.arm === 'builtin' && unit.mode === 'ask');
  const next = (unit: Unit | undefined) => unit?.questions[0]?.requests[0] as number;
  const n = (value: number) => value.toLocaleString('en-US');
  const at = (trace: string, variant: string) => units.find((unit) => unit.trace === trace && unit.variant === variant) as Unit;
  const right = (unit: Unit) => unit.questions.filter((one) => verdictOf(unit, one, grades) === 'correct').length;
  for (const trace of TRACES) {
    const built = builtin.find((unit) => unit.trace === trace.name) as Unit;
    assert.equal(built.base, at(trace.name, 'target-1').base, trace.name);
    const [forty, one] = [at(trace.name, 'target-40'), at(trace.name, 'target-1')];
    has(section, `| \`${trace.name}\` | ${n(next(built))} | ${n(next(forty))} | ${n(next(one))} |`);
    assert.ok(section.includes(`| ${right(forty)} | ${right(one)} |`), trace.name);
  }
  const sizes = (variant: string) => TRACES.map((trace) => next(at(trace.name, variant)));
  has(section, `It carried ${n(Math.min(...sizes('target-1')))} to ${n(Math.max(...sizes('target-1')))} tokens, against ${n(Math.min(...sizes('target-40')))} to ${n(Math.max(...sizes('target-40')))} at 40`);
  const smaller = TRACES.filter((trace) => next(at(trace.name, 'target-1')) < next(builtin.find((unit) => unit.trace === trace.name)));
  assert.equal(smaller.length, 4);
  has(section, 'less than after the summary in four kinds of six');
  has(readme, 'at 1, the default, smaller in four');
  const total = (variant: string) => TRACES.reduce((sum, trace) => sum + right(at(trace.name, variant)), 0);
  has(section, `${total('target-1')} of 54 at 1, ${total('target-40')} of 54 at 40`);
  // What a program grades was right everywhere; at 1 `recall` brought it back, where at 40 two kinds still had it in the conversation.
  const exact = units.flatMap((unit) => unit.questions.filter((one) => one.kind.startsWith('exact')));
  assert.deepEqual([exact.length, exact.filter((one) => one.verdict === 'correct').length], [60, 60]);
  assert.ok(['prose', 'full'].every((trace) => at(trace, 'target-40').questions.every((one) => one.retrieval.recalls === 0)));
  // What docs/limits.md says of the size the plugin goes by, of these: within 20 % over and 6 % under what the next request sent.
  const off = units.map((unit) => ((unit.compaction.line?.estimate as number) - next(unit)) / next(unit));
  assert.ok(Math.max(...off) <= 0.2 && Math.min(...off) >= -0.06 && Math.min(...off) < -0.05, off.map((e) => (e * 100).toFixed(1)).join(' '));
  has(flat(read(fileURLToPath(new URL('../docs/limits.md', import.meta.url)))), `from ${Math.round(-Math.min(...off) * 100)} % under to ${Math.round(Math.max(...off) * 100)} % over`);
  assert.deepEqual(TRACES.map((trace) => at(trace.name, 'target-1').compaction.line?.bodies ?? 0), TRACES.map((trace) => ({ writes: 8, prose: 6, full: 8 })[trace.name] ?? 0));
});

test('a record is replayed in the window its session had: 1,000,000 where any request sent more than 200,000 tokens, whatever line is replayed', async () => {
  const row = (tokens: number, sidechain = false) => JSON.stringify({ type: 'assistant', isSidechain: sidechain, message: { role: 'assistant', usage: { input_tokens: 5, cache_read_input_tokens: tokens - 5, cache_creation_input_tokens: 0 } } });
  assert.equal(windowOf([row(30_000), row(150_000)].join('\n')), 167_000);
  // A /compact typed at 150,000 early in a session that later went over 200,000 is of a window of 1,000,000.
  assert.equal(windowOf([row(30_000), row(150_000), JSON.stringify({ type: 'system', subtype: 'compact_boundary' }), row(40_000), row(200_001)].join('\n')), 967_000);
  // At exactly 200,000 it could have been either: the benchmark's is taken. Lines that are not JSON are passed over, and a subagent's requests are not the session's.
  assert.equal(windowOf([row(200_000), 'not json', '', row(400_000, true)].join('\n')), 167_000);
});

test('a compaction the record says was asked for is replayed as a /compact typed, and replay takes the window and that from the record unless given', async () => {
  const boundary = (trigger: string) => JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger, preTokens: 250_000 } });
  const said = JSON.stringify({ type: 'user', message: { role: 'user', content: 'go on' } });
  const answered = JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 5, cache_read_input_tokens: 249_995, cache_creation_input_tokens: 0 } } });
  const record = [said, answered, boundary('manual'), said, answered, boundary('auto')].join('\n');
  assert.deepEqual([triggerAt(record, 3), triggerAt(record, 6), triggerAt(record, 1), triggerAt(record, 99)], ['manual', 'auto', undefined, undefined]);
  // The plugin's line stands right before the boundary: given it, the compaction is the one after, typed as it was.
  const pluginLine = JSON.stringify({ type: 'system', subtype: 'informational', content: 'lossless-compaction: moved 1 of 1 tool results out' });
  const withLine = [said, answered, pluginLine, boundary('manual')].join('\n');
  assert.equal(triggerAt(withLine, 3), 'manual');
  assert.equal((await replay(withLine, 3, 1, 75)).byHand, true);
  // A message between the line and a boundary: that line reports no compaction. A blank line is not counted, as replay does not count it.
  assert.equal(triggerAt([said, answered, boundary('manual')].join('\n'), 2), undefined);
  assert.equal(triggerAt([said, '', answered, boundary('manual')].join('\n'), 3), 'manual');
  const [typed, started] = [await replay(record, 3, 1, 75), await replay(record, 6, 1, 75)];
  assert.deepEqual([typed.window, typed.byHand, started.window, started.byHand], [967_000, true, 967_000, false]);
  const given = await replay(record, 3, 1, 75, 167_000, false);
  assert.deepEqual([given.window, given.byHand], [167_000, false]);
});

test('what the eight working sessions replayed in a window of 1,000,000 come to, as docs/measurements.md gives them', () => {
  const measurements = readFileSync(fileURLToPath(new URL('../docs/measurements.md', import.meta.url)), 'utf8');
  const section = measurements.slice(measurements.indexOf('### Replayed at 1, 20 and 40'), measurements.indexOf('### Before and after the setting was changed'));
  const flat = section.replace(/\s+/g, ' ');
  const rows = section.split('\n').filter((line) => /^\| [A-H] \|/.test(line)).map((line) => line.split('|').map((cell) => cell.trim()).slice(1, -1));
  assert.equal(rows.length, 8);
  const n = (cell: string | undefined) => Number((cell as string).replace(/,/g, ''));
  const window = 967_000;
  // The records are not published; the arithmetic between the columns is held, and the sentences to it.
  const rowsOf = rows.map(([name, started, counted, , target, , , , , atOne, atForty]) => ({ name: String(name), typed: started === 'by hand', counted: n(counted), target: n(target), atOne: n(atOne), atForty: n(atForty) }));
  for (const row of rowsOf) {
    // The target at 40 is the window's share, or half of what the plugin counted where that is less (both rounded in the table).
    assert.ok(Math.abs(row.target - Math.min((window * 40) / 100, row.counted / 2)) <= 1, row.name);
    // Where 40 left what 1 did, what could not leave was over its target; where it left more, it had reached it.
    if (row.atForty === row.atOne) assert.ok(row.atOne > row.target, row.name);
    else assert.ok(row.atForty > row.atOne && row.atForty <= row.target && row.typed, row.name);
  }
  const same = rowsOf.filter((row) => row.atForty === row.atOne);
  assert.deepEqual([same.length, rowsOf.filter((row) => row.typed).map((row) => row.name).join('')], [7, 'BCD']);
  assert.ok(rowsOf.filter((row) => !row.typed).every((row) => row.atForty === row.atOne));
  const thousands = (value: number) => `${Math.round(value / 1000)},000`;
  const targets = rowsOf.map((row) => row.target);
  const left = rowsOf.map((row) => row.atOne);
  assert.ok(flat.includes(`so it was ${thousands(Math.min(...targets))} to ${thousands(Math.max(...targets))}`));
  assert.ok(flat.includes(`came to ${thousands(Math.min(...left))} to ${thousands(Math.max(...left))} (left at 1), over the target at 40 in seven`));
  assert.ok(flat.includes(`The target at 1 is ${(window / 100).toLocaleString('en-US')} tokens and at 20 ${((window * 20) / 100).toLocaleString('en-US')}`));
  const differs = rowsOf.find((row) => row.atForty !== row.atOne) as (typeof rowsOf)[number];
  assert.ok(flat.includes(`left ${differs.atForty.toLocaleString('en-US')} tokens where they left ${differs.atOne.toLocaleString('en-US')}, ${Math.round(((differs.atForty - differs.atOne) / differs.atOne) * 100)} % more`));
});
