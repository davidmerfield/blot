const async = require("async");
const fs = require("fs-extra");

module.exports = (output_directory, posts, options = {}) => {
  if (!options.preserve_output_directory) fs.emptyDirSync(output_directory);

  const determinePath = require("./determine_path")(output_directory);
  const write = require("./write").createWriter();

  async.eachSeries(
    posts,
    (post, next) => {
      async.waterfall(
        [
          // gets the waterfall flowing...
          (callback) => callback(null, post),
          determinePath,
          require("./download_audio"),
          require("./download_pdfs"),
          require("./download_images"),
          require("./convert_to_markdown"),
          require("./insert_metadata"),
          write,
        ],
        next
      );
    },
    (err) => {
      if (err) throw err;
      console.log("Done!");
      process.exit();
    }
  );
};
