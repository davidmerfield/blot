var cheerio = require("cheerio");

module.exports = function tidy(content, files, output_directory, callback) {
  content = content.trim();

  if (!content) return "";

  // We don't load this with xmlMode:true otherwise we can't read the
  // strange tag <en-note>'s contents
  var $ = cheerio.load(content, { decodeEntities: false });

  var new_html = $("en-note").html();

  if (!new_html) {
    return "";
  }

  return new_html;
};
