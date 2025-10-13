var Entries = require("entries");
var fs = require("fs-extra");
var get = require("../get/blog");
var moment = require("moment");
var localPath = require("helper/localPath");
var path = require("path");
var SUPPORTED_EXTENSIONS = [".txt", ".md"];
var FORMAT = "M/D/YY";
require("moment-timezone");
get(process.argv[2], function (err, user, blog) {
  var client = require("clients")[blog.client];
  Entries.each(
    blog.id,
    function (entry, next) {
      var contents, hasMetadata, dateMetadata;
      if (entry.deleted || entry.page || entry.metadata.date) return next();
      if (
        SUPPORTED_EXTENSIONS.indexOf(path.extname(entry.path).toLowerCase()) ===
        -1
      ) {
        console.log(entry.path, "Cannot add metadata to unsupported file type");
        return next();
      }
      console.log(entry.path, "reading");
      try {
        contents = fs.readFileSync(localPath(blog.id, entry.path), "utf8");
      } catch (e) {
        console.log(e);
        return next();
      }
      hasMetadata = Object.keys(entry.metadata).length > 0;
      dateMetadata =
        "Date: " + moment.utc(entry.dateStamp).tz(blog.timeZone).format(FORMAT);
      if (hasMetadata) {
        contents = dateMetadata + "\n" + ltrim(contents);
      } else {
        contents = dateMetadata + "\n\n" + ltrim(contents);
      }
      console.log(entry.path, "writing");
      client.write(blog.id, entry.path, contents, next);
    },
    function (err) {
      if (err) {
        console.log(err);
        process.exit(1);
      }
      console.log("Done!");
      process.exit();
    }
  );
});

function ltrim(str) {
  if (!str) return str;
  return str.replace(/^\s+/g, "");
}
