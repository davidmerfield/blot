const async = require("async");

module.exports = function (blog, output_directory, source_domain, callback) {
  async.eachSeries(
    blog.posts,
    function (post, next) {
      async.waterfall(
        [
          require("./extract_post")(blog, post, source_domain),
          require("../../helper/determine_path")(output_directory),
          require("../../helper/download_pdfs"),
          require("../../helper/download_images"),
          function (post, callback) {
            var Turndown = require("turndown");
            var turndown = new Turndown();

            // We override Turndown's HTML escaping function. Wordpress
            // sometimes includes Markdown inside the HTML content of
            // an item. By default, Turndown escapes this, e.g.
            // _Hey_ becomes \_Hey\_ since it assumes the input is pure
            // HTML. But we want the Markdown generally, so we remove the
            // escaping and do nothing to the HTML.
            turndown.escape = function (html) {
              return html;
            };

            // allow video embeds like youtube
            turndown.keep(["iframe"]);

            post.content = turndown.turndown(post.html);

            post.content = post.content.trim();

            callback(null, post);
          },
          require("../../helper/insert_metadata"),
          require("../../helper/write"),
        ],
        function (err) {
          if (err) console.error(err);
          next(null);
        }
      );
    },
    callback.bind(this, null, blog)
  );
};
