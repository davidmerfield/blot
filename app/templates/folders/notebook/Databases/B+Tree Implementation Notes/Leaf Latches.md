optimize for fast updates:
- use qsbr or equiv for removals
- do delta updates by locking the version chain head, appending a delta, updating the head
- readers take pointers to version chain heads
- actually reading the tuple requires a per-tuple latch
	- and a version chain re-traversal for each access 

optimize for fast reads:
- qsbr or equiv for removals
- full-row-copy updates
- readers take pointers to versions
- no locking for reads
- writing is a copy -> cas

optimize for low contention:
- locking for removals
- readers hold (page) latches
- writers hold page latches
-> problem: contention on pages; restarts from scans
-> in a very low contention env, could be better

