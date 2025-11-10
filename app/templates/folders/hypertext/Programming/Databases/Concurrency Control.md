# Concurrency Control
[Concurrency Control test cases](https://github.com/ept/hermitage/blob/master/postgres.md)

[MVCC designs evaluated](https://yingjunwu.github.io/papers/vldb2017.pdf). 

Description of [InnoDB's MVCC system](https://dev.mysql.com/doc/refman/8.0/en/innodb-multi-versioning.html)

Pavlo course slides: https://15721.courses.cs.cmu.edu/spring2018/slides/06-mvcc2.pdf

Nice blog post about TSO protocols: https://muratbuffalo.blogspot.com/2022/11/timestamp-based-algorithms-for.html

From TUM: https://db.in.tum.de/other/imdm2013/papers/Muhe.pdf
Textbook on MVTO: https://www.microsoft.com/en-us/research/wp-content/uploads/2016/05/chapter5.pdf

Deuteronomy - Multiversion TSO with phantom protection:
[1] - https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/DeuteronomyTC-CIDR2015-full.pdf
[2] - http://www.vldb.org/pvldb/vol8/p2146-levandoski.pdf

Cicada has a very clever MVTSO scheme that stores TSO timestamps on their carefully designed index nodes to prevent phantoms. Seems like a very low-contention strategy, and also potentially relatively easy to implement.

See some nice detail: "As a common performance optimization, Cicada does not validate read-only accesses to internal index nodes because validating leaf index nodes that are responsible for holding index key-value pairs suffices for phantom avoidance. Temporary structural inconsistencies are mitigated by using sibling pointers, similarly to Blink-tree"

Cicada paper: https://faculty.cc.gatech.edu/~jarulraj/courses/4420-s19/papers/06-mvcc2/lim-sigmod2017.pdf

MVTSO with speculative reads: https://15721.courses.cs.cmu.edu/spring2016/papers/p298-larson.pdf

From a textbook:

https://www.cs.nmsu.edu/~hcao/teaching/cs582/note/DB2_t22_trans2_cc.pdf


Solution 1: A transaction is structured such that its writes are all performed at the end of its processing. All writes of a transaction form an atomic action; no transaction may execute while a transaction is being written. A transaction that aborts is restarted with a new timestamp.

Solution 2: Limited form of locking: wait for data to be committed before reading it

Solution 3: Use commit dependencies to ensure recoverability

TicToc: https://people.csail.mit.edu/sanchez/papers/2016.tictoc.sigmod.pdf


PLOR an interesting hybrid scheme between 2PL and OCC.

https://dl.acm.org/doi/pdf/10.1145/3514221.3517879

Another possibility for phantom protection is HyPeR's predicate locking.

Some interesting analysis of subtle engineering details of implmementation: https://dspace.mit.edu/bitstream/handle/1721.1/133836/3377369.3377373.pdf?sequence=2&isAllowed=y

Older paper which includes an MVTO algo: https://dl.acm.org/doi/pdf/10.1145/6513.6517

Ditto: https://dl.acm.org/doi/pdf/10.1145/319996.319998