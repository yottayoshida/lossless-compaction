// Replays one compaction from Claude Code's record of a session, offline: the
// conversation as it stood before the compaction is put together from the record
// and given to `compact()` as it is in this checkout, and what `compact()` leaves
// too full is given to the cut that stands in place of a summary (src/cut.ts).
// Nothing is sent, and the store is held in memory. What it prints is sizes and
// counts, not what the conversation said.
//
//   node bench/replay.ts <record.jsonl> <line> [targetPercent] [maxAfterPercent]
//
// <line> is the 1-based line of the record where the compaction to replay is reported
// (the plugin's line, or the compaction's boundary). The conversation is every message
// after the compaction before it, up to that line. What is not the conversation is taken
// as the session's first request, and the tokens in use as the last response's usage
// before the line: as in docs/measurements.md, "Moving out tool inputs".

import { readFileSync } from 'node:fs';
import { CHARS_PER_TOKEN, charsOf, compact, countFrom, weightOf, type Config } from '../src/compact.ts';
import { decide, keepOldest } from '../src/cut.ts';
import { messagesFromApi } from '../src/keep.ts';
import { mediaIn } from '../src/media.ts';
import { goalOf, whyNotRebuilt } from '../src/select.ts';
import type { FileStat, Files, Message } from '../src/types.ts';

type Row = { type?: string; subtype?: string; isSidechain?: boolean; isMeta?: boolean; message?: { role?: string; content?: unknown; usage?: Record<string, number> } };

/** A store in memory: enough for `compact()` to write, read back and compare. */
class Memory implements Files {
  readonly files = new Map<string, string>();
  async read(path: string): Promise<string> {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`nothing at ${path}`);
    return text;
  }
  async write(path: string, text: string): Promise<void> {
    this.files.set(path, text);
  }
  async stat(path: string): Promise<FileStat> {
    const text = this.files.get(path);
    if (text !== undefined) return { kind: 'file', size: Buffer.byteLength(text) };
    for (const key of this.files.keys()) if (key.startsWith(`${path}/`)) return { kind: 'dir', size: 0 };
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  }
}

const usageOf = (row: Row): number | null => {
  const u = row.message?.usage;
  if (u === undefined) return null;
  return (u['input_tokens'] ?? 0) + (u['cache_read_input_tokens'] ?? 0) + (u['cache_creation_input_tokens'] ?? 0);
};

/** The conversation before the compaction reported at `line`, in the form the API is sent. */
export function apiBefore(rows: readonly Row[], line: number): unknown[] {
  let start = 0;
  for (let at = line - 2; at >= 0; at -= 1) {
    if (rows[at]?.subtype === 'compact_boundary') {
      start = at + 1;
      break;
    }
  }
  const api: { role: string; content: unknown[] }[] = [];
  for (const row of rows.slice(start, line - 1)) {
    if ((row.type !== 'user' && row.type !== 'assistant') || row.isSidechain || row.message === undefined) continue;
    const role = row.message.role ?? row.type;
    const content = row.message.content;
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
    const last = api[api.length - 1];
    // The record keeps each block of a response on its own row; the API sends one message a turn.
    if (last !== undefined && last.role === role) last.content.push(...blocks);
    else api.push({ role, content: [...blocks] });
  }
  return api;
}

export async function replay(record: string, line: number, targetPercent: number, maxAfterPercent: number) {
  const rows: Row[] = record.split('\n').filter((text) => text.trim() !== '').map((text) => {
    try {
      return JSON.parse(text) as Row;
    } catch {
      return {};
    }
  });
  const api = apiBefore(rows, line);
  const read = messagesFromApi(api);
  if (read === null) throw new Error('the conversation could not be read');
  // As a hook is handed them: the result as the model read it on the call's side too.
  const results = new Map(read.flatMap((m) => (m.toolResults ?? []).map((r) => [r.tool_use_id, r.text] as const)));
  const messages: Message[] = read.map((m) => ({ ...m, toolUses: m.toolUses.map((u) => ({ ...u, text: results.get(u.tool_use_id) })) }));
  const fixedTokens = rows.map(usageOf).find((n): n is number => n !== null && n > 0) ?? 0;
  const tokens = rows.slice(0, line - 1).map(usageOf).filter((n): n is number => n !== null && n > 0).pop() ?? 0;
  const breakdown = { apiUsage: {}, categories: [{ kind: 'used', name: 'System', tokens: fixedTokens }, { kind: 'used', name: 'Messages', tokens: tokens - fixedTokens }] };
  const count = countFrom(breakdown, tokens, api, messages);
  const window = tokens > 200_000 ? 967_000 : 167_000;
  const keepTokens = 20_000;
  const config: Config = { store: { write: '/memory/store', read: ['/memory/store'] }, keepTokens, minChars: 2000, targetPercent, maxAfterPercent };
  const media = mediaIn(api);
  const files = new Memory();
  const outcome = await compact(
    { messages, tokens, count, window, goal: goalOf(messages, undefined), media: media.results },
    config,
    { files, now: () => Date.now() },
  );
  // Counted here, apart from `compact()` and from the cut: what stays, at the density the record gives.
  const recounted = (stay: readonly Message[]): number =>
    Math.round(fixedTokens + (count === undefined ? charsOf(stay) / CHARS_PER_TOKEN : weightOf(stay) * count.density));
  const limit = Math.round((window * maxAfterPercent) / 100);

  // What the hook does with a conversation `compact()` leaves too full or with nothing moved out, `/compact` having been given no instructions.
  const asked = { messages: outcome.messages, tokens: outcome.report.tokensAfter, count, window, maxAfterPercent, cutTo: outcome.target, keepTokens, instructions: undefined };
  const handedOver = (outcome.report.moved === 0 && outcome.report.inputs === 0 && (outcome.report.bodies ?? 0) === 0 && outcome.report.folded === 0) || !outcome.enough;
  const decision = handedOver ? decide(asked) : null;
  const kept = decision?.hand === 'back' && decision.at > 0 ? await keepOldest(files, config.store, asked, decision.after, decision.at) : null;
  const cut =
    decision === null
      ? null
      : decision.hand === 'summary'
        ? { hand: 'summary' as const }
        : kept === null
          ? { hand: 'back' as const, cut: 0, of: outcome.messages.length, tokensAfter: decision.tokensAfter, recount: recounted(outcome.messages) }
          : 'failed' in kept
            ? { hand: 'summary' as const, failed: kept.failed }
            : {
                hand: 'back' as const,
                /** How many messages were kept in parts, and whether the first message stayed in front of them. */
                cut: decision.at - decision.after,
                firstStays: decision.after === 1,
                of: outcome.messages.length,
                parts: kept.parts,
                /** What was estimated before anything was written, and what the conversation as written comes to. */
                estimated: decision.tokensAfter,
                tokensAfter: kept.tokensAfter,
                recount: recounted(kept.messages),
                over: decision.over,
              };
  return {
    messages: messages.length,
    notRebuilt: whyNotRebuilt(messages, api),
    tokens,
    fixedTokens,
    window,
    counted: count !== undefined,
    density: count?.density,
    results: outcome.report.results,
    moved: outcome.report.moved,
    charsBefore: charsOf(messages),
    charsAfter: outcome.report.charsAfter,
    tokensAfter: outcome.report.tokensAfter,
    recount: recounted(outcome.messages),
    limit,
    enough: outcome.enough,
    /** Null where moving results out was enough: the hook hands that back as it is. */
    cut,
  };
}

if (import.meta.main) {
  const [file, line, target, maxAfter] = process.argv.slice(2);
  if (file === undefined || line === undefined) {
    console.error('usage: node bench/replay.ts <record.jsonl> <line> [targetPercent] [maxAfterPercent]');
    process.exit(2);
  }
  const out = await replay(readFileSync(file, 'utf8'), Number(line), Number(target ?? 40), Number(maxAfter ?? 75));
  console.log(JSON.stringify(out, null, 2));
}
