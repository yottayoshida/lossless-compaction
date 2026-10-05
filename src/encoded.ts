// How a result that held images is stored: its text and its images together as one text (ADR 0012). Nothing here
// reads a conversation or is of Claude Code: what takes an image out of a result, and puts one back into a
// message, is src/media.ts.

/** One block of a tool result that held an image, in the order the result held them. */
export type MediaPart = { type: 'text'; text: string } | { type: 'image'; media_type: string; data: string };

// How a stored result that holds images begins. What follows is the parts as
// JSON. That an entry holds an image is told by this alone: an entry beside it
// can be one another tool wrote for the same text.
const HEAD = '[lossless-compaction] a tool result holding images, version 1\n';

// The kinds of image the API takes, each with how its bytes begin in base64. A
// stored text is taken for an image only when its bytes begin as its kind does,
// so a tool's output that merely has the shape of an entry stays text.
const KINDS = new Map([
  ['image/png', 'iVBORw0KGgo'],
  ['image/jpeg', '/9j/'],
  ['image/gif', 'R0lGOD'],
  ['image/webp', 'UklGR'],
]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** True for the bytes of an image of that kind, in base64. What is stored and what is handed back are held to it alike. */
export function isImage(mediaType: unknown, data: unknown): data is string {
  if (typeof mediaType !== 'string' || typeof data !== 'string') return false;
  const start = KINDS.get(mediaType);
  return start !== undefined && data.startsWith(start) && BASE64.test(data);
}

export function encodeMedia(parts: readonly MediaPart[]): string {
  return HEAD + JSON.stringify(parts);
}

function partOf(value: unknown): MediaPart | null {
  if (typeof value !== 'object' || value === null) return null;
  const part = value as Record<string, unknown>;
  if (part['type'] === 'text' && typeof part['text'] === 'string') return { type: 'text', text: part['text'] };
  if (part['type'] === 'image' && isImage(part['media_type'], part['data'])) {
    return { type: 'image', media_type: part['media_type'] as string, data: part['data'] };
  }
  return null;
}

/** The parts of a stored result that holds images, or null for any other stored text. */
export function decodeMedia(text: string): MediaPart[] | null {
  if (!text.startsWith(HEAD)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(HEAD.length));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const parts = parsed.map(partOf);
  return parts.every((part): part is MediaPart => part !== null) && parts.some((part) => part.type === 'image') ? parts : null;
}

/** The text of a stored result that holds images: its text parts alone, never the bytes of an image. */
export function textOf(parts: readonly MediaPart[]): string {
  return parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}
