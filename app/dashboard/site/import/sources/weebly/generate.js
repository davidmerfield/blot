var entries = require("./entries.json");
var cheerio = require("cheerio");
var fs = require("fs-extra");
var async = require("async");
var Turndown = require("turndown");
var turndown = new Turndown();
var domain = process.argv[2];
var output = __dirname + "/data";
async.eachSeries(
  entries,
  function (entry, next) {
    var $ = cheerio.load(entry.html);
    var urls = [];
    var outputFolder = output + "/" + entry.title;
    $("[src]").each(function () {
      var url = $(this).attr("src");
      if (url[0] === "/") url = domain + url;
      urls.push({
        url: url,
        node: this,
        name:
          "_" + require("path").basename(require("url").parse(url).pathname),
      });
    });
    async.eachSeries(
      urls,
      function (item, next) {
        var path = outputFolder + "/" + item.name;
        fs.ensureFileSync(path);
        fs.removeSync(path);
        download(item.url, path, function (err) {
          if (err) {
            console.log("Error downloading", item.url, err);
            return next();
          }
          $(item.node).attr("src", item.name);
          next();
        });
      },
      function (err) {
        if (err) return next(err);
        entry.html = $.html();
        entry.content = turndown.turndown(entry.html).trim();
        entry.content =
          "Date: " +
          entry.date +
          "\n\n# " +
          entry.title +
          "\n\n" +
          entry.content;
        fs.outputFileSync(outputFolder + "/post.txt", entry.content);
        console.log("Wrote:", outputFolder + "/post.txt");
        next();
      }
    );
  },
  function (err) {
    if (err) throw err;
    console.log("Done!");
    process.exit();
  }
);

function download(uri, filename, callback) {
  console.log("Downloading", uri, "to", filename);
  require("child_process").exec(
    'curl -L -o "' + filename + '" "' + uri + '"',
    callback
  );
}
