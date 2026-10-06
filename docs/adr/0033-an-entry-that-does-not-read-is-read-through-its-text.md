# 0033. An entry that does not read is read through its text

- Status: Accepted
- Date: 2026-10-06
- Amends I5 of [docs/invariants.md](../invariants.md): a kept part that
  cannot be read stopped every clean-up; one whose entry alone does not read
  no longer does

## Context

Each stored thing is two files: its text, `blobs/<id>.txt`, named by its
SHA-256, and its entry, `index/<id>.json`, which every version writes as
`{bytes, tool}`. A clean-up follows the kept parts of conversations, whose
entry says `tool` is the part's, to count what they name. An entry that did
not read stopped the clean-up (I5): whether the thing was a part could not
be told, and if it was, what it named would have gone uncounted. The stop
held until the transcript naming it was gone, which can be never (#114).

`recall` never reads the entry's contents: where the text is there and its
hash is its name, it returns it. So an entry that does not read, over a text
that does, stopped every clean-up of a store whose results were all still
read back. The only way on was removing both files, which loses what was
read; #114's first change named the thing and said to move both out of the
store instead, which still takes it out of use.

## Decision

1. Where an entry is there but does not read — not JSON, or not the shape
   every version writes — and the text under its id is there with its hash
   its name, the clean-up reads that text as a part's: what it names is
   counted as named, and put back from the trash first. This is done where
   the clean-up counts what is named and where it puts back what is named,
   alike.
2. Under an entry that says the thing is a part, or that does not read, a
   text that is not there, does not read or has changed still stops the
   clean-up, and `/lossless-store` names it (#114).
3. An entry that reads and says the thing is not a part is believed: its
   text is not read.

## Alternatives considered

- Keep stopping, and say to move both files out of the store: takes out of
  use what `recall` still reads.
- Make the entry anew from the text: a write the clean-up does not do today,
  and an entry made from a text cannot say which tool it came from.
- Read every text without an entry as a possible part: a write that stopped
  between the two files leaves such texts, and reading them all costs a read
  for each id the transcripts hold.

## Consequences

- A text read as a part's that was a tool's result counts every 64-hex
  string in it as named: more is kept, never less.
- I5's list narrows to texts that are not there, do not read or have changed;
  an entry alone that does not read is no longer in it.
- An entry that does not read is no longer a cause a stop records: it is
  either read past, or the text under it is the cause.
