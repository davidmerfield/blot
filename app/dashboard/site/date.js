const express = require("express");
const date = express.Router();
const { resave: resaveEntries } = require("models/entries");
const updateBlog = require("dashboard/util/update-blog");
const moment = require("moment-timezone");

// Formats and their aliases
const formats = ["D/M/YYYY", "M/D/YYYY", "YYYY/M/D"];
const alias = {
  "D/M/YYYY": "Day-Month-Year",
  "M/D/YYYY": "Month-Day-Year",
  "YYYY/M/D": "Year-Month-Day",
};

// Excluded time zones
const excludedZones = [
  "Pacific/Marquesas",
  "America/Caracas",
  "Asia/Kabul",
  "Asia/Pyongyang",
  "Australia/Eucla",
  "Pacific/Chatham",
  "US/Pacific-New",
  "Asia/Tehran",
  "Asia/Katmandu",
  "Asia/Kathmandu",
  "Etc/GMT-14",
  "Pacific/Apia",
  "Pacific/Kiritimati",
];

// Included time zones
const includedZones = ["UTC", "Pacific/Auckland"];

date.get("/", (req, res, next) => {
  const when = Date.now();

  // Filter and format time zones
  const zones = moment.tz.names().filter((zone) => {
    if (excludedZones.includes(zone)) return false;
    if (includedZones.includes(zone)) return true;
    if (
      zone.startsWith("Etc/") ||
      zone.startsWith("Pacific/") ||
      zone.includes("Antarctica")
    )
      return false;
    return /\//.test(zone);
  });

  const timeZones = zones.map((zone) => {
    const offset = moment.tz.zone(zone).utcOffset(when);
    return {
      time: moment.utc(when).tz(zone).format("h:mm a, MMMM Do"),
      value: zone,
      offset,
      selected: zone === req.blog.timeZone ? "selected" : "",
    };
  });

  // Sort time zones
  timeZones.sort(
    (a, b) => b.offset - a.offset || a.value.localeCompare(b.value)
  );

  res.locals.breadcrumbs.add("Settings", "settings");

  res.render("dashboard/site/settings/date", {
    timeZones,
    currentTime: moment.utc().tz(req.blog.timeZone).format("h:mma, MMMM D"),
    dateFormats: formats.map((format) => ({
      value: format,
      selected: format === req.blog.dateFormat ? "selected" : "",
      date: alias[format],
    })),
  });
});

date.post("/", async (req, res) => {
  const { timeZone, dateFormat } = req.body;

  try {
    const changes = await updateBlog(req.blog.id, { timeZone, dateFormat });

    if (
      changes &&
      (changes.includes("timeZone") || changes.includes("dateFormat"))
    ) {
      // Resave entries if timeZone or dateFormat has changed
      resaveEntries(req.blog.id, () => {});
    }

    res.message(req.baseUrl, "Saved changes to date and time");
  } catch (error) {
    res.message(req.baseUrl, error.message);
  }
});

module.exports = date;
