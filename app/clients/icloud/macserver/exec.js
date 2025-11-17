const { spawn } = require("child_process");

// A promisified spawn function to execute commands with async/await.
// Designed to be slightly safer than using exec because I'm worried
// about shell injection attacks.
const exec = (command, args = [], options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);

    let stdout = "";
    let stderr = "";

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
      reject(error); // If spawn fails, reject the promise
    });

    child.on("close", (code) => {
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
};

module.exports = exec;