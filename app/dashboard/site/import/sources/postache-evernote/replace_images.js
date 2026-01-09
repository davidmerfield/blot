var each_el = require("dashboard/importer/helper").each_el;
var fs = require("fs-extra");
var cheerio = require("cheerio");

module.exports = function (html, files, path_without_extension, callback) {
  var $ = cheerio.load(html, { decodeEntities: false });

  var has_images = false;

  // I have to look here because when it's CDATA, cheerio can't find this
  each_el(
    $,
    "en-media",
    function (el, next) {
      var contents = $(el).contents();
      var hash = $(el).attr("hash");
      var file = files[hash];

      if (!file) {
        console.log("NO FILE", hash);
        return callback(null, html, false);
      }

      // Can also access height and width attributes here, but they're huge
      // and not sure how useful that is... blot can work it out later.

      has_images = true;

      // Strange results using insertAfter, even though it's in the docs!
      // after seems to work though...
      $(el).after(contents);
      $(el).replaceWith($('<img src="' + file.name + '"></img>'));

      fs.copy(file.path, path_without_extension + "/" + file.name, function (
        err
      ) {
        if (err) return callback(err);

        next();
      });
    },
    function () {
      callback(null, $.html(), has_images);
    }
  );
};
