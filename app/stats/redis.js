const moment = require("moment");
const fs = require("fs-extra");
const STATS_DIRECTORY = require("./statsDirectory") + "/redis";
const client = require("models/client");

async function main () {
  console.log("computing redis stats");
  const stats = await getAllStats();

  let hour;
  let hourData = [];
  let hourPath;

  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i];
    const date = moment(stat.timestamp * 1000);
    const minute = date.format("YYYY-MM-DD-HH-mm");
    const minuteData = {
      backup_disk_free: parseInt(stat.backup_disk_free),
      backup_disk_used: parseInt(stat.backup_disk_used),
      connected_clients: parseInt(stat.connected_clients),
      cpu_load: parseFloat(stat.cpu_load.slice(0, -1)),
      peak_memory: parseInt(stat.peak_memory),
      root_disk_free: parseInt(stat.root_disk_free),
      root_disk_used: parseInt(stat.root_disk_used),
      system_memory: parseInt(stat.system_memory),
      used_memory: parseInt(stat.used_memory),
      date: moment(minute, "YYYY-MM-DD-HH-mm").valueOf()
    };

    // initialize the current minute and hour
    if (!hour) {
      hour = date.format("YYYY-MM-DD-HH");
      hourPath = STATS_DIRECTORY + "/" + hour + ".json";
    }

    hourData.push(minuteData);

    // we are in a new hour or at the end of the stats
    if (hour !== date.format("YYYY-MM-DD-HH") || i === stats.length - 1) {
      // write the last hour if and only if we have gathered more minutes than those already written
      const existingHourLength =
        ((await fs.exists(hourPath)) && (await fs.readJSON(hourPath)).length) ||
        0;

      console.log(
        "existingHourLength",
        existingHourLength,
        "hourData.length",
        hourData.length
      );

      if (hourData.length > existingHourLength) {
        console.log("writing hour", hourPath);
        await fs.outputJSON(hourPath, hourData);
      }

      hour = date.format("YYYY-MM-DD-HH");
      hourPath = STATS_DIRECTORY + "/" + hour + ".json";
      hourData = [];
    }
  }
  console.log("done computing redis stats");
}

async function getAllStats () {
  return new Promise((resolve, reject) => {
    const key = "blot:stats";
    client.lrange(key, 0, -1, (err, data) => {
      if (err) reject(err);
      resolve(
        data
          .map(JSON.parse)
          .sort((a, b) => {
            if (a.timestamp < b.timestamp) return -1;
            if (a.timestamp > b.timestamp) return 1;
            return 0;
          })
          .reverse()
      );
    });
  });
}

if (require.main === module) {
  main()
    .catch(console.log)
    .then(() => process.exit());
}

module.exports = main;
