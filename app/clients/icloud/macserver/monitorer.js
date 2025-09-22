const { iCloudDriveDirectory } = require("./config");
const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const Bottleneck = require("bottleneck");

const MAX_DEPTH = 1000;

const limiter = new Bottleneck({
    maxConcurrent: 5,
    minTime: 100
});

const execCommand = async (command, args, dirPath) => {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args);
        let output = '';
        let errorOutput = '';

        proc.stdout.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        proc.on('error', (error) => {
            reject(new Error(`Failed to execute ${command}: ${error.message}`));
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`${command} failed with code ${code}: ${errorOutput}`));
            }
        });
    });
};

const syncLimited = limiter.wrap(async function sync(dirPath, depth = 0) {
    if (depth > MAX_DEPTH) {
        console.warn(`Maximum depth ${MAX_DEPTH} reached at ${dirPath}`);
        return;
    }

    console.log(`MONITORER: Syncing path: ${dirPath} (depth: ${depth})`);
    
    try {
        const lsOutput = await execCommand('ls', ['-la1F', dirPath], dirPath);
        
        const dirs = lsOutput.split('\n')
            .filter(line => line.endsWith('/'))           // Only dirs end with /
            .map(line => line.slice(0, -1))              // Remove trailing /
            .filter(name => name !== '.' && name !== '..') // Skip . and ..
            .map(name => path.join(dirPath, name));       // Full path

        await Promise.all(dirs.map(subdir => syncLimited(subdir, depth + 1)));

    } catch (error) {
        console.error(`Error processing directory ${dirPath} at depth ${depth}:`, error);
    }
});

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
                syncLimited(`${iCloudDriveDirectory}/${blogId}`, 0).catch(error => {
                    console.error(`Failed to sync ${blogId}:`, error);
                });
            }
        });

        monitorProcess.stderr.on("data", (data) => {
            console.error(`stderr: ${data}`);
        });

        monitorProcess.on("close", (code) => {
            rl.close();
            if (isStopped) return;
            console.warn(`brctl monitor exited with code ${code}, restarting in 1s...`);
            setTimeout(startMonitor, 1000);
        });
    }

    startMonitor();

    return {
        stop: async () => {
            isStopped = true;
            if (monitorProcess) {
                monitorProcess.kill();
            }
            await limiter.stop({
                dropWaitingJobs: true,
                shouldDrain: true
            });
        },
    };
};