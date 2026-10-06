Nothing has been graded by a model yet: the answers a program cannot grade are counted as ungraded.


### What the plugin estimated against what was in use

| Trace | Model | Plugin | Run | Outcome | Estimated | Measured | Error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

### The questions `find` is for, asked of an agent

| Trace | Model | Run | Key | Compaction | Right | `find` calls | `recall` calls | Files read again | Seconds | Input tokens | Cost, USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| full | claude-haiku-4-5-20251001 | 1 | no key | nothing | 3/5 | 0 | 3 | 0 | 42.3 | 144676 | 0.1341 |
| full | claude-haiku-4-5-20251001 | 1 | with a key | nothing | 4/5 | 1 | 7 | 0 | 39.7 | 284236 | 0.1870 |
| full | claude-haiku-4-5-20251001 | 2 | no key | nothing | 4/5 | 0 | 7 | 0 | 38.2 | 269186 | 0.1867 |
| full | claude-haiku-4-5-20251001 | 2 | with a key | nothing | 4/5 | 2 | 2 | 0 | 29.7 | 138352 | 0.1186 |
| full | claude-haiku-4-5-20251001 | 3 | no key | nothing | 3/5 | 0 | 2 | 0 | 28.7 | 105645 | 0.1134 |
| full | claude-haiku-4-5-20251001 | 3 | with a key | nothing | 5/5 | 2 | 1 | 3 | 31.7 | 176561 | 0.1394 |
| opaque | claude-haiku-4-5-20251001 | 1 | no key | moved | 2/10 | 0 | 18 | 2 | 196.1 | 1386066 | 0.8718 |
| opaque | claude-haiku-4-5-20251001 | 1 | with a key | moved | 7/10 | 10 | 7 | 0 | 78.1 | 814162 | 0.7308 |
| opaque | claude-haiku-4-5-20251001 | 2 | no key | moved | 3/10 | 0 | 35 | 1 | 206.2 | 1366921 | 0.4277 |
| opaque | claude-haiku-4-5-20251001 | 2 | with a key | moved | 6/10 | 10 | 0 | 0 | 64.3 | 669642 | 0.1140 |
| opaque | claude-haiku-4-5-20251001 | 3 | no key | moved | 1/10 | 0 | 16 | 0 | 130.8 | 1069312 | 0.2546 |
| opaque | claude-haiku-4-5-20251001 | 3 | with a key | moved | 6/10 | 9 | 0 | 0 | 54.2 | 636489 | 0.1094 |
| opaque | claude-sonnet-5-5 | 1 | no key | moved | 6/10 | 0 | 96 | 0 | 211.3 | 1163833 | 3.0187 |
| opaque | claude-sonnet-5-5 | 1 | with a key | moved | 7/10 | 9 | 33 | 0 | 131.2 | 988725 | 2.1021 |
| results | claude-haiku-4-5-20251001 | 1 | no key | moved | 5/8 | 0 | 17 | 1 | 143.5 | 1322778 | 0.9489 |
| results | claude-haiku-4-5-20251001 | 1 | with a key | moved | 8/8 | 5 | 7 | 0 | 67.1 | 925022 | 0.7667 |
| results | claude-haiku-4-5-20251001 | 2 | no key | moved | 7/8 | 0 | 13 | 0 | 107.7 | 1050775 | 0.2759 |
| results | claude-haiku-4-5-20251001 | 2 | with a key | moved | 8/8 | 6 | 3 | 0 | 55.3 | 776859 | 0.1513 |
| results | claude-haiku-4-5-20251001 | 3 | no key | moved | 8/8 | 0 | 18 | 3 | 107.2 | 1115996 | 0.3417 |
| results | claude-haiku-4-5-20251001 | 3 | with a key | moved | 8/8 | 7 | 5 | 1 | 63.8 | 960449 | 0.1782 |
