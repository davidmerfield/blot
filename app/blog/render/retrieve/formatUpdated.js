var Entries = require("models/entries");
var FormatDate = require("../load/formatDate");

module.exports = function (req, callback) {
  Entries.lastUpdate(req.blog.id, function (err, dateStamp) {
    var timestamp = (new Date(dateStamp)).getTime();
    return callback(null, FormatDate(timestamp, req.blog.timeZone));
  });
};


