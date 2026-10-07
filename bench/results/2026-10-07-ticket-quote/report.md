Nothing has been graded by a model yet: the answers a program cannot grade are counted as ungraded.

### full, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 0, first in 0. The plugin's code: a14aaad597f3 (commit 73095971395d). Variant: max-after-10.

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 230 | — |
| Tokens before | 197394 | — |
| Tokens sent on the next request | 8431 | — |
| Built-in summary ran | 0 of 1 | 0 of 0 |
| Compaction: tokens read from cache | 0 | — |
| Compaction: tokens written to cache or sent fresh | 0 | — |
| Compaction: tokens written out | 0 | — |
| Compaction: cost, USD | 0.0000 | — |
| All questions: seconds | 40.5 | — |
| All questions: input tokens | 126650 | — |
| All questions: cost, USD | 0.2057 | — |
| `recall` calls | 3 | — |
| Files read again | 2 | — |
| Calls refused at a question | 0 | — |
| Answers after reading outside the working directory | 0 | — |
| Exact answers the program found wrong and the grader called right | 0 | — |
| Words that tell the arm, in all answers | 2 | — |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2 |  |
| Exact, file unchanged | 1/1 |  |
| Exact, file changed: what it said then | 1/1 |  |
| Exact, file changed: what it says now | 1/1 |  |
| Where the work stands | ?/2 |  |
| A rule stated early | ?/2 |  |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 0 | 0 |
| correct after recall | 3 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 0 |
| correct after reading again | 2 | 0 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 4 | 0 |


### What the plugin estimated against what was in use

| Trace | Model | Plugin | Run | Outcome | Estimated | Measured | Error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| full | claude-sonnet-5-5 | max-after-10 (a14aaad597f3) | 1 | moved | 8945 | 8431 sent next | 6.1 % |

### The questions `find` is for, asked of an agent

| Trace | Model | Run | Key | Compaction | Right | Answered by another model after a refusal | `find` calls | `recall` calls | Files read again | Bytes `recall` handed back | Bytes `find` handed back | Seconds | Input tokens | Cost, USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opaque | claude-sonnet-5-5 | 1 | branch | moved | 14/17 | 0 | 3 | 11 | 0 | 77956 | 1449 | 93.2 | 337185 | 0.5885 |
| opaque | claude-sonnet-5-5 | 1 | branch2 | moved | 15/17 | 0 | 4 | 8 | 0 | 56676 | 7611 | 76.0 | 309624 | 0.5566 |
| opaque | claude-sonnet-5-5 | 1 | no key | moved | 15/17 | 1 | 16 | 14 | 1 | 99209 | 81555 | 132.0 | 536652 | 0.8676 |
| opaque | claude-sonnet-5-5 | 2 | branch | moved | 15/17 | 0 | 3 | 12 | 0 | 85030 | 1449 | 93.2 | 349825 | 0.2212 |
| opaque | claude-sonnet-5-5 | 2 | branch2 | moved | 15/17 | 1 | 3 | 11 | 0 | 77939 | 1449 | 92.5 | 344698 | 0.2829 |
| opaque | claude-sonnet-5-5 | 2 | no key | moved | 17/17 | 0 | 17 | 15 | 0 | 106297 | 87717 | 119.0 | 575723 | 0.4910 |
| opaque | claude-sonnet-5-5 | 3 | branch | moved | 14/17 | 0 | 3 | 14 | 0 | 99161 | 1449 | 98.6 | 364992 | 0.2595 |
| opaque | claude-sonnet-5-5 | 3 | branch2 | moved | 15/17 | 0 | 3 | 8 | 0 | 56672 | 1449 | 82.2 | 303874 | 0.1831 |
| opaque | claude-sonnet-5-5 | 3 | no key | moved | 16/17 | 1 | 17 | 16 | 0 | 111671 | 81710 | 135.1 | 567815 | 0.4785 |

### The questions `find` is for, by how they were asked

| Trace | Model | Key | Run | Asked by | Right | Answered by another model | `find` calls | `recall` calls | Ids handed to `recall` not holding it | Bytes `recall` handed back |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opaque | claude-sonnet-5-5 | branch | 1 | meaning | 7/7 | 0 | 0 | 7 | 0 | 49615 |
| opaque | claude-sonnet-5-5 | branch | 1 | value | 3/3 | 0 | 3 | 0 | 0 | 0 |
| opaque | claude-sonnet-5-5 | branch | 1 | subject | 4/7 | 0 | 0 | 4 | 0 | 28341 |
| opaque | claude-sonnet-5-5 | branch | 2 | meaning | 7/7 | 0 | 0 | 7 | 0 | 49615 |
| opaque | claude-sonnet-5-5 | branch | 2 | value | 3/3 | 0 | 3 | 0 | 0 | 0 |
| opaque | claude-sonnet-5-5 | branch | 2 | subject | 5/7 | 0 | 0 | 5 | 0 | 35415 |
| opaque | claude-sonnet-5-5 | branch | 3 | meaning | 7/7 | 0 | 0 | 8 | 1 | 56685 |
| opaque | claude-sonnet-5-5 | branch | 3 | value | 3/3 | 0 | 3 | 1 | 0 | 7061 |
| opaque | claude-sonnet-5-5 | branch | 3 | subject | 4/7 | 0 | 0 | 5 | 0 | 35415 |
| opaque | claude-sonnet-5-5 | branch2 | 1 | meaning | 7/7 | 0 | 0 | 2 | 0 | 14191 |
| opaque | claude-sonnet-5-5 | branch2 | 1 | value | 3/3 | 0 | 3 | 0 | 0 | 0 |
| opaque | claude-sonnet-5-5 | branch2 | 1 | subject | 5/7 | 0 | 1 | 6 | 1 | 42485 |
| opaque | claude-sonnet-5-5 | branch2 | 2 | meaning | 7/7 | 0 | 0 | 4 | 1 | 28327 |
| opaque | claude-sonnet-5-5 | branch2 | 2 | value | 3/3 | 0 | 3 | 2 | 0 | 14197 |
| opaque | claude-sonnet-5-5 | branch2 | 2 | subject | 5/7 | 1 | 0 | 5 | 0 | 35415 |
| opaque | claude-sonnet-5-5 | branch2 | 3 | meaning | 7/7 | 0 | 0 | 3 | 0 | 21257 |
| opaque | claude-sonnet-5-5 | branch2 | 3 | value | 3/3 | 0 | 3 | 0 | 0 | 0 |
| opaque | claude-sonnet-5-5 | branch2 | 3 | subject | 5/7 | 0 | 0 | 5 | 0 | 35415 |
| opaque | claude-sonnet-5-5 | no key | 1 | meaning | 6/7 | 1 | 6 | 6 | 1 | 42527 |
| opaque | claude-sonnet-5-5 | no key | 1 | value | 3/3 | 0 | 3 | 2 | 0 | 14197 |
| opaque | claude-sonnet-5-5 | no key | 1 | subject | 6/7 | 0 | 7 | 6 | 0 | 42485 |
| opaque | claude-sonnet-5-5 | no key | 2 | meaning | 7/7 | 0 | 7 | 6 | 0 | 42499 |
| opaque | claude-sonnet-5-5 | no key | 2 | value | 3/3 | 0 | 3 | 2 | 0 | 14197 |
| opaque | claude-sonnet-5-5 | no key | 2 | subject | 7/7 | 0 | 7 | 7 | 0 | 49601 |
| opaque | claude-sonnet-5-5 | no key | 3 | meaning | 6/7 | 1 | 7 | 7 | 1 | 49601 |
| opaque | claude-sonnet-5-5 | no key | 3 | value | 3/3 | 0 | 3 | 1 | 0 | 7123 |
| opaque | claude-sonnet-5-5 | no key | 3 | subject | 7/7 | 0 | 7 | 8 | 1 | 54947 |

### Where the answer went, and how far the agent got in fetching it

| Trace | Model | Setting | Runs | Questions | Answer left in the conversation | Had to be fetched | `recall` or `find` called | A piece holding it chosen | It came back | Right | Came back, answered wrong | Bytes `recall` handed back | Of them, to calls naming no piece that holds it |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| full | claude-sonnet-5-5 | max-after-10 | 1 | 3 | 0 | 3 | 3 | 3 | 3 | 3 | 0 | 15831 | 0 |
| opaque | claude-sonnet-5-5 | branch, find's questions | 3 | 51 | 21 | 30 | 23 | 15 | 15 | 22 | 1 | 106232 | 0 |
| opaque | claude-sonnet-5-5 | branch2, find's questions | 3 | 51 | 21 | 30 | 24 | 17 | 17 | 24 | 0 | 127512 | 7070 |
| opaque | claude-sonnet-5-5 | default, find's questions | 3 | 51 | 0 | 51 | 50 | 42 | 42 | 48 | 0 | 317177 | 19486 |
