const fs = require("fs-extra");
const { log_directory } = require("config");

const redis_stats = require("./redis");

async function handle ({ logFileName, aggregator }) {
  // the most recent logfile is stored
  // in /var/instance-ssd/logs/app.log"
  // previous logfiles are stored in directories with the format
  // log_directory + "/archive-YYYY-MM-DD-ec2-user/app.log"
  // where YYYY-MM-DD is the date of the logfile
  // and ec2-user is the user that ran the blot process

  // we should first process the most recent logfile
  // then iterate over the archive directories in reverse chronological order

  const logFiles = [log_directory + "/" + logFileName].concat(
    fs
      .readdirSync(log_directory)
      .filter(file => file.indexOf("archive-") > -1)
      .sort()
      .reverse()
      .map(file => log_directory + "/" + file + "/" + logFileName)
      .filter(file => fs.existsSync(file))
  );

  for (let i = 0; i < logFiles.length; i++) {
    console.log(logFileName, logFiles[i], "computing...");
    const { reComputed } = await aggregator(logFiles[i]);
    if (reComputed) {
      console.log(
        logFileName,
        logFiles[i],
        "computed up to already-computed data"
      );
      break;
    } else {
      console.log(logFileName, logFiles[i], "computed");
    }
  }

  console.log(logFileName, "done");
}

async function main ({ reset = false }) {
  if (reset) {
    console.log("resetting stats");
    await fs.emptyDir();
    console.log("reset stats, now recomputing...");
  }

  await redis_stats();

  await Promise.all([
    handle({ logFileName: "app.log", aggregator: require("./node") }),
    handle({
      logFileName: "access.log",
      aggregator: require("./nginx-access")
    })
  ]);
}

module.exports = main;

if (require.main === module) {
  (async function () {
    await main({ reset: process.argv[2] === "--reset" });
    if (!process.argv[2]) {
      console.log("please specify --reset to reset stats");
    }
    console.log("done");
    process.exit();
  })();
}
