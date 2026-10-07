// Where the store keeps what it keeps, under its directory. Written once, here:
// the writer, the clean-up and `/lossless-store` read the same names, so a
// change to one of them cannot leave the others looking somewhere else.

export const DAY = 24 * 60 * 60 * 1000;

/** The name of a day directory of the trash: the day in UTC. */
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The day `ms` falls on, as a directory of the trash is named. */
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const BLOB = /^([0-9a-f]{64})\.txt$/;
const ENTRY = /^([0-9a-f]{64})\.json$/;
const TRASHED = /^([0-9a-f]{64})\.(?:txt|json)$/;

export const blobsDir = (dir: string) => `${dir}/blobs`;
export const indexDir = (dir: string) => `${dir}/index`;
export const tmpDir = (dir: string) => `${dir}/tmp`;
export const trashDir = (dir: string) => `${dir}/trash`;
export const trashDayDir = (dir: string, day: string) => `${trashDir(dir)}/${day}`;
export const rootsDir = (dir: string) => `${dir}/roots`;
/** Where a place transcripts are kept in is recorded, under `key`, the hash of the place. */
export const rootPath = (dir: string, key: string) => `${rootsDir(dir)}/${key}.json`;
/** Whether a file of `roots/` is a record of a place, by its name. */
export const isRootName = (name: string) => name.endsWith('.json');
export const gcFile = (dir: string) => `${dir}/gc.json`;
/** One file for each conversation compacted with tickets: its newest, looked for in its transcript (ADR 0027). */
export const witnessDir = (dir: string) => `${dir}/witness`;
export const witnessPath = (dir: string, key: string) => `${witnessDir(dir)}/${key}.json`;
/** One file for each machine the store is used from, named by its id (ADR 0032). */
export const machinesDir = (dir: string) => `${dir}/machines`;
export const machinePath = (dir: string, id: string) => `${machinesDir(dir)}/${id}.json`;

/** Where the text of the result `id` is. */
export const blobPath = (dir: string, id: string) => `${blobsDir(dir)}/${id}.txt`;
/** Where what is known of the result `id` is: its size and the tool that made it. */
export const entryPath = (dir: string, id: string) => `${indexDir(dir)}/${id}.json`;
/** Where the text and the entry of `id` are, once the clean-up moved them to the trash on `day`. */
export const trashedPaths = (dir: string, day: string, id: string): [string, string] => [
  `${trashDayDir(dir, day)}/${id}.txt`,
  `${trashDayDir(dir, day)}/${id}.json`,
];

/** The name of the text of `id` in `blobs/`, and of its entry in `index/`. */
export const blobName = (id: string) => `${id}.txt`;
export const entryName = (id: string) => `${id}.json`;

/** The id a file of `blobs/` is the text of, by its name; undefined when it is no such file. */
export const blobIdOf = (name: string): string | undefined => BLOB.exec(name)?.[1];
/** The id a file of `index/` is the entry of, by its name. */
export const entryIdOf = (name: string): string | undefined => ENTRY.exec(name)?.[1];
/** The id a file of a day of the trash is the text or the entry of, by its name. */
export const trashedIdOf = (name: string): string | undefined => TRASHED.exec(name)?.[1];
