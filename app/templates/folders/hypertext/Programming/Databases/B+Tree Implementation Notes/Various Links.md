Implementation in C:
http://www.amittai.com/prose/bpt.c
http://www.amittai.com/prose/bplustree.html

Go port of the above (slightly more readable):
https://github.com/collinglass/bptree/blob/master/tree.go#L409

and C++ port of the above with some nice refactoring:
https://github.com/romz-pl/amittai-btree/blob/master/src/BPlusTree.cpp#L358

Visualization:
https://www.cs.usfca.edu/~galles/visualization/BPlusTree.html

Pavlo notes:
https://15445.courses.cs.cmu.edu/fall2022/slides/08-trees.pdf
https://15445.courses.cs.cmu.edu/fall2022/notes/08-trees.pdf

Tuple storage
https://15721.courses.cs.cmu.edu/spring2019/slides/09-storage.pdf

Detailed pavlo locking notes from the main memory session
https://15721.courses.cs.cmu.edu/spring2019/slides/06-indexes.pdf

Wikipedia:
https://en.wikipedia.org/wiki/B%2B_tree

C++ Implementation:
https://github.com/sayef/bplus-tree/blob/master/BPlusTree.cpp

Rust stdlib implementation (not a B+ Tree, but still has some good Rust tricks):
https://doc.rust-lang.org/nightly/src/alloc/collections/btree/node.rs.html

Compression:
https://dl.acm.org/doi/pdf/10.1145/3654972

OLC:
https://github.com/wangziqi2016/index-microbench/blob/master/BTreeOLC/BTreeOLC.h

DataBass implementation notes
https://www.oreilly.com/library/view/database-internals/9781492040330/ch04.html

Handling deadlocks with scans at 54m:
https://www.youtube.com/watch?v=POuQogLy3E8

Sibling pointer updates in innodb
https://dom.as/2011/07/03/innodb-index-lock/

I think the trick for sibling pointers is:
- Sibling pointer updates _always_ occur between nodes under the same parent
- Moving parents does not require sibling pointer updates
- Just write-lock the node and its left and right neighbors (from left to write) when performing structural modifications
- Index scanners hop only along leaf nodes in either direction, and restart (from their last read key) if they hit a locked node, so while they can block the write, they can't cause deadlocks, and writes can't conflict with other writes, since they're localized to a single parent (and the writer X-locks the parent).

C++ one (TLX) - Wheatman:
https://github.com/wheatman/BP-Tree/blob/main/tlx-plain/container/btree.hpp

TUM locking
https://db.in.tum.de/~boettcher/locking.pdf