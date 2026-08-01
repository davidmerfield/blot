var Markdown = require("markdown-it");
var cheerio = require("cheerio");
var async = require("async");
var download = require("download");
var fs = require("fs-extra");

module.exports = function (result, callback) {
  var markdown = new Markdown({ html: true });

  result.content = result.content.split("{{ site.url }}").join("");
  result.content = result.content.split("{{ site.baseurl }}").join("");

  var m;
  var regex = /\{% link (.*) %\}/gm;
  var replace = [];
  while ((m = regex.exec(result.content)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
      regex.lastIndex++;
    }

    // The result can be accessed through the `m`-variable.
    replace.push([m[0], m[1]]);
  }

  replace.forEach(function (change) {
    result.content = result.content.split(change[0]).join(change[1]);
  });

  var $ = cheerio.load(markdown.render(result.content));

  var srcs = [];
  var errors = [];

  // find anything with HREF/SRC, download it, store it in assetDirectory
  $("[src]").each(function () {
    var src = $(this).attr("src");
    var newName = "_" + require("path").basename(src);

    if (src.indexOf("/assets") !== 0) return;

    try {
      fs.copySync(
        result.sourceDirectory + src,
        result.assetDirectory + "/" + newName
      );
    } catch (e) {
      console.log(e);
      return;
    }

    result.assets = true;
    result.content = result.content.split(src).join(newName);
  });

  callback(null, result);
};
