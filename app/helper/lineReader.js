(function () {
  "use strict";
  var fs = require("fs");
  var noop = function () {};

  function LineReader(filename, separator, encoding, chunkSize) {
    this.size = fs.statSync(filename).size;
    this.filename = filename;
    this.separator = separator || "\n";
    this.encoding = encoding || "utf8";
    this.chunkSize = chunkSize || 1024;
    this.pos = Math.max(this.size - this.chunkSize, 0);
    this.pointer = this.pos;
    this.buffer = null;
    this.savedBuffer = "";
  }

  LineReader.prototype.searchBuffer = function () {
    if (this.buffer === null) {
      return false;
    }
    var separatorPos = this.buffer.lastIndexOf(this.separator);
    var savedBuffer;
    if (this.pos <= 0 && separatorPos === -1) {
      var lastLine = this.buffer;
      this.buffer = "";
      savedBuffer = this.savedBuffer;
      this.savedBuffer = "";
      return lastLine + savedBuffer;
    }
    if (separatorPos === -1) {
      this.pointer = this.pos - this.chunkSize - 1;
      this.pos = this.pointer;
      this.savedBuffer = this.buffer + this.savedBuffer;
      this.buffer = "";
      return false;
    } else {
      var line = this.buffer.substr(
        separatorPos + this.separator.length,
        this.buffer.length
      );
      this.buffer = this.buffer.substr(0, separatorPos);
      savedBuffer = this.savedBuffer;
      this.savedBuffer = "";
      return line + savedBuffer;
    }
  };

  LineReader.prototype.readLine = function (cb) {
    var _this = this;
    var chunkSize = 0;
    var line = _this.searchBuffer();
    if (line !== false) {
      cb(line, _this.buffer === "" && this.pos <= 0);
    } else {
      var stream = fs.createReadStream(this.filename, {
        start: Math.max(this.pointer, 0),
        end: Math.max(this.pointer + this.chunkSize, 0),
        encoding: this.encoding,
      });

      stream.on("error", function (err) {
        throw err;
      });
      stream.on("end", function () {
        if (_this.buffer === null) {
          cb(null, true);
        } else {
          _this.readLine(cb);
        }
      });
      stream.on("data", function (data) {
        if (_this.buffer === null) {
          _this.buffer = "";
        }
        _this.buffer += data;
        chunkSize += data.length;
      });
    }
  };

  function eachLine(filename, cb, separator, encoding, chunkSize) {
    var finalFn,
      asyncCb = cb.length == 3;
    var reader = new LineReader(filename, separator, encoding, chunkSize);
    readLine();
    function readLine(continueReading) {
      if (continueReading === false) {
        if (finalFn) {
          finalFn();
        }
        return;
      }
      reader.readLine(function (line, last) {
        if (line !== null && cb(line, last, last ? noop : readLine) !== false) {
          if (!last) {
            if (!asyncCb) {
              readLine();
            }
          }
        } else {
          last = true;
        }

        if (last && finalFn) {
          finalFn();
        }
      });
    }

    return {
      then: function (cb) {
        finalFn = cb;
      },
    };
  }

  module.exports.eachLine = eachLine;
})();
