var fs = require("fs-extra");
var cheerio = require("cheerio");

module.exports = function (path_to_source_file, callback) {
  fs.readFile(path_to_source_file, "utf-8", function (err, source_xml) {
    if (err) return callback(err);

    var $ = cheerio.load(source_xml, {
      // This prevent cheerio from replacing characters
      // it really ought to preserve.
      decodeEntities: false,

      // Enabling XML mode has confusing effects
      // 1. It makes it hard to read certain non-standard
      //    tags that the evernote file contains, like <en-note>
      // 2. It allows us to read the contents of the <note> tags
      //    without manually removing the CDATA tags. So be
      //    careful if you remove this.
      xmlMode: true,
    });

    callback(null, $);
  });
};
