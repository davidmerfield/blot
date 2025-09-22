const { iCloudDriveDirectory } = require("./config");
const { spawn } = require("child_process");
const readline = require("readline");

function sync(blogId) {
    console.log(`MONITORER: Syncing blog ID: ${blogId}`);
  // No-op for now
}

module.exports = () => {

  let isStopped = false;
  let monitorProcess = null;

  function startMonitor() {
    if (isStopped) return;
    monitorProcess = spawn("brctl", ["monitor", iCloudDriveDirectory]);

    const rl = readline.createInterface({
      input: monitorProcess.stdout,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      const match = line.match(/blog_[a-fA-F0-9]+/);
      if (match) {
        const blogId = match[0];
        console.log("Detected blog ID:", blogId);
        sync(blogId);
      }
    });

    monitorProcess.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`);
    });

    monitorProcess.on("close", (code) => {
      rl.close();
      if (isStopped) return;
      console.warn(`brctl monitor exited with code ${code}, restarting in 1s...`);
      setTimeout(startMonitor, 1000); // Restart after 1 second
    });
  }

  startMonitor();

  // Optionally, provide a way to stop monitoring in future
  return {
    stop: () => {
      isStopped = true;
      if (monitorProcess) {
        monitorProcess.kill();
      }
    },
  };
};