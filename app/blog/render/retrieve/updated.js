const moment = require("moment");
require("moment-timezone");

module.exports = function (req, res, callback) {
  return callback(null, function () {
    const d = moment.utc(req.blog.cacheID).tz(req.blog.timeZone);

    // Section: {{#date}} YYYY {{/date}}
    var renderDate = function () {
      let [text, render] = arguments; // text = block contents

      try {
        text = text.trim();
        text = render(text);
        text = d.format(text);
      } catch (e) {
        text = "";
      }

      return text;
    };

    // Interpolation: {{date}}
    renderDate.toString = function () {
      let text = "";
      try {
        text = d.format(res.locals.date_display || "MMMM D, Y");
      } catch (e) {
        text = "";
      }
      return text;
    };

    return renderDate;
  });
};
