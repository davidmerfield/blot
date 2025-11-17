/*

The zero dependency Node.js module for tailing a file

https://www.lucagrulla.com/node-tail/

The MIT License (MIT)

Copyright (c) 2011 2012 2013 Forward

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/

let events = require(`events`);
let fs = require("fs");
let path = require("path");

// const environment = process.env['NODE_ENV'] || 'development'

class devNull {
  info() {}
  error() {}
}

class Tail extends events.EventEmitter {
  constructor(filename, options = {}) {
    super();
    this.filename = filename;
    this.absPath = path.dirname(this.filename);
    this.separator =
      options.separator !== undefined ? options.separator : /[\r]{0,1}\n/; // null is a valid param
    this.fsWatchOptions = options.fsWatchOptions || {};
    this.follow = "follow" in options ? options.follow : true;
    this.logger = options.logger || new devNull();
    this.useWatchFile = options.useWatchFile || false;
    this.flushAtEOF = options.flushAtEOF || false;
    this.encoding = options.encoding || "utf-8";
    const fromBeginning = options.fromBeginning || false;
    this.nLines = options.nLines || undefined;

    this.logger.info(`Tail starting...`);
    this.logger.info(`filename: ${this.filename}`);
    this.logger.info(`encoding: ${this.encoding}`);

    try {
      fs.accessSync(this.filename, fs.constants.F_OK);
    } catch (err) {
      if (err.code == "ENOENT") {
        throw err;
      }
    }

    this.buffer = "";
    this.internalDispatcher = new events.EventEmitter();
    this.queue = [];
    this.isWatching = false;
    this.pos = 0;

    // this.internalDispatcher.on('next',this.readBlock);
    this.internalDispatcher.on("next", () => {
      this.readBlock();
    });

    this.logger.info(`fromBeginning: ${fromBeginning}`);
    let startingCursor;
    if (fromBeginning) {
      startingCursor = 0;
    } else if (this.nLines !== undefined) {
      const data = fs.readFileSync(this.filename, {
        flag: "r",
        encoding: this.encoding,
      });
      const tokens = data.split(this.separator);
      const dropLastToken = tokens[tokens.length - 1] === "" ? 1 : 0; //if the file end with empty line ignore line NL
      const match = data.match(
        new RegExp(
          `(?:[^\r\n]*[\r]{0,1}\n){${
            tokens.length - this.nLines - dropLastToken
          }}`
        )
      );
      startingCursor =
        match && match.length
          ? Buffer.byteLength(match[0], this.encoding)
          : this.latestPosition();
    } else {
      startingCursor = this.latestPosition();
    }
    if (startingCursor === undefined) throw new Error("Tail can't initialize.");
    const flush = fromBeginning || this.nLines != undefined;
    try {
      this.watch(startingCursor, flush);
    } catch (err) {
      this.logger.error(`watch for ${this.filename} failed: ${err}`);
      this.emit("error", `watch for ${this.filename} failed: ${err}`);
    }
  }

  latestPosition() {
    try {
      return fs.statSync(this.filename).size;
    } catch (err) {
      this.logger.error(`size check for ${this.filename} failed: ${err}`);
      this.emit("error", `size check for ${this.filename} failed: ${err}`);
      throw err;
    }
  }

  readBlock() {
    if (this.queue.length >= 1) {
      const block = this.queue[0];
      if (block.end > block.start) {
        let stream = fs.createReadStream(this.filename, {
          start: block.start,
          end: block.end - 1,
          encoding: this.encoding,
        });
        stream.on("error", (error) => {
          this.logger.error(`Tail error: ${error}`);
          this.emit("error", error);
        });
        stream.on("end", () => {
          let _ = this.queue.shift();
          if (this.queue.length > 0) {
            this.internalDispatcher.emit("next");
          }
          if (this.flushAtEOF && this.buffer.length > 0) {
            this.emit("line", this.buffer);
            this.buffer = "";
          }
        });
        stream.on("data", (d) => {
          if (this.separator === null) {
            this.emit("line", d);
          } else {
            this.buffer += d;
            let parts = this.buffer.split(this.separator);
            this.buffer = parts.pop();
            for (const chunk of parts) {
              this.emit("line", chunk);
            }
          }
        });
      }
    }
  }

  change() {
    let p = this.latestPosition();
    if (p < this.currentCursorPos) {
      //scenario where text is not appended but it's actually a w+
      this.currentCursorPos = p;
    } else if (p > this.currentCursorPos) {
      this.queue.push({ start: this.currentCursorPos, end: p });
      this.currentCursorPos = p;
      if (this.queue.length == 1) {
        this.internalDispatcher.emit("next");
      }
    }
  }

  watch(startingCursor, flush) {
    if (this.isWatching) return;
    this.logger.info(`filesystem.watch present? ${fs.watch != undefined}`);
    this.logger.info(`useWatchFile: ${this.useWatchFile}`);

    this.isWatching = true;
    this.currentCursorPos = startingCursor;
    //force a file flush is either fromBegining or nLines flags were passed.
    if (flush) this.change();

    if (!this.useWatchFile && fs.watch) {
      this.logger.info(`watch strategy: watch`);
      this.watcher = fs.watch(
        this.filename,
        this.fsWatchOptions,
        (e, filename) => {
          this.watchEvent(e, filename);
        }
      );
    } else {
      this.logger.info(`watch strategy: watchFile`);
      fs.watchFile(this.filename, this.fsWatchOptions, (curr, prev) => {
        this.watchFileEvent(curr, prev);
      });
    }
  }

  rename(filename) {
    //TODO
    //MacOS sometimes throws a rename event for no reason.
    //Different platforms might behave differently.
    //see https://nodejs.org/api/fs.html#fs_fs_watch_filename_options_listener
    //filename might not be present.
    //https://nodejs.org/api/fs.html#fs_filename_argument
    //Better solution would be check inode but it will require a timeout and
    // a sync file read.
    if (filename === undefined || filename !== this.filename) {
      this.unwatch();
      if (this.follow) {
        this.filename = path.join(this.absPath, filename);
        this.rewatchId = setTimeout(() => {
          try {
            this.watch(this.currentCursorPos);
          } catch (ex) {
            this.logger.error(
              `'rename' event for ${this.filename}. File not available anymore.`
            );
            this.emit("error", ex);
          }
        }, 1000);
      } else {
        this.logger.error(
          `'rename' event for ${this.filename}. File not available anymore.`
        );
        this.emit(
          "error",
          `'rename' event for ${this.filename}. File not available anymore.`
        );
      }
    } else {
      // this.logger.info("rename event but same filename")
    }
  }

  watchEvent(e, evtFilename) {
    if (e === "change") {
      this.change();
    } else if (e === "rename") {
      this.rename(evtFilename);
    }
  }

  watchFileEvent(curr, prev) {
    if (curr.size > prev.size) {
      this.currentCursorPos = curr.size; //Update this.currentCursorPos so that a consumer can determine if entire file has been handled
      this.queue.push({ start: prev.size, end: curr.size });
      if (this.queue.length == 1) {
        this.internalDispatcher.emit("next");
      }
    }
  }

  unwatch() {
    if (this.watcher) {
      this.watcher.close();
    } else {
      fs.unwatchFile(this.filename);
    }
    if (this.rewatchId) {
      clearTimeout(this.rewatchId);
      this.rewatchId = undefined;
    }
    this.isWatching = false;
    this.queue = []; // TODO: is this correct behaviour?
    if (this.logger) {
      this.logger.info(`Unwatch ${this.filename}`);
    }
  }
}

module.exports = Tail;
