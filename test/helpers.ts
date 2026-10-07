import type { DirEntry, FileStat, Files, Http, HttpResponse, Message } from '../src/types.ts';

/**
 * A file system in memory that behaves as the host's was measured to: a write
 * follows a symbolic link, `stat` reports a link as a link, and a link to
 * nothing is `other`.
 */
export class MemoryFiles implements Files {
  readonly files = new Map<string, string>();
  readonly links = new Map<string, string>();
  readonly dirs = new Set<string>();
  readonly writes: string[] = [];
  /** Every path that was read or looked at, in order. */
  readonly looked: string[] = [];
  /** Set to change what a write stores, as a broken disk would. */
  corrupt: ((text: string) => string) | undefined;

  /** `path` as the host resolves it: a link it is, or a link to a directory it goes through, replaced by where it leads. */
  #real(path: string): string {
    let at = path;
    for (let hops = 0; hops < 8; hops += 1) {
      const link = [...this.links.keys()].find((one) => at === one || at.startsWith(`${one}/`));
      if (link === undefined) return at;
      at = `${this.links.get(link)}${at.slice(link.length)}`;
    }
    return at;
  }

  /** Where `path` lands, as the host's `fs.stat` with `resolve` answers: null where it leads nowhere. */
  async realPath(path: string): Promise<string | null> {
    const at = this.#real(path);
    return this.files.has(at) || this.dirs.has(at) ? at : null;
  }

  async read(path: string): Promise<string> {
    this.looked.push(path);
    const text = this.files.get(this.#real(path));
    if (text === undefined) throw new Error(`nothing at ${path}`);
    return text;
  }

  async write(path: string, text: string): Promise<void> {
    this.writes.push(path);
    const real = this.#real(path);
    this.files.set(real, this.corrupt ? this.corrupt(text) : text);
    for (let cut = real.lastIndexOf('/'); cut > 0; cut = real.lastIndexOf('/', cut - 1)) {
      this.dirs.add(real.slice(0, cut));
    }
  }

  async stat(path: string): Promise<FileStat> {
    this.looked.push(path);
    // What the path leads to, and whether it is itself a link: one that leads nowhere is `other`.
    const at = this.#real(path);
    const isLink = this.links.has(path);
    const text = this.files.get(at);
    if (text !== undefined) return { kind: 'file', size: text.length, isLink };
    if (this.dirs.has(at)) return { kind: 'dir', size: 0, isLink };
    if (isLink) return { kind: 'other', size: 0, isLink: true };
    throw new Error(`nothing at ${path}`);
  }

  /** When each file was last written, in ms; a file not in it is as old as can be. */
  readonly mtimes = new Map<string, number>();

  /** The entries directly in `path`, as the host's `fs.list` gives them: a link in it is `other`, not followed; a path through one is. */
  async list(path: string): Promise<DirEntry[]> {
    const dir = this.#real(path);
    if (!this.dirs.has(dir)) throw new Error(`no directory at ${path}`);
    const names = new Map<string, DirEntry>();
    const child = (full: string) => (full.startsWith(`${dir}/`) ? full.slice(dir.length + 1).split('/')[0] : undefined);
    for (const full of [...this.files.keys(), ...this.dirs, ...this.links.keys()]) {
      const name = child(full);
      if (name === undefined || names.has(name)) continue;
      const at = `${dir}/${name}`;
      const kind = this.links.has(at) ? 'other' : this.files.has(at) ? 'file' : 'dir';
      const text = this.links.has(at) ? undefined : this.files.get(at);
      // In bytes, as the host gives it.
      names.set(name, { name, kind, mtimeMs: this.mtimes.get(at) ?? 0, isLink: this.links.has(at), ...(text === undefined ? {} : { size: Buffer.byteLength(text) }) });
    }
    return [...names.values()];
  }

  /** What is stored, by path, for comparing one state of the disk with another. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files].sort(([a], [b]) => a.localeCompare(b)));
  }
}

/** The error the host throws for a write the disk refused, as measured (ADR 0008). */
export const enospc = (path: string) => new Error(`lossless-compaction: $.fs.write(${path}) failed: ENOSPC`);

/**
 * A disk that writes as the host's was measured to: a write first cuts the
 * file to nothing, then, after the other writes in flight have had a turn,
 * puts the text there. A write `full` says no to puts half of it and throws
 * ENOSPC, as a full disk did. With `moves`, it can also move a file into place
 * in one step, as `mv` does; without, it is a host with no `mv`.
 */
export class DiskFiles extends MemoryFiles {
  /** Says which writes the disk refuses, by path and by the count of writes so far. */
  full: (path: string, count: number) => boolean = () => false;
  /** Says which writes a broken disk stores other text for, without saying so. */
  garble: (path: string, count: number) => boolean = () => false;
  /** When a write that goes wrong gets to the disk. A test resolves it once the write it races has finished. */
  later: Promise<void> = Promise.resolve();
  readonly renamed: [string, string][] = [];
  readonly removed: string[] = [];
  readonly renewed: string[] = [];
  /** The time a renewed file is given. */
  now: () => number = () => Date.now();
  #count = 0;

  constructor(moves: boolean, renameWorks = true) {
    super();
    if (moves) {
      this.move = {
        available: async () => true,
        rename: async (from, to) => {
          this.renamed.push([from, to]);
          const text = this.files.get(from);
          // As `mv`: it makes no directory, so the one `to` is in has to be there.
          if (!renameWorks || text === undefined || !this.dirs.has(to.slice(0, to.lastIndexOf('/')))) return false;
          this.files.delete(from);
          this.files.set(to, text);
          return true;
        },
        remove: async (path) => {
          this.removed.push(path);
          this.files.delete(path);
        },
        makeDir: async (path) => {
          if (!renameWorks) return;
          for (let cut = path.length; cut > 0; cut = path.lastIndexOf('/', cut - 1)) this.dirs.add(path.slice(0, cut));
        },
        // As `touch -c`: the time of a file that is there, and no file where there is none.
        renew: async (path) => {
          this.renewed.push(path);
          if (this.files.has(path)) this.mtimes.set(path, this.now());
        },
      };
    }
  }

  move: Files['move'];

  override async write(path: string, text: string): Promise<void> {
    this.#count += 1;
    const refused = this.full(path, this.#count);
    const garbled = this.garble(path, this.#count);
    await super.write(path, '');
    // A write that goes wrong is the slow one: it gets to the disk once `later` says the others are done,
    // not after a time, which a busy machine does not keep.
    await (refused || garbled ? this.later : new Promise((resolve) => setTimeout(resolve, 1)));
    if (refused) {
      this.files.set(path, text.slice(0, Math.floor(text.length / 2)));
      throw enospc(path);
    }
    this.files.set(path, garbled ? `${text}!` : text);
  }
}

export type Sent = { url: string; headers: Record<string, string>; body: unknown };

/** An endpoint that records what it was sent and answers with `answer`. */
export function recordingHttp(answer: (sent: Sent, count: number) => HttpResponse | Promise<HttpResponse>) {
  const sent: Sent[] = [];
  const http: Http = async (url, init) => {
    const request = { url, headers: init.headers, body: JSON.parse(init.body) as unknown };
    sent.push(request);
    return answer(request, sent.length);
  };
  return { http, sent };
}

export const ok = (payload: unknown): HttpResponse => ({ status: 200, ok: true, text: JSON.stringify(payload) });

/** The questions of a request, whichever provider it was built for. */
export function questionsOf(sent: Sent): Record<string, { instructions: string }> {
  const body = sent.body as { questions?: unknown; input?: { questions?: unknown } };
  return (body.questions ?? body.input?.questions ?? {}) as Record<string, { instructions: string }>;
}

/** The options of the one choice a request carries, each with its key. */
export const optionsAsked = (sent: Sent) => Object.entries((questionsOf(sent)['q'] as { criteria?: Record<string, string> } | undefined)?.criteria ?? {});

/** What `find` adds to the option of the one result a line of which holds the values a question names. */
export const TOLD = /One of its lines holds ("[^"]+"(?: and )?)+\.$/;

/** A stand-in for Jev that takes the result it is told holds the values, at probability `p`, and says none where it is told of no one result. */
export const trusting = (p = 0.95) =>
  recordingHttp((sent) => {
    const options = optionsAsked(sent);
    const told = options.filter(([, text]) => TOLD.test(text));
    const winner = told.length === 1 ? (told[0]?.[0] ?? 'none') : 'none';
    return ok({ answers: { q: { type: 'choice', choice: winner, probabilities: Object.fromEntries(options.map(([key]) => [key, key === winner ? p : (1 - p) / (options.length - 1)])) } } });
  });

export type Call = { tool: string; input: Record<string, unknown>; text: string; isError?: boolean };

/**
 * A conversation as a `session.compact` hook receives it: the person's
 * request, then a call and its result per entry, then the assistant's last
 * word. The result's text sits on both sides of each call, and every message
 * carries a handle.
 */
export function conversation(calls: readonly Call[], request = 'Fix the failing parser test.'): Message[] {
  const messages: Message[] = [{ role: 'user', text: request, toolUses: [], handle: 'h0' }];
  calls.forEach((call, index) => {
    const id = `toolu_${index + 1}`;
    messages.push({
      role: 'assistant',
      text: '',
      toolUses: [
        {
          tool_use_id: id,
          tool: call.tool,
          input: call.input,
          text: call.text,
          result: { stdout: call.text },
          ...(call.isError ? { isError: true as const } : {}),
        },
      ],
      handle: `h${messages.length}`,
    });
    messages.push({
      role: 'user',
      text: '',
      toolUses: [],
      toolResults: [{ tool_use_id: id, text: call.text, isError: call.isError ?? false, result: { stdout: call.text } }],
      handle: `h${messages.length}`,
    });
  });
  messages.push({ role: 'assistant', text: 'Done with that step.', toolUses: [], handle: `h${messages.length}` });
  return messages;
}

/** A Read of `file` whose result is exactly `chars` characters, distinct per file. */
export const sized = (file: string, chars: number): Call => ({
  tool: 'Read',
  input: { file_path: file },
  text: `${file}\n${'x'.repeat(chars - file.length - 1)}`,
});

/** `lines` numbered lines that start with `label`, so two outputs never share text. */
export function output(label: string, lines: number): string {
  return Array.from({ length: lines }, (_, i) => `${label} line ${i + 1}: value ${(i * 7919) % 1000}`).join('\n');
}
