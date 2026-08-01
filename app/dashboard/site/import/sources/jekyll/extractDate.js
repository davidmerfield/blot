var moment = require("moment");

module.exports = function (result, callback) {
  var year = parseInt(result.name.split("-")[0]);
  var month = parseInt(result.name.split("-")[1]) - 1; // month is zero-based!
  var date = parseInt(result.name.split("-")[2]);

  var published = moment([year, month, date]);

  result.date = published;

  callback(null, result);
};
