Nothing has been graded by a model yet: the answers a program cannot grade are counted as ungraded.


### What the plugin estimated against what was in use

| Trace | Model | Plugin | Run | Outcome | Estimated | Measured | Error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

### The questions `find` is for, asked of an agent

| Trace | Model | Run | Key | Compaction | Right | `find` calls | `recall` calls | Files read again | Seconds | Input tokens | Cost, USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opaque | claude-haiku-4-5-20251001 | 1 | with a key | moved | 4/10 | 5 | 1 | 0 | 108.5 | 666521 | 0.1396 |
| opaque | claude-haiku-4-5-20251001 | 2 | with a key | moved | 7/10 | 7 | 2 | 0 | 121.7 | 857542 | 0.1958 |
| opaque | claude-haiku-4-5-20251001 | 3 | with a key | moved | 8/10 | 8 | 9 | 0 | 130.3 | 1026014 | 0.2465 |
| results | claude-haiku-4-5-20251001 | 1 | with a key | moved | 8/8 | 2 | 5 | 2 | 102.0 | 1184132 | 0.2175 |
| results | claude-haiku-4-5-20251001 | 2 | with a key | moved | 8/8 | 3 | 10 | 0 | 108.2 | 1543939 | 0.3095 |
| results | claude-haiku-4-5-20251001 | 3 | with a key | moved | 7/8 | 3 | 5 | 0 | 87.0 | 1192959 | 0.2210 |

### What `find` picks, against a word match

| Trace | Asked by | Options | Questions | Word match: right | find: gave the right one | find: gave a wrong one | find: listed, the right one first | find: listed, the right one further down | find: listed without it | find: said none | find: did not answer | Answer not among the options: find said none |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| results | value | 15 | 4 | 3 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 of 0 |
| results | meaning | 15 | 4 | 2 | 1 | 0 | 2 | 0 | 1 | 0 | 0 | 0 of 0 |
| writes | value | 3 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 1 of 1 |
| writes | meaning | 3 | 3 | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 of 0 |
| prose | value | 3 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 of 0 |
| prose | meaning | 3 | 3 | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 of 0 |
| short | value | 3 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 of 0 |
| short | meaning | 3 | 3 | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 of 0 |
| full | value | 3 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 of 0 |
| full | meaning | 3 | 3 | 2 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 of 0 |
| thinking | value | 3 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 of 0 |
| thinking | meaning | 3 | 3 | 2 | 2 | 0 | 0 | 1 | 0 | 0 | 0 | 0 of 0 |
| opaque | meaning | 20 | 7 | 2 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 of 0 |
| opaque | value | 20 | 3 | 1 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 of 0 |
