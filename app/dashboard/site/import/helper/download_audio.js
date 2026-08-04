var cheerio = require("cheerio");
var basename = require("path").basename;
var parse = require("url").parse;
var download = require("download");
var each_el = require("./each_el");
var fs = require("fs-extra");

module.exports = function download_pdfs(post, callback) {
  var $ = cheerio.load(post.html, { decodeEntities: false });

  each_el(
    $,
    "audio",
    function (el, next) {
      var href = $(el).attr("src");
      var name;

      try {
        name = nameFrom(href);
      } catch (e) {
        return next();
      }

      if (name.charAt(0) !== "_") name = "_" + name;

      download(href)
        .then(function (data) {
          fs.outputFile(post.path + "/" + name, data, function (err) {
            if (err) return next();

            $(el).attr("src", name);

            next();
          });
        })
        .catch(function (err) {
          console.log("Audio error:", href, err.name, err.statusCode);
          next();
        });
    },
    function () {
      post.html = $.html();
      callback(null, post);
    }
  );
};

function nameFrom(src) {
  return "_" + basename(parse(src).pathname);
}
