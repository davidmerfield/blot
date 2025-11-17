/**
 * systemd-notify
 * 
 * Usage:
 * const notify = require('helper/systemd-notify');

const opts = {
    ready: true,
    status: 'Ready to go',
    pid: 1337
};

await notify(opts);

 */

const { spawn } = require("child_process");

function generateArgs (opts) {
  const result = [];

  if ("ready" in opts && opts.ready === true) {
    result.push("--ready");
  }

  if ("pid" in opts) {
    result.push(`--pid=${opts.pid}`);
  } else if ("ready" in opts || "status" in opts) {
    /**
     * Always send PID to avoid possible race condition
     * https://www.pluralsight.com/tech-blog/using-systemd-notify-with-nodejs/
     */

    result.push(`--pid=${process.pid}`);
  }

  if ("status" in opts) {
    result.push(`--status=${opts.status}`);
  }

  if ("booted" in opts && opts.booted === true) {
    result.push("--booted");
  }

  return result;
}

module.exports = (opts = {}) =>
  new Promise((resolve, reject) => {
    // for now do nothing
    return resolve();

    // const args = generateArgs(opts);
    // const cmd = spawn("systemd-notify", args);

    // let stdout = "";
    // let stderr = "";

    // let hasCalledBack = false;

    // cmd.stdout.on("data", d => {
    //   stdout += d;
    // });
    // cmd.stderr.on("data", d => {
    //   stderr += d;
    // });

    // cmd.on("error", err => {
    //   if (hasCalledBack) {
    //     return null;
    //   }

    //   hasCalledBack = true;
    //   console.error(err);
    //   return resolve();
    // });

    // cmd.on("close", code => {
    //   if (hasCalledBack) {
    //     return null;
    //   }

    //   hasCalledBack = true;

    //   if (code !== 0) {
    //     const err = stderr.trim() || stdout.trim();
    //     console.error(err);
    //     return resolve();
    //   }

    //   return resolve(cmd);
    // });
  });
