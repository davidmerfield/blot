var moment = require("moment");
require("moment-timezone");

module.exports = function FormatDate(dateStamp, zone) {
  return function () {
    return function (text, render) {
      try {
        text = text.trim();
        text = moment.utc(dateStamp).tz(zone).format(text);
      } catch (e) {
        text = "";
      }

      return render(text);
    };
  };
};
