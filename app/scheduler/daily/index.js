var Email = require("helper/email");
var async = require("async");
var callOnce = require("helper/callOnce");

function main (callback) {
  var view = {};

  view.date = require("moment")().format("LL");

  function step () {
    return function (cb) {
      cb(null, {});
    };
  }

  async.mapSeries(
    [
      step(),
      step(),
      require("./revenue"),
      step(),
      require("./new-posts"),
      step(),
      require("./newsletter-subscribers"),
      step(),
      require("./new-customers"),
      step()
    ],
    function (fn, next) {
      fn(
        callOnce(function (err, res) {
          if (res) for (var i in res) view[i] = res[i];
          next();
        })
      );
    },
    function () {
      Email.DAILY_UPDATE("", view, callback);
    }
  );
}

if (require.main === module) require("./cli")(main);

module.exports = main;
