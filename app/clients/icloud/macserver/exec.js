const { spawn } = require("child_process");

// A promisified spawn function to execute commands with async/await.
// Designed to be slightly safer than using exec because I'm worried
// about shell injection attacks.
const exec = (command, args = [], options = {}) => {
  return new Promise((resolve, reject) => {
    const { timeout, ...spawnOptions } = options;
    const child = spawn(command, args, spawnOptions);

    let stdout = "";
    let stderr = "";
    let finished = false;
    let timeoutId = null;

    const finalize = (fn) => {
      if (finished) {
        return;
      }
      finished = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      fn();
    };

    if (typeof timeout === "number" && timeout > 0) {
      timeoutId = setTimeout(() => {
        if (finished) {
          return;
        }
        child.kill("SIGTERM");
        finalize(() => {
          reject(new Error(`Command timed out after ${timeout}ms`));
        });
      }, timeout);
    }

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
    }

    child.on("error", (error) => {
      finalize(() => {
        reject(error); // If spawn fails, reject the promise
      });
    });

    child.on("close", (code) => {
      finalize(() => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(
            new Error(
              `Command failed with exit code ${code}\nStderr: ${stderr.trim()}`
            )
          );
        }
      });
    });
  });
};

module.exports = exec;
