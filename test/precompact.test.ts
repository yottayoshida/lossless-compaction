import assert from 'node:assert/strict';
import { test } from 'node:test';

import { preCompactHooksIn, unrunLine, unrunNotice } from '../src/precompact.ts';

const group = (matcher?: unknown) => ({ ...(matcher === undefined ? {} : { matcher }), hooks: [{ type: 'command', command: 'cp "$TRANSCRIPT" backup/' }] });
const withPreCompact = (...groups: unknown[]) => ({ hooks: { PreCompact: groups } });

test('a PreCompact hook is named unless its matcher is the other trigger exactly: empty, *, .* and manual|auto all count (#126)', () => {
  for (const matcher of [undefined, '', '*', '.*', 'manual|auto', 'manual']) {
    assert.deepEqual(preCompactHooksIn({ project: withPreCompact(group(matcher)) }, 'manual'), ['.claude/settings.json'], String(matcher));
  }
  // Claude Code would not have run these for this trigger.
  assert.deepEqual(preCompactHooksIn({ project: withPreCompact(group('auto')) }, 'manual'), []);
  assert.deepEqual(preCompactHooksIn({ project: withPreCompact(group('manual')) }, 'auto'), []);
  // One group of several that would run is enough.
  assert.deepEqual(preCompactHooksIn({ project: withPreCompact(group('auto'), group('manual')) }, 'manual'), ['.claude/settings.json']);
  // A compaction a plugin asked for leaves no matcher out.
  assert.deepEqual(preCompactHooksIn({ project: withPreCompact(group('auto')) }, 'plugin'), ['.claude/settings.json']);
});

test('each settings source is named as a person knows it, and the same hooks read twice are named once, as the first (#126)', () => {
  const read = {
    user: withPreCompact(group()),
    project: withPreCompact(group('*')),
    local: withPreCompact(group('')),
    flag: withPreCompact(group('.*')),
    policy: withPreCompact(group('manual|auto')),
  };
  // The user file is where CLAUDE_CONFIG_DIR says: not named by a path.
  assert.deepEqual(preCompactHooksIn(read, 'auto'), ['your user settings', '.claude/settings.json', '.claude/settings.local.json', '--settings', 'managed settings']);
  // Started in the home directory, the project file is the user file.
  const home = withPreCompact(group());
  assert.deepEqual(preCompactHooksIn({ user: home, project: JSON.parse(JSON.stringify(home)) }, 'auto'), ['your user settings']);
  // A Claude Code that answered a source it does not know with the merge: the project's hooks are not named as --settings.
  const project = { env: { A: '1' }, ...withPreCompact(group('*')) };
  assert.deepEqual(preCompactHooksIn({ project, flag: { ...project, permissions: {} } }, 'manual'), ['.claude/settings.json']);
  // A merge that holds the groups of two files, joined: neither is named again.
  const [a, b] = [group('manual'), group('*')];
  assert.deepEqual(preCompactHooksIn({ user: withPreCompact(a), project: withPreCompact(b), flag: withPreCompact(a, b), policy: withPreCompact(b, a) }, 'manual'), ['your user settings', '.claude/settings.json']);
  // One group not seen before is enough to name a source that also holds one that was.
  assert.deepEqual(preCompactHooksIn({ user: withPreCompact(a), local: withPreCompact(a, group('')) }, 'manual'), ['your user settings', '.claude/settings.local.json']);
});

test('settings with no PreCompact hook, or not read, or not shaped as settings, name nothing (#126)', () => {
  assert.deepEqual(preCompactHooksIn({}, 'manual'), []);
  assert.deepEqual(preCompactHooksIn({ user: {}, project: { hooks: { PostCompact: [group()], SessionStart: [group('compact')] } } }, 'manual'), []);
  assert.deepEqual(preCompactHooksIn({ project: withPreCompact({ matcher: 'manual', hooks: [] }) }, 'manual'), [], 'a group with no hook');
  for (const odd of [null, 'text', 3, [], { hooks: 'x' }, { hooks: { PreCompact: 'x' } }, { hooks: { PreCompact: [null, 'x', 3] } }]) {
    assert.deepEqual(preCompactHooksIn({ project: odd }, 'manual'), [], JSON.stringify(odd));
  }
});

test('the line names the files, says why, and where the docs say what to use instead, without the command (#126)', () => {
  const line = unrunLine(['~/.claude/settings.json', '.claude/settings.json']);
  assert.match(line, /^your PreCompact hooks did not run: Claude Code runs them only before its own summary/);
  assert.match(line, /\(~\/\.claude\/settings\.json, \.claude\/settings\.json\)/);
  assert.match(line, /SessionStart with the matcher compact runs after either/);
  assert.match(line, /docs\/limits\.md, "Other hooks at a compaction"/);
  assert.ok(!line.includes('backup'));
  // The notice is short enough that one cut at the width of the screen still shows where.
  assert.equal(unrunNotice(['.claude/settings.json']), 'your PreCompact hooks did not run (.claude/settings.json)');
});
