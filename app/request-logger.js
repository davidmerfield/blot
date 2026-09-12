const clfdate = require("helper/clfdate");

module.exports = function requestLogger(req, res, next) {
  const requestStart = Date.now();
  const requestId = req.headers["x-request-id"] || "no-request-id";
  
  function formatRequestUrl() {
    return `${req.protocol}://${req.hostname}${req.originalUrl}`;
  }

  // Strip newlines and other control characters from anything that ends
  // up in a log line so request-controlled values (paths, query strings,
  // headers, entry titles, etc.) can't forge or split log entries.
  function sanitizeLogValue(value) {
    if (typeof value !== "string") return value;
    return value.replace(/[\x00-\x1F\x7F]/g, " ");
  }

  function createLogEntry(...args) {
    return [
      clfdate(),
      sanitizeLogValue(requestId),
      ...args.map(sanitizeLogValue)
    ].join(" ");
  }

  // Initial request logging. Written immediately (not buffered below) so a
  // request that hangs or never finishes still leaves a trace of having
  // started.
  try {
    console.log(createLogEntry(formatRequestUrl(), req.method));
  } catch (err) {
    console.error("Error logging request:", err);
  }

  // req.log is called many times per request by handlers along the way
  // (see app/blog/*) to trace where time goes. Each call used to be its
  // own console.log, i.e. its own blocking write() syscall - on a request
  // with 20+ trace points that's 20+ syscalls instead of one, and because
  // console.log to a file/pipe is synchronous on Node, those writes block
  // the event loop and queue up behind each other under concurrent load.
  // Buffering the trace lines in memory and flushing them as a single
  // write when the request ends keeps the same log output shape and
  // timing values while cutting the number of writes per request to two
  // (this start line, and one flush at the end).
  const traceLines = [];
  let lastLogTime = Date.now();
  req.log = function (...args) {
    const now = Date.now();
    const timeDiff = now - lastLogTime;
    lastLogTime = now;

    traceLines.push(createLogEntry(`+${timeDiff}ms`, ...args));
  };

  function flushTraceLines(summaryLine) {
    traceLines.push(summaryLine);
    try {
      console.log(traceLines.join("\n"));
    } catch (err) {
      console.error("Error logging request:", err);
    }
  }

  // Response logging
  let hasFinished = false;

  res.on("finish", () => {
    hasFinished = true;
    const duration = ((Date.now() - requestStart) / 1000).toFixed(3);
    flushTraceLines(
      createLogEntry(res.statusCode, duration, formatRequestUrl())
    );
  });

  // this can fire unexpectedly for POST requests with bodies
  // https://github.com/expressjs/express/issues/6334
  req.on("close", () => {
    if (hasFinished) return;
    flushTraceLines(
      createLogEntry("Connection closed by client", formatRequestUrl())
    );
  });

  next();
};