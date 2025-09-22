const { iCloudDriveDirectory } = require("./config");
const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");

async function sync(dirPath) {
    console.log(`MONITORER: Syncing path: ${dirPath}`);
    
    try {
        // Use spawn instead of exec - more efficient for larger outputs
        // Use -1 to force one file per line, making parsing simpler
        const ls = spawn('ls', ['-la1', dirPath]);
        
        let dirs = [];
        
        // Process output as it comes in, line by line
        for await (const chunk of ls.stdout) {
            const lines = chunk.toString().split('\n');
            
            for (const line of lines) {
                if (line && 
                    line.startsWith('d') && 
                    !line.endsWith(' .') && 
                    !line.endsWith(' ..')) {
                    
                    // Extract directory name more efficiently
                    const name = line.substring(line.lastIndexOf(' ') + 1);
                    console.log(`Found subdirectory: ${name}`);
                    dirs.push(path.join(dirPath, name));
                } else {
                    console.log(`Ignoring line: ${line}`);
                }
            }
        }

        // Process directories sequentially instead of parallel
        // This prevents too many open files and system overload
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