| Setting | Runs | Compactions | In use before each | Right after each | Read from the cache right after | Written to it right after | Sent per request | Right | Right after reading outside the work | `recall` calls | Cost by log 24, USD | Cost by log 30, USD | Cost, USD | Time, s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| target-40 | 3 | 5, 5, 5 | 170056, 170170, 170037 | 64634, 64708, 64617 | 4128, 4128, 4128 | 60504, 60578, 60487 | 101979, 101925, 101941 | 6/6, 6/6, 6/6 | 0, 0, 0 | 5, 5, 6 | 3.16, 3.02, 3.16 | 4.13, 4.00, 4.13 | 5.13, 5.01, 5.13 | 277, 489, 292 |
| target-1 | 3 | 4, 4, 4 | 170405, 170631, 170349 | 26245, 26277, 26208 | 4128, 4128, 4128 | 22115, 22147, 22078 | 87936, 86384, 87667 | 6/6, 6/6, 6/6 | 0, 0, 0 | 5, 6, 6 | 2.36, 2.36, 2.45 | 3.19, 3.26, 3.27 | 4.06, 4.13, 4.13 | 251, 314, 282 |

| Setting | Runs | `recall` calls | Refused | Refused, not 64 hexadecimal characters |
| --- | --- | --- | --- | --- |
| target-40 | 3 | 5, 5, 6 | 0, 0, 0 | 0, 0, 0 |
| target-1 | 3 | 5, 6, 6 | 0, 0, 0 | 0, 0, 0 |
