// What Claude Code attached to the messages of a conversation as it sent them, which the messages a compaction hook
// is handed lack (#105): a file handed over with `@`, what a hook added, the text of a command, reminders, after what
// the person said and after what a tool returned. Read from the conversation as it was sent, set against the messages
// handed over. Nothing here is written: src/keep.ts keeps what this finds.

import type { Message } from './types.ts';

/** One block of what was attached, under the message it came with: `with message 3`, or `before message 1` where it came alone. */
export type Attached = { label: string; text: string };

/** The text of a block's content as it was sent: a string, or its text blocks, a line apart. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((block) => (typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text' ? [String((block as { text?: unknown }).text ?? '')] : []))
    .join('\n');
}

/**
 * What the conversation as it was sent (`api`) holds that the messages handed over (`handed`) do not, block by block,
 * in order: a text block no message of the person's was, what a result was sent with after its own text, and a result
 * no handed message holds. What the person said and what a tool returned are not among it. Where a result was sent
 * other than it was handed (its own text not at its start), the whole of it is: kept twice rather than not at all.
 */
export function attachedOf(handed: readonly Message[], api: unknown): Attached[] {
  if (!Array.isArray(api)) return [];
  // Where each result and each thing the person said stands among the messages handed over.
  const results = new Map<string, { at: number; text: string }>();
  const said = new Map<string, number[]>();
  handed.forEach((message, at) => {
    for (const result of message.toolResults ?? []) results.set(result.tool_use_id, { at, text: result.text });
    const text = message.text.trim();
    if (message.role === 'user' && text !== '') said.set(text, [...(said.get(text) ?? []), at]);
  });
  // Each message as it was sent: the handed message it holds, if any, and what came with it.
  const groups: { at: number | undefined; texts: string[] }[] = [];
  for (const raw of api) {
    const { role, content } = (typeof raw === 'object' && raw !== null ? raw : {}) as { role?: unknown; content?: unknown };
    if (role !== 'user') continue;
    const group: { at: number | undefined; texts: string[] } = { at: undefined, texts: [] };
    for (const block of typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []) {
      const b = (typeof block === 'object' && block !== null ? block : {}) as Record<string, unknown>;
      if (b['type'] === 'text') {
        const text = String(b['text'] ?? '').trim();
        // Each thing said is matched once, in order: a word said twice is two messages.
        const at = said.get(text)?.shift();
        if (at !== undefined) group.at ??= at;
        else if (text !== '') group.texts.push(text);
      } else if (b['type'] === 'tool_result') {
        const sent = textOf(b['content']);
        const own = results.get(String(b['tool_use_id'] ?? ''));
        if (own === undefined) {
          if (sent.trim() !== '') group.texts.push(sent.trim());
          continue;
        }
        group.at ??= own.at;
        const ownText = own.text.trimEnd();
        const rest = sent.startsWith(ownText) ? sent.slice(ownText.length) : sent.trim() === own.text.trim() ? '' : sent;
        if (rest.trim() !== '') group.texts.push(rest.trim());
      }
    }
    groups.push(group);
  }
  // A message sent with nothing handed in it is named by the next that has something, else by the last handed over.
  return groups.flatMap((group, index) => {
    const next = group.at ?? groups.slice(index + 1).find((later) => later.at !== undefined)?.at;
    const label = group.at !== undefined ? `with message ${group.at + 1}` : next !== undefined ? `before message ${next + 1}` : `after message ${handed.length}`;
    return group.texts.map((text) => ({ label, text }));
  });
}
