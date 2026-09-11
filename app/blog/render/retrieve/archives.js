var Entries = require("models/entries");
var arrayify = require("helper/arrayify");
var projectEntryFields = require("./helpers/projectEntryFields");
var entryFieldList = require("./helpers/entryFieldList");
var withEntryFields = require("./helpers/withEntryFields");

module.exports = function (req, res, callback) {
  var fields = entryFieldList(req.retrieve, ["archives"]);

  var build = function (allEntries) {
    // dateStamp is always kept, so the year/month grouping below is unaffected.
    projectEntryFields(allEntries, req.retrieve, ["archives"]);

    // One formatter reused across every entry - Intl.DateTimeFormat's per-call
    // cost is dominated by construction, so this is far cheaper than moment's
    // per-call parse + timezone lookup, and drops the moment/moment-timezone
    // dependency for this path entirely.
    var formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: req.blog.timeZone,
      year: "numeric",
      month: "long"
    });

    var years = {};

    for (var x in allEntries) {
      var entry = allEntries[x];

      var parts = formatter.formatToParts(entry.dateStamp);
      var year, month;
      for (var p = 0; p < parts.length; p++) {
        if (parts[p].type === "year") year = parts[p].value;
        else if (parts[p].type === "month") month = parts[p].value;
      }

      // Init an empty data structure
      years[year] = years[year] || {
        year: year,
        total: 0,
        months: {}
      };

      years[year].months[month] = years[year].months[month] || {
        month: month,
        entries: []
      };

      years[year].months[month].entries.push(entry);
      years[year].total++;
    }

    for (var i in years) {
      for (var j in years[i].months)
        years[i].months[j].s = years[i].months[j].entries.length > 1 ? "s" : "";

      years[i].months = arrayify(years[i].months);
      years[i].s = years[i].total > 1 ? "s" : "";
    }

    years = arrayify(years).sort(function (a, b) {
      return parseInt(b.year) - parseInt(a.year);
    });

    return callback(null, years);
  };

  if (!fields) return Entries.getAll(req.blog.id, build);

  withEntryFields(
    function (cb) {
      Entries.getAll(req.blog.id, { fields: fields }, cb);
    },
    function (cb) {
      Entries.getAll(req.blog.id, cb);
    },
    build
  );
};
