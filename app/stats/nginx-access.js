const moment = require("moment");
const URL = require("url");
const fs = require("fs-extra");
const lineReader = require("helper/lineReader");
const STATS_DIRECTORY = require("./statsDirectory") + "/nginx";
const MAX_RECOMPUTED = 2; // hours

let reComputed = 0;

function main (logFile) {
  const logFileName = logFile.split("/").slice(-1)[0];

  return new Promise(resolve => {
    const handleLine = aggregator({ logFileName });
    lineReader.eachLine(logFile, handleLine).then(() => {
      if (reComputed >= MAX_RECOMPUTED) {
        resolve({ reComputed: true });
      } else {
        resolve({ reComputed: false });
      }
    });
  });
}

function aggregator ({ logFileName }) {
  let currentMinute;
  let currentMinuteData = [];

  let currentHour;
  let currentHourData = [];

  return function (line, last) {
    try {
      // Handle a regular access log line
      // which look like:
      // [31/Aug/2023:19:28:35 +0100] 45ab1ff645eb1cf89b09c65d95885c8a 200 0.162 788:2249003 https://blot.development/dashboard/stats/stats.json  cache=proxied-because-dashboard
      const {
        date,
        responseTime,
        status,
        url,
        host,
        requestID,
        requestBytes,
        responseBytes,
        cache
      } = parse(line);

      if (!currentMinute) currentMinute = date.format("YYYY-MM-DD-HH-mm");

      if (!currentHour) currentHour = date.format("YYYY-MM-DD-HH");

      if (date.format("YYYY-MM-DD-HH-mm") !== currentMinute) {
        currentMinute = date.format("YYYY-MM-DD-HH-mm");
        // we now need to calculate the averages for the previous minute

        const requestsByHost = currentMinuteData.reduce((acc, { host }) => {
          if (!acc[host]) acc[host] = 0;
          acc[host] += 1;
          return acc;
        }, {});

        const requestsByURL = currentMinuteData.reduce((acc, { url }) => {
          if (!acc[url]) acc[url] = 0;
          acc[url] += 1;
          return acc;
        }, {});

        // we calculate the median response time by sorting the response times
        // and then taking the middle value
        const medianResponseTime = currentMinuteData
          .slice()
          .sort((a, b) => a.responseTime - b.responseTime)[
          Math.floor(currentMinuteData.length / 2)
        ].responseTime;

        const slowestResponseTime = currentMinuteData
          .slice()
          .sort((a, b) => b.responseTime - a.responseTime)[0].responseTime;

        currentHourData.push({
          date: moment(currentMinute, "YYYY-MM-DD-HH-mm").valueOf(),

          slowestRequests: currentMinuteData
            .slice()
            .sort((a, b) => b.responseTime - a.responseTime)
            .slice(0, 10)
            .map(({ responseTime, url, requestID }) => ({
              responseTime,
              url,
              requestID
            })),

          slowestResponseTime,
          medianResponseTime,
          meanResponseTime:
            currentMinuteData.reduce((acc, { responseTime }) => {
              return acc + responseTime;
            }, 0) / currentMinuteData.length,

          bytesSent: currentMinuteData.reduce((acc, { responseBytes }) => {
            return acc + responseBytes;
          }, 0),

          bytesReceived: currentMinuteData.reduce((acc, { requestBytes }) => {
            return acc + requestBytes;
          }, 0),

          byCache: currentMinuteData.reduce((acc, { cache }) => {
            if (!acc[cache]) acc[cache] = 0;
            acc[cache] += 1;
            return acc;
          }, {}),

          requests: currentMinuteData.length,

          popularHosts: Object.keys(requestsByHost)
            .sort((a, b) => requestsByHost[b] - requestsByHost[a])
            .slice(0, 10)
            .map(host => ({ host, count: requestsByHost[host] })),

          popularURLs: Object.keys(requestsByURL)
            .sort((a, b) => requestsByURL[b] - requestsByURL[a])
            .slice(0, 10)
            .map(url => ({ url, count: requestsByURL[url] })),

          percent4XX:
            (currentMinuteData.reduce((acc, { status }) => {
              if (status >= 400 && status < 500) return acc + 1;
              return acc;
            }, 0) /
              currentMinuteData.length) *
            100,

          percent5XX:
            (currentMinuteData.reduce((acc, { status }) => {
              if (status >= 500 && status < 600) return acc + 1;
              return acc;
            }, 0) /
              currentMinuteData.length) *
            100
        });

        currentMinuteData = [];

        console.log(logFileName, ": computed minute ", currentMinute);

        if (currentHour !== date.format("YYYY-MM-DD-HH")) {
          if (fs.existsSync(STATS_DIRECTORY + "/" + currentHour + ".json"))
            reComputed++;

          fs.outputJSONSync(
            STATS_DIRECTORY + "/" + currentHour + ".json",
            currentHourData
          );
          console.log(logFileName, ": wrote computed hour ", currentHour);

          if (reComputed >= MAX_RECOMPUTED) {
            return false;
          }

          currentHour = date.format("YYYY-MM-DD-HH");
          currentHourData = [];
        }
      } else {
        currentMinuteData.push({
          date,
          responseTime,
          status,
          url,
          host,
          requestID,
          requestBytes,
          responseBytes,
          cache
        });
      }

      if (last) {
        // write the last hour
        fs.outputJSONSync(
          STATS_DIRECTORY + "/" + currentHour + ".json",
          currentHourData
        );
      }
    } catch (e) {}

    return true;
  };
}

module.exports = main;

// parses log line in format:
// [31/Aug/2023:19:28:35 +0100] 45ab1ff645eb1cf89b09c65d95885c8a 200 0.162 788:2249003 https://blot.development/dashboard/stats/stats.json  cache=proxied-because-dashboard
// and returns an object with the following properties:
// date, requestID, responseTime, status, url, host, cache, requestBytes, responseBytes

function parse (line) {
  if (!line) throw new Error("Empty line");

  if (line.indexOf("[error]") > -1) throw new Error("Error line");

  if (line.indexOf("[warn]") > -1) throw new Error("Warn line");

  if (line[0] !== "[") throw new Error("Invalid line");

  var date = moment(line.slice(1, line.indexOf("]")), "DD/MMM/YYYY:HH:mm:ss Z");

  if (!date.isValid()) throw new Error("Invalid date");

  var components = line.slice(line.indexOf("]") + 2).split(" ");

  var requestID = components[0];

  var status = parseFloat(components[1]);

  if (isNaN(status)) throw new Error("Invalid status");

  var responseTime = parseFloat(components[2]);

  if (isNaN(responseTime)) throw new Error("Invalid response time");

  var requestBytes = parseFloat(components[3].split(":")[0]);
  var responseBytes = parseFloat(components[3].split(":")[1]);

  if (isNaN(requestBytes)) throw new Error("Invalid request bytes");
  if (isNaN(responseBytes)) throw new Error("Invalid response bytes");

  var url = components[4];

  var host = URL.parse(components[4]).hostname;

  var cache = components[5].slice("cache=".length);

  return {
    date,
    requestID,
    responseTime,
    status,
    url,
    host,
    cache,
    requestBytes,
    responseBytes
  };
}
