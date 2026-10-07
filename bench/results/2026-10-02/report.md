Graded by claude-haiku-4-5-20251001, in two passes; the tables use the first. Of 186 answers mixed in whose grade was known, it graded 186, 186 as expected. Of 120 pairs of the same answer with and without words that tell an arm, it graded both of 120, 120 alike. The two passes graded 4 answer(s) differently; 0 answer(s) or control(s) were left ungraded by a pass.

### full, claude-haiku-4-5-20251001

Runs: plugin 3, first in 2; builtin 3, first in 1. The plugin's code: bfe9c5b1d1d4 (commit 9cb27ca9e873).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 40144, 33701, 33679 | 31044, 35784, 43351 |
| Tokens before | 143024, 143024, 143024 | 143024, 143024, 143024 |
| Tokens sent on the next request | 14512, 14519, 14453 | 12613, 12608, 13267 |
| Built-in summary ran | 3 of 3 | 3 of 3 |
| Compaction: tokens read from cache | 8355, 8355, 8355 | 143210, 8355, 8355 |
| Compaction: tokens written to cache or sent fresh | 136389, 136389, 136389 | 1534, 136389, 136389 |
| Compaction: tokens written out | 3879, 2982, 3102 | 2951, 3973, 5077 |
| Compaction: cost, USD | 0.1903, 0.1521, 0.1527 | 0.0306, 0.1571, 0.1626 |
| All questions: seconds | 69.2, 72.3, 71.8 | 32.5, 88.7, 41.7 |
| All questions: input tokens | 449943, 484288, 463993 | 139888, 625927, 204919 |
| All questions: cost, USD | 0.2835, 0.2879, 0.2925 | 0.1487, 0.3019, 0.1778 |
| `recall` calls | 7, 7, 6 | 0, 0, 0 |
| Files read again | 1, 1, 4 | 1, 23, 5 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 1, 1 | 1, 2, 1 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 1, 0, 1 | 2, 0, 1 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2, 2/2, 1/2 | 0/2, 2/2, 0/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 0/1, 0/1, 0/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 16 | 17 |
| correct after recall | 5 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 2 |
| correct after reading again | 2 | 1 |
| incorrect without retrieval | 3 | 3 |
| incorrect after retrieval | 1 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 4 |
| ungraded | 0 | 0 |

### prose, claude-haiku-4-5-20251001

Runs: plugin 3, first in 2; builtin 3, first in 1. The plugin's code: bfe9c5b1d1d4 (commit 9cb27ca9e873).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 32261, 25784, 27020 | 28584, 22419, 23465 |
| Tokens before | 58936, 58936, 58936 | 58936, 58936, 58936 |
| Tokens sent on the next request | 13823, 13739, 13840 | 12558, 12702, 12634 |
| Built-in summary ran | 3 of 3 | 3 of 3 |
| Compaction: tokens read from cache | 8355, 8355, 8355 | 59113, 8355, 8355 |
| Compaction: tokens written to cache or sent fresh | 52295, 52295, 52295 | 1537, 52295, 52295 |
| Compaction: tokens written out | 3052, 2633, 2452 | 2539, 2001, 2038 |
| Compaction: cost, USD | 0.0811, 0.0663, 0.0654 | 0.0201, 0.0758, 0.0633 |
| All questions: seconds | 62.5, 52.1, 51.9 | 76.9, 35.2, 107.7 |
| All questions: input tokens | 297068, 277340, 262020 | 556402, 196027, 453924 |
| All questions: cost, USD | 0.2280, 0.2272, 0.2221 | 0.2608, 0.1650, 0.2240 |
| `recall` calls | 4, 4, 4 | 0, 0, 0 |
| Files read again | 2, 1, 1 | 19, 3, 19 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 2, 2, 2 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 1, 0, 0 | 0, 1, 1 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 1/2, 2/2, 2/2 | 1/2, 0/2, 1/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 0/1, 0/1, 0/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 15 | 15 |
| correct after recall | 5 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 2 |
| correct after reading again | 3 | 3 |
| incorrect without retrieval | 3 | 3 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 1 | 4 |
| ungraded | 0 | 0 |

### prose, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 0. The plugin's code: bfe9c5b1d1d4 (commit 9cb27ca9e873).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 16844 | 13756 |
| Tokens before | 58936 | 58936 |
| Tokens sent on the next request | 13052 | 11557 |
| Built-in summary ran | 1 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 11476 | 11476 |
| Compaction: tokens written to cache or sent fresh | 72772 | 72772 |
| Compaction: tokens written out | 2377 | 2046 |
| Compaction: cost, USD | 0.1716 | 0.1683 |
| All questions: seconds | 49.0 | 37.3 |
| All questions: input tokens | 289936 | 164923 |
| All questions: cost, USD | 0.4978 | 0.3296 |
| `recall` calls | 4 | 0 |
| Files read again | 3 | 5 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 1 | 3 |
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
| correct from context | 5 | 6 |
| correct after recall | 2 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 1 | 3 |
| correct after reading again | 1 | 0 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |

### results, claude-haiku-4-5-20251001

Runs: plugin 3, first in 2; builtin 3, first in 1. The plugin's code: bfe9c5b1d1d4 (commit 2cba970a8c28, 9cb27ca9e873).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 98, 91, 136 | 28111, 30379, 23293 |
| Tokens before | 102276, 102276, 102276 | 102276, 102276, 102276 |
| Tokens sent on the next request | 37139, 37139, 37139 | 8333, 8313, 8282 |
| Built-in summary ran | 0 of 3 | 3 of 3 |
| Compaction: tokens read from cache | 0, 0, 0 | 8355, 8355, 8355 |
| Compaction: tokens written to cache or sent fresh | 0, 0, 0 | 95621, 95621, 95621 |
| Compaction: tokens written out | 0, 0, 0 | 2640, 3270, 2571 |
| Compaction: cost, USD | 0.0000, 0.0000, 0.0000 | 0.1332, 0.1363, 0.1093 |
| All questions: seconds | 40.5, 47.5, 43.1 | 115.6, 57.7, 73.7 |
| All questions: input tokens | 682118, 682961, 684727 | 433002, 200443, 179582 |
| All questions: cost, USD | 0.6406, 0.1086, 0.1118 | 0.1869, 0.1061, 0.1031 |
| `recall` calls | 4, 4, 4 | 0, 0, 0 |
| Files read again | 1, 1, 1 | 26, 6, 4 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 2, 1, 1 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 0, 1, 0 | 3, 2, 2 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 1/2, 2/2, 1/2 | 1/2, 0/2, 0/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 1/1, 0/1, 1/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 2/2, 1/2 | 2/2, 2/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 11 | 12 |
| correct after recall | 9 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 1 |
| correct after reading again | 3 | 6 |
| incorrect without retrieval | 1 | 0 |
| incorrect after retrieval | 2 | 0 |
| incorrect after reading outside the working directory | 0 | 1 |
| incorrect after reading again | 0 | 0 |
| abstained | 1 | 7 |
| ungraded | 0 | 0 |

### results, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 0. The plugin's code: bfe9c5b1d1d4 (commit 9cb27ca9e873).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 104 | 25080 |
| Tokens before | 102276 | 102276 |
| Tokens sent on the next request | 36770 | 7423 |
| Built-in summary ran | 0 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 0 | 0 |
| Compaction: tokens written to cache or sent fresh | 0 | 111397 |
| Compaction: tokens written out | 0 | 3432 |
| Compaction: cost, USD | 0.0000 | 0.2629 |
| All questions: seconds | 44.8 | 33.9 |
| All questions: input tokens | 636206 | 105553 |
| All questions: cost, USD | 1.2930 | 0.1715 |
| `recall` calls | 3 | 0 |
| Files read again | 2 | 5 |
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

### short, claude-haiku-4-5-20251001

Runs: plugin 3, first in 1; builtin 3, first in 2. The plugin's code: bfe9c5b1d1d4 (commit bfc503c4ef6b, 9cb27ca9e873).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 25505, 26687, 28681 | 24341, 25286, 28731 |
| Tokens before | 27728, 27728, 27728 | 27728, 27728, 27728 |
| Tokens sent on the next request | 13608, 13641, 13394 | 13077, 13091, 13293 |
| Built-in summary ran | 3 of 3 | 3 of 3 |
| Compaction: tokens read from cache | 27903, 8355, 8355 | 0, 8355, 8355 |
| Compaction: tokens written to cache or sent fresh | 1546, 21094, 21094 | 29449, 21094, 21094 |
| Compaction: tokens written out | 2223, 3061, 3208 | 2271, 2435, 2940 |
| Compaction: cost, USD | 0.0155, 0.0372, 0.0380 | 0.0478, 0.0341, 0.0366 |
| All questions: seconds | 45.4, 46.3, 47.6 | 45.5, 60.8, 80.4 |
| All questions: input tokens | 254653, 270816, 251779 | 255479, 351625, 458935 |
| All questions: cost, USD | 0.2130, 0.2190, 0.2107 | 0.1783, 0.2011, 0.2441 |
| `recall` calls | 4, 4, 4 | 0, 0, 0 |
| Files read again | 1, 2, 1 | 5, 14, 20 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 1, 1, 2 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 0, 0, 0 | 1, 0, 0 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2, 2/2, 2/2 | 0/2, 0/2, 1/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 0/1, 0/1, 0/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 15 | 15 |
| correct after recall | 6 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 1 |
| correct after reading again | 3 | 3 |
| incorrect without retrieval | 3 | 3 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 5 |
| ungraded | 0 | 0 |

### thinking, claude-haiku-4-5-20251001

Runs: plugin 3, first in 1; builtin 3, first in 2. The plugin's code: bfe9c5b1d1d4 (commit 9cb27ca9e873).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 30218, 37994, 34811 | 29388, 25421, 28610 |
| Tokens before | 34489, 34489, 34489 | 34489, 34489, 34489 |
| Tokens sent on the next request | 13530, 14378, 14213 | 12829, 12818, 13563 |
| Built-in summary ran | 3 of 3 | 3 of 3 |
| Compaction: tokens read from cache | 34643, 8355, 8355 | 8355, 8355, 8355 |
| Compaction: tokens written to cache or sent fresh | 1550, 27838, 27838 | 27838, 27838, 27838 |
| Compaction: tokens written out | 3299, 4321, 3637 | 3223, 2341, 3422 |
| Compaction: cost, USD | 0.0215, 0.0503, 0.0469 | 0.0514, 0.0404, 0.0458 |
| All questions: seconds | 55.2, 51.4, 50.7 | 38.2, 52.6, 42.3 |
| All questions: input tokens | 268174, 283733, 265092 | 163120, 276315, 178494 |
| All questions: cost, USD | 0.2168, 0.2328, 0.2270 | 0.1720, 0.1930, 0.1764 |
| `recall` calls | 4, 4, 4 | 0, 0, 0 |
| Files read again | 2, 2, 1 | 1, 7, 1 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 1, 1, 0 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 0, 0, 0 | 2, 0, 0 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2, 2/2, 2/2 | 0/2, 1/2, 0/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 0/1, 0/1, 0/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 1/2, 0/2, 2/2 | 1/2, 1/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 12 | 15 |
| correct after recall | 6 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 1 |
| correct after reading again | 3 | 1 |
| incorrect without retrieval | 6 | 5 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 5 |
| ungraded | 0 | 0 |

### writes, claude-haiku-4-5-20251001

Runs: plugin 3, first in 1; builtin 3, first in 2. The plugin's code: bfe9c5b1d1d4 (commit 9cb27ca9e873).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 29965, 27729, 27248 | 26559, 29172, 35697 |
| Tokens before | 68349, 68349, 68349 | 68349, 68349, 68349 |
| Tokens sent on the next request | 27812, 27218, 27103 | 26174, 26432, 26327 |
| Built-in summary ran | 3 of 3 | 3 of 3 |
| Compaction: tokens read from cache | 68471, 8355, 8355 | 8355, 68471, 8355 |
| Compaction: tokens written to cache or sent fresh | 1562, 61678, 61678 | 61678, 1562, 61678 |
| Compaction: tokens written out | 3415, 2864, 3158 | 3065, 3006, 3871 |
| Compaction: cost, USD | 0.0255, 0.0919, 0.0783 | 0.0929, 0.0234, 0.0819 |
| All questions: seconds | 79.6, 66.0, 61.1 | 49.7, 47.2, 67.5 |
| All questions: input tokens | 655527, 642738, 583432 | 388771, 497719, 692623 |
| All questions: cost, USD | 0.5427, 0.5569, 0.5168 | 0.4345, 0.4573, 0.4832 |
| `recall` calls | 4, 6, 4 | 0, 0, 0 |
| Files read again | 3, 2, 2 | 5, 9, 13 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 0, 1, 1 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 2, 0, 2 | 8, 1, 4 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 1/2, 2/2, 1/2 | 0/2, 1/2, 1/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 1/1, 1/1, 1/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 2/2, 2/2 | 1/2, 2/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 12 | 11 |
| correct after recall | 7 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 2 |
| correct after reading again | 6 | 6 |
| incorrect without retrieval | 0 | 1 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 2 | 7 |
| ungraded | 0 | 0 |

### writes, claude-sonnet-5-5

Runs: plugin 1, first in 0; builtin 1, first in 1. The plugin's code: bfe9c5b1d1d4 (commit 9cb27ca9e873).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 19751 | 16959 |
| Tokens before | 68349 | 68349 |
| Tokens sent on the next request | 29439 | 28347 |
| Built-in summary ran | 1 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 11476 | 11476 |
| Compaction: tokens written to cache or sent fresh | 75010 | 75010 |
| Compaction: tokens written out | 2475 | 2256 |
| Compaction: cost, USD | 0.1771 | 0.1749 |
| All questions: seconds | 62.2 | 58.4 |
| All questions: input tokens | 701692 | 427919 |
| All questions: cost, USD | 1.2534 | 0.9622 |
| `recall` calls | 6 | 0 |
| Files read again | 2 | 6 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 0 | 3 |
| Exact answers the program found wrong and the grader called right | 0 | 0 |
| Words that tell the arm, in all answers | 1 | 4 |

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
| correct from context | 4 | 3 |
| correct after recall | 3 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 2 | 2 |
| incorrect without retrieval | 0 | 1 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |


### What the plugin estimated against what was in use

| Trace | Model | Plugin | Run | Outcome | Estimated | Measured | Error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| full | claude-haiku-4-5-20251001 | current (bfe9c5b1d1d4) | 1 | nothing | 211577 | 143024 in use before | 47.9 % |
| full | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 1 | nothing | 211577 | 143024 in use before | 47.9 % |
| full | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 2 | nothing | 211577 | 143024 in use before | 47.9 % |
| full | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 3 | nothing | 211577 | 143024 in use before | 47.9 % |
| full | claude-haiku-4-5-20251001 | v0.5.2 (fb0cbed94dd9) | 1 | nothing | 142915 | 143024 in use before | -0.1 % |
| prose | claude-haiku-4-5-20251001 | current (bfe9c5b1d1d4) | 1 | nothing | 79233 | 58936 in use before | 34.4 % |
| prose | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 1 | nothing | 79233 | 58936 in use before | 34.4 % |
| prose | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 2 | nothing | 79233 | 58936 in use before | 34.4 % |
| prose | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 3 | nothing | 79233 | 58936 in use before | 34.4 % |
| prose | claude-haiku-4-5-20251001 | v0.5.2 (fb0cbed94dd9) | 1 | nothing | 58821 | 58936 in use before | -0.2 % |
| prose | claude-sonnet-5-5 | default (bfe9c5b1d1d4) | 1 | nothing | 80105 | 58936 in use before | 35.9 % |
| results | claude-haiku-4-5-20251001 | current (bfe9c5b1d1d4) | 1 | moved | 36926 | 37130 sent next | -0.5 % |
| results | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 1 | moved | 36926 | 37139 sent next | -0.6 % |
| results | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 2 | moved | 36926 | 37139 sent next | -0.6 % |
| results | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 3 | moved | 36926 | 37139 sent next | -0.6 % |
| results | claude-haiku-4-5-20251001 | v0.5.2 (fb0cbed94dd9) | 1 | moved | 49157 | 37130 sent next | 32.4 % |
| results | claude-sonnet-5-5 | default (bfe9c5b1d1d4) | 1 | moved | 37533 | 36770 sent next | 2.1 % |
| short | claude-haiku-4-5-20251001 | current (bfe9c5b1d1d4) | 1 | nothing | 20462 | 27728 in use before | -26.2 % |
| short | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 1 | nothing | 20462 | 27728 in use before | -26.2 % |
| short | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 2 | nothing | 20462 | 27728 in use before | -26.2 % |
| short | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 3 | nothing | 20462 | 27728 in use before | -26.2 % |
| short | claude-haiku-4-5-20251001 | v0.5.2 (fb0cbed94dd9) | 1 | nothing | 27620 | 27728 in use before | -0.4 % |
| short | claude-sonnet-5-5 | default (bfe9c5b1d1d4) | 1 | nothing | 20788 | 27728 in use before | -25.0 % |
| thinking | claude-haiku-4-5-20251001 | current (bfe9c5b1d1d4) | 1 | nothing | 20185 | 34489 in use before | -41.5 % |
| thinking | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 1 | nothing | 20185 | 34489 in use before | -41.5 % |
| thinking | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 2 | nothing | 20185 | 34489 in use before | -41.5 % |
| thinking | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 3 | nothing | 20185 | 34489 in use before | -41.5 % |
| thinking | claude-haiku-4-5-20251001 | v0.5.2 (fb0cbed94dd9) | 1 | nothing | 34364 | 34489 in use before | -0.4 % |
| writes | claude-haiku-4-5-20251001 | current (bfe9c5b1d1d4) | 1 | nothing | 64406 | 68349 in use before | -5.8 % |
| writes | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 1 | nothing | 64406 | 68349 in use before | -5.8 % |
| writes | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 2 | nothing | 64406 | 68349 in use before | -5.8 % |
| writes | claude-haiku-4-5-20251001 | default (bfe9c5b1d1d4) | 3 | nothing | 64406 | 68349 in use before | -5.8 % |
| writes | claude-haiku-4-5-20251001 | v0.5.2 (fb0cbed94dd9) | 1 | nothing | 68204 | 68349 in use before | -0.2 % |
| writes | claude-sonnet-5-5 | default (bfe9c5b1d1d4) | 1 | nothing | 65278 | 68349 in use before | -4.5 % |

### The questions `find` is for, asked of an agent

| Trace | Model | Run | Key | Compaction | Right | `find` calls | `recall` calls | Files read again | Seconds | Input tokens | Cost, USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| results | claude-haiku-4-5-20251001 | 1 | no key | moved | 5/8 | 0 | 3 | 1 | 59.3 | 568683 | 0.5876 |
| results | claude-haiku-4-5-20251001 | 1 | with a key | moved | 6/8 | 0 | 11 | 0 | 169.2 | 1051285 | 0.7488 |
| short | claude-haiku-4-5-20251001 | 1 | no key | nothing | 3/5 | 0 | 3 | 0 | 38.4 | 161473 | 0.1370 |
| short | claude-haiku-4-5-20251001 | 1 | with a key | nothing | 4/5 | 0 | 4 | 0 | 41.4 | 188390 | 0.1480 |

### What `find` picks, against a word match

| Trace | Asked by | Options | Questions | Word match: right | find: gave the right one | find: gave a wrong one | find: listed, the right one first | find: listed, the right one further down | find: listed without it | find: said none | find: did not answer | Answer not among the options: find said none |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| results | value | 15 | 4 | 3 | 1 | 0 | 0 | 0 | 0 | 3 | 0 | 0 of 0 |
| results | meaning | 15 | 4 | 2 | 1 | 0 | 1 | 1 | 1 | 0 | 0 | 0 of 0 |
| writes | value | 3 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 1 of 1 |
| writes | meaning | 3 | 3 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 | 0 of 0 |
| prose | value | 3 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 of 0 |
| prose | meaning | 3 | 3 | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 of 0 |
| short | value | 3 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 of 0 |
| short | meaning | 3 | 3 | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 of 0 |
| full | value | 3 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 of 0 |
| full | meaning | 3 | 3 | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 of 0 |
| thinking | value | 3 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 of 0 |
| thinking | meaning | 3 | 3 | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 of 0 |
