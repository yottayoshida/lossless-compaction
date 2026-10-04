// The traces: what is said to build each conversation, what happens to its files
// before the compaction, and the questions asked afterwards with their answers.
// All of it is fixed before any comparison is run (`bench/questions.json` is this
// file written out; a test holds the two together). A change to a trace after
// results exist raises its `version`, and what measured the older one is left out.

import { OPAQUE_SUBJECTS, inventoryFile, jaDoc, jaPuzzle, logFile, logLine, opaqueCode, opaqueCodeLine, opaqueDoc, proseDoc, puzzle, reportLine, reportScript, showScript, sourceFile, statusFile } from './fixtures.ts';

/** One thing that happens while a trace is built: something said to the agent, or a change to the files made from outside. */
export type Step = { say: string; effort?: string } | { write: string; text: string } | { remove: string };

export type Kind =
  /** The exact text of something no file of the work holds any more: the output of a script that is gone. */
  | 'exact-gone'
  /** The exact text of a file that is still there, unchanged: reading it again is a right answer. */
  | 'exact-unchanged'
  /** What a file said when it was read, the file having changed since. */
  | 'exact-then'
  /** What that file says now: an answer from the old reading is wrong. */
  | 'exact-now'
  /** Where the work stands: what is next, what was decided, what is open. */
  | 'continuity'
  /** A rule stated early and not repeated. */
  | 'constraint';

export type Question = {
  id: string;
  kind: Kind;
  /** As a person would ask it: no tool is named, and nothing says what to do when the answer is not at hand. */
  ask: string;
  /** The facts a right answer holds. */
  reference: string;
  /** For the exact kinds: every one of these is in a right answer. Graded by the program. */
  needles?: string[];
  /** For the others: what makes an answer right, written before any answer was seen. Graded by a model that is not told the arm. */
  rubric?: string;
  /** For the others: an answer known to be right and one known to be wrong, mixed in to measure the grader. */
  right?: string;
  wrong?: string;
};

/** A question `find` is for: which earlier result was about something, asked without naming where it came from. */
export type FindQuestion = {
  id: string;
  /**
   * `value`: the question names something the result holds, a number or a
   * checksum, and matching words can find it. `meaning`: it says what the result
   * was, in other words than the call that made it or the text it holds.
   */
  by: 'value' | 'meaning';
  ask: string;
  /** A line only the result asked for holds: the line the question is about, or for `meaning` the result's first line. */
  target: string;
};

export type Trace = {
  name: string;
  version: number;
  shape: string;
  files: { path: string; text: string }[];
  steps: Step[];
  /** Changes to the files after the trace is built and before any compaction: the same for both arms. */
  beforeCompaction: Step[];
  /** What a built trace has to look like to be used: no compaction on the way, and a size within these. */
  accept: { minTokens: number; maxTokens: number; minThinkingTokens?: number };
  /** The window its sessions compact against, in tokens, where it is not the 200,000 of the others. */
  window?: number;
  questions: Question[];
  finds: FindQuestion[];
  /** A phrase of each rule stated early: it is in the first message and nowhere else, which a test holds. */
  marks: string[];
};

const BUILD_TOOLS = ['Read', 'Write', 'Edit', 'Bash'] as const;
/** At a question: files may be read again, nothing may be run or written. */
export const QUESTION_TOOLS = ['Read', 'Grep', 'Glob', 'ToolSearch', 'mcp__lossless-compaction__recall'] as const;
export const FIND_TOOL = 'mcp__lossless-compaction__find';
export { BUILD_TOOLS };

const REPORT_BATCHES = 120;
const LOG_LINES = 100;
/** What a line of a station log says, without the record's number in front: what an answer about that line has to hold. */
const units = (line: string) => / (station \d+ reported \d+ units) /.exec(line)?.[1] ?? line;

type Rules = {
  /** Said in the first message, never again. `mark` is a phrase of the rule that nothing else in the trace holds: no file, no later message, no question. */
  first: { rule: string; mark: string; ask: string; reference: string; rubric: string; right: string; wrong: string };
  second: { rule: string; mark: string; ask: string; reference: string; rubric: string; right: string; wrong: string };
};

type Standing = {
  /** Said in the last message before the compaction. */
  status: string;
  next: { ask: string; reference: string; rubric: string; right: string; wrong: string };
  decided: { ask: string; reference: string; rubric: string; right: string; wrong: string };
};

/**
 * What every trace has around its bulk: two rules stated first, a script run
 * once and then removed, a file that stays and one that is regenerated, and
 * where the work stands, said last.
 */
function trace(
  n: number,
  name: string,
  shape: string,
  task: string,
  rules: Rules,
  bulk: Step[],
  standing: Standing,
  extra: Partial<Pick<Trace, 'accept' | 'finds' | 'files' | 'version' | 'window' | 'questions' | 'beforeCompaction'>> = {},
): Trace {
  const kept = `kept-${n}.log`;
  const changing = `changing-${n}.log`;
  const keptLog = 90 + n;
  const changingLog = 80 + n;
  const checksum = (line: string) => /checksum ([0-9a-f]{8})/.exec(line)?.[1] ?? line;
  return {
    name,
    version: extra.version ?? 1,
    shape,
    ...(extra.window !== undefined ? { window: extra.window } : {}),
    files: [
      { path: 'report.sh', text: reportScript(n, REPORT_BATCHES) },
      { path: kept, text: logFile(keptLog, LOG_LINES) },
      { path: changing, text: logFile(changingLog, LOG_LINES) },
      ...(extra.files ?? []),
    ],
    steps: [
      { say: `${task}\n\nTwo rules for all of this work. ${rules.first.rule} ${rules.second.rule}\n\nReply only: understood.` },
      { say: 'Run `sh report.sh` once with Bash, then reply only: ran.' },
      { say: `Read ${kept} and ${changing}, one file per call, then reply only: read.` },
      ...bulk,
      { say: `${standing.status}\n\nReply only: noted.` },
    ],
    beforeCompaction: [{ remove: 'report.sh' }, { write: changing, text: logFile(changingLog, LOG_LINES, 2) }, ...(extra.beforeCompaction ?? [])],
    accept: extra.accept ?? { minTokens: 30_000, maxTokens: 160_000 },
    questions: [
      {
        id: 'gone-1',
        kind: 'exact-gone',
        ask: 'What did report.sh print for batch 07? Give the whole line.',
        reference: reportLine(n, 7),
        needles: [reportLine(n, 7)],
      },
      {
        id: 'gone-2',
        kind: 'exact-gone',
        ask: 'What was the checksum on the line report.sh printed for batch 93?',
        reference: reportLine(n, 93),
        needles: [checksum(reportLine(n, 93))],
      },
      {
        id: 'unchanged',
        kind: 'exact-unchanged',
        ask: `What does the line for record ${keptLog}-0061 in ${kept} say?`,
        reference: logLine(keptLog, 61),
        needles: [units(logLine(keptLog, 61))],
      },
      {
        id: 'then',
        kind: 'exact-then',
        ask: `${changing} has been regenerated since you read it. What did its line for record ${changingLog}-0044 say when you read it, before that?`,
        reference: logLine(changingLog, 44, 1),
        needles: [units(logLine(changingLog, 44, 1))],
      },
      {
        id: 'now',
        kind: 'exact-now',
        ask: `${changing} has been regenerated since you read it. What does its line for record ${changingLog}-0044 say now?`,
        reference: logLine(changingLog, 44, 2),
        needles: [units(logLine(changingLog, 44, 2))],
      },
      { id: 'next', kind: 'continuity', ...standing.next },
      { id: 'decided', kind: 'continuity', ...standing.decided },
      { id: 'rule-1', kind: 'constraint', ask: rules.first.ask, reference: rules.first.reference, rubric: rules.first.rubric, right: rules.first.right, wrong: rules.first.wrong },
      { id: 'rule-2', kind: 'constraint', ask: rules.second.ask, reference: rules.second.reference, rubric: rules.second.rubric, right: rules.second.right, wrong: rules.second.wrong },
      ...(extra.questions ?? []),
    ],
    finds: [
      { id: 'find-report', by: 'value', ask: `Which earlier result held a line reading "${checksum(reportLine(n, 58))}"?`, target: reportLine(n, 58) },
      { id: 'find-kept', by: 'value', ask: `Which earlier result listed a station that reported ${/reported (\d+) units/.exec(logLine(keptLog, 17))?.[1]} units at step 17?`, target: logLine(keptLog, 17) },
      { id: 'find-script', by: 'meaning', ask: 'Which earlier result was what the shell script printed when it was run at the start?', target: reportLine(n, 1) },
      // The two logs are asked for by what was to become of each: a guess between them is right for one and wrong for the other.
      { id: 'find-stays', by: 'meaning', ask: 'Of the two log files looked at near the start, which earlier result was the one that was to be left as it is?', target: logLine(keptLog, 1) },
      { id: 'find-changes', by: 'meaning', ask: 'Of the two log files looked at near the start, which earlier result was the one that was going to be made anew?', target: logLine(changingLog, 1) },
      ...(extra.finds ?? []),
    ],
    marks: [rules.first.mark, rules.second.mark],
  };
}

const said = (count: number, each: (n: number) => string): Step[] => Array.from({ length: count }, (_, i) => ({ say: each(i + 1) }));

/** What is said to have four station logs read: the first four at step 1, the next four at step 2. */
const readFourLogs = (step: number) => {
  const from = (step - 1) * 4 + 1;
  const names = Array.from({ length: 4 }, (_, i) => `log${from + i}.txt`).join(', ');
  return `Read ${names} with the Read tool, one file per call, in that order. Then reply only: read.`;
};

// T1. Results-heavy: twelve large files read, nothing written.
const RESULTS_LOGS = 12;
const RESULTS_LINES = 289;
const results = trace(
  1,
  'results',
  'results-heavy: twelve files of about 17,000 characters read, nothing written',
  'We are auditing station logs. I will ask you to read log files; later we will look for stations that reported unusually many units.',
  {
    first: {
      rule: 'Findings are written to findings.md and nowhere else.',
      mark: 'findings.md',
      ask: 'Where are we supposed to write findings?',
      reference: 'Findings go in findings.md and nowhere else.',
      rubric: 'Right if it names findings.md as the place for findings. Wrong if it names another file or says there is no rule.',
      right: 'In findings.md, and only there.',
      wrong: 'In a notes.txt file next to each log.',
    },
    second: {
      rule: 'A station id is always written with the prefix ST-, as in ST-1325.',
      mark: 'ST-1325',
      ask: 'How do we write a station id in our notes?',
      reference: 'With the prefix ST-, as in ST-1325.',
      rubric: 'Right if it says station ids take the prefix ST-. Wrong if it gives another form or says there is no rule.',
      right: 'Always with the ST- prefix, for example ST-1325.',
      wrong: 'As the bare number, exactly as the log prints it.',
    },
  },
  said(RESULTS_LOGS / 4, readFourLogs),
  {
    status:
      'Where we stand. Logs 1 to 12 are read. We decided to flag a station only when it reports more than 990 units in two different logs, not in one. ' +
      'Next you will read log13.txt to log16.txt and list the stations over 990 units in each. Still open: whether log7.txt, which looked truncated, has to be fetched again.',
    next: {
      ask: 'Without starting on it yet: what is the next step, and which files does it involve?',
      reference: 'Read log13.txt to log16.txt and list the stations reporting more than 990 units in each.',
      rubric: 'Right if it says the next step is reading log13 to log16 (those four files) and listing stations over 990 units. Wrong if it names other files or another task, or does not know.',
      right: 'Next is reading log13.txt through log16.txt and listing, for each, the stations that reported over 990 units.',
      wrong: 'Next is to re-read logs 1 to 4 and compute the average units per station.',
    },
    decided: {
      ask: 'What did we decide about when to flag a station, and what is still open?',
      reference: 'Flag a station only when it reports more than 990 units in two different logs. Still open: whether log7.txt, which looked truncated, must be fetched again.',
      rubric: 'Right if it gives both: the two-different-logs rule for flagging (over 990 units), and that log7.txt possibly being truncated is the open point. Wrong if either is missing or different.',
      right: 'A station is flagged only if it is over 990 units in two different logs; open is whether the truncated-looking log7.txt needs fetching again.',
      wrong: 'A station is flagged as soon as it is over 990 units in any one log; nothing is open.',
    },
  },
  {
    files: Array.from({ length: RESULTS_LOGS }, (_, i) => ({ path: `log${i + 1}.txt`, text: logFile(i + 1, RESULTS_LINES) })),
    finds: [
      { id: 'find-log-a', by: 'value', ask: 'Which earlier result listed a station that reported 664 units at step 150?', target: logLine(2, 150) },
      { id: 'find-log-b', by: 'value', ask: `Which earlier result held the record numbered 9-0203?`, target: logLine(9, 203) },
      { id: 'find-seventh', by: 'meaning', ask: 'Which earlier result was the seventh of the station logs gone through one after another?', target: logLine(7, 1) },
    ],
    accept: { minTokens: 90_000, maxTokens: 160_000 },
  },
);

// T2. Write- and edit-heavy: the bulk is what the agent wrote, which is not a tool result.
const WRITE_MODULES = 8;
const WRITE_FUNCTIONS = 36;
const writes = trace(
  2,
  'writes',
  'write- and edit-heavy: eight source files written from dictation and two edited; the bulk is tool inputs',
  'We are adding clamp modules to a small library. I will dictate each file; write it exactly as given.',
  {
    first: {
      rule: 'The package leftpad-lite must never be added or imported.',
      mark: 'leftpad-lite',
      ask: 'Is there a package we must not use? Which one?',
      reference: 'leftpad-lite must never be added or imported.',
      rubric: 'Right if it names leftpad-lite as the package not to use. Wrong if it names another or says there is none.',
      right: 'Yes: leftpad-lite must not be added or imported.',
      wrong: 'No, any package from the registry is fine.',
    },
    second: {
      rule: 'New files go under lib/ and never under vendor/.',
      mark: 'vendor/',
      ask: 'Which directory must new files never go under?',
      reference: 'Never under vendor/; new files go under lib/.',
      rubric: 'Right if it says vendor/ is where new files must not go (lib/ is where they go). Wrong otherwise.',
      right: 'Never under vendor/. They belong under lib/.',
      wrong: 'Never under lib/; put them in the repository root.',
    },
  },
  [
    ...said(WRITE_MODULES, (m) => `Write lib/m${m}.ts with the Write tool, with exactly this content, then reply only: written.\n\n${sourceFile(m, WRITE_FUNCTIONS)}`),
    { say: 'In lib/m1.ts, change the limit in clamp1_3 from its current value to 77, with the Edit tool. Reply only: edited.' },
    { say: 'In lib/m4.ts, change the limit in clamp4_10 from its current value to 1234, with the Edit tool. Reply only: edited.' },
  ],
  {
    status:
      'Where we stand. Modules m1 to m8 are written; m1 and m4 have one edited limit each. We decided to keep one function per step rather than a table of limits, because the per-step comments are what reviewers read. ' +
      'Next you will add lib/index.ts that re-exports m1 to m8. Still open: whether the limits above 4000 are intended.',
    next: {
      ask: 'Without starting on it yet: what is the next step, and which files does it involve?',
      reference: 'Add lib/index.ts re-exporting modules m1 to m8.',
      rubric: 'Right if it says the next step is adding lib/index.ts that re-exports m1 to m8. Wrong if it names another file or task, or does not know.',
      right: 'Add lib/index.ts, which re-exports lib/m1.ts through lib/m8.ts.',
      wrong: 'Write tests for m1 in test/m1.test.ts.',
    },
    decided: {
      ask: 'What did we decide about how the limits are laid out, and what is still open?',
      reference: 'Keep one function per step rather than a table of limits, because reviewers read the per-step comments. Still open: whether limits above 4000 are intended.',
      rubric: 'Right if it gives both: one function per step instead of a table, and that limits above 4000 being intended is the open point. Wrong if either is missing or different.',
      right: 'One function per step, not a table of limits, since reviewers read the per-step comments; open is whether the limits over 4000 are intended.',
      wrong: 'We moved all limits into one table; nothing is open.',
    },
  },
  {
    // What confirms an edit is a line or two, too short to be moved out: the right answer of `find` here is that none of its options is it.
    finds: [{ id: 'find-edit', by: 'value', ask: 'Which earlier result confirmed a change to the limit 1234?', target: '1234' }],
    accept: { minTokens: 60_000, maxTokens: 160_000 },
  },
);

// T3. Prose-heavy: the bulk is what the person pasted.
const PROSE_DOCS = 6;
const PROSE_PARAGRAPHS = 68;
const prose = trace(
  3,
  'prose',
  'prose-heavy: six documents of about 21,000 characters pasted into messages; few tool results',
  'We are reviewing design notes for a storage service. I will paste them in parts.',
  {
    first: {
      rule: 'The service listens on port 8443, never on 8080.',
      mark: '8443',
      ask: 'Which port does the service listen on?',
      reference: 'Port 8443, never 8080.',
      rubric: 'Right if it says 8443. Wrong if it says 8080 or another port, or does not know.',
      right: 'On port 8443, and never 8080.',
      wrong: 'On port 8080.',
    },
    second: {
      rule: 'Anything touching quotas is reviewed by Dana Whitlock.',
      mark: 'Dana Whitlock',
      ask: 'Who reviews changes that touch quotas?',
      reference: 'Dana Whitlock.',
      rubric: 'Right if it names Dana Whitlock. Wrong if it names someone else or does not know.',
      right: 'Dana Whitlock reviews anything touching quotas.',
      wrong: 'Any two maintainers can review them.',
    },
  },
  said(PROSE_DOCS, (doc) => `Design notes, part ${doc} of ${PROSE_DOCS}. Read them and reply only: noted.\n\n${proseDoc(doc, PROSE_PARAGRAPHS)}`),
  {
    status:
      'Where we stand. All six parts are read. We decided the replay worker gets its own queue instead of sharing the ingest queue, since a slow replay must not hold up ingest. ' +
      'Next you will draft the queue section of DESIGN.md. Still open: who owns the alert for the high-water mark.',
    next: {
      ask: 'Without starting on it yet: what is the next step, and which file does it involve?',
      reference: 'Draft the queue section of DESIGN.md.',
      rubric: 'Right if it says the next step is drafting the queue section of DESIGN.md. Wrong if it names another file or task, or does not know.',
      right: 'Drafting the queue section in DESIGN.md.',
      wrong: 'Implementing the quota service in quota.ts.',
    },
    decided: {
      ask: 'What did we decide about the replay worker, and what is still open?',
      reference: 'The replay worker gets its own queue instead of sharing the ingest queue, so a slow replay does not hold up ingest. Still open: who owns the alert for the high-water mark.',
      rubric: 'Right if it gives both: the replay worker gets its own queue (not the shared ingest queue), and the owner of the high-water-mark alert is open. Wrong if either is missing or different.',
      right: 'The replay worker gets a queue of its own rather than sharing ingest; open is who owns the high-water-mark alert.',
      wrong: 'The replay worker shares the ingest queue; nothing is open.',
    },
  },
  { accept: { minTokens: 50_000, maxTokens: 160_000 } },
);

// T4. Many short results, and one file read again and again while it changes.
const SHORT_ROUNDS = 5;
const SHORT_PER_ROUND = 6;
const short = trace(
  4,
  'short',
  'many short results: thirty small command outputs, and a status file read five times while it changes',
  'We are checking a parts inventory shelf by shelf, and watching a status file that changes while we work.',
  {
    first: {
      rule: 'Everything has to run on Node 22: no syntax newer than that.',
      mark: 'Node 22',
      ask: 'Which Node version does our code have to run on?',
      reference: 'Node 22, with no newer syntax.',
      rubric: 'Right if it says Node 22. Wrong if it gives another version or says there is no requirement.',
      right: 'Node 22; nothing newer than its syntax.',
      wrong: 'The latest Node, whatever is current.',
    },
    second: {
      rule: 'A date in our notes is written day first, as in 03 Feb, never month first.',
      mark: '03 Feb',
      ask: 'How do we write a date in our notes?',
      reference: 'Day first, as in 03 Feb, never month first.',
      rubric: 'Right if it says dates are written day first. Wrong if it gives another order or says there is no rule.',
      right: 'Day first, like 03 Feb; never month first.',
      wrong: 'Month first, as in Feb 03.',
    },
  },
  Array.from({ length: SHORT_ROUNDS }, (_, round): Step[] => {
    const from = round * SHORT_PER_ROUND + 1;
    const shelves = Array.from({ length: SHORT_PER_ROUND }, (_, i) => `inv/shelf${from + i}.txt`).join(', ');
    return [
      { write: 'status.txt', text: statusFile(round + 1) },
      { say: `Run \`cat\` on each of ${shelves} with Bash, one command per call, then read status.txt with the Read tool. Reply only: checked.` },
    ];
  }).flat(),
  {
    status:
      'Where we stand. Shelves 1 to 30 are checked. We decided to report a slot as short only when its quantity is under 5, not under 10. ' +
      'Next you will check shelves 31 to 36 the same way. Still open: whether shelf 12, whose slots all read zero, was miscounted.',
    next: {
      ask: 'Without starting on it yet: what is the next step, and which shelves does it involve?',
      reference: 'Check shelves 31 to 36 the same way.',
      rubric: 'Right if it says the next step is checking shelves 31 to 36. Wrong if it names other shelves or another task, or does not know.',
      right: 'Checking shelves 31 through 36 in the same way.',
      wrong: 'Re-checking shelves 1 to 6 with a stricter threshold.',
    },
    decided: {
      ask: 'What did we decide about when a slot counts as short, and what is still open?',
      reference: 'A slot is short only when its quantity is under 5, not under 10. Still open: whether shelf 12 was miscounted.',
      rubric: 'Right if it gives both: short means quantity under 5 (not 10), and shelf 12 possibly being miscounted is open. Wrong if either is missing or different.',
      right: 'A slot is short only under a quantity of 5; open is whether shelf 12 was miscounted.',
      wrong: 'A slot is short under a quantity of 10; nothing is open.',
    },
  },
  {
    files: [
      ...Array.from({ length: SHORT_ROUNDS * SHORT_PER_ROUND }, (_, i) => ({ path: `inv/shelf${i + 1}.txt`, text: inventoryFile(i + 1) })),
      { path: 'status.txt', text: statusFile(0) },
    ],
    accept: { minTokens: 25_000, maxTokens: 160_000 },
  },
);

// T5. Too full: what cannot be moved out fills the window, so the plugin has to hand over.
// Sonnet 5.5 counts this text as about 197,000 tokens, more than the 200,000 window of the others lets it build:
// in 264,000, which the plugin sees as 231,000, it fills 85 % of what the plugin sees, as it did for Haiku 4.5 in 200,000.
const FULL_DOCS = 8;
const FULL_PARAGRAPHS = 155;
const full = trace(
  5,
  'full',
  'too full: about 440,000 characters pasted into messages, which moving results out cannot reduce',
  'We are reviewing the full design record of a storage service. I will paste it in parts; it is long.',
  {
    first: {
      rule: 'Nothing under legacy/ may be changed.',
      mark: 'legacy/',
      ask: 'Which directory are we not allowed to change?',
      reference: 'legacy/ must not be changed.',
      rubric: 'Right if it names legacy/ as the directory not to change. Wrong if it names another or says there is none.',
      right: 'Nothing under legacy/ may be changed.',
      wrong: 'Nothing under src/ may be changed.',
    },
    second: {
      rule: 'Commit messages are written in the past tense, as in "Raised the cap".',
      mark: 'past tense',
      ask: 'In which tense do we write commit messages?',
      reference: 'In the past tense, as in "Raised the cap".',
      rubric: 'Right if it says commit messages are written in the past tense. Wrong if it gives another tense or says there is no rule.',
      right: 'In the past tense, like "Raised the cap".',
      wrong: 'In the imperative, as in "Raise the cap".',
    },
  },
  said(FULL_DOCS, (doc) => `Design record, part ${doc} of ${FULL_DOCS}. Read it and reply only: noted.\n\n${proseDoc(10 + doc, FULL_PARAGRAPHS)}`),
  {
    status:
      'Where we stand. All eight parts are read. We decided to cut the archive tier from the first release, since nothing in the record depends on it yet. ' +
      'Next you will list every limit above 900 per minute into LIMITS.md. Still open: whether the export job needs its own quota.',
    next: {
      ask: 'Without starting on it yet: what is the next step, and which file does it involve?',
      reference: 'List every limit above 900 per minute into LIMITS.md.',
      rubric: 'Right if it says the next step is listing the limits above 900 per minute into LIMITS.md. Wrong if it names another file or task, or does not know.',
      right: 'Listing every limit over 900 per minute in LIMITS.md.',
      wrong: 'Rewriting the archive tier section in ARCHIVE.md.',
    },
    decided: {
      ask: 'What did we decide about the archive tier, and what is still open?',
      reference: 'Cut the archive tier from the first release, since nothing depends on it yet. Still open: whether the export job needs its own quota.',
      rubric: 'Right if it gives both: the archive tier is cut from the first release, and the export job needing its own quota is open. Wrong if either is missing or different.',
      right: 'The archive tier is cut from the first release; open is whether the export job needs a quota of its own.',
      wrong: 'The archive tier ships in the first release; nothing is open.',
    },
  },
  { version: 2, window: 264_000, accept: { minTokens: 187_000, maxTokens: 224_000 } },
);

// T6. Long thinking: the bulk of what is in use is reasoning, which no rebuilt message carries. At high effort
// Sonnet 5.5 thinks a few hundred tokens a puzzle, and ten puzzles even at max came to 5,044 tokens of thinking in
// 24,711: twenty, at max.
const PUZZLES = 20;
const thinking = trace(
  6,
  'thinking',
  'long thinking: twenty puzzles worked out at the highest effort; much of what is in use is thinking',
  'We are checking a set of arithmetic puzzles. Work each one out carefully when I give it.',
  {
    first: {
      rule: 'Every answer is an integer written without thousands separators.',
      mark: 'thousands separators',
      ask: 'How do we write the answers?',
      reference: 'As integers without thousands separators.',
      rubric: 'Right if it says answers are integers with no thousands separators. Wrong if it gives another form or says there is no rule.',
      right: 'As plain integers, with no thousands separators.',
      wrong: 'With a comma every three digits, for readability.',
    },
    second: {
      rule: 'We first agreed to round a half up; that is reversed: a half is rounded to the even neighbour.',
      mark: 'even neighbour',
      ask: 'How do we round a half?',
      reference: 'To the even neighbour: the earlier agreement to round a half up was reversed.',
      rubric: 'Right if it says a half is rounded to the even neighbour. Wrong if it says a half is rounded up, gives another rule, or says there is none.',
      right: 'To the even neighbour; the earlier agreement to round a half up was reversed.',
      wrong: 'A half is rounded up.',
    },
  },
  Array.from({ length: PUZZLES }, (_, i): Step => ({ say: puzzle(i + 1).ask, effort: 'max' })),
  {
    status:
      `Where we stand. Puzzles 1 to ${PUZZLES} are worked out. We decided to report a puzzle as doubtful when two workings disagree, rather than taking the later one. ` +
      `Next you will work out puzzles ${PUZZLES + 1} to ${PUZZLES + 3}. Still open: whether puzzle 4, whose divisor is 10, has a misprinted step.`,
    next: {
      ask: 'Without starting on it yet: what is the next step?',
      reference: `Work out puzzles ${PUZZLES + 1} to ${PUZZLES + 3}.`,
      rubric: `Right if it says the next step is working out puzzles ${PUZZLES + 1} to ${PUZZLES + 3}. Wrong if it names other puzzles or another task, or does not know.`,
      right: `Working out puzzles ${PUZZLES + 1}, ${PUZZLES + 2} and ${PUZZLES + 3}.`,
      wrong: 'Re-doing puzzles 1 to 3 with a different method.',
    },
    decided: {
      ask: 'What did we decide to do when two workings of a puzzle disagree, and what is still open?',
      reference: 'Report the puzzle as doubtful rather than taking the later working. Still open: whether puzzle 4, whose divisor is 10, has a misprinted step.',
      rubric: 'Right if it gives both: a puzzle with disagreeing workings is reported as doubtful (not settled by the later working), and puzzle 4 possibly having a misprinted step is open. Wrong if either is missing or different.',
      right: 'We report it as doubtful instead of taking the later working; open is whether puzzle 4 has a misprinted step.',
      wrong: 'We take the later working as correct; nothing is open.',
    },
  },
  { version: 2, accept: { minTokens: 25_000, maxTokens: 160_000, minThinkingTokens: 8_000 } },
);

// T7. Mostly pasted prose, and results large enough to move: where a size counted too high hands over what would have fitted (#37).
const MIXED_LOGS = 6;
const MIXED_DOCS = 8;
const MIXED_PARAGRAPHS = 92;
const mixed = trace(
  7,
  'mixed',
  'pasted prose with movable results: six files of about 17,000 characters read, then about 360,000 characters pasted',
  'We are reviewing a storage service: first its station logs, then its design record, which I will paste in parts.',
  {
    first: { rule: 'Nothing under attic/ may be changed.', mark: 'attic/', ask: 'Which directory are we not allowed to change?', reference: 'attic/ must not be changed.', rubric: 'Right if it names attic/.', right: 'Nothing under attic/ may be changed.', wrong: 'Nothing under src/ may be changed.' },
    second: { rule: 'Branch names start with the word topic.', mark: 'the word topic', ask: 'How do branch names start?', reference: 'With the word topic.', rubric: 'Right if it says topic.', right: 'With topic.', wrong: 'With feature.' },
  },
  [
    { say: `Read ${Array.from({ length: MIXED_LOGS }, (_, i) => `mlog${i + 1}.txt`).join(', ')} with the Read tool, one file per call, in that order. Then reply only: read.` },
    ...said(MIXED_DOCS, (doc) => `Design record, part ${doc} of ${MIXED_DOCS}. Read it and reply only: noted.\n\n${proseDoc(30 + doc, MIXED_PARAGRAPHS)}`),
  ],
  {
    status: 'Where we stand. The logs and all eight parts are read. We decided to keep the replay worker out of the first release. Next you will list every limit above 800 per minute into CAPS.md. Still open: whether the scheduler needs a second queue.',
    next: { ask: 'Without starting on it yet: what is the next step, and which file does it involve?', reference: 'List every limit above 800 per minute into CAPS.md.', rubric: 'Right if it says listing limits above 800 into CAPS.md.', right: 'Listing every limit over 800 per minute in CAPS.md.', wrong: 'Rewriting the scheduler.' },
    decided: { ask: 'What did we decide about the replay worker, and what is still open?', reference: 'Keep it out of the first release. Open: whether the scheduler needs a second queue.', rubric: 'Right if it gives both.', right: 'Out of the first release; open is the second queue.', wrong: 'It ships; nothing is open.' },
  },
  {
    files: Array.from({ length: MIXED_LOGS }, (_, i) => ({ path: `mlog${i + 1}.txt`, text: logFile(40 + i, RESULTS_LINES) })),
    accept: { minTokens: 115_000, maxTokens: 162_000 },
  },
);

// T8. Japanese with English results moved out of it, and some thinking: what stays comes to more tokens a character than what leaves (#37).
const JA_LOGS = 6;
const JA_DOCS = 5;
const JA_PARAGRAPHS = 47;
const JA_PUZZLES = 3;
const japanese = trace(
  8,
  'japanese',
  'Japanese prose with English results: six files of about 17,000 characters read, about 57,000 characters of Japanese pasted, three puzzles',
  'We are reviewing how a library runs its desk. I will ask you to read some station logs, then paste the desk\'s notes, which are in Japanese, and then give a few arithmetic puzzles.',
  {
    first: { rule: 'Nothing under cellar/ may be changed.', mark: 'cellar/', ask: 'Which directory are we not allowed to change?', reference: 'cellar/ must not be changed.', rubric: 'Right if it names cellar/.', right: 'Nothing under cellar/ may be changed.', wrong: 'Nothing under src/ may be changed.' },
    second: { rule: 'Notes are filed under the heading Ledger.', mark: 'the heading Ledger', ask: 'Under which heading are notes filed?', reference: 'Ledger.', rubric: 'Right if it says Ledger.', right: 'Under Ledger.', wrong: 'Under Notes.' },
  },
  [
    { say: `Read ${Array.from({ length: JA_LOGS }, (_, i) => `jlog${i + 1}.txt`).join(', ')} with the Read tool, one file per call, in that order. Then reply only: read.` },
    ...said(JA_DOCS, (doc) => `図書館の運用記録の第 ${doc} 部（全 ${JA_DOCS} 部）です。読んで「了解」とだけ返してください。\n\n${jaDoc(120 + doc, JA_PARAGRAPHS)}`),
    ...Array.from({ length: JA_PUZZLES }, (_, i): Step => ({ say: jaPuzzle(i + 1), effort: 'high' })),
  ],
  {
    status: 'Where we stand. The logs, the five parts and three puzzles are done. We decided to report limits in the units the record uses. Next you will list every limit above 700 into JA-CAPS.md. Still open: whether part 3 repeats part 1.',
    next: { ask: 'Without starting on it yet: what is the next step, and which file does it involve?', reference: 'List every limit above 700 into JA-CAPS.md.', rubric: 'Right if it says listing limits above 700 into JA-CAPS.md.', right: 'Listing every limit over 700 in JA-CAPS.md.', wrong: 'Translating the record.' },
    decided: { ask: 'What did we decide about units, and what is still open?', reference: 'Report limits in the record\'s own units. Open: whether part 3 repeats part 1.', rubric: 'Right if it gives both.', right: 'The record\'s own units; open is whether part 3 repeats part 1.', wrong: 'Convert everything; nothing is open.' },
  },
  {
    files: Array.from({ length: JA_LOGS }, (_, i) => ({ path: `jlog${i + 1}.txt`, text: logFile(110 + i, RESULTS_LINES) })),
    accept: { minTokens: 70_000, maxTokens: 162_000 },
  },
);

// T9. Thirteen documents printed by a numbered script: the call says nothing of what came back,
// so which one a question is about is in the results alone (#38). Asked only what `find` is for.
const OPAQUE_DOCS = OPAQUE_SUBJECTS.length;
const OPAQUE_LINES = 48;
/** Station logs printed after the documents: four that may leave once the documents have, three that the newest results keep. */
const OPAQUE_SPARE = 4;
const OPAQUE_KEPT = 3;
const OPAQUE_SPARE_LINES = 400;
const OPAQUE_KEPT_LINES = 330;
const opaqueOutputs = [
  ...Array.from({ length: OPAQUE_DOCS }, (_, i) => opaqueDoc(i + 1, OPAQUE_LINES)),
  ...Array.from({ length: OPAQUE_SPARE }, (_, i) => logFile(200 + i, OPAQUE_SPARE_LINES)),
  ...Array.from({ length: OPAQUE_KEPT }, (_, i) => logFile(210 + i, OPAQUE_KEPT_LINES)),
];
const shown = (from: number, to: number): Step => ({
  say: `Run ${Array.from({ length: to - from + 1 }, (_, i) => `\`sh show.sh ${String(from + i).padStart(2, '0')}\``).join(', ')} with Bash, a separate call apiece, lowest number first. Then reply only: shown.`,
});
/** Asked by what each was: the subject in other words than its title. */
const OPAQUE_MEANING: [doc: number, ask: string][] = [
  [1, 'Which earlier result explained how to replace the key that software is signed with before it ships?'],
  [2, 'Which earlier result described the outage in which buyers could not finish paying because a callback went silent?'],
  [4, 'Which earlier result covered letting an outside worker reach the internal network from home?'],
  [7, 'Which earlier result named the spot staff assemble at when the alarm is practised?'],
  [9, 'Which earlier result set out who answers customers while most people are away in December?'],
  [10, 'Which earlier result told how stored data wiped out by a tidying job was restored?'],
  [12, 'Which earlier result was about keeping the credentials that secure web traffic from lapsing?'],
];
const OPAQUE_VALUE = [3, 6, 11];
const opaque: Trace = {
  name: 'opaque',
  version: 1,
  shape: `calls that say nothing of what they print: ${OPAQUE_DOCS} documents of about 7,000 characters on unrelated subjects, then ${OPAQUE_SPARE + OPAQUE_KEPT} station logs, each printed by \`sh show.sh NN\``,
  files: [{ path: 'show.sh', text: showScript(opaqueOutputs) }],
  steps: [
    { say: 'We are going through what a script prints, output by output. I will ask you to run it; each time, reply with only the word I give.\n\nReply only: understood.' },
    shown(1, 5),
    shown(6, 10),
    shown(11, OPAQUE_DOCS),
    shown(OPAQUE_DOCS + 1, OPAQUE_DOCS + OPAQUE_SPARE),
    shown(OPAQUE_DOCS + OPAQUE_SPARE + 1, OPAQUE_DOCS + OPAQUE_SPARE + OPAQUE_KEPT),
    // Said last, in the words of the station logs: the logs share more with it than the documents do, so the documents leave first.
    { say: `Station record outputs ${OPAQUE_DOCS + 1} to ${OPAQUE_DOCS + OPAQUE_SPARE + OPAQUE_KEPT} are shown. Next: tally units each station reported at each step into TALLY.md. Open: whether station 4107 reported twice.\n\nReply only: noted.` },
  ],
  // The script is the only place the documents are on disk: gone before any question, as a command's output is gone once it has scrolled away.
  beforeCompaction: [{ remove: 'show.sh' }],
  accept: { minTokens: 85_000, maxTokens: 140_000 },
  questions: [],
  finds: [
    ...OPAQUE_MEANING.map(([doc, ask]) => ({ id: `find-doc-${doc}`, by: 'meaning' as const, ask, target: OPAQUE_SUBJECTS[doc - 1]?.[0] ?? '' })),
    ...OPAQUE_VALUE.map((doc) => ({ id: `find-code-${doc}`, by: 'value' as const, ask: `Which earlier result gave the reference code ${opaqueCode(doc)}?`, target: opaqueCodeLine(doc) })),
  ],
  marks: [],
};

// T10. Large: the shape of T1 in a window of 1,000,000, thirty-two files of about 43,000 characters read, nothing written.
const LARGE_LOGS = 32;
const LARGE_LINES = 700;
/**
 * Two logs that are gone before the compaction, so that what they said is in the
 * conversation and nowhere else: one read early, which a compaction moves out,
 * and the last one read, which it keeps.
 */
const LARGE_EARLY = 5;
const LARGE_LAST = LARGE_LOGS;
const LARGE_STEP = 412;
const goneLog = (id: string, log: number): Question => ({
  id,
  kind: 'exact-gone',
  ask: `log${log}.txt has been deleted since you read it. What did its line for record ${log}-${String(LARGE_STEP).padStart(4, '0')} say?`,
  reference: logLine(log, LARGE_STEP),
  needles: [units(logLine(log, LARGE_STEP))],
});
const large = trace(
  10,
  'large',
  'large: thirty-two files of about 43,000 characters read in a window of 1,000,000 tokens, nothing written',
  'We are auditing station logs, a long run of them. I will ask you to read log files; later we will look for stations that reported unusually many units.',
  {
    first: {
      rule: 'Conclusions are written to audit-notes.md and nowhere else.',
      mark: 'audit-notes.md',
      ask: 'Where are we supposed to write our conclusions?',
      reference: 'Conclusions go in audit-notes.md and nowhere else.',
      rubric: 'Right if it names audit-notes.md as the place for conclusions. Wrong if it names another file or says there is no rule.',
      right: 'In audit-notes.md, and only there.',
      wrong: 'In a summary.txt file next to each log.',
    },
    second: {
      rule: 'A station id is always written with the prefix SN-, as in SN-2044.',
      mark: 'SN-2044',
      ask: 'How do we write a station id in our notes?',
      reference: 'With the prefix SN-, as in SN-2044.',
      rubric: 'Right if it says station ids take the prefix SN-. Wrong if it gives another form or says there is no rule.',
      right: 'Always with the SN- prefix, for example SN-2044.',
      wrong: 'As the bare number, exactly as the log prints it.',
    },
  },
  said(LARGE_LOGS / 4, readFourLogs),
  {
    status:
      'Where we stand. Logs 1 to 32 are read. We decided to flag a station only when it reports more than 990 units in three different logs, not in one or two. ' +
      'Next you will read log33.txt to log36.txt and list the stations over 990 units in each. Still open: whether log19.txt, which looked truncated, has to be fetched again.',
    next: {
      ask: 'Without starting on it yet: what is the next step, and which files does it involve?',
      reference: 'Read log33.txt to log36.txt and list the stations reporting more than 990 units in each.',
      rubric: 'Right if it says the next step is reading log33 to log36 (those four files) and listing stations over 990 units. Wrong if it names other files or another task, or does not know.',
      right: 'Next is reading log33.txt through log36.txt and listing, for each, the stations that reported over 990 units.',
      wrong: 'Next is to re-read logs 1 to 4 and compute the average units per station.',
    },
    decided: {
      ask: 'What did we decide about when to flag a station, and what is still open?',
      reference: 'Flag a station only when it reports more than 990 units in three different logs. Still open: whether log19.txt, which looked truncated, must be fetched again.',
      rubric: 'Right if it gives both: the three-different-logs rule for flagging (over 990 units), and that log19.txt possibly being truncated is the open point. Wrong if either is missing or different.',
      right: 'A station is flagged only if it is over 990 units in three different logs; open is whether the truncated-looking log19.txt needs fetching again.',
      wrong: 'A station is flagged as soon as it is over 990 units in any one log; nothing is open.',
    },
  },
  {
    window: 1_000_000,
    files: Array.from({ length: LARGE_LOGS }, (_, i) => ({ path: `log${i + 1}.txt`, text: logFile(i + 1, LARGE_LINES) })),
    beforeCompaction: [{ remove: `log${LARGE_EARLY}.txt` }, { remove: `log${LARGE_LAST}.txt` }],
    questions: [goneLog('gone-early', LARGE_EARLY), goneLog('gone-last', LARGE_LAST)],
    accept: { minTokens: 500_000, maxTokens: 750_000 },
  },
);

export const TRACES: readonly Trace[] = [results, writes, prose, short, full, thinking];

/**
 * Conversations no question is asked of: they are built and compacted to set the
 * size the plugin counts against what the next request is sent (`probe`). Made
 * by the same steps as the others, so each opens and ends as they do.
 */
export const PROBED: readonly Trace[] = [mixed, japanese];

/**
 * Conversations asked only the questions `find` is for (`find`, `pick`): whose
 * calls say nothing of what came back, so an id in a ticket does not tell which
 * result a question is about.
 */
export const FOUND: readonly Trace[] = [opaque];

/**
 * Conversations built in another window than the 200,000 of the rest, and asked
 * the questions of `TRACES`. Run by name only: one costs more than those six.
 */
export const LARGE: readonly Trace[] = [large];

/** The conversations asked their own questions, and so those whose answers are graded. */
export const ASKED: readonly Trace[] = [...TRACES, ...LARGE];

/** Every conversation that can be built. */
export const BUILT: readonly Trace[] = [...TRACES, ...PROBED, ...FOUND, ...LARGE];

/**
 * The conversations a command takes when none is named: `build` every one but
 * the large one, `probe` those whose size was set against the count, the rest
 * the six their questions were written for. The large one is taken by name
 * only: it costs more than all the others, and is built by another model.
 */
export function unnamed(command: string): readonly Trace[] {
  return command === 'build' ? [...TRACES, ...PROBED, ...FOUND] : command === 'probe' ? [...TRACES, ...PROBED] : TRACES;
}

/** What `bench/questions.json` holds: every question, its answer and how it is graded. */
export function described() {
  return [...TRACES, ...FOUND, ...LARGE].map((one) => ({
    trace: one.name,
    version: one.version,
    shape: one.shape,
    ...(one.window !== undefined ? { window: one.window } : {}),
    said: one.steps.filter((step): step is { say: string } => 'say' in step).length,
    filesBeforeCompaction: one.beforeCompaction.map((step) => ('remove' in step ? `removed: ${step.remove}` : 'write' in step ? `regenerated: ${step.write}` : '')),
    questions: one.questions,
    finds: one.finds,
  }));
}

