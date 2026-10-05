Nothing has been graded by a model yet: the answers a program cannot grade are counted as ungraded.


### What the plugin estimated against what was in use

| Trace | Model | Plugin | Run | Outcome | Estimated | Measured | Error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |

### The questions `find` is for, asked of an agent

| Trace | Model | Run | Tools | Compaction | Right | Answered by another model after a refusal | `find` calls | `recall` calls | Files read again | Seconds | Input tokens | Cost, USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opaque | claude-sonnet-5-5 | 1 | `recall` only | moved | 9/10 | 1 | 0 | 103 | 0 | 219.6 | 1359167 | 3.2049 |
| opaque | claude-sonnet-5-5 | 2 | `recall` only | moved | 9/10 | 1 | 0 | 113 | 1 | 231.3 | 1415453 | 1.9324 |
| opaque | claude-sonnet-5-5 | 3 | `recall` only | moved | 9/10 | 1 | 0 | 97 | 1 | 210.6 | 1337419 | 1.5936 |

### Where the answer went, and how far the agent got in fetching it

| Trace | Model | Setting | Runs | Questions | Answer left in the conversation | Had to be fetched | `recall` or `find` called | A piece holding it chosen | It came back | Right | Came back, answered wrong |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opaque | claude-sonnet-5-5 | default, find's questions | 3 | 30 | 0 | 30 | 27 | 27 | 27 | 27 | 0 |
| results | claude-sonnet-5-5 | v070 | 3 | 9 | 0 | 9 | 9 | 9 | 9 | 9 | 0 |
| results | claude-sonnet-5-5 | v070-max-after-10 | 3 | 9 | 0 | 9 | 9 | 9 | 9 | 9 | 0 |
| short | claude-sonnet-5-5 | v070 | 3 | 9 | 0 | 9 | 9 | 9 | 9 | 9 | 0 |
| thinking | claude-sonnet-5-5 | v070 | 3 | 9 | 0 | 9 | 9 | 9 | 9 | 9 | 0 |
| writes | claude-sonnet-5-5 | v070 | 3 | 9 | 0 | 9 | 9 | 9 | 9 | 9 | 0 |
| writes | claude-sonnet-5-5 | v070-max-after-10 | 3 | 9 | 0 | 9 | 9 | 9 | 9 | 9 | 0 |
