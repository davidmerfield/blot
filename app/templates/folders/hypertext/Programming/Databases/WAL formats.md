# WAL formats

There are many ways to write a sequence of binary log entries to a file, though usually they're buried inside of larger projects. Here's a few.
- [RocksDB WAL](https://github.com/facebook/rocksdb/wiki/Write-Ahead-Log-File-Format)
- [LevelDB WAL](https://github.com/google/leveldb/blob/main/doc/log_format.md)
- [TFRecord](https://github.com/tensorflow/tensorflow/blob/master/tensorflow/core/lib/io/record_writer.cc)
- [Riegeli](https://github.com/google/riegeli)
- [GRAIL/logio](https://github.com/awans/logio) which is what I used in [[Aft]]