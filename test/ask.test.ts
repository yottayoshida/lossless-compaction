import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  CHARS_PER_REQUEST,
  OPTIONS_PER_REQUEST,
  batchesFor,
  choose,
  digest,
  inputLine,
  providerFrom,
  readProbabilities,
  redact,
  requestFor,
  stateFor,
  type Option,
} from '../src/ask.ts';
import { ok, output, questionsOf, recordingHttp, type Sent } from './helpers.ts';

// Put together here so that no line of this file has the shape of a real credential.
const FAKE = {
  github: ['gh', 'p_', 'a1B2c3D4'.repeat(5)].join(''),
  openai: ['s', 'k-', 'x9Y8z7W6'.repeat(4)].join(''),
  aws: ['AK', 'IA', 'ABCDEFGHIJKLMNOP'].join(''),
  jwt: ['eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJ', 'zdWIiOiIxMjM0NTY3ODkwIn0', '.', 'c2lnbmF0dXJlLWhlcmU'].join(''),
  password: ['hunter2', 'swordfish'].join('-'),
};

const TYPESAFE = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as const;

const options = (count: number, chars = 100): Option[] =>
  Array.from({ length: count }, (_, i) => ({ key: `t${i + 1}`, text: `option ${i + 1} ${'x'.repeat(chars)}` }));

/** The keys of the one choice question a request carries. */
function keysOf(sent: Sent): string[] {
  const question = questionsOf(sent)['q'] as { criteria?: Record<string, string> } | undefined;
  return Object.keys(question?.criteria ?? {});
}

/** An answer that gives every key the same probability but `winner`, which gets `p`. */
function peaked(keys: readonly string[], winner: string | null, p = 0.9) {
  const rest = keys.length > 1 ? (winner === null ? 1 : 1 - p) / (winner === null ? keys.length : keys.length - 1) : 1;
  return ok({ answers: { q: { type: 'choice', choice: winner ?? keys[0], probabilities: Object.fromEntries(keys.map((key) => [key, key === winner ? p : rest])) } } });
}

test('the shapes of secrets are blanked, and ordinary text is left as it is', () => {
  const lines = [
    `GITHUB=${FAKE.github}`,
    `export OPENAI_API_KEY="${FAKE.openai}"`,
    `aws_access_key_id = ${FAKE.aws}`,
    `Authorization: Bearer ${FAKE.jwt}`,
    `db_password: ${FAKE.password}`,
    `postgres://admin:${FAKE.password}@db.internal:5432/app`,
    `https://bucket.example/file?X-Amz-Signature=${'f'.repeat(64)}&other=1`,
    ['-----BEGIN', ' PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END', ' PRIVATE KEY-----'].join(''),
  ];
  const blanked = redact(lines.join('\n'));

  for (const secret of [...Object.values(FAKE), 'f'.repeat(64), 'MIIEvQIBADANBg']) {
    assert.ok(!blanked.includes(secret), `still there: ${secret.slice(0, 6)}...`);
  }
  assert.ok(blanked.includes('db.internal:5432/app'));
  assert.ok(blanked.includes('other=1'));

  const plain = 'test parser > handles nested arrays\n  expected 3 tokens, received 4';
  assert.equal(redact(plain), plain);
});

test('a secret that straddles a cut leaves no piece behind', () => {
  // The line is cut at 200 characters, in the middle of the credential.
  const line = `${'x'.repeat(190)} ${FAKE.github}`;
  const text = [line, ...output('log', 30).split('\n')].join('\n');

  const shown = digest(text);

  for (let at = 0; at + 8 <= FAKE.github.length; at += 1) {
    assert.ok(!shown.includes(FAKE.github.slice(at, at + 8)), `piece at ${at}`);
  }
  // What cutting first would have shown: a piece too short for any shape to match.
  assert.ok(redact(line.slice(0, 200)).includes(FAKE.github.slice(0, 8)));
});

test('a digest keeps the head, the tail and the lines between them that look like failures', () => {
  const lines = output('build', 60).split('\n');
  lines[30] = 'ERROR: migration 0042 failed';

  const shown = digest(lines.join('\n'));

  assert.ok(shown.startsWith('build line 1:'));
  assert.ok(shown.includes('ERROR: migration 0042 failed'));
  assert.ok(shown.includes('build line 60:'));
  assert.ok(!shown.includes('build line 20:'));
  assert.ok(shown.length <= 700);
});

test('the question is blanked before it is sent, and the state holds nothing else', () => {
  const state = stateFor(`The result of the deploy with token=${FAKE.password}`);

  assert.ok(!JSON.stringify(state).includes(FAKE.password));
  assert.deepEqual(Object.keys(state), ['task', 'judging']);
  assert.ok(state.task.includes('The result of the deploy'));
});

test('options are grouped so that no request holds more than it may, by count or by size', () => {
  const byCount = batchesFor(options(200));
  assert.deepEqual(
    byCount.map((batch) => batch.length),
    [OPTIONS_PER_REQUEST, OPTIONS_PER_REQUEST, 200 - 2 * OPTIONS_PER_REQUEST],
  );

  const bySize = batchesFor(options(20, 10_000));
  assert.ok(bySize.length > 1);
  assert.equal(bySize.flat().length, 20);
  for (const batch of bySize) {
    assert.ok(batch.reduce((sum, option) => sum + option.text.length, 0) <= CHARS_PER_REQUEST);
  }
  // One option larger than a request may be still goes, on its own.
  assert.equal(batchesFor(options(1, CHARS_PER_REQUEST + 1)).length, 1);
});

test('a setting is read before the environment, and each key goes to its own provider only', () => {
  const env = { TYPESAFE_API_KEY: 'from-env-typesafe', CLOUDFLARE_API_TOKEN: 'from-env-cloudflare' };
  const account = 'a'.repeat(32);

  assert.deepEqual(providerFrom({ apiKey: 'from-setting' }, env), {
    kind: 'typesafe',
    key: 'from-setting',
    model: 'jev-latest',
  });
  assert.deepEqual(providerFrom({ provider: 'typesafe' }, env), { kind: 'typesafe', key: 'from-env-typesafe', model: 'jev-latest' });
  assert.deepEqual(providerFrom({ provider: 'cloudflare', cloudflareAccountId: account }, env), {
    kind: 'cloudflare',
    key: 'from-env-cloudflare',
    accountId: account,
  });
  // No key for the chosen provider: nothing is sent, whatever other keys are around.
  assert.equal(providerFrom({}, { CLOUDFLARE_API_TOKEN: 'from-env-cloudflare' }), null);
  assert.equal(providerFrom({ provider: 'cloudflare', cloudflareAccountId: account }, { TYPESAFE_API_KEY: 'x' }), null);
  assert.equal(providerFrom({ apiKey: '   ' }, {}), null);
});

test('a key in the environment is used only where the plugin\'s own settings chose the provider (#103)', () => {
  const account = 'a'.repeat(32);
  const env = { TYPESAFE_API_KEY: 'from-env-typesafe', CLOUDFLARE_API_TOKEN: 'from-env-cloudflare' };

  // Left on auto with no account id, as the settings arrive untouched: a key exported for another tool sends nothing.
  assert.equal(providerFrom({}, env), null);
  // `provider` set by hand, or an account id entered, is a choice made in the plugin's settings.
  assert.deepEqual(providerFrom({ provider: 'typesafe' }, env), { kind: 'typesafe', key: 'from-env-typesafe', model: 'jev-latest' });
  assert.deepEqual(providerFrom({ cloudflareAccountId: account }, env), { kind: 'cloudflare', key: 'from-env-cloudflare', accountId: account });
});

test("a secret in a call's input is blanked whether a quote stands before it or a field's name", () => {
  const name = ['API', 'KEY'].join('_');
  const value = ['abcd', 'EFGH', '1234', 'secret'].join('');
  // Written as JSON, the quote after `=` becomes `\"`, which the shapes do not expect.
  const quoted = inputLine({ command: `export ${name}="${value}"` });
  const named = inputLine({ [['pass', 'word'].join('')]: value });
  const nested = inputLine({ env: [{ [name]: value }] });

  for (const line of [quoted, named, nested]) {
    assert.ok(!line.includes(value), line);
    assert.ok(line.includes('[redacted]'), line);
  }
  assert.ok(inputLine({ file_path: 'src/parser.ts', limit: 40 }).includes('src/parser.ts'));
});

test('with the key from the settings, the account id is not read from the environment', () => {
  const account = 'a'.repeat(32);

  const fromSettings = providerFrom({ provider: 'cloudflare', apiKey: 'k' }, { CLOUDFLARE_ACCOUNT_ID: account });
  assert.ok(fromSettings !== null && 'error' in fromSettings);
  // With the key from the environment, the account may come from there too.
  assert.deepEqual(providerFrom({ provider: 'cloudflare' }, { CLOUDFLARE_API_TOKEN: 'k', CLOUDFLARE_ACCOUNT_ID: account }), {
    kind: 'cloudflare',
    key: 'k',
    accountId: account,
  });
});

test('left on auto, an account id in the settings chooses Cloudflare and none chooses TypeSafe', () => {
  const account = 'a'.repeat(32);
  const cloudflare = { kind: 'cloudflare', key: 'k', accountId: account };
  const typesafe = { kind: 'typesafe', key: 'k', model: 'jev-latest' };

  // Not set, blank and `auto` are one thing: what Claude Code hands over when the field was left alone.
  for (const provider of ['auto', ' auto ', undefined, '']) {
    assert.deepEqual(providerFrom({ provider, apiKey: 'k', cloudflareAccountId: account }, {}), cloudflare);
    assert.deepEqual(providerFrom({ provider, cloudflareAccountId: account }, { CLOUDFLARE_API_TOKEN: 'k' }), cloudflare);
    assert.deepEqual(providerFrom({ provider, apiKey: 'k' }, {}), typesafe);
    // A key in the environment chooses nothing either: it may be there for another tool (#103).
    assert.equal(providerFrom({ provider }, { TYPESAFE_API_KEY: 'k' }), null);
    // An account id in the environment chooses nothing: it is there for other tools.
    assert.deepEqual(providerFrom({ provider, apiKey: 'k' }, { CLOUDFLARE_ACCOUNT_ID: account }), typesafe);
    assert.equal(providerFrom({ provider }, { CLOUDFLARE_API_TOKEN: 'k', CLOUDFLARE_ACCOUNT_ID: account }), null);
    // A key still goes to its own provider only.
    assert.equal(providerFrom({ provider, cloudflareAccountId: account }, { TYPESAFE_API_KEY: 'k' }), null);
  }
});

test('an account id that is there and malformed, or there while the provider says typesafe, sends nothing', () => {
  const account = 'a'.repeat(32);

  // Read as absent, a malformed id would send a Cloudflare key to TypeSafe.
  // So would one that is not text, which a settings file written by hand can hold.
  for (const cloudflareAccountId of ['abc', 'a'.repeat(31), `${account}0`, 12345, [], [account], {}, false]) {
    for (const provider of ['auto', undefined]) {
      const malformed = providerFrom({ provider, apiKey: 'k', cloudflareAccountId }, {});
      assert.ok(malformed !== null && 'error' in malformed, JSON.stringify({ provider, cloudflareAccountId }));
      // It names the field and both ways out, and does not repeat what was entered.
      assert.match(malformed.error, /cloudflareAccountId/);
      assert.match(malformed.error, /clear it to ask TypeSafe/);
      assert.ok(!malformed.error.includes('abc'), malformed.error);
    }
  }
  const chosen = providerFrom({ provider: 'cloudflare', apiKey: 'k', cloudflareAccountId: 'abc' }, {});
  assert.ok(chosen !== null && 'error' in chosen && /cloudflareAccountId/.test(chosen.error));
  // With Cloudflare chosen by name, TypeSafe is not a way out to offer.
  assert.ok(!chosen.error.includes('TypeSafe'), chosen.error);

  for (const env of [{}, { TYPESAFE_API_KEY: 'from-env' }]) {
    const settings = 'TYPESAFE_API_KEY' in env ? {} : { apiKey: 'k' };
    const contradiction = providerFrom({ ...settings, provider: 'typesafe', cloudflareAccountId: account }, env);
    assert.ok(contradiction !== null && 'error' in contradiction, JSON.stringify(env));
    // The message names both fields: it is what says how to put it right.
    assert.match(contradiction.error, /provider/);
    assert.match(contradiction.error, /cloudflareAccountId/);
  }
  // Without a key there is nothing to send and nothing to say.
  assert.equal(providerFrom({ provider: 'typesafe', cloudflareAccountId: account }, {}), null);
  // What stops it is the id in the settings, not one in the environment.
  assert.deepEqual(providerFrom({ provider: 'typesafe', apiKey: 'k' }, { CLOUDFLARE_ACCOUNT_ID: account }), {
    kind: 'typesafe',
    key: 'k',
    model: 'jev-latest',
  });
});

test('what the manifest hands over when provider was left alone is read as auto, and the field is free text', () => {
  const manifest = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')) as {
    userConfig: Record<string, { default?: unknown; options?: unknown }>;
  };
  const field = manifest.userConfig['provider'];
  const account = 'a'.repeat(32);

  // Claude Code fills the default in, so this is what reaches providerFrom from someone who entered the key and the id.
  assert.deepEqual(providerFrom({ provider: field?.default, apiKey: 'k', cloudflareAccountId: account }, {}), {
    kind: 'cloudflare',
    key: 'k',
    accountId: account,
  });
  assert.deepEqual(providerFrom({ provider: field?.default, apiKey: 'k' }, {}), { kind: 'typesafe', key: 'k', model: 'jev-latest' });
  // From someone who opened nothing, with a key kept for another tool: nothing is sent (#103). A default that chose a provider would send it.
  assert.equal(providerFrom({ provider: field?.default }, { TYPESAFE_API_KEY: 'k', CLOUDFLARE_API_TOKEN: 'k' }), null);
  // As a picker, a value outside the options would silently become the default instead of being refused (ADR 0009).
  assert.equal(field?.options, undefined);
  // No default of its own: an account id filled in for everyone would choose Cloudflare for everyone.
  assert.equal(manifest.userConfig['cloudflareAccountId']?.default, undefined);
});

test('a provider that is not one of the three, a key that cannot be a key, a bad account id: all refused', () => {
  for (const settings of [
    { provider: 'https://evil.example/collect', apiKey: 'k' },
    { apiKey: 'two words' },
    { apiKey: 'line\nbreak' },
    { provider: 'cloudflare', apiKey: 'k' },
    { provider: 'cloudflare', apiKey: 'k', cloudflareAccountId: '../../accounts/other' },
  ]) {
    const provider = providerFrom(settings, {});
    assert.ok(provider !== null && 'error' in provider, JSON.stringify(settings));
  }
});

test('the address is fixed per provider, and Workers AI gets its input wrapped', () => {
  const state = stateFor('Which result is the build script?');
  const questions = { q: { type: 'choice' as const, instructions: state.task, criteria: { t1: 'a', t2: 'b' } } };

  const direct = requestFor(TYPESAFE, state, questions);
  const wrapped = requestFor({ kind: 'cloudflare', key: 'cf-key', accountId: 'b'.repeat(32) }, state, questions);

  assert.equal(direct.url, 'https://api.typesafe.ai/v1/systemone');
  assert.deepEqual(JSON.parse(direct.body), { model: 'jev-latest', state, questions });
  assert.equal(wrapped.url, `https://api.cloudflare.com/client/v4/accounts/${'b'.repeat(32)}/ai/run`);
  assert.deepEqual(Object.keys(JSON.parse(wrapped.body)), ['model', 'input']);
  assert.equal(wrapped.headers.authorization, 'Bearer cf-key');
});

test('only a probability from 0 to 1, for a key that was asked, counts', () => {
  const body = JSON.stringify({
    result: {
      state: 'Completed',
      result: {
        answers: {
          q: {
            type: 'choice',
            choice: 't1',
            probabilities: { t1: 0.6, t2: 0.4, t3: 1.5, t4: -0.1, t5: '0.2', t6: Number.NaN, t99: 1 },
          },
        },
      },
    },
  });

  const probabilities = readProbabilities(body, ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 'constructor']);

  assert.deepEqual([...probabilities], [['t1', 0.6], ['t2', 0.4]]);
  assert.equal(readProbabilities('<html>502</html>', ['t1']).size, 0);
  assert.equal(readProbabilities('{"answers":{"q":{"probabilities":[0.5]}}}', ['t1']).size, 0);
});

test('one request: every option is offered once, the key is in the header and nowhere else, and the answer is the distribution', async () => {
  const { http, sent } = recordingHttp((request) => peaked(keysOf(request), 't2', 0.7));

  const chosen = await choose(http, TYPESAFE, 'Which result is the build script?', options(3));

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(sent[0]?.headers['authorization'], `Bearer ${TYPESAFE.key}`);
  assert.ok(!JSON.stringify(sent[0]?.body).includes(TYPESAFE.key));
  assert.deepEqual(keysOf(sent[0] as Sent), ['t1', 't2', 't3']);
  assert.ok('ranked' in chosen);
  assert.deepEqual(chosen.ranked.map(([key]) => key), ['t2', 't1', 't3']);
  assert.equal(chosen.ranked[0]?.[1], 0.7);
  assert.equal(chosen.requests, 1);
});

test('more options than one request takes are asked in rounds, and the winner of a later request wins the last', async () => {
  const { http, sent } = recordingHttp((request) => {
    const keys = keysOf(request);
    return peaked(keys, keys.includes('t150') ? 't150' : null);
  });

  const chosen = await choose(http, TYPESAFE, 'Which one?', options(200));

  // Three requests of the first round, then one holding three of each.
  assert.deepEqual(sent.map((request) => keysOf(request).length), [80, 80, 40, 9]);
  assert.ok('ranked' in chosen);
  assert.equal(chosen.ranked[0]?.[0], 't150');
  assert.equal(chosen.ranked.length, 9);
  assert.equal(chosen.requests, 4);
});

test('a request refused for its size is split in two, and when that does not narrow the choice, the winners alone go on', async () => {
  const { http, sent } = recordingHttp((request) => {
    const keys = keysOf(request);
    return keys.length > 2 ? { status: 400, ok: false, text: '{"error_type":"max_tokens_exceeded"}' } : peaked(keys, keys[0] ?? null, 0.8);
  });

  const chosen = await choose(http, TYPESAFE, 'Which one?', options(4));

  assert.deepEqual(sent.map((request) => keysOf(request).length), [4, 2, 2, 2]);
  assert.ok('ranked' in chosen);
  assert.equal(chosen.ranked.length, 2);
});

test('a request that fails ends the asking with its status, and what the endpoint said goes nowhere', async () => {
  const echo = `bad request: authorization Bearer ${TYPESAFE.key}`;
  const { http, sent } = recordingHttp(() => ({ status: 503, ok: false, text: echo }));

  const chosen = await choose(http, TYPESAFE, 'Which one?', options(200));

  assert.ok('error' in chosen);
  assert.equal(chosen.error, 'HTTP 503');
  assert.ok(!JSON.stringify(chosen).includes(TYPESAFE.key));
  // The asking stops with the round in flight: no later round is sent.
  assert.ok(sent.length <= 3, `${sent.length} requests`);
});

test('an endpoint that cannot be reached is an error, not an exception, and the key stays out of it', async () => {
  const chosen = await choose(
    async () => {
      throw new Error(`connect failed with header Bearer ${TYPESAFE.key}`);
    },
    TYPESAFE,
    'Which one?',
    options(3),
  );

  assert.deepEqual(chosen, { error: 'the endpoint could not be reached' });
});

test('more requests than may be sent for one question end the asking', async () => {
  const { http, sent } = recordingHttp((request) => peaked(keysOf(request), null));

  const chosen = await choose(http, TYPESAFE, 'Which one?', options(2000));

  assert.deepEqual(chosen, { error: 'too many requests' });
  assert.ok(sent.length <= 24);
});

test('an answer without a readable probability for any option ends the asking, rather than ranking by nothing', async () => {
  const { http } = recordingHttp(() => ok({ answers: { q: { type: 'choice', choice: 't1' } } }));

  const chosen = await choose(http, TYPESAFE, 'Which one?', options(3));

  assert.deepEqual(chosen, { error: 'the answer could not be read' });
});

test('an answer that does not come in time ends the asking, and the clock is stopped once an answer is in', async () => {
  const waits: { ms: number; aborted: boolean }[] = [];
  const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const entry = { ms, aborted: false };
      waits.push(entry);
      signal.addEventListener('abort', () => {
        entry.aborted = true;
        reject(new Error('aborted'));
      });
      setTimeout(resolve, ms);
    });

  const late = await choose(() => new Promise(() => {}), TYPESAFE, 'Which one?', options(3), { withinMs: 5, wait });
  assert.deepEqual(late, { error: 'Jev did not answer in time' });

  const { http } = recordingHttp((request) => peaked(keysOf(request), 't1'));
  const inTime = await choose(http, TYPESAFE, 'Which one?', options(3), { withinMs: 5000, wait });
  assert.ok('ranked' in inTime);
  assert.deepEqual(waits.map((entry) => entry.aborted), [true, true]);
});

test('an option put into every request is ranked with the rest in each, and once in the last', async () => {
  const none = { key: 'none', text: 'None of these' };
  const { http, sent } = recordingHttp((request) => {
    const keys = keysOf(request);
    return peaked(keys, keys.includes('t150') ? 't150' : 'none');
  });

  const chosen = await choose(http, TYPESAFE, 'Which one?', options(200), { always: none });

  for (const request of sent) assert.equal(keysOf(request)[0], 'none');
  assert.deepEqual(sent.map((request) => keysOf(request).length).slice(0, 3), [81, 81, 41]);
  const last = keysOf(sent[3] as Sent);
  assert.equal(last.filter((key) => key === 'none').length, 1);
  assert.ok(last.includes('t150'));
  assert.ok('ranked' in chosen);
  assert.equal(chosen.ranked[0]?.[0], 't150');
});

test('a request split for its size that "none of these" wins still sends its own likeliest on', async () => {
  const none = { key: 'none', text: 'None of these' };
  const { http, sent } = recordingHttp((request) => {
    const keys = keysOf(request);
    if (keys.length > 3) return { status: 400, ok: false, text: '{"error_type":"max_tokens_exceeded"}' };
    // In the half that holds t1, none wins; t1 is the likeliest of the rest. In the other half, t3 wins.
    return peaked(keys, keys.includes('t1') ? 'none' : 't3', 0.6);
  });

  const chosen = await choose(http, TYPESAFE, 'Which one?', options(4), { always: none });

  // [none,t1..t4] refused; [none,t1,t2] and [none,t3,t4] answered; the winners t1 and t3 meet none in the last.
  assert.deepEqual(sent.map((request) => keysOf(request).length), [5, 3, 3, 3]);
  const last = keysOf(sent[3] as Sent);
  assert.deepEqual(last, ['none', 't1', 't3']);
  assert.ok('ranked' in chosen);
});

test('a key Jev was not asked about changes nothing, and an option it left out or put off the scale makes the answer unreadable', async () => {
  const extra = recordingHttp(() =>
    ok({ answers: { q: { type: 'choice', choice: 't9', probabilities: { t9: 1, t1: 0.6, t2: 0.3, t3: 0.1 } } } }),
  );
  const offScale = recordingHttp(() =>
    ok({ answers: { q: { type: 'choice', choice: 't1', probabilities: { t1: 5, t2: 0.3, t3: 0.1 } } } }),
  );
  const leftOut = recordingHttp(() => ok({ answers: { q: { type: 'choice', choice: 't2', probabilities: { t2: 0.7, t3: 0.3 } } } }));

  const withExtra = await choose(extra.http, TYPESAFE, 'Which one?', options(3));
  assert.ok('ranked' in withExtra);
  assert.deepEqual(withExtra.ranked, [['t1', 0.6], ['t2', 0.3], ['t3', 0.1]]);
  assert.deepEqual(await choose(offScale.http, TYPESAFE, 'Which one?', options(3)), { error: 'the answer could not be read' });
  assert.deepEqual(await choose(leftOut.http, TYPESAFE, 'Which one?', options(3)), { error: 'the answer could not be read' });
});

// #70: text cut by UTF-16 units must not end in the first half of a pair.
const halfAlone = /\p{Surrogate}/u;

test('a call input, a digest and a question are never cut inside a character, nor made longer (#70)', () => {
  for (let n = 270; n <= 300; n += 1) {
    const line = inputLine({ command: `${'x'.repeat(n)}${'🎉'.repeat(200)}` });
    assert.ok(!halfAlone.test(line) && line.length <= 300, `inputLine at ${n}`);
  }
  for (let n = 190; n <= 205; n += 1) {
    const clipped = digest(`${'y'.repeat(n)}${'🎉'.repeat(100)}`, 10_000);
    assert.ok(!halfAlone.test(clipped), `a line of a digest at ${n}`);
  }
  for (let n = 90; n <= 105; n += 1) {
    const short = digest(`${'z'.repeat(n)}${'🎉'.repeat(40)}`, 100);
    assert.ok(!halfAlone.test(short) && short.length <= 100, `a digest's limit at ${n}`);
    const long = digest([...Array.from({ length: 20 }, () => 'line'), `${'z'.repeat(n)}${'🎉'.repeat(40)}`].join('\n'), 140 + n - 90);
    assert.ok(!halfAlone.test(long), `a long digest's limit at ${n}`);
  }
  for (let n = 1990; n <= 2005; n += 1) {
    const { task } = stateFor(`${'q'.repeat(n)}${'🎉'.repeat(100)}`);
    assert.ok(!halfAlone.test(task) && task.length <= 2000, `stateFor at ${n}`);
  }
});

// Every shape PRIVACY.md lists, one made-up value each, put together here so that no line of this file has the shape of
// a real credential. Each: the line it stands in, and the part of it that must not be left.
const j = (...pieces: string[]) => pieces.join('');
const LISTED: readonly (readonly [string, string, string])[] = [
  ['a private key block', j('-----BEGIN', ' PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END', ' PRIVATE KEY-----'), 'MIIEvQIBADANBg'],
  ['a URL with a user and a password', j('postgres://admin:', 'hunter2-swordfish', '@db.internal/app'), 'hunter2-swordfish'],
  ['a URL with a user alone (a DSN)', j('https://', 'a1b2c3d4e5f6a7b8', '@o1.ingest.sentry.io/42'), 'a1b2c3d4e5f6a7b8'],
  ['an Authorization header', j('Authorization: ', 'Token qwertyuiop12345'), 'qwertyuiop12345'],
  ['a Bearer token', j('curl -H "x: Bearer ', 'zxcvbnm1234567890', '"'), 'zxcvbnm1234567890'],
  ['a value named as a secret', j('db_password: ', 'correct-horse-battery'), 'correct-horse-battery'],
  ['an environment assignment ending in _KEY', j('STRIPE', '_KEY=', 'plainvalue123456'), 'plainvalue123456'],
  ['an environment assignment ending in _PASS', j('export SMTP', '_PASS="', 'mailpass99887766', '"'), 'mailpass99887766'],
  ['an environment assignment ending in _PW', j('DB', '_PW=', 'dbpw55667788aa'), 'dbpw55667788aa'],
  ['an environment assignment ending in DSN', j('SENTRY', '_DSN=', 'notaurl-but-a-dsn-value'), 'notaurl-but-a-dsn-value'],
  ['an environment assignment ending in _WEBHOOK_URL', j('ALERTS', '_WEBHOOK_URL=', 'hookvalue-1234567'), 'hookvalue-1234567'],
  ['a key with sk- before it', j('s', 'k-', 'x9Y8z7W6'.repeat(4)), 'x9Y8z7W6x9Y8z7W6'],
  ['a payment key, sk_live_', j('s', 'k_live_', 'a1B2c3D4e5F6g7H8i9J0'), 'a1B2c3D4e5F6g7H8i9J0'],
  ['a payment key, rk_test_', j('r', 'k_test_', 'Z9y8X7w6V5u4T3s2R1q0'), 'Z9y8X7w6V5u4T3s2R1q0'],
  ['a GitHub token', j('gh', 'p_', 'a1B2c3D4'.repeat(5)), 'a1B2c3D4a1B2c3D4'],
  ['a GitHub fine-grained token', j('github', '_pat_', 'A1b2C3d4E5f6G7h8I9j0K1'), 'A1b2C3d4E5f6G7h8I9j0K1'],
  ['a GitLab token', j('gl', 'pat-', 'Aa1Bb2Cc3Dd4Ee5Ff6'), 'Aa1Bb2Cc3Dd4Ee5Ff6'],
  ['a Slack token', j('xo', 'xb-', '1234567890-abcdefghij'), '1234567890-abcdefghij'],
  ['an AWS access key id', j('AK', 'IA', 'ABCDEFGHIJKLMNOP'), 'ABCDEFGHIJKLMNOP'],
  ['a Google API key', j('AI', 'za', 'Sy0123456789abcdefghijklmnopqrstu'), 'Sy0123456789abcdefghijklmnopqrstu'],
  ['an npm token', j('np', 'm_', 'a1b2c3d4e5'.repeat(3), 'f6g7h8'), 'a1b2c3d4e5a1b2c3d4e5'],
  ['a PyPI token', j('py', 'pi-AgEIcHlwaS5vcmc', 'Q'.repeat(60)), 'QQQQQQQQQQQQ'],
  ['a RubyGems token', j('ruby', 'gems_', 'ab12'.repeat(12)), 'ab12ab12ab12ab12'],
  ['a JSON web token', j('ey', 'JhbGciOiJIUzI1NiJ9', '.', 'eyJ', 'zdWIiOiIxMjM0NTY3ODkwIn0', '.', 'c2lnbmF0dXJlLWhlcmU'), 'zdWIiOiIxMjM0NTY3ODkwIn0'],
  ['a signature in a URL', j('https://bucket.example/f?X-Amz-Signature=', 'f'.repeat(64), '&other=1'), 'f'.repeat(64)],
  ['a Slack webhook', j('https://hooks.slack.com/services/', 'T0001/B0002/', 'q9W8e7R6t5Y4u3I2o1P0a9S8'), 'q9W8e7R6t5Y4u3I2o1P0a9S8'],
  ['a Microsoft Teams webhook', j('https://contoso.webhook.office.com/webhookb2/', 'abc@def/IncomingWebhook/', '0123456789abcdef'), '0123456789abcdef'],
  ['a Discord webhook', j('https://discord.com/api/webhooks/', '123456789012/', 'Ab-Cd_Ef'.repeat(5)), 'Ab-Cd_EfAb-Cd_Ef'],
  ['an email address', j('written by ', 'jane.doe', '@', 'example.com', '.'), 'jane.doe'],
  ['a telephone number with + and groups', j('call ', '+44 20', ' 7946 0958', ' today'), '7946 0958'],
  ['a telephone number in parentheses', j('call ', '+1 (415)', ' 555-0100'), '555-0100'],
  ['a tel: link', j('<a href="', 'tel:', '+81-3-1234-5678', '">'), '1234-5678'],
  ['a tel: link written for a URL', j('href="', 'tel:', '+44%2020%207946%200958', '"'), '7946%200958'],
  ['a telephone number with a group of six', j('mobile ', '+44 7911', ' 123456'), '123456'],
  ['a telephone number with a group of eight', j('office ', '+49 30', ' 12345678'), '12345678'],
  ['a telephone number with (0)', j('tel ', '+44 (0)20', ' 7946 0958'), '7946 0958'],
  ['a telephone number with (0) and no space after it', j('tel ', '+81 (0)3', '-1234-5678'), '1234-5678'],
  ['a telephone number with dots', j('call ', '+1.415', '.555.0100'), '555.0100'],
  ['a telephone number with brackets and no space after them', j('call ', '+1 (415)', '555-0100'), '555-0100'],
  ['a telephone number with its country code in brackets', j('call ', '(+81)', ' 90-1234-5678'), '1234-5678'],
  ['a URL with a password and no user', j('redis://:', 's3cretPassw0rd', '@cache:6379'), 's3cretPassw0rd'],
  ['a quoted value escaped in JSON', j('{"command":"export SMTP', '_PASS=\\"', 'mailpass99887766', '\\""}'), 'mailpass99887766'],
  ['a quoted secret escaped in JSON', j('{"command":"db_password=\\"', 'correct-horse-battery', '\\""}'), 'correct-horse-battery'],
  ['an environment assignment named DSN', j('DSN', '=', 'just-the-dsn-value'), 'just-the-dsn-value'],
  ['an email address before a colon and a space', j('sent to ', 'jane.doe', '@', 'example.com', ': ok'), 'jane.doe'],
  ['a Discord webhook with the version in its path', j('https://discord.com/api/v10/webhooks/', '123456789012/', 'Ab-Cd_Ef'.repeat(5)), 'Ab-Cd_EfAb-Cd_Ef'],
  ['a telephone number with a date after it', j('call ', '+44 20', ' 7946 0958', ' 2026-10-07'), '7946 0958'],
  ['a telephone number with another after it', j('call ', '+81 3', ' 1234 5678', ' 03 1234 5678'), '+81 3 1234'],
  ['a quoted secret with spaces in it', j('password: "', 'correct horse', ' battery', '"'), 'horse battery'],
  ['a quoted environment value with spaces in it', j('SMTP', '_PASS="', 'mail pass', ' 9988', '"'), 'pass 9988'],
  ['a Slack webhook written in JSON', j('{"url":"https:\\/\\/hooks.slack.com\\/services\\/', 'T0001\\/B0002\\/', 'q9W8e7R6t5Y4u3I2o1P0a9S8', '"}'), 'q9W8e7R6t5Y4u3I2o1P0a9S8'],
];

test('each shape PRIVACY.md lists is blanked, alone and in a digest (#131)', () => {
  for (const [label, line, secret] of LISTED) {
    assert.ok(!redact(line).includes(secret), `${label}: ${redact(line)}`);
    assert.ok(!digest(`first line\n${line}\nlast line`).includes(secret), `${label}, in a digest`);
  }
});

test('ordinary lines a coding session holds are left as they are (#131)', () => {
  const kept = [
    '2026-10-07 14:57:01',
    'v1.2.3-beta+build.5',
    '123e4567-e89b-12d3-a456-426614174000',
    `[lossless-compaction] Bash result moved out, 1290 bytes; recall with mcp__lossless-compaction__recall id ${'a1'.repeat(32)}`,
    'record 95-0001: station 418 reported 126 units at step 1',
    'git clone git@github.com:owner/repo.git',
    'scp notes.txt user@host.example.com:path/to',
    'npm install pkg@1.2.3',
    `docker pull node@sha256:${'c'.repeat(64)}`,
    '+12345678',
    '+10 20 30',
    'Date: Tue, 07 Oct 2026 14:57:01 +0900',
    'Hotel: two nights',
    'call 090-1234-5678 for the desk',
    'const MONKEY = banana',
    'https://github.com/@scope/pkg',
  ];
  for (const line of kept) assert.equal(redact(line), line);
  // What follows a telephone number, or a quoted secret, is kept: only the number and the secret go.
  assert.equal(redact(j('call ', '+44 20 7946', ' 0958 2026-10-07')), 'call [redacted] 2026-10-07');
  assert.equal(redact(j('password: "', 'a b', '", user: "me"')), 'password: "[redacted]", user: "me"');
});
