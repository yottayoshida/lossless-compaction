import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { logLine } from '../bench/fixtures.ts';
import { NOT_AN_ID, NOT_STORED } from '../src/store.ts';
import { ASKS, defaultFrom, AUTO_LINE, LOGS, MARKS, REMOVED, REWRITTEN, RULE, SESSION_VERSION, SETTINGS, type SessionRun, type Turn, callsIn, figuresOf, logPath, longMessage, recalledIn, recallsTable, scriptOf, sessionReport, sessionTable, sessionsUnder } from '../bench/session.ts';

const usage = (costUSD: number) => ({ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD, thinkingTokens: 0 });
const request = (read: number, written: number, fresh = 5) => ({ fresh, read, written });

test('the script: every log is read once, a log is removed or written again right after it is read, and a question comes only after what it asks of is gone', () => {
  const steps = scriptOf('x');
  assert.deepEqual(steps.filter((step) => step.kind === 'read').map((step) => (step.kind === 'read' ? step.log : 0)), Array.from({ length: LOGS }, (_, i) => i + 1));
  for (const log of REMOVED) {
    const read = steps.findIndex((step) => step.kind === 'read' && step.log === log);
    assert.deepEqual(steps[read + 1], { kind: 'remove', log });
  }
  assert.deepEqual(steps[steps.findIndex((step) => step.kind === 'read' && step.log === REWRITTEN) + 1], { kind: 'rewrite', log: REWRITTEN });
  // A question about a removed log is asked at least six logs after the log was read: by then other logs have been read on top of it.
  for (const log of REMOVED) {
    const ask = ASKS.find((one) => one.id === `gone-${log}`);
    assert.ok(ask !== undefined && ask.after >= log + 6, `gone-${log}`);
    assert.ok(ask.needles[0]?.startsWith(`record ${log}-`));
  }
  // What the written-again log is asked for is its line as read, which the file no longer holds.
  const then = ASKS.find((one) => one.id === `then-${REWRITTEN}`);
  assert.deepEqual(then?.needles, [logLine(REWRITTEN, 222, 1)]);
  assert.notEqual(logLine(REWRITTEN, 222, 1), logLine(REWRITTEN, 222, 2));
  // The tag is in the first message and nowhere else, so that two sessions share no more than what is before it.
  assert.ok(steps[0]?.kind === 'say' && steps[0].text.includes('(Session x.)'));
  assert.equal(JSON.stringify(scriptOf('x').slice(1)), JSON.stringify(scriptOf('y').slice(1)));
  assert.equal(logPath(4), 'logs/log-04.txt');
});

test('the long message holds the rule in a middle paragraph only, and is long enough for its middle to leave', () => {
  const paragraphs = longMessage().split('\n\n');
  assert.equal(paragraphs.length, 7);
  assert.equal(paragraphs.indexOf(RULE), 3);
  // Neither the first nor the last 500 characters hold it: with its middle gone, the rule is out of the agent's sight (ADR 0024).
  assert.ok(longMessage().length >= 2000);
  assert.ok(!longMessage().slice(0, 500).includes('OVER') && !longMessage().slice(-500).includes('OVER'));
  // No log and no other step says it.
  assert.ok(!JSON.stringify(scriptOf('x').filter((step) => step.kind !== 'say' && step.kind !== 'ask')).includes('OVER'));
});

test('the settings: the three targets differ only in targetPercent, and the one that hands over types its /compact where Claude Code would compact', () => {
  assert.deepEqual(Object.keys(SETTINGS), ['builtin', 'target-40', 'target-20', 'target-1', 'hybrid']);
  assert.deepEqual([SETTINGS['target-40']?.options, SETTINGS['target-20']?.options, SETTINGS['target-1']?.options], [{ targetPercent: 40 }, { targetPercent: 20 }, { targetPercent: 1 }]);
  assert.deepEqual(SETTINGS['hybrid'], { name: 'hybrid', arm: 'plugin', options: { targetPercent: 1, maxAfterPercent: 10 }, manual: AUTO_LINE });
  assert.equal(SETTINGS['builtin']?.arm, 'builtin');
});

const runOf = (setting: string, run: number, turns: Turn[]): SessionRun => ({ version: 1, setting, arm: setting === 'builtin' ? 'builtin' : 'plugin', options: null, model: 'm', run, plugin: null, pluginCommit: null, claudeCode: '2.1.289', at: '', turns });

test('the figures of a run: the request right after a compaction is the next one sent, in its turn or in the next', () => {
  const line = { outcome: 'moved' as const, moved: 3, results: 9, images: 0, charsBefore: 9, charsAfter: 5, ms: 60 };
  const turns: Turn[] = [
    { step: 0, kind: 'say', requests: [request(0, 9000)], own: usage(0.1), wallMs: 1000, calls: [] },
    // Compacted on its own before the turn's second request: that request is the first after it.
    { step: 1, kind: 'read', requests: [request(9000, 100), request(19000, 52000)], compaction: { trigger: 'auto', inUse: 9105, preTokens: 170000, postTokens: 60000, durationMs: 200, at: 1, line }, own: usage(0.5), wallMs: 4000, calls: ['Read'] },
    // Typed by the driver: the turn sends nothing, and the next turn's first request is the first after it.
    { step: 2, kind: 'compact', requests: [], compaction: { trigger: 'manual', inUse: 71005, preTokens: 160000, postTokens: 20000, durationMs: 21000, at: 0, line: { ...line, outcome: 'too-much' } }, own: usage(0.3), wallMs: 22000, calls: [] },
    { step: 2, kind: 'ask', id: 'gone-4', requests: [request(19000, 8000), request(27000, 300)], own: usage(0.2), wallMs: 3000, answer: 'x', right: true, calls: ['mcp__lossless-compaction__recall'] },
    { step: 3, kind: 'ask', id: 'rule', requests: [], own: usage(0), wallMs: 0, refused: true, right: false, calls: [] },
  ];
  const figures = figuresOf(runOf('target-40', 1, turns));
  assert.deepEqual(figures.compactions, [
    { trigger: 'auto', before: 170000, after: 71005, read: 19000, written: 52000, ms: 200, outcome: 'moved' },
    { trigger: 'manual', before: 71005, after: 27005, read: 19000, written: 8000, ms: 21000, outcome: 'too-much' },
  ]);
  assert.deepEqual([figures.asked, figures.right, figures.refused, figures.recalls, figures.requests], [2, 1, 1, 1, 5]);
  assert.equal(figures.costUSD.toFixed(2), '1.10');
  assert.equal(figures.seconds, 30);
  assert.equal(figures.sent, 9005 + 9105 + 71005 + 27005 + 27305);
  // What it had cost by a log: every turn up to the read of that log, the read with it; not given where the log was not reached.
  const stepOf = (log: number) => scriptOf('').findIndex((step) => step.kind === 'read' && step.log === log);
  const reads = (log: number, cost: number): Turn => ({ step: stepOf(log), kind: 'read', requests: [request(1, 1)], own: usage(cost), wallMs: 0, calls: [] });
  const outside: Turn = { step: stepOf(24) + 1, kind: 'ask', id: 'gone-4', requests: [request(1, 1)], own: usage(0.5), wallMs: 0, answer: 'x', right: true, outside: true, calls: ['Read'] };
  const partial = figuresOf(runOf('builtin', 1, [reads(23, 1), reads(24, 2), outside, reads(30, 4)]));
  assert.deepEqual(MARKS, [24, 30, 36]);
  assert.deepEqual(partial.costAt, [3, 7.5, NaN]);
  assert.equal(partial.rightOutside, 1);
  // A compaction with no request after it, the session's last turn, has no figures of one.
  const last = figuresOf(runOf('builtin', 1, [{ step: 0, kind: 'read', requests: [request(1, 2)], compaction: { trigger: 'auto', inUse: 8, preTokens: 9, postTokens: 3, durationMs: 1, at: 1, line: null }, own: usage(0), wallMs: 0, calls: [] }]));
  assert.deepEqual(last.compactions, [{ trigger: 'auto', before: 9, after: null, read: null, written: null, ms: 1, outcome: 'summary' }]);
});

test('the table: a row a setting in a fixed order, each run in turn', () => {
  const turn = (cost: number, right: boolean): Turn[] => [
    { step: 1, kind: 'read', requests: [request(100, 50), request(10, 40)], compaction: { trigger: 'auto', inUse: 1000, preTokens: 1000, postTokens: 400, durationMs: 9, at: 1, line: null }, own: usage(cost), wallMs: 2000, calls: [] },
    { step: 2, kind: 'ask', id: 'rule', requests: [request(60, 0)], own: usage(0), wallMs: 1000, answer: '', right, calls: [] },
  ];
  const rows = sessionTable([runOf('target-1', 2, turn(2, false)), runOf('builtin', 1, turn(3, true)), runOf('target-1', 1, turn(1.5, true))]).split('\n');
  assert.deepEqual(rows.slice(2), [
    '| builtin | 1 | 1 | 1000 | 55 | 10 | 40 | 92 | 1/1 | 0 | 0 | — | — | 3.00 | 3 |',
    '| target-1 | 2 | 1, 1 | 1000, 1000 | 55, 55 | 10, 10 | 40, 40 | 92, 92 | 1/1, 0/1 | 0, 0 | 0, 0 | —, — | —, — | 1.50, 2.00 | 3, 3 |',
  ]);
});

const SESSION_AT = fileURLToPath(new URL('../bench/results/2026-10-05-session', import.meta.url));

test('the sessions that were measured: the table made from them, and every figure docs/measurements.md gives of them', () => {
  const flat = (text: string) => text.replace(/\s+/g, ' ');
  const measurements = readFileSync(fileURLToPath(new URL('../docs/measurements.md', import.meta.url)), 'utf8');
  const section = measurements.slice(measurements.indexOf('## One session that compacts several times, under each setting'));
  const has = (phrase: string) => assert.ok(flat(section).includes(phrase), phrase);
  const runs = sessionsUnder(SESSION_AT);
  // Two runs of each of the five, of this script, with Sonnet 5.5, on one state of the plugin's code; nothing of the machine.
  assert.deepEqual(runs.map((run) => `${run.setting} ${run.run}`).sort(), ['builtin', 'hybrid', 'target-1', 'target-20', 'target-40'].flatMap((name) => [`${name} 1`, `${name} 2`]));
  assert.ok(runs.every((run) => run.version === SESSION_VERSION && run.model === 'claude-sonnet-5-5' && run.claudeCode === '2.1.289' && run.plugin === (run.arm === 'plugin' ? '23ff90df6625' : null)));
  has('(code `23ff90df6625`) and Claude Code 2.1.289');
  assert.ok(!/\/Users\/|\/home\/|\.cctmp/.test(JSON.stringify(runs)));
  // Each ran the whole script: thirty-six logs read and the six questions asked, none refused.
  for (const run of runs) {
    assert.equal(run.turns.filter((turn) => turn.kind === 'read').length, LOGS, `${run.setting} ${run.run}`);
    assert.deepEqual(run.turns.filter((turn) => turn.kind === 'ask').map((turn) => turn.id), ASKS.map((ask) => ask.id));
    assert.ok(run.turns.every((turn) => turn.refused !== true));
  }
  // The table is these runs and nothing else, in the file and in the document.
  const table = sessionTable(runs);
  assert.equal(`${table}\n`, readFileSync(`${SESSION_AT}/report.md`, 'utf8'));
  for (const row of table.split('\n')) assert.ok(section.includes(row), row);

  const of = (setting: string) => runs.filter((run) => run.setting === setting).sort((a, b) => a.run - b.run);
  const figures = (setting: string) => of(setting).map(figuresOf);
  const compactions = (setting: string) => of(setting).flatMap((run) => run.turns.flatMap((turn) => (turn.compaction === undefined ? [] : [turn.compaction])));
  // How each compacted: Claude Code on its own but for `hybrid`, typed by the driver and handed to the summary; the targets moved out and no summary ran.
  for (const setting of ['target-40', 'target-20', 'target-1']) assert.ok(compactions(setting).every((one) => one.trigger === 'auto' && one.line?.outcome === 'moved' && one.line.bodies === undefined), setting);
  assert.ok(compactions('hybrid').every((one) => one.trigger === 'manual' && one.line?.outcome === 'too-much'));
  assert.ok(compactions('builtin').every((one) => one.trigger === 'auto' && one.line === null));
  // What the text under the table says.
  assert.deepEqual(figures('target-40').map((one) => one.compactions.length), [5, 5]);
  assert.deepEqual([...new Set(compactions('target-40').map((one) => one.line?.moved))].sort(), [7, 8]);
  assert.deepEqual([...new Set([...compactions('target-20'), ...compactions('target-1')].map((one) => one.line?.moved))], [10]);
  const usd = (setting: string) => figures(setting).map((one) => one.costUSD.toFixed(2));
  has(`${usd('target-40').join(' and ')} USD at 40 against ${Math.min(...[...usd('target-20'), ...usd('target-1')].map(Number)).toFixed(2)} to ${Math.max(...[...usd('target-20'), ...usd('target-1')].map(Number)).toFixed(2)} at 20 and at 1`);
  for (const at of [0, 1]) {
    const dear = Math.min(...figures('target-40').map((one) => one.costAt[at] as number));
    assert.ok([...figures('target-20'), ...figures('target-1')].every((one) => (one.costAt[at] as number) < dear), `cheaper by log ${MARKS[at]}`);
  }
  has(`cost least, ${[...usd('builtin')].sort().join(' and ')} USD`);
  assert.ok(Math.max(...usd('builtin').map(Number)) <= Math.min(...['target-40', 'target-20', 'target-1', 'hybrid'].flatMap(usd).map(Number)));
  assert.deepEqual(figures('builtin').map((one) => [one.right, one.rightOutside]), [[5, 3], [5, 3]]);
  assert.ok(['target-40', 'target-20', 'target-1', 'hybrid'].every((setting) => figures(setting).every((one) => one.rightOutside === 0)));
  has(`answered every question, for ${usd('hybrid').join(' and ')} USD`);
  const waits = compactions('hybrid').map((one) => Math.round(one.durationMs / 1000));
  has(`waited for a summary, ${Math.min(...waits)} to ${Math.max(...waits)} seconds`);
  assert.deepEqual(figures('hybrid').map((one) => one.right), [6, 6]);
  // The answers missed: the first removed log, at 40 in one run and at 1 in one, after `recall` was called; the built-in's, one a run.
  const missed = (setting: string) => of(setting).flatMap((run) => run.turns.filter((turn) => turn.kind === 'ask' && turn.right !== true).map((turn) => `${run.run} ${turn.id} ${turn.calls.filter((name) => name.endsWith('__recall')).length > 0}`));
  assert.deepEqual([missed('target-40'), missed('target-1'), missed('target-20'), missed('hybrid')], [['2 gone-4 true'], ['1 gone-4 true'], [], []]);
  assert.deepEqual(missed('builtin'), ['1 then-8 false', '2 gone-4 false']);
  const recalls = ['target-40', 'target-20', 'target-1', 'hybrid'].flatMap((setting) => figures(setting).map((one) => one.recalls));
  has(`\`recall\`, ${Math.min(...recalls)} to ${Math.max(...recalls)} calls a run`);
  // The rule: right in all ten, with no call but under `hybrid`.
  const rule = (setting: string) => of(setting).map((run) => run.turns.find((turn) => turn.id === 'rule') as Turn);
  assert.ok(runs.every((run) => run.turns.find((turn) => turn.id === 'rule')?.right === true));
  assert.ok(['builtin', 'target-40', 'target-20', 'target-1'].every((setting) => rule(setting).every((turn) => turn.calls.length === 0)));
  has(`with ${rule('hybrid').map((turn) => turn.calls.filter((name) => name.endsWith('__recall')).length).join(' and ')} calls to \`recall\``);
  // The two runs of a setting are within 5 % of each other.
  for (const setting of ['builtin', 'target-40', 'target-20', 'target-1', 'hybrid']) {
    const [a, b] = figures(setting).map((one) => one.costUSD) as [number, number];
    assert.ok(Math.abs(a - b) / Math.min(a, b) < 0.05, setting);
  }
});

test('the calls of a turn are those of the responses it was sent: what a compaction prints again of earlier turns is not', () => {
  const said = (id: string, callId: string, name: string, tokens: number) => JSON.stringify({ type: 'assistant', message: { id, usage: { input_tokens: tokens }, content: [{ type: 'tool_use', id: callId, name, input: {} }] } });
  assert.deepEqual(callsIn([said('m1', 't1', 'Read', 10), said('m1', 't1', 'Read', 10), said('old', 't0', 'Grep', 0), 'not json', said('m2', 't2', 'mcp__lossless-compaction__recall', 4)].join('\n')), ['Read', 'mcp__lossless-compaction__recall']);
});

test('the rule for the default of targetPercent: 1 only where every condition holds against 40, and 40 where any one does not', () => {
  // A run that read to each mark at a cost, then cost `rest` more, and answered `right` of two questions.
  const stepOf = (log: number) => scriptOf('').findIndex((step) => step.kind === 'read' && step.log === log);
  const made = (setting: string, run: number, at24: number, at30: number, total: number, right: number): SessionRun =>
    runOf(setting, run, [
      { step: stepOf(24), kind: 'read', requests: [request(1, 1)], own: usage(at24), wallMs: 0, calls: [] },
      { step: stepOf(30), kind: 'read', requests: [request(1, 1)], own: usage(at30 - at24), wallMs: 0, calls: [] },
      { step: stepOf(36), kind: 'read', requests: [request(1, 1)], own: usage(total - at30), wallMs: 0, calls: [] },
      ...[0, 1].map((n): Turn => ({ step: stepOf(36) + 1 + n, kind: 'ask', id: `q${n}`, requests: [], own: usage(0), wallMs: 0, answer: '', right: n < right, calls: [] })),
    ]);
  const forty = [made('target-40', 1, 3, 4, 5, 2), made('target-40', 2, 3, 4, 5.2, 2)];
  const ruled = (one: SessionRun[]) => defaultFrom([...forty, ...one]);
  // Cheaper in both, by more than 5 %, as many right, cheaper on the way.
  assert.deepEqual(ruled([made('target-1', 1, 2.5, 3.3, 4.2, 2), made('target-1', 2, 2.4, 3.2, 4, 1)]), { targetPercent: 1, cheaperInBoth: true, byFivePercent: true, asManyRight: true, cheaperOnTheWay: true });
  // One run at 1 no cheaper than the cheapest at 40.
  assert.deepEqual(ruled([made('target-1', 1, 2.5, 3.3, 5.1, 2), made('target-1', 2, 2.4, 3.2, 3, 2)]), { targetPercent: 40, cheaperInBoth: false, byFivePercent: true, asManyRight: true, cheaperOnTheWay: true });
  // Cheaper in both, but by less than 5 % on average.
  assert.deepEqual(ruled([made('target-1', 1, 2.5, 3.3, 4.95, 2), made('target-1', 2, 2.4, 3.2, 4.9, 2)]), { targetPercent: 40, cheaperInBoth: true, byFivePercent: false, asManyRight: true, cheaperOnTheWay: true });
  // More than one answer fewer on average.
  assert.deepEqual(ruled([made('target-1', 1, 2.5, 3.3, 4.2, 0), made('target-1', 2, 2.4, 3.2, 4, 1)]), { targetPercent: 40, cheaperInBoth: true, byFivePercent: true, asManyRight: false, cheaperOnTheWay: true });
  // Exactly one answer fewer on average is as many as the rule asks.
  assert.equal(ruled([made('target-1', 1, 2.5, 3.3, 4.2, 1), made('target-1', 2, 2.4, 3.2, 4, 1)]).targetPercent, 1);
  // Cheaper at the end and by the thirtieth log, and not by the twenty-fourth.
  assert.deepEqual(ruled([made('target-1', 1, 3.1, 3.3, 4.2, 2), made('target-1', 2, 2.4, 3.2, 4, 2)]), { targetPercent: 40, cheaperInBoth: true, byFivePercent: true, asManyRight: true, cheaperOnTheWay: false });
  // Cheaper at the end and not by the thirtieth log: the end alone decided it.
  assert.deepEqual(ruled([made('target-1', 1, 2.5, 4.1, 4.2, 2), made('target-1', 2, 2.4, 3.2, 4, 2)]), { targetPercent: 40, cheaperInBoth: true, byFivePercent: true, asManyRight: true, cheaperOnTheWay: false });
  // One run of each decides nothing.
  assert.equal(defaultFrom([forty[0] as SessionRun, made('target-1', 1, 1, 1, 1, 2)]).targetPercent, 40);
});

test("the default of targetPercent is what the rule gives of the sessions published, and the manifest and the code give the same", () => {
  const ruling = defaultFrom(sessionsUnder(fileURLToPath(new URL('../bench/results/2026-10-05-session', import.meta.url))));
  assert.deepEqual(ruling, { targetPercent: 1, cheaperInBoth: true, byFivePercent: true, asManyRight: true, cheaperOnTheWay: true });
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../.claude-plugin/plugin.json', import.meta.url)), 'utf8')) as { userConfig: Record<string, { default?: unknown }> };
  assert.equal(manifest.userConfig['targetPercent']?.default, ruling.targetPercent);
  // The decision record gives the figures the rule was applied to.
  const adr = readFileSync(fileURLToPath(new URL('../docs/adr/0025-everything-that-may-leave-does.md', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  assert.ok(adr.includes('It held: 4.23 and 4.03 USD at 1 against 5.02 and 5.13 at 40, 81 % on average'));
});

test('each call to recall a turn sent is recorded with the id handed and whether it was refused, and tabled for the runs that recorded them (#107)', () => {
  const sent = (uses: { id: string; given: unknown }[], usage = 10) =>
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: usage }, content: uses.map((use) => ({ type: 'tool_use', id: use.id, name: 'mcp__lossless-compaction__recall', input: { id: use.given } })) } });
  const answered = (id: string, content: unknown) => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } });
  const id = '6c7cc4406e6e8fb60cea6af41ecebabf800a6089e1b0ae27489e5ada8ef3b822';
  const text = [
    sent([{ id: 'a', given: '6c7cc4406e8\n6c7cc4406e8' }, { id: 'b', given: id }]),
    answered('a', `[lossless-compaction] ${NOT_AN_ID}\nThe tickets of this conversation it may stand for:`),
    answered('b', [{ type: 'text', text: 'line 1 of the log' }]),
    sent([{ id: 'c', given: '/Users/someone/notes.txt' }, { id: 'd', given: 'f'.repeat(64) }]),
    answered('c', `[lossless-compaction] ${NOT_AN_ID}`),
    answered('d', `[lossless-compaction] ${NOT_STORED}`),
    // Printed again after a compaction, with no usage: not this turn's call.
    sent([{ id: 'e', given: '1234' }], 0),
    answered('e', `[lossless-compaction] ${NOT_AN_ID}`),
  ].join('\n');
  assert.deepEqual(recalledIn(text), [
    { given: '6c7cc4406e8\n6c7cc4406e8', refused: true },
    { given: id, refused: false },
    // What is no id is kept by its length only: it can be a path of the machine.
    { given: '(no id: 24 characters)', refused: true },
    { given: 'f'.repeat(64), refused: true },
  ]);

  const turnOf = (recalled?: { given: string; refused: boolean }[]): Turn => ({ step: 1, kind: 'ask', requests: [request(10, 0)], own: usage(0.1), wallMs: 1, calls: [], ...(recalled !== undefined ? { recalled } : {}) });
  const runs = [
    runOf('target-1', 1, [turnOf(recalledIn(text))]),
    runOf('target-1', 2, [turnOf([])]),
    runOf('target-40', 1, [turnOf()]),
  ];
  assert.deepEqual(recallsTable(runs).split('\n').slice(2), ['| target-1 | 2 | 4, 0 | 3, 0 | 2, 0 |']);
  // Printed after the table only where a run recorded them: the runs published before it print as they did.
  assert.ok(sessionReport(runs).includes('| Setting | Runs | \`recall\` calls | Refused |'));
  assert.equal(sessionReport([runOf('target-40', 1, [turnOf()])]), `${sessionTable([runOf('target-40', 1, [turnOf()])])}\n`);
});

const IDS_AT = fileURLToPath(new URL('../bench/results/2026-10-06-session-ids', import.meta.url));

test('the session driven again for #107: its tables, the ids handed to recall, and every figure docs/measurements.md gives of them', () => {
  const flat = (text: string) => text.replace(/\s+/g, ' ');
  const measurements = readFileSync(fileURLToPath(new URL('../docs/measurements.md', import.meta.url)), 'utf8');
  const section = measurements.slice(measurements.indexOf('## Ids copied wrong in one session that compacts several times'), measurements.indexOf('## The six kinds of conversation, at 40 and at 1'));
  const has = (phrase: string) => assert.ok(flat(section).includes(phrase), phrase);
  const runs = sessionsUnder(IDS_AT);
  // Three runs at 1 and three at 40, of this script, with Sonnet 5.5, on one state of the plugin's code; nothing of the machine.
  assert.deepEqual(runs.map((run) => `${run.setting} ${run.run}`).sort(), ['target-1 1', 'target-1 2', 'target-1 3', 'target-40 1', 'target-40 2', 'target-40 3']);
  assert.ok(runs.every((run) => run.version === SESSION_VERSION && run.model === 'claude-sonnet-5-5' && run.claudeCode === '2.1.291' && run.plugin === 'e1d108539619'));
  has('(code `e1d108539619`) and Claude Code 2.1.291');
  assert.ok(!/\/Users\/|\/home\/|\.cctmp/.test(JSON.stringify(runs)));
  // The tables are these runs, in the file and in the document.
  const report = sessionReport(runs);
  assert.equal(report, readFileSync(`${IDS_AT}/report.md`, 'utf8'));
  for (const row of report.trim().split('\n').filter((line) => line.startsWith('|'))) assert.ok(section.includes(row), row);

  // Every call recorded, and every question asked and answered right.
  const recalled = runs.flatMap((run) => run.turns.flatMap((turn) => (turn.recalled ?? []).map((one) => ({ ...one, run: `${run.setting} ${run.run}`, turn: turn.id }))));
  assert.ok(runs.every((run) => run.turns.every((turn) => turn.recalled !== undefined)));
  assert.equal(recalled.length, 33);
  has('Of the 33 calls to `recall`');
  assert.equal(recalled.filter((one) => one.refused).length, 0);
  has('None was refused');
  assert.equal(runs.reduce((total, run) => total + figuresOf(run).right, 0), 36);
  has('36 of 36');
  // The two that were no whole id: the same 62 characters as on 2026-10-05, at the same question, taken (not refused) and answered right.
  const copied = recalled.filter((one) => !/^[0-9a-f]{64}$/.test(one.given));
  const measured = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/copied-ids.json', import.meta.url)), 'utf8')) as { meant: string; refused: { given: string }[] };
  assert.deepEqual(copied.map((one) => [one.run, one.turn, one.given.length]), [['target-1 2', 'gone-4', 62], ['target-40 2', 'gone-4', 62]]);
  assert.ok(copied.every((one) => measured.refused.some((then) => then.given === one.given) && one.given.startsWith(measured.meant.slice(0, 10)) && !one.refused));
  for (const one of copied) {
    const run = runs.find((each) => `${each.setting} ${each.run}` === one.run);
    assert.equal(run?.turns.find((turn) => turn.id === 'gone-4')?.right, true, one.run);
  }
  has('The other 2, in the second run at 1 and the second run at 40, handed the same 62 characters as on 2026-10-05');
  // The CHANGELOG and the limits say the same.
  const changelog = flat(readFileSync(fileURLToPath(new URL('../CHANGELOG.md', import.meta.url)), 'utf8'));
  assert.ok(changelog.includes('the same 62 characters were handed twice in 33 calls to `recall`, and taken both times'));
  const limits = flat(readFileSync(fileURLToPath(new URL('../docs/limits.md', import.meta.url)), 'utf8'));
  assert.ok(limits.includes('the same copy came twice in 33 calls and was taken both times'));
});
