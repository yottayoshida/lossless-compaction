// An image a tool returned leaves the conversation with its result (ADR 0012).
//
// A rebuilt message carries text and tool blocks only, so the image cannot
// stay. The result's text and its images are stored together as one text, and
// one ticket stands in the result's place, as for any result that was moved out.

import { isImage, type MediaPart } from './encoded.ts';
import { WHY, type Why } from './reasons.ts';

export { decodeMedia, encodeMedia, isImage, textOf, type MediaPart } from './encoded.ts';

// Text the host puts after a result's own blocks, taken off the end only. It is not what the tool returned.
const HOST_NOTE = /^<system-reminder>/;

/** A rough figure for what one image takes of the context: one of 1,092 by 1,092 pixels comes to about 1,590 tokens. */
export const IMAGE_TOKENS = 1500;

/**
 * A stored result that holds images as the blocks a tool hands back, in the
 * form the Messages API takes and in the order they were stored, with nothing
 * added. Read again from the conversation and stored again, they come to the
 * same text, so a result that was recalled is stored once.
 */
export function blocksOf(parts: readonly MediaPart[]): unknown[] {
  return parts.map((part) =>
    part.type === 'text' ? { type: 'text', text: part.text } : { type: 'image', source: { type: 'base64', media_type: part.media_type, data: part.data } },
  );
}

export type Media = {
  /** By the id of its call, every tool result that holds an image, with its parts. */
  results: Map<string, MediaPart[]>;
  images: number;
  /** Why one of them cannot be moved out, or null. */
  why: Why | null;
};

/**
 * The tool results of a conversation that hold an image, read from the
 * conversation with its blocks intact. An image anywhere else is not looked
 * at here: `whyNotRebuilt` leaves such a conversation to the built-in compaction.
 */
export function mediaIn(api: unknown): Media {
  const media: Media = { results: new Map(), images: 0, why: null };
  if (!Array.isArray(api)) return media;
  for (const message of api) {
    const content = (message as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) continue;
    for (const raw of content) {
      if (typeof raw !== 'object' || raw === null) continue;
      const block = raw as Record<string, unknown>;
      if (block['type'] !== 'tool_result') continue;
      if (!Array.isArray(block['content'])) {
        // An image that is the whole content and not one of a list: not a form to take one from.
        if ((block['content'] as { type?: unknown } | null)?.type === 'image') media.why = WHY.imageNotInList();
        continue;
      }
      const inside = block['content'] as unknown[];
      if (!inside.some((b) => (b as { type?: unknown } | null)?.type === 'image')) continue;
      const id = block['tool_use_id'];
      if (typeof id !== 'string') {
        media.why = WHY.imageWithoutCall();
        continue;
      }
      const parts: MediaPart[] = [];
      for (const b of inside) {
        const one = (typeof b === 'object' && b !== null ? b : {}) as Record<string, unknown>;
        if (one['type'] === 'text' && typeof one['text'] === 'string') {
          parts.push({ type: 'text', text: one['text'] });
          continue;
        }
        const source = one['source'] as Record<string, unknown> | undefined;
        if (one['type'] !== 'image') {
          media.why = WHY.imageBesideOther();
        } else if (typeof source !== 'object' || source === null || source['type'] !== 'base64' || typeof source['data'] !== 'string') {
          media.why = WHY.imageNotBytes();
        } else if (!isImage(source['media_type'], source['data'])) {
          media.why = WHY.imageOfAnotherKind();
        } else {
          parts.push({ type: 'image', media_type: source['media_type'] as string, data: source['data'] });
          media.images += 1;
        }
      }
      // What the host put after the result's own blocks is not the result's.
      for (let last = parts.at(-1); last?.type === 'text' && HOST_NOTE.test(last.text); last = parts.at(-1)) parts.pop();
      media.results.set(id, parts);
    }
  }
  return media;
}
