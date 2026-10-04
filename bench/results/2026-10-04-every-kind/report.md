Graded by claude-sonnet-5-5, in two passes; the tables use the first. Of 217 answers mixed in whose grade was known, it graded 217, 215 as expected. Of 140 pairs of the same answer with and without words that tell an arm, it graded both of 140, 139 alike. The two passes graded 10 answer(s) differently; 0 answer(s) or control(s) were left ungraded by a pass.

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
| Where the work stands | 1/2 | 2/2 |
| A rule stated early | 2/2 | 1/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 3 | 3 |
| correct after recall | 3 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 2 | 2 |
| incorrect without retrieval | 1 | 1 |
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
| Where the work stands | 2/2 | 1/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 3 | 5 |
| correct after recall | 4 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 2 | 0 |
| incorrect without retrieval | 0 | 1 |
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
| Where the work stands | 2/2 | 1/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 4 | 4 |
| correct after recall | 3 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 2 |
| correct after reading again | 2 | 1 |
| incorrect without retrieval | 0 | 2 |
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

### The questions asked one after another: how much the context grew

| Trace | Model | Run | Arm | In use before | Right after | After the questions | Grew by | Of the room made, taken again | `recall` calls | Files read again | Questions that read outside the work | Right |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| full | claude-sonnet-5-5 | 1 | builtin | 199586 | 14251 | 16684 | 2433 | 1 % | 0 | 4 | 2 | 8 of 9 graded |
| full | claude-sonnet-5-5 | 1 | plugin | 199947 | 83475 | 84889 | 1414 | 1 % | 0 | 1 | 0 | 9 of 9 graded |
| prose | claude-sonnet-5-5 | 1 | builtin | 76198 | 13883 | 16283 | 2400 | 4 % | 0 | 4 | 2 | 8 of 9 graded |
| prose | claude-sonnet-5-5 | 1 | plugin | 76559 | 34512 | 35762 | 1250 | 3 % | 0 | 1 | 0 | 9 of 9 graded |
| results | claude-sonnet-5-5 | 1 | builtin | 103450 | 9242 | 12010 | 2768 | 3 % | 0 | 5 | 3 | 6 of 9 graded |
| results | claude-sonnet-5-5 | 1 | plugin | 103811 | 43606 | 53512 | 9906 | 16 % | 3 | 1 | 0 | 8 of 9 graded |
| short | claude-sonnet-5-5 | 1 | builtin | 27341 | 14081 | 17082 | 3001 | 23 % | 0 | 4 | 2 | 8 of 9 graded |
| short | claude-sonnet-5-5 | 1 | plugin | 27702 | 12283 | 22645 | 10362 | 67 % | 4 | 1 | 0 | 8 of 9 graded |
| thinking | claude-sonnet-5-5 | 1 | builtin | 27783 | 14859 | 17597 | 2738 | 21 % | 0 | 4 | 2 | 7 of 9 graded |
| thinking | claude-sonnet-5-5 | 1 | plugin | 28144 | 17656 | 27032 | 9376 | 89 % | 3 | 1 | 0 | 9 of 9 graded |
| writes | claude-sonnet-5-5 | 1 | builtin | 77643 | 30735 | 34629 | 3894 | 8 % | 0 | 7 | 4 | 9 of 9 graded |
| writes | claude-sonnet-5-5 | 1 | plugin | 78004 | 35230 | 44970 | 9740 | 23 % | 3 | 1 | 0 | 8 of 9 graded |
