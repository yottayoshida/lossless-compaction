Nothing has been graded by a model yet: the answers a program cannot grade are counted as ungraded.


### What the plugin estimated against what was in use

| Trace | Model | Plugin | Run | Outcome | Estimated | Measured | Error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

### The questions `find` is for, asked of an agent

| Trace | Model | Run | Key | Compaction | Right | `find` calls | `recall` calls | Files read again | Seconds | Input tokens | Cost, USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opaque | claude-haiku-4-5-20251001 | 1 | no key | moved | 1/10 | 0 | 20 | 0 | 167.4 | 911237 | 0.2774 |
| opaque | claude-haiku-4-5-20251001 | 1 | with a key | moved | 4/10 | 6 | 18 | 0 | 186.8 | 1613917 | 0.3544 |
| opaque | claude-haiku-4-5-20251001 | 2 | no key | moved | 2/10 | 0 | 40 | 2 | 219.5 | 1721629 | 0.4694 |
| opaque | claude-haiku-4-5-20251001 | 2 | with a key | moved | 4/10 | 7 | 9 | 0 | 142.8 | 1210246 | 0.2550 |
| opaque | claude-haiku-4-5-20251001 | 3 | no key | moved | 0/10 | 0 | 19 | 1 | 174.6 | 971581 | 0.2842 |
| opaque | claude-haiku-4-5-20251001 | 3 | with a key | moved | 4/10 | 6 | 11 | 1 | 150.2 | 1192973 | 0.2684 |
| opaque | claude-sonnet-5-5 | 1 | no key | moved | 5/10 | 0 | 81 | 1 | 194.2 | 1118898 | 1.6132 |
| opaque | claude-sonnet-5-5 | 1 | with a key | moved | 7/10 | 9 | 27 | 0 | 122.4 | 879263 | 0.8243 |
| results | claude-haiku-4-5-20251001 | 1 | no key | moved | 5/8 | 0 | 17 | 0 | 178.8 | 1676692 | 0.4257 |
| results | claude-haiku-4-5-20251001 | 1 | with a key | moved | 6/8 | 1 | 12 | 0 | 107.0 | 1114414 | 0.2817 |
| results | claude-haiku-4-5-20251001 | 2 | no key | moved | 5/8 | 0 | 11 | 1 | 142.1 | 1372251 | 0.3262 |
| results | claude-haiku-4-5-20251001 | 2 | with a key | moved | 8/8 | 2 | 5 | 1 | 71.7 | 1093694 | 0.1958 |
| results | claude-haiku-4-5-20251001 | 3 | no key | moved | 5/8 | 0 | 6 | 1 | 102.0 | 927893 | 0.2034 |
| results | claude-haiku-4-5-20251001 | 3 | with a key | moved | 5/8 | 1 | 18 | 1 | 145.3 | 1670363 | 0.4537 |
| short | claude-haiku-4-5-20251001 | 1 | no key | nothing | 4/5 | 0 | 5 | 0 | 38.6 | 212244 | 0.1556 |
| short | claude-haiku-4-5-20251001 | 1 | with a key | nothing | 4/5 | 0 | 4 | 0 | 40.3 | 185444 | 0.1450 |
| short | claude-haiku-4-5-20251001 | 2 | no key | nothing | 3/5 | 0 | 3 | 0 | 43.7 | 160665 | 0.1363 |
| short | claude-haiku-4-5-20251001 | 2 | with a key | nothing | 4/5 | 0 | 5 | 0 | 40.9 | 210734 | 0.1557 |
| short | claude-haiku-4-5-20251001 | 3 | no key | nothing | 4/5 | 0 | 4 | 0 | 37.1 | 187832 | 0.1454 |
| short | claude-haiku-4-5-20251001 | 3 | with a key | nothing | 4/5 | 0 | 4 | 0 | 36.3 | 190018 | 0.1480 |

### What `find` picks, against a word match

| Trace | Asked by | Options | Questions | Word match: right | find: gave the right one | find: gave a wrong one | find: listed, the right one first | find: listed, the right one further down | find: listed without it | find: said none | find: did not answer | Answer not among the options: find said none |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opaque | meaning | 20 | 7 | 2 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 of 0 |
| opaque | value | 20 | 3 | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 of 0 |
