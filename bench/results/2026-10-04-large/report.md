Graded by claude-sonnet-5-5, in two passes; the tables use the first. Of 217 answers mixed in whose grade was known, it graded 217, 215 as expected. Of 140 pairs of the same answer with and without words that tell an arm, it graded both of 140, 137 alike. The two passes graded 5 answer(s) differently; 0 answer(s) or control(s) were left ungraded by a pass.

### large, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 1. The plugin's code: 214978c94372 (commit be9ec8d01909).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 269 | 39774 |
| Tokens before | 576136 | 576136 |
| Tokens sent on the next request | 272134 | 7042 |
| Built-in summary ran | 0 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 0 | 4682 |
| Compaction: tokens written to cache or sent fresh | 0 | 573352 |
| Compaction: tokens written out | 0 | 2764 |
| Compaction: cost, USD | 0.0000 | 1.4609 |
| All questions: seconds | 125.0 | 51.9 |
| All questions: input tokens | 4655542 | 137108 |
| All questions: cost, USD | 12.2807 | 0.2120 |
| `recall` calls | 5 | 0 |
| Files read again | 1 | 8 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 0 | 5 |
| Exact answers the program found wrong and the grader called right | 0 | 0 |
| Words that tell the arm, in all answers | 3 | 1 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 4/4 | 3/4 |
| Exact, file unchanged | 1/1 | 0/1 |
| Exact, file changed: what it said then | 1/1 | 1/1 |
| Exact, file changed: what it says now | 1/1 | 1/1 |
| Where the work stands | 1/2 | 1/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 4 | 3 |
| correct after recall | 5 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 4 |
| correct after reading again | 1 | 1 |
| incorrect without retrieval | 1 | 1 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 1 |
| incorrect after reading again | 0 | 1 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |


### What the plugin estimated against what was in use

| Trace | Model | Plugin | Run | Outcome | Estimated | Measured | Error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| large | claude-sonnet-5-5 | default (214978c94372) | 1 | moved | 272454 | 272134 sent next | 0.1 % |

### The questions asked one after another: how much the context grew

| Trace | Model | Run | Arm | In use before | Right after | After the questions | Grew by | Of the room made, taken again | `recall` calls | Files read again | Questions that read outside the work | Right |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| large | claude-sonnet-5-5 | 1 | builtin | 577763 | 9669 | 13853 | 4184 | 1 % | 0 | 7 | 5 | 6 of 11 graded |
| large | claude-sonnet-5-5 | 1 | plugin | 578124 | 272163 | 300460 | 28297 | 9 % | 4 | 1 | 0 | 11 of 11 graded |
