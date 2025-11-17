const fs = require("fs-extra");
const prettyNumber = require("helper/prettyNumber");
const prettySize = require("helper/prettySize");
const { blot_directory } = require("config");

const stats_directory = blot_directory + "/data/stats";

// stats are stored in JSON arrays in files with the format '2023-11-29-20.json'
// where 20 is the hour of the day in UTC. we want to read all the files for the
// last 24 hours and average some of the values, and sum others.
// each file contains an array of 60 objects with the following properties,
// representing a minute of data:
// "date":1701237480000,
// "cpu":39.25,
// "memory":40.735,
// "slowestRequests":[],
// "slowestResponseTime":5.325,
// "medianResponseTime":0.029,
// "meanResponseTime":0.2983464566929135,
// "requests":254,
// "percent4XX":1.968503937007874,
// "percent5XX":0.7874015748031495

const stats_subdirectories = fs.existsSync(stats_directory)
  ? fs.readdirSync(stats_directory)
  : [];

const properties_to_apply_prettyNumber = ["requests"];
const properties_to_round_integer = ["connected_clients"];
const properties_to_round_three_decimal_places = [
  "medianResponseTime",
  "meanResponseTime"
];

const properties_to_apply_makePercentage = [
  "memory",
  "cpu",
  "cpu_load",
  "percent4XX",
  "percent5XX"
];
const properties_to_apply_prettySize = [
  "bytesSent",
  "bytesReceived",
  "root_disk_used",
  "root_disk_free",
  "backup_disk_free",
  "backup_disk_used",
  "system_memory",
  "used_memory"
];

const properties_to_sum = ["requests", "bytesSent", "bytesReceived"];

const properties_to_average = [
  "medianResponseTime",
  "meanResponseTime",
  "memory",
  "cpu",
  "percent4XX",
  "percent5XX",

  // redis
  "connected_clients",
  "cpu_load"
];

const properties_to_return_most_recent = [
  "root_disk_used",
  "root_disk_free",
  "backup_disk_free",
  "backup_disk_used",
  "system_memory",
  "used_memory"
];

function main (callback) {
  const response = {};

  for (let x = 0; x < stats_subdirectories.length; x++) {
    const subdirectory = stats_subdirectories[x];
    const aggregate = (response[subdirectory] = {});
    const files = fs
      .readdirSync(stats_directory + "/" + subdirectory)
      .filter(file => file.endsWith(".json"))
      .sort()
      .slice(-24)
      .reverse();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const stats = JSON.parse(
        fs.readFileSync(
          stats_directory + "/" + subdirectory + "/" + file,
          "utf8"
        )
      ).reverse();

      for (let j = 0; j < stats.length; j++) {
        const stat = stats[j];

        for (let k = 0; k < properties_to_sum.length; k++) {
          const property = properties_to_sum[k];
          if (stat[property] === undefined) continue;

          if (!aggregate[property]) aggregate[property] = 0;
          aggregate[property] += stat[property];
        }

        for (let k = 0; k < properties_to_average.length; k++) {
          const property = properties_to_average[k];
          if (stat[property] === undefined) continue;

          if (!aggregate[property]) aggregate[property] = [];
          aggregate[property].push(stat[property]);
        }

        for (let k = 0; k < properties_to_return_most_recent.length; k++) {
          const property = properties_to_return_most_recent[k];
          if (stat[property] === undefined) continue;
          if (aggregate[property] === undefined)
            aggregate[property] = stat[property];
        }
      }
    }

    // average the properties that need to be averaged
    for (let i = 0; i < properties_to_average.length; i++) {
      const property = properties_to_average[i];
      if (!aggregate[property]) continue;
      const average =
        aggregate[property].reduce((a, b) => a + b) /
        aggregate[property].length;

      aggregate[property] = average;
    }

    // apply the formatting for the properties that need it
    for (let i = 0; i < properties_to_apply_prettyNumber.length; i++) {
      const property = properties_to_apply_prettyNumber[i];
      if (aggregate[property] === undefined) continue;
      aggregate[property] = prettyNumber(aggregate[property]);
    }

    for (let i = 0; i < properties_to_apply_makePercentage.length; i++) {
      const property = properties_to_apply_makePercentage[i];
      if (aggregate[property] === undefined) continue;
      aggregate[property] = aggregate[property].toFixed(2) + "%";
    }

    for (let i = 0; i < properties_to_round_integer.length; i++) {
      const property = properties_to_round_integer[i];
      if (aggregate[property] === undefined) continue;
      aggregate[property] = Math.round(aggregate[property]);
    }

    for (let i = 0; i < properties_to_round_three_decimal_places.length; i++) {
      const property = properties_to_round_three_decimal_places[i];
      if (aggregate[property] === undefined) continue;
      aggregate[property] = aggregate[property].toFixed(3);
    }

    for (let i = 0; i < properties_to_apply_prettySize.length; i++) {
      const property = properties_to_apply_prettySize[i];
      if (aggregate[property] === undefined) continue;

      // convert to KB
      if (
        property === "bytesSent" ||
        property === "bytesReceived" ||
        property === "used_memory" ||
        property === "system_memory"
      ) {
        aggregate[property] *= 1 / 1024;
      }

      aggregate[property] = prettySize(aggregate[property]);
    }
  }

  return callback(null, response);
}

module.exports = main;

if (require.main === module) require("./cli")(main);
