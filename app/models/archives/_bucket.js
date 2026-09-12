var moment = require("moment");
require("moment-timezone");

// "YYYY-MM" bucket an entry with this dateStamp belongs to, in the blog's timezone.
function yearMonth(dateStamp, timeZone) {
  return moment.utc(dateStamp).tz(timeZone).format("YYYY-MM");
}

// Numeric sort key for a "YYYY-MM" string, e.g. "2024-03" -> 202403.
function score(yearMonthString) {
  return parseInt(yearMonthString.replace("-", ""), 10);
}

// Same rule app/models/entry/_assign.js uses to decide whether an entry
// belongs in the "entries" list - archives should show exactly those posts.
function visible(entry) {
  return !(
    entry.menu ||
    entry.scheduled ||
    entry.page ||
    entry.deleted ||
    entry.draft
  );
}

module.exports = {
  yearMonth: yearMonth,
  score: score,
  visible: visible,
};
