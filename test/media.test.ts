import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHARS_PER_TOKEN, compact, countFrom, imagesOf, reportLine, weightOf, type Config, type Host, type Input } from '../src/compact.ts';
import { find, type FindInput } from '../src/find.ts';
import { keepThenSummarize, messagesFromApi } from '../src/keep.ts';
import { IMAGE_TOKENS, blocksOf, decodeMedia, encodeMedia, isImage, mediaIn, type MediaPart } from '../src/media.ts';
import { whyNotRebuilt } from '../src/select.ts';
import { MAX_BYTES, RECALL_TOOL, isStored, moveOut, readTicket, recall } from '../src/store.ts';
import type { Http, Message } from '../src/types.ts';
import { MemoryFiles, conversation, ok, output, questionsOf, recordingHttp, type Call } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';
const CONFIG: Config = { store: { write: DIR, read: [DIR] }, keepTokens: 20_000, minChars: 2000, targetPercent: 40, maxAfterPercent: 75, fold: false };
const TYPESAFE = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as const;

const STARTS = { 'image/png': 'iVBORw0KGgo', 'image/jpeg': '/9j/' } as const;

/** Bytes of an image in base64 that begin as its kind does, distinct per label and long enough to be told from any text beside them. */
const pixels = (label: string, chars = 4000, kind: keyof typeof STARTS = 'image/png') =>
  `${STARTS[kind]}${label.replace(/[^A-Za-z0-9]/g, '')}${'Qk1G'.repeat(Math.ceil(chars / 4))}`.slice(0, chars);

const host = (files: MemoryFiles): Host => ({ files, now: () => 0 });

const text = (label: string, lines = 100): Call => ({ tool: 'Bash', input: { command: `show ${label}` }, text: output(label, lines) });

/**
 * A conversation as it was measured on Claude Code 2.1.286 after a `Read` of an
 * image: for a hook, the result's text is empty and the tool's record holds the
 * bytes on both sides of the call; read with its blocks, the result's content is
 * the image. `shots` are the calls, by position, whose result is an image.
 */
function withImages(calls: readonly Call[], shots: Readonly<Record<number, { before?: string; data: string; after?: string }>>) {
  const messages = conversation(calls);
  const api: { role: string; content: unknown }[] = [{ role: 'user', content: [{ type: 'text', text: 'Fix the failing parser test.' }] }];
  calls.forEach((call, index) => {
    const id = `toolu_${index + 1}`;
    const shot = shots[index + 1];
    api.push({ role: 'assistant', content: [{ type: 'tool_use', id, name: call.tool, input: call.input }] });
    if (shot === undefined) {
      api.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: call.text }] });
      return;
    }
    const record = { type: 'image', file: { base64: shot.data, type: 'image/png', originalSize: 3000 } };
    const said = [shot.before, shot.after].filter((part) => part !== undefined).join('\n');
    for (const message of messages) {
      for (const use of message.toolUses) if (use.tool_use_id === id) Object.assign(use, { text: said, result: record });
      for (const result of message.toolResults ?? []) if (result.tool_use_id === id) Object.assign(result, { text: said, result: record });
    }
    api.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: id,
          content: [
            ...(shot.before === undefined ? [] : [{ type: 'text', text: shot.before }]),
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: shot.data } },
            ...(shot.after === undefined ? [] : [{ type: 'text', text: shot.after }]),
            // What the host adds after a result's own blocks.
            { type: 'text', text: '<system-reminder>\nnot what the tool returned\n</system-reminder>' },
          ],
        },
      ],
    });
  });
  api.push({ role: 'assistant', content: [{ type: 'text', text: 'Done with that step.' }] });
  return { messages, api };
}

function inputFor(messages: readonly Message[], api: unknown, window = 1_000_000): Input {
  const chars = messages.reduce((sum, m) => sum + m.text.length + (m.toolResults ?? []).reduce((n, r) => n + r.text.length, 0), 0);
  return { messages, tokens: Math.ceil(chars / CHARS_PER_TOKEN) + 5000, window, goal: '', media: mediaIn(api).results };
}

const resultOf = (messages: readonly Message[], id: string) => messages.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === id);
const useOf = (messages: readonly Message[], id: string) => messages.flatMap((m) => m.toolUses).find((u) => u.tool_use_id === id);

test('a conversation holding an image in a tool result is rebuilt: the result leaves whole, and its bytes are in nothing handed back', async () => {
  const files = new MemoryFiles();
  const data = pixels('shot-one');
  const { messages, api } = withImages([text('a'), { tool: 'Read', input: { file_path: 'shot.png' }, text: '' }, text('b')], { 2: { data } });

  assert.equal(whyNotRebuilt(messages, api), null);
  const outcome = await compact(inputFor(messages, api), CONFIG, host(files));

  assert.equal(outcome.abandoned, undefined);
  assert.equal(outcome.enough, true);
  assert.equal(outcome.report.images, 1);
  const result = resultOf(outcome.messages, 'toolu_2');
  const ticket = readTicket(result?.text ?? '');
  assert.ok(ticket, 'the result is one ticket');
  assert.equal(ticket.tool, 'Read');
  assert.deepEqual(Object.keys(result ?? {}).sort(), ['isError', 'text', 'tool_use_id'], 'the tool\'s record is gone from the result');
  const use = useOf(outcome.messages, 'toolu_2');
  assert.equal(use?.text, result?.text, 'the same ticket on the call');
  assert.ok(!('result' in (use ?? {})), 'and the record gone from the call');
  assert.ok(!JSON.stringify(outcome.messages).includes(data.slice(0, 200)), 'no bytes of the image in what is handed back');
  assert.ok(outcome.messages.every((message) => message.handle === undefined), 'every message is rebuilt');
  assert.ok(await isStored(files, DIR, result?.text ?? ''), 'the ticket is one of this store');

  const back = await recall(files, DIR, ticket.id);
  assert.ok('text' in back);
  assert.deepEqual(back.parts, [{ type: 'image', media_type: 'image/png', data }]);
  assert.equal(back.text, '', 'recall never hands the bytes on as text');
  assert.deepEqual(blocksOf(back.parts ?? []), [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }], 'what the tool hands back: the image as the API takes it, and nothing added');
});

test('a result that holds an image leaves whatever its place: the newest, a short one, a failed call, and when nothing else needs to', async () => {
  // One result, the newest, with no text: every rule that keeps a result in place would keep this one.
  const only = withImages([{ tool: 'Read', input: { file_path: 'shot.png' }, text: '' }], { 1: { data: pixels('only') } });
  const alone = await compact(inputFor(only.messages, only.api), CONFIG, host(new MemoryFiles()));
  assert.equal(alone.report.moved, 1);
  assert.equal(alone.report.images, 1);
  assert.equal(alone.enough, true);
  assert.ok(readTicket(resultOf(alone.messages, 'toolu_1')?.text ?? ''));

  // A failed call that returned a screenshot of the error.
  const failed = withImages([{ tool: 'mcp__shots__take', input: {}, text: '', isError: true }], { 1: { before: 'the page did not load', data: pixels('error') } });
  const after = await compact(inputFor(failed.messages, failed.api), CONFIG, host(new MemoryFiles()));
  assert.equal(after.report.images, 1);
  assert.equal(readTicket(resultOf(after.messages, 'toolu_1')?.text ?? '')?.tool, 'mcp__shots__take');
});

test('a /compact by hand that reaches into the newest calls leaves a result that held an image as it left, its image with it', async () => {
  const files = new MemoryFiles();
  const data = pixels('second-round');
  const before = 'what the notebook\'s plot shows\n'.repeat(80);
  const { messages, api } = withImages([text('a'), { tool: 'Read', input: { file_path: 'plots.ipynb' }, text: '' }], { 2: { before, data } });
  // What the person said last comes after the result, and its text is long enough to leave on its own.
  messages.push({ role: 'user', text: 'Go on with the plots.', toolUses: [] }, { role: 'assistant', text: 'Going on.', toolUses: [] });

  const outcome = await compact({ ...inputFor(messages, api), byHand: true }, CONFIG, host(files));
  assert.equal(outcome.report.images, 1);
  assert.ok((outcome.report.recent ?? 0) > 0, 'the second round ran');
  const ticket = readTicket(resultOf(outcome.messages, 'toolu_2')?.text ?? '');
  assert.ok(ticket);
  const back = await recall(files, DIR, ticket.id);
  assert.ok('text' in back);
  assert.deepEqual(back.parts, [{ type: 'text', text: before }, { type: 'image', media_type: 'image/png', data }]);
});

test('text and images of one result are stored in the order the result held them, the host\'s note left out, under one ticket', async () => {
  const files = new MemoryFiles();
  const first = pixels('first');
  const { messages, api } = withImages([{ tool: 'mcp__shots__take', input: {}, text: '' }], { 1: { before: 'before the image', data: first, after: 'after the image' } });
  // A second image in the same result.
  const content = (api[2] as { content: { content: unknown[] }[] }).content[0]?.content as unknown[];
  const second = pixels('second', 4000, 'image/jpeg');
  content.splice(3, 0, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: second } });

  const media = mediaIn(api);
  assert.equal(media.why, null);
  assert.equal(media.images, 2);
  assert.deepEqual(media.results.get('toolu_1'), [
    { type: 'text', text: 'before the image' },
    { type: 'image', media_type: 'image/png', data: first },
    { type: 'text', text: 'after the image' },
    { type: 'image', media_type: 'image/jpeg', data: second },
  ]);

  const outcome = await compact(inputFor(messages, api), CONFIG, host(files));
  assert.equal(outcome.report.moved, 1);
  assert.equal(outcome.report.images, 2);
  const line = resultOf(outcome.messages, 'toolu_1')?.text ?? '';
  assert.ok(readTicket(line) && !line.includes('\n'), 'one ticket, one line');
  // Its lines are those of its text, the images not counted (#149).
  assert.equal(readTicket(line)?.lines, 2);
  const back = await recall(files, DIR, readTicket(line)?.id);
  assert.ok('text' in back);
  assert.equal(back.text, 'before the image\nafter the image');
  assert.deepEqual(back.parts, media.results.get('toolu_1'), 'every part, in the order the result held them');
});

test('when a result that holds an image cannot be moved out, nothing is rebuilt and the conversation goes on as it was handed in', async () => {
  const { messages, api } = withImages([text('a'), { tool: 'Read', input: { file_path: 'shot.png' }, text: '' }], { 2: { data: pixels('big', 5000) } });

  // Over what the host writes in one file.
  const huge = mediaIn(api).results;
  huge.set('toolu_2', [{ type: 'image', media_type: 'image/png', data: 'A'.repeat(MAX_BYTES + 1) }]);
  const tooLarge = await compact({ ...inputFor(messages, api), media: huge }, CONFIG, host(new MemoryFiles()));
  assert.match(tooLarge.abandoned ?? '', /could not be moved out: too large to keep \(over about 4 MB\)$/);
  assert.equal(tooLarge.enough, false);
  assert.equal(tooLarge.report.moved, 0);
  assert.deepEqual(tooLarge.messages, messages, 'the messages handed in, handles and all');
  assert.ok(tooLarge.messages.every((message) => message.handle !== undefined));

  // A disk that stores other text than it was given.
  const broken = new MemoryFiles();
  broken.corrupt = (stored) => `${stored} `;
  const unwritten = await compact(inputFor(messages, api), CONFIG, host(broken));
  assert.match(unwritten.abandoned ?? '', /could not be moved out/);
  assert.deepEqual(unwritten.messages, messages);

  // A result the hook was not shown.
  const elsewhere = new Map(mediaIn(api).results);
  elsewhere.set('toolu_99', [{ type: 'image', media_type: 'image/png', data: pixels('unseen') }]);
  const unseen = await compact({ ...inputFor(messages, api), media: elsewhere }, CONFIG, host(new MemoryFiles()));
  assert.match(unseen.abandoned ?? '', /not among the messages shown$/);
  assert.deepEqual(unseen.messages, messages);

  // The control: the same conversation on a disk that works is rebuilt.
  const fine = await compact(inputFor(messages, api), CONFIG, host(new MemoryFiles()));
  assert.equal(fine.abandoned, undefined);
  assert.equal(fine.report.images, 1);
});

test('an image that cannot be carried still leaves the conversation to the built-in compaction, with the reason', () => {
  const few = conversation([text('a')]);
  const base = [{ role: 'user', content: [{ type: 'text', text: 'Fix it' }] }];
  const png = pixels('carried', 64);
  const pasted = [...base, { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }] }];
  const attached = [...base, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'document', source: {} }] }] }];
  const result = (image: unknown, ...more: unknown[]) => [...base, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [image, ...more] }] }];
  const linked = result({ type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } });
  const unusual = result({ type: 'image', source: { type: 'base64', media_type: 'image/tiff', data: png } });
  const mislabelled = result({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: png } });
  const mixed = result({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }, { type: 'tool_reference', tool_name: 'x' });
  const carried = result({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }, { type: 'text', text: 'a caption' });
  // A tool result inside a tool result: not a place an image is taken from.
  const nested = [...base, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }] }] }] }];

  // Outside a tool result, and a document anywhere: as before.
  assert.match(whyNotRebuilt(few, pasted) ?? '', /: image$/);
  assert.match(whyNotRebuilt(few, attached) ?? '', /: document$/);
  assert.equal(mediaIn(pasted).results.size, 0, 'an image in a message is not one of a tool result');
  // In a tool result, what cannot be stored or handed back says why.
  assert.equal(whyNotRebuilt(few, linked), null);
  assert.equal(mediaIn(linked).why, 'an image that is not held as its bytes');
  // A source of another kind, whatever it carries: only bytes in base64 are stored.
  assert.equal(mediaIn(result({ type: 'image', source: { type: 'file', media_type: 'image/png', data: png } })).why, 'an image that is not held as its bytes');
  assert.equal(mediaIn(unusual).why, 'an image of a kind that is not kept');
  assert.equal(mediaIn(mislabelled).why, 'an image of a kind that is not kept', 'bytes that do not begin as their kind does');
  assert.match(whyNotRebuilt(few, nested) ?? '', /: image$/);
  assert.equal(mediaIn(nested).results.size, 0);
  // An image that is the whole content, not one of a list of blocks.
  const bare = [...base, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } } }] }];
  assert.equal(whyNotRebuilt(few, bare), null);
  assert.equal(mediaIn(bare).why, 'an image in a tool result that is not a list of blocks');
  // A tool's own text that begins as a reminder does is kept where it stands; only what follows the last block is the host's.
  const own = result({ type: 'text', text: '<system-reminder>from the tool itself</system-reminder>' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }, { type: 'text', text: '<system-reminder>from the host</system-reminder>' });
  assert.deepEqual(mediaIn(own).results.get('t1'), [
    { type: 'text', text: '<system-reminder>from the tool itself</system-reminder>' },
    { type: 'image', media_type: 'image/png', data: png },
  ]);
  assert.equal(mediaIn(mixed).why, 'an image in a tool result next to a block that is not text');
  // The control.
  assert.equal(whyNotRebuilt(few, carried), null);
  assert.equal(mediaIn(carried).why, null);
  assert.equal(mediaIn(carried).images, 1);
});

test('the tokens of an image are taken off what the messages come to, and more images than the row holds are not counted with', () => {
  const data = pixels('counted', 300_000);
  const withImage = [
    { role: 'user', content: [{ type: 'text', text: 'x'.repeat(30_000) }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }] }] },
  ];
  const without = [withImage[0], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [] }] }];
  assert.equal(imagesOf(withImage), 1);
  assert.equal(imagesOf(without), 0);
  // For a hook, the result that holds the image has no text.
  const messages: Message[] = [
    { role: 'user', text: 'x'.repeat(30_000), toolUses: [] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: '', isError: false }] },
  ];

  const row = (name: string, tokens: number) => ({ name, tokens, kind: 'used', color: '', isDeferred: false });
  const breakdown = (tokens: number) => ({ categories: [row('System prompt', 10_000), row('Messages', tokens)], apiUsage: { input_tokens: 1 } });
  // 30,000 letters at one token each, and one image on top. Its tokens are off the row, and of its 300,000 characters of
  // base64 none is among those the row is spread over: only the line that stands for an image in what is kept, which
  // counts as what Claude Code added does, at four fifths.
  const counted = countFrom(breakdown(30_000 + IMAGE_TOKENS), 200_000, withImage, messages);
  assert.equal(counted?.density, 30_000 / (30_000 + 0.8 * '[image not kept]'.length));
  // The control: the same row over a conversation without the image comes out higher.
  const plain = countFrom(breakdown(30_000 + IMAGE_TOKENS), 200_000, without, messages);
  assert.ok((plain?.density ?? 0) > 1);
  // More images than the row holds at their rough figure: nothing is left to spread, and the size is not counted.
  const many = Array.from({ length: 50 }, () => withImage[1]);
  assert.equal(countFrom(breakdown(40_000), 200_000, [withImage[0], ...many], messages), undefined);
});

test('a conversation of screenshots is not said to be too full once they are gone', async () => {
  // Thirty screenshots and little text: nearly all the tokens of the messages are images.
  const calls = Array.from({ length: 30 }, (_, i): Call => ({ tool: 'mcp__shots__take', input: { n: i }, text: '' }));
  const shots = Object.fromEntries(calls.map((_, i) => [i + 1, { data: pixels(`shot-${i}`) }]));
  const { messages, api } = withImages(calls, shots);
  const fixed = 20_000;
  // What was sent with the images: the calls, and the reminder the host puts after each result.
  const conversationTokens = 30 * IMAGE_TOKENS + Math.ceil(weightOf(messagesFromApi(api) ?? []) / CHARS_PER_TOKEN);
  const breakdown = {
    categories: [
      { name: 'System prompt', tokens: fixed, kind: 'used' },
      { name: 'Messages', tokens: conversationTokens, kind: 'used' },
    ],
    apiUsage: { input_tokens: 1 },
  };
  const tokens = fixed + conversationTokens;
  const count = countFrom(breakdown, tokens, api, messages);
  assert.ok(count);
  const window = Math.round(tokens * 1.1);

  const outcome = await compact({ messages, tokens, window, goal: '', count, media: mediaIn(api).results }, CONFIG, host(new MemoryFiles()));

  assert.equal(outcome.report.images, 30);
  assert.ok(outcome.report.tokensAfter < window / 2, `${outcome.report.tokensAfter} of ${window}`);
  assert.equal(outcome.enough, true);
});

test('find neither sends nor returns a result that holds an image, in the conversation or in a kept part', async () => {
  const files = new MemoryFiles();
  const data = pixels('secret-screen');
  const caption = 'the dashboard of the billing page';
  const { messages, api } = withImages([text('alpha', 150), { tool: 'mcp__shots__take', input: {}, text: '' }, text('beta', 150), text('gamma', 150)], {
    2: { before: caption, data },
  });
  const outcome = await compact({ ...inputFor(messages, api), tokens: 400_000, window: 200_000 }, { ...CONFIG, keepTokens: 0, minChars: 200 }, host(files));
  assert.equal(outcome.report.images, 1);
  assert.ok(outcome.report.moved >= 3);

  const ask = async (conversationNow: readonly Message[], question: string) => {
    const { http, sent } = recordingHttp((request) => {
      const keys = Object.keys((questionsOf(request)['q'] as { criteria?: Record<string, string> } | undefined)?.criteria ?? {});
      return ok({ answers: { q: { type: 'choice', choice: keys[0], probabilities: Object.fromEntries(keys.map((key, i) => [key, i === 0 ? 0.95 : 0.05 / Math.max(1, keys.length - 1)])) } } });
    });
    const input: FindInput = { files, dirs: [DIR], messages: conversationNow as Message[], provider: TYPESAFE, http: http as Http, wait: async () => {}, question, agentId: undefined };
    const answer = await find(input);
    return { answer, wire: JSON.stringify(sent) };
  };

  const direct = await ask(outcome.messages, 'the screenshot of the billing page');
  assert.ok(direct.wire.length > 0, 'something was sent: the text results are offered');
  assert.ok(!direct.wire.includes(data.slice(0, 60)) && !direct.wire.includes(caption), 'nothing of the result that holds the image');
  assert.ok(!direct.answer.includes(data.slice(0, 60)));
  // By the phrase its caption holds: found among the others if it were offered.
  const quoted = await ask(outcome.messages, `"${caption}"`);
  assert.ok(!quoted.answer.includes(caption) && !quoted.answer.includes(data.slice(0, 60)));

  // In a kept part: the ticket is read out of the part, and the entry behind it is left out all the same.
  const kept = await keepThenSummarize(
    files,
    { dir: DIR, messages: outcome.messages },
    () => {},
    async () => ({ messages: [{ role: 'user' as const, text: 'summary', toolUses: [] }] as Message[] }),
    () => ({ messages: [] as Message[] }),
  );
  assert.ok((kept.messages ?? []).length > 1, 'the part\'s ticket stands after the summary');
  const viaPart = await ask(kept.messages ?? [], 'the screenshot of the billing page');
  assert.ok(!viaPart.wire.includes(data.slice(0, 60)) && !viaPart.wire.includes(caption));
  assert.ok(!viaPart.answer.includes(data.slice(0, 60)));
});

test('what is stored tells by how it begins that it holds an image, and nothing else is taken for it', async () => {
  const parts: MediaPart[] = [{ type: 'text', text: 'a caption' }, { type: 'image', media_type: 'image/png', data: pixels('p') }];
  assert.deepEqual(decodeMedia(encodeMedia(parts)), parts);
  assert.ok(isImage('image/png', pixels('p')) && isImage('image/jpeg', pixels('j', 40, 'image/jpeg')));
  assert.ok(!isImage('image/png', 'not base64 at all') && !isImage('image/png', pixels('j', 40, 'image/jpeg')) && !isImage('image/svg+xml', pixels('p')));
  assert.equal(decodeMedia('an ordinary result'), null);
  // Begins the same and is not what this plugin wrote: text, returned as text.
  const head = encodeMedia(parts).split('\n')[0];
  assert.equal(decodeMedia(`${head}\nnot json`), null);
  assert.equal(decodeMedia(`${head}\n${JSON.stringify([{ type: 'text', text: 'no image in it' }])}`), null);
  assert.equal(decodeMedia(`${head}\n${JSON.stringify([{ type: 'image', media_type: 'text/html', data: 'x' }])}`), null, 'a kind that is not an image the API takes');
  // The shape of an entry around bytes that are no image: a tool's output, stored and returned as the text it is.
  const files = new MemoryFiles();
  const shaped = `${head}\n${JSON.stringify([{ type: 'text', text: 'a caption' }, { type: 'image', media_type: 'image/png', data: '<<not an image>>' }])}`;
  const stored = await moveOut(files, DIR, 'Bash', shaped);
  assert.ok(!('reason' in stored));
  assert.deepEqual(await recall(files, DIR, stored.id), { text: shaped });
});

test('the line a compaction shows says how many images left with their results', async () => {
  const { messages, api } = withImages([{ tool: 'Read', input: { file_path: 'a.png' }, text: '' }, { tool: 'Read', input: { file_path: 'b.png' }, text: '' }], {
    1: { data: pixels('a') },
    2: { data: pixels('b') },
  });
  const both = await compact(inputFor(messages, api), CONFIG, host(new MemoryFiles()));
  assert.match(reportLine(both.report), /^moved out 2 of 2 tool results, 2 images with them; /);
  const one = withImages([{ tool: 'Read', input: { file_path: 'a.png' }, text: '' }], { 1: { data: pixels('a') } });
  assert.match(reportLine((await compact(inputFor(one.messages, one.api), CONFIG, host(new MemoryFiles()))).report), /^moved out 1 of 1 tool results, 1 image with them; /);
  const none = conversation([text('a', 400), text('b', 400), text('c', 400)]);
  const plain = await compact({ ...inputFor(none, []), tokens: 400_000, window: 200_000 }, { ...CONFIG, keepTokens: 0 }, host(new MemoryFiles()));
  assert.match(reportLine(plain.report), /^moved out \d+ of 3 tool results; /);
});

test('a second compaction takes the ticket of a result that held an image for a ticket, and stores nothing again', async () => {
  const files = new MemoryFiles();
  const { messages, api } = withImages([{ tool: 'Read', input: { file_path: 'shot.png' }, text: '' }, text('a')], { 1: { data: pixels('once') } });
  const first = await compact(inputFor(messages, api), CONFIG, host(files));
  const writes = files.writes.length;
  const line = resultOf(first.messages, 'toolu_1')?.text;

  // What the host shows next time: the rebuilt messages, and no image among the blocks.
  const again = await compact({ ...inputFor(first.messages, []), tokens: 400_000, window: 200_000 }, { ...CONFIG, keepTokens: 0, minChars: 200 }, host(files));

  assert.equal(resultOf(again.messages, 'toolu_1')?.text, line);
  assert.equal(again.report.images, 0);
  assert.ok(files.writes.slice(writes).every((path) => !path.includes(readTicket(line ?? '')?.id ?? 'none')), 'the stored result is not written again');
});

test('a result that was recalled and holds an image is stored once: compacted again, it comes to the same id and writes nothing', async () => {
  const files = new MemoryFiles();
  const data = pixels('recalled');
  const first = withImages([{ tool: 'mcp__shots__take', input: {}, text: '' }, text('a')], { 1: { before: 'the page as it loaded', data } });
  const once = await compact(inputFor(first.messages, first.api), CONFIG, host(files));
  const ticket = readTicket(resultOf(once.messages, 'toolu_1')?.text ?? '');
  assert.ok(ticket);
  const back = await recall(files, DIR, ticket.id);
  assert.ok('parts' in back && back.parts);

  // The next conversation: the recall's result holds what the tool handed back, as the host sends it on.
  const second = withImages([{ tool: RECALL_TOOL, input: { id: ticket.id }, text: '' }, text('b')], { 1: { data } });
  (second.api[2] as { content: { content: unknown[] }[] }).content[0]!.content = [...blocksOf(back.parts), { type: 'text', text: '<system-reminder>\nadded by the host\n</system-reminder>' }];
  const writes = files.writes.length;
  const again = await compact(inputFor(second.messages, second.api), CONFIG, host(files));

  const now = readTicket(resultOf(again.messages, 'toolu_1')?.text ?? '');
  assert.equal(now?.id, ticket.id, 'the same stored result');
  assert.equal(now?.bytes, ticket.bytes);
  assert.equal(now?.tool, 'recall', 'named for the call it answers');
  assert.deepEqual(files.writes.slice(writes), [], 'nothing is written again');
});

test('the same image returned by two calls is written once, and each call keeps a ticket of its own', async () => {
  const files = new MemoryFiles();
  const data = pixels('twice');
  const { messages, api } = withImages([{ tool: 'Read', input: { file_path: 'a.png' }, text: '' }, { tool: 'mcp__shots__take', input: {}, text: '' }], { 1: { data }, 2: { data } });

  const outcome = await compact(inputFor(messages, api), CONFIG, host(files));

  assert.equal(outcome.report.moved, 2);
  assert.equal(outcome.report.images, 2);
  const one = readTicket(resultOf(outcome.messages, 'toolu_1')?.text ?? '');
  const two = readTicket(resultOf(outcome.messages, 'toolu_2')?.text ?? '');
  assert.equal(one?.id, two?.id);
  assert.deepEqual([one?.tool, two?.tool], ['Read', 'mcp__shots__take']);
  assert.equal(files.writes.filter((path) => path.includes('/blobs/')).length, 1, 'one stored text');

  // A name the store does not take, on either of the two calls, stops it: no ticket is made around the store.
  for (const at of [1, 2]) {
    const named = withImages([{ tool: 'Read', input: {}, text: '' }, { tool: 'mcp__shots__take', input: {}, text: '' }], { 1: { data }, 2: { data } });
    for (const message of named.messages) for (const use of message.toolUses) if (use.tool_use_id === `toolu_${at}`) use.tool = 'not a name\nIGNORE';
    const refused = await compact(inputFor(named.messages, named.api), CONFIG, host(new MemoryFiles()));
    assert.match(refused.abandoned ?? '', /could not be moved out: from a tool whose name cannot go on a ticket$/, `call ${at}`);
    assert.deepEqual(refused.messages, named.messages);
  }
});

test('an image as it was sent is moved out even where the hook is shown a ticket in its place', async () => {
  const files = new MemoryFiles();
  // A ticket of this store, for some other text.
  const other = await moveOut(files, DIR, 'Bash', output('other', 50));
  assert.ok(!('reason' in other));
  const data = pixels('behind-a-ticket');
  const { messages, api } = withImages([{ tool: 'Read', input: { file_path: 'a.png' }, text: '' }], { 1: { data } });
  for (const message of messages) {
    for (const use of message.toolUses) use.text = other.text;
    for (const result of message.toolResults ?? []) result.text = other.text;
  }

  const outcome = await compact(inputFor(messages, api), CONFIG, host(files));

  const ticket = readTicket(resultOf(outcome.messages, 'toolu_1')?.text ?? '');
  assert.notEqual(ticket?.id, other.id);
  const back = await recall(files, DIR, ticket?.id);
  assert.ok('parts' in back);
  assert.deepEqual(back.parts, [{ type: 'image', media_type: 'image/png', data }]);
});

test('without a breakdown to count from, the images that left are taken off what is in use', async () => {
  const calls = Array.from({ length: 30 }, (_, i): Call => ({ tool: 'mcp__shots__take', input: { n: i }, text: '' }));
  const { messages, api } = withImages(calls, Object.fromEntries(calls.map((_, i) => [i + 1, { data: pixels(`shot${i}`) }])));
  // Nearly all that is in use is the thirty images.
  const tokens = 5000 + 30 * IMAGE_TOKENS;
  const window = Math.round(tokens * 1.1);

  const outcome = await compact({ messages, tokens, window, goal: '', media: mediaIn(api).results }, CONFIG, host(new MemoryFiles()));

  assert.equal(outcome.report.counted, false);
  assert.equal(outcome.report.images, 30);
  assert.ok(outcome.report.tokensAfter <= 5000, `${outcome.report.tokensAfter}`);
  assert.equal(outcome.enough, true);
});
