var readability = require("node-readability");
var moment = require("moment");
var fs = require("fs-extra");

var helper = require("dashboard/importer/helper");

var each_el = helper.each_el;
var Extract = helper.extract;
var insert_video_embeds = helper.insert_video_embeds;
var determine_path = helper.determine_path;
var download_images = helper.download_images;
var insert_metadata = helper.insert_metadata;
var to_markdown = helper.to_markdown;

module.exports = function ($, output_directory, callback) {
  var blog = {
    title: $("title").first().text(),
    host: $("link").first().text(),
    posts: [],
  };

  each_el(
    $,
    "item",
    function (el, next) {
      var extract, created, updated, content;
      var title, dateStamp, tags, draft, page, post;

      extract = Extract($, el);
      title = extract("title");
      tags = extract("category");
      created = updated = dateStamp = moment(extract("pubDate")).valueOf();

      readability(extract("link"), function (err, article) {
        // third arg: meta

        if (err) return callback(err);

        content = article.content;

        content = insert_video_embeds(content);

        post = {
          draft,
          page,

          // We don't know any of these properties
          // as far as I can tell.
          name: "",
          permalink: "",
          summary: "",

          title: title,

          dateStamp: dateStamp,
          created: created,
          updated: updated,
          tags: tags,
          metadata: {},

          // Clean up the contents of the <content>
          // tag. Evernote has quite a lot of cruft.
          // Then convert into Markdown!
          html: content,
        };

        post = determine_path(post);

        download_images(post, function (err, post) {
          if (err) throw err;

          post.content = to_markdown(post.html);
          post = insert_metadata(post);

          fs.outputFile(post.path, post.content, function (err) {
            if (err) return callback(err);

            next();
          });
        });
      });
    },
    function () {
      callback(null, blog);
    }
  );
};
