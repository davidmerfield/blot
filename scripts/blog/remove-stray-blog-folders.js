var Blog = require("models/blog");
var fs = require("fs-extra");
var BLOGS_DIRECTORY = require("config").blog_folder_dir;
var STATIC_DIRECTORY = require("config").blog_static_files_dir;

var tmp = require("helper/tempDir")();
var async = require("async");
var getConfirmation = require("../util/getConfirmation");
var colors = require("colors/safe");

if (require.main === module)
  main(function (err) {
    if (err) throw err;
    process.exit();
  });

function main(callback) {
  Blog.getAllIDs(function (err, ids) {
    if (err) return callback(err);

    const blogs_directory_contents = fs.readdirSync(BLOGS_DIRECTORY);
    const static_directory_contents = fs.readdirSync(STATIC_DIRECTORY);

    const strayFolders = [];

    blogs_directory_contents.forEach((folder) => {
      if (folder.endsWith(".lock")) return;

      if (!ids.includes(folder))
        strayFolders.push({
          from: BLOGS_DIRECTORY + "/" + folder,
          to: tmp + folder,
        });
    });

    static_directory_contents.forEach((folder) => {
      if (folder.endsWith(".lock")) return;

      if (!ids.includes(folder))
        strayFolders.push({
          from: STATIC_DIRECTORY + "/" + folder,
          to: tmp + folder,
        });
    });

    console.log(
      `There are ${strayFolders.length} folders without a corresponding blog in the db`
    );

    console.log(strayFolders);

    async.eachSeries(
      strayFolders,
      function ({ from, to }, next) {
        getConfirmation(
          "Move?" + colors.dim("\nFrom: " + from + "\n. To: " + to),
          function (err, ok) {
            if (!ok) return next();
            console.log("Moving");
            fs.move(from, to, next);
          }
        );
      },
      callback
    );
  });
}
