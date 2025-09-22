const { iCloudDriveDirectory } = require("./config");
const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");

async function sync(dirPath) {
    console.log(`MONITORER: Syncing path: ${dirPath}`);
    
    try {
        const ls = spawn('ls', ['-la', dirPath]);
        
        let dirs = [];
        let buffer = '';
        
        // Process output as it comes in
        for await (const chunk of ls.stdout) {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                // Match lines starting with 'd' and capture the last segment (name)
                // This regex matches the standard ls -la format
                const match = line.match(/^d.{9}\s+\d+\s+\w+\s+\w+\s+\d+\s+[A-Za-z]+\s+\d+\s+[\d:]+\s+(.+)$/);
                if (match && match[1] !== '.' && match[1] !== '..') {
                    dirs.push(path.join(dirPath, match[1]));
                }
            }
        }

        // Process any remaining line in buffer
        if (buffer) {
            const match = buffer.match(/^d.{9}\s+\d+\s+\w+\s+\w+\s+\d+\s+[A-Za-z]+\s+\d+\s+[\d:]+\s+(.+)$/);
            if (match && match[1] !== '.' && match[1] !== '..') {
                dirs.push(path.join(dirPath, match[1]));
            }
        }

        // Process directories sequentially
        for (const subdir of dirs) {
            await sync(subdir);
        }

    } catch (error) {
        console.error(`Error processing directory ${dirPath}:`, error);
    }
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
        sync(`${iCloudDriveDirectory}/${blogId}`);
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