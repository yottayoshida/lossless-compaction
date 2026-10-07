Graded by claude-sonnet-5-5, in two passes; the tables use the first. Of 217 answers mixed in whose grade was known, it graded 217, 214 as expected. Of 140 pairs of the same answer with and without words that tell an arm, it graded both of 140, 135 alike. The two passes graded 2 answer(s) differently; 0 answer(s) or control(s) were left ungraded by a pass.


### What the plugin estimated against what was in use

| Trace | Model | Plugin | Run | Outcome | Estimated | Measured | Error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

### The questions `find` is for, asked of an agent

| Trace | Model | Run | Key | Compaction | Right | Answered by another model after a refusal | `find` calls | `recall` calls | Files read again | Seconds | Input tokens | Cost, USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opaque | claude-sonnet-5-5 | 1 | before | moved | 9/10 | 1 | 0 | 129 | 0 | 225.7 | 828717 | 2.2996 |
| opaque | claude-sonnet-5-5 | 1 | branch | moved | 9/10 | 1 | 9 | 8 | 0 | 69.0 | 299108 | 0.5280 |
| opaque | claude-sonnet-5-5 | 2 | before | moved | 9/10 | 1 | 0 | 96 | 2 | 195.8 | 569380 | 1.3654 |
| opaque | claude-sonnet-5-5 | 2 | branch | moved | 9/10 | 1 | 9 | 7 | 0 | 81.6 | 293994 | 0.2836 |
| opaque | claude-sonnet-5-5 | 3 | before | moved | 9/10 | 1 | 0 | 100 | 0 | 180.9 | 508540 | 1.1993 |
| opaque | claude-sonnet-5-5 | 3 | branch | moved | 9/10 | 1 | 9 | 7 | 0 | 70.5 | 296568 | 0.2645 |

### Where the answer went, and how far the agent got in fetching it

| Trace | Model | Setting | Runs | Questions | Answer left in the conversation | Had to be fetched | `recall` or `find` called | A piece holding it chosen | It came back | Right | Came back, answered wrong |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opaque | claude-sonnet-5-5 | before, find's questions | 3 | 30 | 0 | 30 | 27 | 27 | 27 | 27 | 0 |
| opaque | claude-sonnet-5-5 | branch, find's questions | 3 | 30 | 0 | 30 | 27 | 21 | 21 | 27 | 0 |
| results | claude-sonnet-5-5 | before | 2 | 6 | 0 | 6 | 6 | 6 | 6 | 6 | 0 |
| results | claude-sonnet-5-5 | before-max-after-10 | 1 | 3 | 0 | 3 | 3 | 3 | 3 | 3 | 0 |
| results | claude-sonnet-5-5 | branch | 2 | 6 | 0 | 6 | 6 | 6 | 6 | 6 | 0 |
| results | claude-sonnet-5-5 | branch-max-after-10 | 1 | 3 | 0 | 3 | 3 | 3 | 3 | 3 | 0 |
