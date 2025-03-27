var spawn = require("child_process").spawn;
var time = require("helper/time");
var config = require("config");
var Pandoc = config.pandoc.bin;
var debug = require("debug")("blot:converters:rtf");

module.exports = function (blog, text, callback) {
  var args = [
    // Limit the heap size for the pandoc process
    // to prevent pandoc consuming all the system's
    // memory in corner cases
    "+RTS",
    "-M" + config.pandoc.maxmemory,
    "-RTS",

    "-f",
    "rtf",

    // Not really sure what the difference is between
    // this and just HTML.
    "-t",
    "html5",

    // we use our own highlighint library (hljs) later
    "--no-highlight",

    // such a dumb default feature... sorry john!
    "--email-obfuscation=none",
  ];

  var startTime = Date.now();
  var pandoc = spawn(Pandoc, args);

  var result = "";
  var error = "";

  pandoc.stdout.on("data", function (data) {
    result += data;
  });

  pandoc.stderr.on("data", function (data) {
    error += data;
  });

  setTimeout(function () {
    pandoc.kill();
  }, config.pandoc.timeout);

  pandoc.on("close", function (code) {
    time.end("pandoc");

    var err = null;

    // This means something went wrong
    if (code !== 0) {
      err =
        "Pandoc exited with code " +
        code +
        " in " +
        (Date.now() - startTime) +
        "ms (timeout=" +
        config.pandoc.timeout +
        "ms)";
      err += error;
      err = new Error(err);
    }

    if (err) return callback(err);

    debug("Final:", result);
    callback(null, result);
  });

  debug("Pre-pandoc", text);
  time("pandoc");
  pandoc.stdin.end(text, "utf8");
};
