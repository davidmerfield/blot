var async = require("async");
var helper = require("dashboard/site/import/helper");
var extract_entry = require("./extract_entry");
var tidy = require("./tidy");

module.exports = function (item, output_directory, context, callback) {
  if (typeof context === "function") {
    callback = context;
    context = null;
  }
  // Filter out items which should not become posts or pages
  if (
    item["wp:post_type"][0] === "nav_menu_item" ||
    item["wp:post_type"][0] === "attachment" ||
    item["wp:post_type"][0] === "feedback"
  ) {
    return callback(null);
  }

  async.waterfall(
    [
      extract_entry(item),
      tidy,
      helper.determine_path(output_directory),
      function (post, next) {
        post.importContext = context;
        helper.download_pdfs(post, next);
      },
      helper.download_images,
      helper.convert_to_markdown,
      helper.insert_metadata,
      helper.write,
    ],
    function (err, result) {
      if (err && err.cancelled) return callback(err);
      if (err) console.error(err);
      callback(null);
    }
  );
};
