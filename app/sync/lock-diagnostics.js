const fs = require("fs");
const os = require("os");
const { promisify } = require("util");
const freeDiskSpace = require("../scheduler/free-disk-space");
const {
  getPendingSyncs,
  getPendingUpdates
} = require("./lock-diagnostics-state");

const freeDiskSpaceAsync = promisify(freeDiskSpace);
const DEFAULT_TIMEOUT_MS = 2000;

const serializeError = error => {
  if (!error) return null;

  return {
    message: error.message,
    code: error.code,
    stack: error.stack
  };
};

const runWithTimeout = (fn, timeoutMs) => {
  if (timeoutMs <= 0) {
    return Promise.resolve({ timedOut: true });
  }

  return Promise.race([
    (async () => {
      try {
        const value = await fn();
        return { value };
      } catch (error) {
        return { error: serializeError(error) };
      }
    })(),
    new Promise(resolve => {
      setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    })
  ]);
};

const addResult = (target, key, result) => {
  if (result.value !== undefined) {
    target[key] = result.value;
    return;
  }

  if (result.error) {
    target[`${key}Error`] = result.error;
    return;
  }

  if (result.timedOut) {
    target[`${key}Error`] = { timedOut: true };
  }
};

const gatherLockDiagnostics = async ({
  blogID,
  lockPath,
  lockAcquiredAt,
  syncContext,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) => {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const lockFilePath = lockPath ? `${lockPath}.lock` : undefined;
  const now = Date.now();

  const diagnostics = {
    blogID,
    lockPath,
    lockFilePath,
    now,
    pendingSyncs: getPendingSyncs(),
    pendingUpdates: getPendingUpdates(),
    lockDurationMs:
      typeof lockAcquiredAt === "number" ? now - lockAcquiredAt : null,
    processUptimeSec: (() => {
      try {
        return process.uptime();
      } catch (error) {
        return null;
      }
    })()
  };

  if (syncContext) {
    diagnostics.syncContext = syncContext;
  }

  const timeLeft = () => Math.max(0, deadline - Date.now());

  addResult(
    diagnostics,
    "process",
    await runWithTimeout(
      () => ({
        pid: process.pid,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage ? process.cpuUsage() : null
      }),
      timeLeft()
    )
  );

  addResult(
    diagnostics,
    "load",
    await runWithTimeout(
      () => ({
        loadavg: os.loadavg(),
        cpuCount: os.cpus().length
      }),
      timeLeft()
    )
  );

  addResult(
    diagnostics,
    "diskSpace",
    await runWithTimeout(() => freeDiskSpaceAsync(), timeLeft())
  );

  if (lockFilePath) {
    addResult(
      diagnostics,
      "lockFileStat",
      await runWithTimeout(async () => {
        const stat = await fs.promises.stat(lockFilePath);
        return {
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          mode: stat.mode
        };
      }, timeLeft())
    );
  }

  if (lockPath) {
    addResult(
      diagnostics,
      "lockPathStat",
      await runWithTimeout(async () => {
        const stat = await fs.promises.stat(lockPath);
        return {
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          mode: stat.mode
        };
      }, timeLeft())
    );
  }

  if (Date.now() > deadline) {
    diagnostics.timedOut = true;
    diagnostics.timeoutMs = timeoutMs;
  }

  return diagnostics;
};

module.exports = gatherLockDiagnostics;
