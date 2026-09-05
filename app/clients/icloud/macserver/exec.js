import { spawn } from "child_process";

// A promisified spawn function to execute commands with async/await.
// Designed to be slightly safer than using exec because I'm worried
// about shell injection attacks.
const exec = (command, args = [], options = {}) => {
  return new Promise((resolve, reject) => {
    const { timeout = 30000, ...spawnOptions } = options;
    const child = spawn(command, args, spawnOptions);

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timerId;

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

    const settle = (handler) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timerId) {
        clearTimeout(timerId);
      }
      handler();
    };

    timerId = setTimeout(() => {
      child.kill();
      settle(() =>
        reject(new Error(`Command timed out after ${timeout}ms`))
      );
    }, timeout);

    child.on("error", (error) => {
      settle(() => reject(error)); // If spawn fails, reject the promise
    });

    child.on("close", (code) => {
      settle(() => {
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

export default exec;
