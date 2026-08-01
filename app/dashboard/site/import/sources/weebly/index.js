var cheerio = require("cheerio");
var fs = require("fs-extra");
var async = require("async");

var archives = process.argv[2];
var domain = "https://" + require("url").parse(archives).hostname;

function curl(url, cb) {
  require("child_process").exec("curl -L " + url, cb);
}

var entries = [];

curl(archives, function (err, res) {
  if (err) throw err;

  var $ = cheerio.load(res);

  $("#wsite-content ul li a").each(function () {
    var source;

    if ($(this).attr("href")[0] === "/") {
      source = domain + $(this).attr("href");
    } else {
      source = $(this).attr("href");
    }

    entries.push({
      title: $(this).text(),
      source: source,
    });
  });

  console.log("Downloading " + entries.length + " entries");

  async.mapSeries(
    entries,
    function (entry, next) {
      console.log(".", entry.title, entry.source);
      curl(entry.source, function (err, res) {
        if (err) return next(err);

        var $ = cheerio.load(res);

        entry.html = $(".blog-post .blog-content").html().trim();

        entry.date = $(".blog-date .date-text").text().trim();

        return next(null, entry);
      });
    },
    function (err, entries) {
      if (err) throw err;

      fs.outputJson("entries.json", entries, function (err) {
        if (err) throw err;

        console.log("Done!");
        process.exit();
      });
    }
  );
});
