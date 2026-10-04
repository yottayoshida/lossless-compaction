Graded by claude-sonnet-5-5, in two passes; the tables use the first. Of 217 answers mixed in whose grade was known, it graded 217, 214 as expected. Of 140 pairs of the same answer with and without words that tell an arm, it graded both of 140, 137 alike. The two passes graded 7 answer(s) differently; 0 answer(s) or control(s) were left ungraded by a pass.

### full, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 1. The plugin's code: 214978c94372 (commit 9946ad9de137).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 103 | 20322 |
| Tokens before | 197394 | 197394 |
| Tokens sent on the next request | 83460 | 11935 |
| Built-in summary ran | 0 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 0 | 4682 |
| Compaction: tokens written to cache or sent fresh | 0 | 195235 |
| Compaction: tokens written out | 0 | 2813 |
| Compaction: cost, USD | 0.0000 | 0.5161 |
| All questions: seconds | 40.5 | 50.1 |
| All questions: input tokens | 834827 | 195522 |
| All questions: cost, USD | 2.8932 | 0.3628 |
| `recall` calls | 0 | 0 |
| Files read again | 1 | 7 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 0 | 3 |
| Exact answers the program found wrong and the grader called right | 0 | 0 |
| Words that tell the arm, in all answers | 1 | 1 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2 | 2/2 |
| Exact, file unchanged | 1/1 | 1/1 |
| Exact, file changed: what it said then | 1/1 | 1/1 |
| Exact, file changed: what it says now | 1/1 | 1/1 |
| Where the work stands | 2/2 | 2/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 8 | 5 |
| correct after recall | 0 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 1 | 1 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |

### prose, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 1. The plugin's code: 214978c94372 (commit 9946ad9de137).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 87 | 20434 |
| Tokens before | 74075 | 74075 |
| Tokens sent on the next request | 34497 | 11647 |
| Built-in summary ran | 0 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 0 | 4682 |
| Compaction: tokens written to cache or sent fresh | 0 | 71847 |
| Compaction: tokens written out | 0 | 2557 |
| Compaction: cost, USD | 0.0000 | 0.2051 |
| All questions: seconds | 24.7 | 46.8 |
| All questions: input tokens | 345198 | 179084 |
| All questions: cost, USD | 1.1197 | 0.3477 |
| `recall` calls | 0 | 0 |
| Files read again | 1 | 6 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 0 | 3 |
| Exact answers the program found wrong and the grader called right | 0 | 0 |
| Words that tell the arm, in all answers | 0 | 0 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2 | 2/2 |
| Exact, file unchanged | 1/1 | 1/1 |
| Exact, file changed: what it said then | 1/1 | 1/1 |
| Exact, file changed: what it says now | 1/1 | 1/1 |
| Where the work stands | 2/2 | 2/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 8 | 6 |
| correct after recall | 0 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 1 | 0 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |

### results, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 1. The plugin's code: 214978c94372 (commit 9946ad9de137).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 121 | 21913 |
| Tokens before | 101258 | 101258 |
| Tokens sent on the next request | 43586 | 6955 |
| Built-in summary ran | 0 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 0 | 0 |
| Compaction: tokens written to cache or sent fresh | 0 | 103781 |
| Compaction: tokens written out | 0 | 2807 |
| Compaction: cost, USD | 0.0000 | 0.2865 |
| All questions: seconds | 39.5 | 42.6 |
| All questions: input tokens | 619148 | 121920 |
| All questions: cost, USD | 1.5433 | 0.1725 |
| `recall` calls | 3 | 0 |
| Files read again | 2 | 8 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 0 | 3 |
| Exact answers the program found wrong and the grader called right | 0 | 0 |
| Words that tell the arm, in all answers | 0 | 0 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2 | 2/2 |
| Exact, file unchanged | 1/1 | 1/1 |
| Exact, file changed: what it said then | 1/1 | 1/1 |
| Exact, file changed: what it says now | 1/1 | 1/1 |
| Where the work stands | 2/2 | 2/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 4 | 4 |
| correct after recall | 3 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 2 | 2 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |

### short, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 1. The plugin's code: 214978c94372 (commit 9946ad9de137).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 184 | 26669 |
| Tokens before | 25377 | 25377 |
| Tokens sent on the next request | 10766 | 12774 |
| Built-in summary ran | 0 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 0 | 4682 |
| Compaction: tokens written to cache or sent fresh | 0 | 22904 |
| Compaction: tokens written out | 0 | 4128 |
| Compaction: cost, USD | 0.0000 | 0.0984 |
| All questions: seconds | 46.2 | 45.4 |
| All questions: input tokens | 171395 | 195787 |
| All questions: cost, USD | 0.3285 | 0.3893 |
| `recall` calls | 4 | 0 |
| Files read again | 2 | 6 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 0 | 3 |
| Exact answers the program found wrong and the grader called right | 0 | 0 |
| Words that tell the arm, in all answers | 3 | 1 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2 | 2/2 |
| Exact, file unchanged | 1/1 | 1/1 |
| Exact, file changed: what it said then | 1/1 | 1/1 |
| Exact, file changed: what it says now | 1/1 | 1/1 |
| Where the work stands | 2/2 | 2/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 3 | 6 |
| correct after recall | 4 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 2 | 0 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |

### thinking, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 1. The plugin's code: 214978c94372 (commit 9946ad9de137).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 77 | 23632 |
| Tokens before | 37746 | 37746 |
| Tokens sent on the next request | 17641 | 12413 |
| Built-in summary ran | 0 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 0 | 4682 |
| Compaction: tokens written to cache or sent fresh | 0 | 23432 |
| Compaction: tokens written out | 0 | 3479 |
| Compaction: cost, USD | 0.0000 | 0.0932 |
| All questions: seconds | 37.9 | 47.5 |
| All questions: input tokens | 255629 | 163698 |
| All questions: cost, USD | 0.5662 | 0.3637 |
| `recall` calls | 3 | 0 |
| Files read again | 2 | 4 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 0 | 2 |
| Exact answers the program found wrong and the grader called right | 0 | 0 |
| Words that tell the arm, in all answers | 0 | 0 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2 | 2/2 |
| Exact, file unchanged | 1/1 | 1/1 |
| Exact, file changed: what it said then | 1/1 | 0/1 |
| Exact, file changed: what it says now | 1/1 | 1/1 |
| Where the work stands | 2/2 | 2/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 4 | 5 |
| correct after recall | 3 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 2 |
| correct after reading again | 2 | 1 |
| incorrect without retrieval | 0 | 1 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |

### writes, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 1. The plugin's code: 214978c94372 (commit 9946ad9de137).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 183 | 18184 |
| Tokens before | 75591 | 75591 |
| Tokens sent on the next request | 35215 | 28060 |
| Built-in summary ran | 0 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 0 | 4682 |
| Compaction: tokens written to cache or sent fresh | 0 | 73292 |
| Compaction: tokens written out | 0 | 2258 |
| Compaction: cost, USD | 0.0000 | 0.2057 |
| All questions: seconds | 42.8 | 53.1 |
| All questions: input tokens | 504263 | 481961 |
| All questions: cost, USD | 1.2320 | 0.9774 |
| `recall` calls | 4 | 0 |
| Files read again | 1 | 8 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 0 | 3 |
| Exact answers the program found wrong and the grader called right | 0 | 0 |
| Words that tell the arm, in all answers | 1 | 0 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2 | 2/2 |
| Exact, file unchanged | 1/1 | 1/1 |
| Exact, file changed: what it said then | 1/1 | 1/1 |
| Exact, file changed: what it says now | 1/1 | 1/1 |
| Where the work stands | 2/2 | 2/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 4 | 4 |
| correct after recall | 4 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 1 | 2 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |


### What the plugin estimated against what was in use

| Trace | Model | Plugin | Run | Outcome | Estimated | Measured | Error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| full | claude-sonnet-5-5 | default (214978c94372) | 1 | moved | 82908 | 83460 sent next | -0.7 % |
| prose | claude-sonnet-5-5 | default (214978c94372) | 1 | moved | 33934 | 34497 sent next | -1.6 % |
| results | claude-sonnet-5-5 | default (214978c94372) | 1 | moved | 43742 | 43586 sent next | 0.4 % |
| short | claude-sonnet-5-5 | default (214978c94372) | 1 | moved | 10473 | 10766 sent next | -2.7 % |
| thinking | claude-sonnet-5-5 | default (214978c94372) | 1 | moved | 20714 | 17641 sent next | 17.4 % |
| writes | claude-sonnet-5-5 | default (214978c94372) | 1 | moved | 34138 | 35215 sent next | -3.1 % |

### The questions asked one after another: what came back into the context

| Trace | Model | Run | Arm | In use before | Right after | After the questions | Brought back | Of the room made, taken again | `recall` calls | Files read again | Questions that read outside the work | Right |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| full | claude-sonnet-5-5 | 1 | builtin | 197394 | 11761 | 14254 | 2493 | 1 % | 0 | 4 | 2 | 7 of 9 graded |
| full | claude-sonnet-5-5 | 1 | plugin | 197394 | 83460 | 84906 | 1446 | 1 % | 0 | 1 | 0 | 9 of 9 graded |
| prose | claude-sonnet-5-5 | 1 | builtin | 74075 | 11717 | 13785 | 2068 | 3 % | 0 | 3 | 2 | 8 of 9 graded |
| prose | claude-sonnet-5-5 | 1 | plugin | 74075 | 34497 | 35678 | 1181 | 3 % | 0 | 1 | 0 | 9 of 9 graded |
| results | claude-sonnet-5-5 | 1 | builtin | 101258 | 7334 | 10268 | 2934 | 3 % | 0 | 5 | 3 | 9 of 9 graded |
| results | claude-sonnet-5-5 | 1 | plugin | 101258 | 43586 | 53466 | 9880 | 17 % | 3 | 1 | 0 | 8 of 9 graded |
| short | claude-sonnet-5-5 | 1 | builtin | 25377 | 11854 | 14609 | 2755 | 20 % | 0 | 4 | 2 | 8 of 9 graded |
| short | claude-sonnet-5-5 | 1 | plugin | 25377 | 10766 | 21675 | 10909 | 75 % | 4 | 1 | 0 | 9 of 9 graded |
| thinking | claude-sonnet-5-5 | 1 | builtin | 37746 | 12552 | 15289 | 2737 | 11 % | 0 | 4 | 2 | 8 of 9 graded |
| thinking | claude-sonnet-5-5 | 1 | plugin | 37746 | 17641 | 27005 | 9364 | 47 % | 3 | 1 | 0 | 9 of 9 graded |
| writes | claude-sonnet-5-5 | 1 | builtin | 75591 | 28413 | 32430 | 4017 | 9 % | 0 | 7 | 3 | 9 of 9 graded |
| writes | claude-sonnet-5-5 | 1 | plugin | 75591 | 35215 | 44617 | 9402 | 23 % | 3 | 1 | 0 | 9 of 9 graded |
