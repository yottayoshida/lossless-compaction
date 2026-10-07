// Asking Jev which of several tool results a question is about.
//
// One `choice` question per request, its options the results moved out of a
// conversation, each shown as a digest cut from the text after secrets' shapes
// have been blanked. Jev's answer is a distribution over the options; what is
// made of it is decided in find.ts. Nothing is asked at a compaction.

import type { Http } from './types.ts';

const JUDGING =
  'Each option is one tool result that was moved out of this coding session: the call that made it, the size of ' +
  'its output, and a digest of the output. Choose the result the question is about.';

/** At most this many options, and this many characters, per request, before the one put into every request. Measured: 95 options of 750 characters went through. */
export const OPTIONS_PER_REQUEST = 80;
export const CHARS_PER_REQUEST = 60_000;
/** When a round took several requests, this many of each go on to the next round. */
export const FINALISTS = 3;
/** How long one request is waited for. Jev answers in well under two seconds when it answers. */
export const REQUEST_WITHIN_MS = 20_000;
const MAX_REQUESTS = 24;
const MAX_ROUNDS = 4;
const IN_FLIGHT = 8;
const SPLITS = 3;

const BLANK = '[redacted]';

/** A number written with `+` and a country code is taken for a telephone number when it has as many digits as one can (E.164). */
const PHONE_DIGITS = { least: 8, most: 15 } as const;

/**
 * What is blanked of a number written with `+` and groups: the longest run of its first groups that has as many digits
 * as a telephone number can, the rest kept (`+44 20 7946 0958 2026-10-07` blanks the number and keeps the date). Too few
 * digits even in all of it, and nothing is.
 */
function phone(found: string): string {
  let digits = 0;
  let upTo = 0;
  for (const group of found.matchAll(/\d+/g)) {
    digits += group[0].length;
    if (digits > PHONE_DIGITS.most) break;
    if (digits >= PHONE_DIGITS.least) upTo = (group.index ?? 0) + group[0].length;
  }
  return upTo === 0 ? found : `${BLANK}${found.slice(upTo)}`;
}

/**
 * A value given to a name, blanked: a quoted one to its closing quote (the quote kept, escaped or not), any other to a
 * space, a comma or a semicolon.
 */
const value = (_found: string, name: string, given: string) => `${name}${/^\\?["']/.exec(given)?.[0] ?? ''}${BLANK}`;

// Shapes of secrets, and of what tells who a person is. This is a courtesy, not a boundary: a password with no
// telling name or prefix passes through it. PRIVACY.md lists them; the order matters where one shape holds
// another (a webhook's path holds an `@`, an address with a password holds one without). Those marked
// "gitleaks:" are adapted from the rules of that name in gitleaks's default configuration (MIT,
// github.com/gitleaks/gitleaks). No address here is one the plugin sends to (test/privacy.test.ts).
const SHAPES: readonly (readonly [RegExp, string | ((found: string, ...groups: string[]) => string)])[] = [
  [/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(?:-----END [A-Z0-9 ]+-----|$)/g, BLANK],
  // The path of an incoming webhook is its secret; a `/` may be written `\/` in JSON. gitleaks: slack-webhook-url,
  // microsoft-teams-webhook; Discord's is not among them: its form is Discord's own documentation of webhooks.
  [/\b(hooks\.slack\.com\\?\/(?:services|workflows|triggers)\\?\/)[^\s"'<>]+/gi, `$1${BLANK}`],
  [/\b([a-z0-9-]{1,63}\.webhook\.office\.com\\?\/webhookb2\\?\/)[^\s"'<>]+/gi, `$1${BLANK}`],
  [/\b(discord(?:app)?\.com\\?\/api\\?\/(?:v\d{1,3}\\?\/)?webhooks\\?\/\d{1,30}\\?\/)[^\s"'<>/?\\]+/gi, `$1${BLANK}`],
  // A password with a user or none (`redis://:password@host`).
  [/\b([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/@:]{0,256}:[^\s/@]{1,256}@/gi, `$1${BLANK}@`],
  // A user alone stands for a key where a service takes one there (a DSN): blanked whatever it is.
  [/\b([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/@:]{1,256}@/gi, `$1${BLANK}@`],
  // A quote before a value may be escaped, as JSON writes one inside a string (a kept part's call line).
  [/\b((?:proxy-)?authorization\\?["']?\s*[:=]\s*\\?["']?)[^\r\n"']+/gi, `$1${BLANK}`],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${BLANK}`],
  [
    /\b([A-Za-z0-9_.-]*(?:api[_-]?key|secret|token|passwd|password|pwd|credential|private[_-]?key)[A-Za-z0-9_.-]*\\?["']?\s*[:=]\s*)(\\?"[^"\r\n]*|\\?'[^'\r\n]*|[^\s"',;]+)/gi,
    value,
  ],
  // An assignment as an environment file or a shell writes one, to a name in capitals ending as keys, passwords,
  // DSNs and webhooks are named, or that is one of those words (`DSN=`).
  [/(?<![A-Za-z0-9_$])([A-Z0-9_]*(?:_KEY|_PASS|_PW|DSN|_WEBHOOK|_WEBHOOK_URL)\s*=\s*)(\\?"[^"\r\n]*|\\?'[^'\r\n]*|[^\s"',;]+)/g, value],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, BLANK],
  // gitleaks: stripe-access-token.
  [/\b(?:sk|rk)_(?:live|test|prod)_[A-Za-z0-9]{10,}/g, BLANK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, BLANK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, BLANK],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, BLANK],
  [/\bxox[abeoprs]-[A-Za-z0-9-]{10,}/g, BLANK],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, BLANK],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, BLANK],
  // gitleaks: npm-access-token, pypi-upload-token, rubygems-api-token.
  [/\bnpm_[A-Za-z0-9]{36}\b/g, BLANK],
  [/\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}/g, BLANK],
  [/\brubygems_[a-f0-9]{48}\b/g, BLANK],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, BLANK],
  [
    /([?&](?:X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|sig|signature|token|access_token|key)=)[^&\s"']+/gi,
    `$1${BLANK}`,
  ],
  // An email address, not `user@host:path` (where git and scp are told which account to use), nor a domain going
  // on past where it is cut (`a@host.example` of `a@host.example.com:path`). Each part is bounded, as an address's
  // are: a long run of letters is not read again from each place it could begin.
  [/\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}\b(?!:\S|[.-][A-Za-z0-9])/g, BLANK],
  // A telephone number with `+` and its country code, `(+81)` too, then groups apart by a space, a `-` or a `.`;
  // after a part in brackets (`(0)20`, `(415)555`) a group may follow with none. Not one written at home
  // (`090-1234-5678` is shaped as a date is, `07-10-2026`), nor `+12345678` or `+0900` with no groups; `phone`
  // keeps one of too few or too many digits (`+10 20 30`). And a `tel:` link, whatever it holds.
  [/(?<![\w+])(?:\(\+\d{1,3}\)|\+\d{1,3})(?:[ .-]?\(\d{1,4}\)[ .-]?\d{1,8}|[ .-]\d{1,8})(?:[ .-]\(?\d{1,8}\)?)+(?![\w-])/g, phone],
  [/\btel:[^\s"'<>]{6,}/gi, BLANK],
];

export function redact(text: string): string {
  let out = text;
  // Two calls for replace's two signatures, a text and a function: TypeScript takes neither for the union.
  for (const [shape, replacement] of SHAPES) out = typeof replacement === 'string' ? out.replace(shape, replacement) : out.replace(shape, replacement);
  return out;
}

const LOUD = /\b(?:errors?|failed|failures?|fatal|panic(?:ked)?|exception|traceback|denied|refused|cannot|segmentation)\b/i;
const LINE = 200;

/**
 * The first `limit` UTF-16 units of `text`, one fewer where the last would be
 * the first half of a pair: a half alone is not text UTF-8 can hold (#70).
 */
export function head(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const last = text.charCodeAt(limit - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? limit - 1 : limit);
}

/**
 * The head and the tail of a result, and the lines between them that look like
 * failures. Secrets' shapes are blanked over the whole text first: cutting
 * first could split one and leave a piece no shape matches.
 */
export function digest(text: string, limit = 700): string {
  const lines = redact(text).split('\n');
  const clip = (line: string) => (line.length > LINE ? `${head(line, LINE)} [...]` : line);
  if (lines.length <= 12) return head(lines.map(clip).join('\n'), limit);
  const middle = lines.slice(6, -4);
  const loud = middle.filter((line) => LOUD.test(line)).slice(0, 5);
  return head(
    [...lines.slice(0, 6), `[... ${middle.length} lines, of which these look like failures:]`, ...loud, '[...]', ...lines.slice(-4)].map(clip).join('\n'),
    limit,
  );
}

/** A value with every string in it blanked. */
function redactIn(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redact(value);
  if (depth > 8 || typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => redactIn(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactIn(item, depth + 1)]));
}

/**
 * A call's input as one line. Blanked before it is written as JSON, which
 * puts a backslash before a quote and so hides `KEY="..."` from the shapes,
 * and again after, where a secret shows by the name of its field.
 */
export function inputLine(input: Record<string, unknown>): string {
  return head(redact(JSON.stringify(redactIn(input))), 300);
}

export type Question = { type: 'choice'; instructions: string; criteria: Record<string, string> };

export type State = { task: string; judging: string };

/** The most of a question Jev is told, in UTF-16 units. */
export const QUESTION_CHARS = 2000;

/** What Jev is told: the question, blanked, and what the options are. Nothing of the conversation. */
export function stateFor(question: string): State {
  return { task: head(redact(question), QUESTION_CHARS), judging: JUDGING };
}

/** One option of a choice: a key Jev answers by, and the text it is shown. */
export type Option = { key: string; text: string };

/** Options grouped so that each request stays within the size a request may have. */
export function batchesFor(options: readonly Option[]): Option[][] {
  const batches: Option[][] = [];
  let current: Option[] = [];
  let used = 0;
  for (const option of options) {
    const size = option.text.length + option.key.length + 8;
    if (current.length > 0 && (current.length >= OPTIONS_PER_REQUEST || used + size > CHARS_PER_REQUEST)) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push(option);
    used += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export type Provider =
  | { kind: 'typesafe'; key: string; model: string }
  | { kind: 'cloudflare'; key: string; accountId: string };

export type Settings = { provider?: unknown; apiKey?: unknown; cloudflareAccountId?: unknown; model?: unknown };
export type Environment = { TYPESAFE_API_KEY?: string; CLOUDFLARE_API_TOKEN?: string; CLOUDFLARE_ACCOUNT_ID?: string };

/** A setting as it is taken: a string that is not blank, trimmed. Anything else is unset. trust.ts judges by it too. */
export const filled = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** The account id as the settings hold it. A value that is not text is there too, and is no id: '' stands for it, which is entered and never well formed. */
function enteredId(id: unknown): string | undefined {
  return typeof id === 'string' ? filled(id) : id === undefined || id === null ? undefined : '';
}

/** Whether the settings chose the provider, by `provider` or an account id: only then is a key in the environment used (ADR 0028). */
export function choosesProvider(settings: Settings): boolean {
  return (filled(settings.provider) ?? 'auto') !== 'auto' || enteredId(settings.cloudflareAccountId) !== undefined;
}

/**
 * Who is asked, or null when no key was given and nothing is to be sent.
 * A setting is read before the environment. The address is fixed per kind and
 * cannot be set, and a key from the environment goes to its own provider only.
 * The key in the settings is one field: it goes to whichever provider is chosen.
 *
 * Left on `auto`, an account id in the settings chooses Cloudflare and none
 * chooses TypeSafe: the field for the provider arrives filled in whether or not
 * it was touched, so the account id is what tells the two apart (ADR 0009).
 * "In the settings" is "not blank", not "well formed": a malformed id read as
 * absent would send a Cloudflare key to TypeSafe.
 *
 * A key in the environment is used only where the settings chose the provider:
 * `provider` set to one, or an account id entered. Left on `auto` with none, a
 * key exported for another tool would start sending excerpts on its own (#103).
 */
export function providerFrom(settings: Settings, env: Environment): Provider | null | { error: string } {
  const chosen = filled(settings.provider) ?? 'auto';
  if (chosen !== 'auto' && chosen !== 'typesafe' && chosen !== 'cloudflare') {
    return { error: 'provider must be auto, typesafe or cloudflare' };
  }
  const entered = enteredId(settings.cloudflareAccountId);
  const kind = chosen === 'auto' ? (entered === undefined ? 'typesafe' : 'cloudflare') : chosen;
  const set = filled(settings.apiKey);
  const key = set ?? (choosesProvider(settings) ? filled(kind === 'typesafe' ? env.TYPESAFE_API_KEY : env.CLOUDFLARE_API_TOKEN) : undefined);
  if (key === undefined) return null;
  if (!/^[\x21-\x7e]+$/.test(key)) return { error: 'the API key holds a character a key cannot have' };
  if (kind === 'typesafe') {
    if (entered !== undefined) {
      return {
        error:
          'provider is typesafe while cloudflareAccountId is set, so the key is sent to neither: ' +
          'clear cloudflareAccountId to ask TypeSafe, or set provider to auto to ask Cloudflare',
      };
    }
    return { kind, key, model: filled(settings.model) ?? 'jev-latest' };
  }
  // With the key from the settings, the account comes from the settings too: the
  // environment, which a repository can set, then decides nothing about where it goes.
  const accountId = entered ?? (set === undefined ? filled(env.CLOUDFLARE_ACCOUNT_ID) : undefined);
  if (accountId === undefined || !/^[0-9a-f]{32}$/i.test(accountId)) {
    if (entered === undefined) return { error: 'the cloudflare provider needs an account id of 32 hexadecimal characters' };
    return {
      error:
        'cloudflareAccountId is not 32 hexadecimal characters, so the key is sent nowhere: correct it to ask Cloudflare' +
        (chosen === 'auto' ? ', or clear it to ask TypeSafe' : ''),
    };
  }
  return { kind, key, accountId };
}

export function requestFor(provider: Provider, state: State, questions: Record<string, Question>) {
  const headers = { authorization: `Bearer ${provider.key}`, 'content-type': 'application/json' };
  if (provider.kind === 'typesafe') {
    return {
      url: 'https://api.typesafe.ai/v1/systemone',
      headers,
      body: JSON.stringify({ model: provider.model, state, questions }),
    };
  }
  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${provider.accountId}/ai/run`,
    headers,
    body: JSON.stringify({ model: 'typesafe/jev', input: { state, questions } }),
  };
}

/** The object holding `answers`. Workers AI wraps it a few levels down. */
function answersIn(payload: unknown): Record<string, unknown> | null {
  let node = payload;
  for (let depth = 0; depth < 5 && typeof node === 'object' && node !== null; depth += 1) {
    const object = node as Record<string, unknown>;
    const answers = object['answers'];
    if (typeof answers === 'object' && answers !== null && !Array.isArray(answers)) {
      return answers as Record<string, unknown>;
    }
    node = object['result'];
  }
  return null;
}

/** The probability of each key that was asked. Anything that is not a number from 0 to 1 is left out. */
export function readProbabilities(body: string, keys: readonly string[]): Map<string, number> {
  const probabilities = new Map<string, number>();
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return probabilities;
  }
  const answer = answersIn(payload)?.['q'];
  const given = typeof answer === 'object' && answer !== null ? (answer as { probabilities?: unknown }).probabilities : undefined;
  if (typeof given !== 'object' || given === null || Array.isArray(given)) return probabilities;
  for (const key of keys) {
    if (!Object.hasOwn(given, key)) continue;
    const p = (given as Record<string, unknown>)[key];
    if (typeof p === 'number' && p >= 0 && p <= 1) probabilities.set(key, p);
  }
  return probabilities;
}

/** The options of one request, and the probability Jev gave each of them. */
type Answered = { options: Option[]; probabilities: Map<string, number> };

/**
 * Why asking ended: what went wrong, and the HTTP status where an answer came with one. Set together, the two cannot
 * come from different requests. `json` where the answer was in JSON, as both providers answer (measured with a key
 * they refused): one that is not may be from something between this machine and the provider. Nothing else of the
 * answer is kept.
 */
export type Failed = { error: string; status?: number; json?: true };

export type Chosen = { ranked: [string, number][]; requests: number } | Failed;

export type Asking = {
  /** An option put into every request, such as "none of these"; it is ranked with the rest. */
  always?: Option | undefined;
  withinMs?: number | undefined;
  /** Resolves after `ms`, rejects when `signal` aborts: the host's clock. Without it, a request is waited for without end. */
  wait?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined;
};

/**
 * Asks which option the question is about. Options that do not fit one
 * request are asked in rounds: the likeliest few of each request meet in the
 * next round, until one request holds them all, and its distribution is the
 * answer. A request refused for its size is split in two. A request that
 * fails otherwise, is not answered in time, or is answered without a readable
 * probability for any option, ends the asking: a distribution over some of
 * the options would name the wrong one with confidence. No part of a
 * response is ever thrown or logged, since an endpoint may echo the key it
 * was sent.
 */
export async function choose(http: Http, provider: Provider, question: string, options: readonly Option[], asking: Asking = {}): Promise<Chosen> {
  const state = stateFor(question);
  const always = asking.always;
  const withinMs = asking.withinMs ?? REQUEST_WITHIN_MS;
  let requests = 0;
  let pool = options.filter((option) => option.key !== always?.key);
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const queue = batchesFor(pool).map((batch) => ({ options: always ? [always, ...batch] : batch, splits: SPLITS }));
    const answered: Answered[] = [];
    let failure: Failed | null = null;
    // Requests in flight end one after another: an answer with a status says more of why than one that came late or not
    // at all, and is not given up for it.
    const fail = (one: Failed) => {
      if (failure === null || (failure.status === undefined && one.status !== undefined)) failure = one;
    };

    const work = async () => {
      for (;;) {
        const job = queue.shift();
        if (!job || failure !== null) return;
        if (requests >= MAX_REQUESTS) {
          fail({ error: 'too many requests' });
          return;
        }
        requests += 1;
        const criteria = Object.fromEntries(job.options.map((option) => [option.key, option.text]));
        const request = requestFor(provider, state, { q: { type: 'choice', instructions: state.task, criteria } });
        let response;
        const timer = new AbortController();
        const late = asking.wait
          ? asking.wait(withinMs, timer.signal).then(
              () => 'late' as const,
              () => 'late' as const,
            )
          : new Promise<never>(() => {});
        try {
          response = await Promise.race([http(request.url, { method: 'POST', headers: request.headers, body: request.body }), late]);
        } catch {
          fail({ error: 'the endpoint could not be reached' });
          return;
        } finally {
          // The clock is stopped once the answer is in: a wait that ran on would be paid for.
          timer.abort();
        }
        if (response === 'late') {
          fail({ error: 'Jev did not answer in time' });
          return;
        }
        if (!response.ok) {
          const tooLarge = response.status === 400 && response.text.includes('max_tokens_exceeded');
          const own = job.options.filter((option) => option.key !== always?.key);
          if (tooLarge && job.splits > 0 && own.length > 1) {
            // Each half gets the option put into every request again.
            const half = Math.ceil(own.length / 2);
            for (const part of [own.slice(0, half), own.slice(half)]) {
              queue.push({ options: always ? [always, ...part] : part, splits: job.splits - 1 });
            }
            continue;
          }
          fail({ error: `HTTP ${response.status}`, status: response.status, ...(response.text.trimStart().startsWith('{') ? { json: true as const } : {}) });
          return;
        }
        const keys = job.options.map((option) => option.key);
        const probabilities = readProbabilities(response.text, keys);
        // Every option asked about has to have been answered: a missing one ranked as 0 would be a wrong answer.
        if (probabilities.size !== keys.length) {
          fail({ error: 'the answer could not be read' });
          return;
        }
        answered.push({ options: job.options, probabilities });
      }
    };
    await Promise.all(Array.from({ length: IN_FLIGHT }, work));
    if (failure !== null) return failure;

    const rankedOf = (answer: Answered): [Option, number][] =>
      answer.options.map((option): [Option, number] => [option, answer.probabilities.get(option.key) ?? 0]).sort((a, b) => b[1] - a[1]);
    if (answered.length === 1) {
      const [only] = answered;
      return { ranked: rankedOf(only as Answered).map(([option, p]) => [option.key, p]), requests };
    }
    // The option put into every request is put into the next round's requests again, not carried as a
    // finalist: it is left out before the likeliest are counted, or a request it won would send none of its own.
    const finalists = (count: number) => {
      const seen = new Set<string>();
      return answered
        .flatMap((answer) =>
          rankedOf(answer)
            .filter(([option]) => option.key !== always?.key)
            .slice(0, count)
            .map(([option]) => option),
        )
        .filter((option) => !seen.has(option.key) && seen.add(option.key));
    };
    let next = finalists(FINALISTS);
    // Requests split for their size hold too few options for the finalists to narrow anything: the winners alone go on.
    if (next.length >= pool.length) next = finalists(1);
    if (next.length >= pool.length) return { error: 'the options could not be narrowed down' };
    pool = next;
  }
  return { error: 'too many rounds' };
}
