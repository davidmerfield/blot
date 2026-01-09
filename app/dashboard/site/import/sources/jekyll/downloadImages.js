var Markdown = require("markdown-it");
var cheerio = require("cheerio");
var async = require("async");
var download = require("download");
var fs = require("fs-extra");

module.exports = function (result, callback) {
  var markdown = new Markdown({ html: true });
  var $ = cheerio.load(markdown.render(result.content));

  var srcs = [];

  // find anything with HREF/SRC, download it, store it in assetDirectory
  $("img[src]").each(function () {
    srcs.push($(this).attr("src"));
  });

  var errors = [];

  async.eachSeries(
    srcs,
    function (src, next) {
      // console.log('Downloading image', src);

      fs.ensureDirSync(result.assetDirectory);

      var filename = "_" + require("path").basename(src);

      download(src, result.assetDirectory, { filename: filename })
        .then(function () {
          // replace reference to HREF and SRC with new relative path
          // set result.assets to 'true' so we know which path to use

          result.assets = true;
          result.content = result.content.split(src).join(filename);

          // console.log('Done!', fs.readdirSync(result.assetDirectory));
          next();
        })
        .catch(function (err) {
          result.warnings.push("Could not download:" + src + err.code);

          next();
        });
    },
    function () {
      callback(null, result);
    }
  );
};
