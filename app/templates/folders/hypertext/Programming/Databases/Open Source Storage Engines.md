SQLite, as used by FDB: https://github.com/apple/foundationdb/blob/e0c8175f3ccad92c582a3e70e9bcae58fff53633/fdbserver/KeyValueStoreSQLite.actor.cpp

LMDB wrapper with production use: https://github.com/meilisearch/heed

RocksDb: https://crates.io/crates/rocksdb

LevelDb/BerkeleyDb exist, but the above options seem to have more modern production usage.

InnoDb and WiredTiger are open source, but are tightly coupled to MySQL and Mongo respectively.

Sled is a pure Rust option, but I'm not clear on how much production usage it has.