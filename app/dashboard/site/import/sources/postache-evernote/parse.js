var fs = require("fs-extra");
var moment = require("moment");
var helper = require("dashboard/importer/helper");

var forEach = helper.for_each;
var Extract = helper.extract;
var determine_path = helper.determine_path;
var insert_metadata = helper.insert_metadata;
var to_markdown = helper.to_markdown;

var extract_html = require("./extract_html");
var extract_files = require("./extract_files");
var replace_images = require("./replace_images");

module.exports = function ($, output_directory, callback) {
  var blog = {
    title: "",
    host: "",
    posts: [],
  };

  extract_files($, output_directory, function (err, files) {
    if (err) return callback(err);

    forEach(
      $("note"),
      function (i, el, next) {
        var extract, created, updated, metadata, path_without_extension;
        var title, dateStamp, tags, draft, page, html, post, path;

        // Some notes are empty for some reason I don't understand
        // skip them here to avoid errors.
        if (!$(el).html()) return next();

        // Don't do this to the root element. Not sure why
        // cheerio offers it, but whatever!
        if (!$(el).parent().length) return next();

        extract = Extract($, el);
        title = extract("title");
        tags = extract("tag");

        // Would be nice to fix the extractor function
        // to force return an array, removing these next lines
        if (typeof tags === "string") tags = [tags];
        if (!tags) tags = [];

        //
        draft = tags.indexOf("published") === -1;
        page = tags.indexOf("page") > -1;
        tags = tags.filter(function (tag) {
          return ["published", "page"].indexOf(tag) === -1;
        });

        // The note's creation & updated date are used
        // as the file's creation and updated dates.
        created = moment(extract("created")).valueOf();
        updated = moment(extract("updated")).valueOf();

        // Aparently postache uses the note's creation
        // date as the blog post's publish date.
        dateStamp = created;

        metadata = {};

        // It seems like Evernote offers author metadata,
        // so store it just in case it's useful.
        if (extract("author")) metadata.author = extract("author");

        html = extract_html(extract("content"), files);

        replace_images(html, files, path_without_extension, function (
          err,
          html,
          has_images
        ) {
          if (err) return callback(err);

          if (has_images) {
            path = path_without_extension + "/post.txt";
          } else {
            path = path_without_extension + ".txt";
          }

          if (err) return callback(err);

          // Add the new post to the list of posts!
          post = {
            draft: draft,
            page: page,

            // We don't know any of these properties
            // as far as I can tell.
            name: "",
            permalink: "",
            summary: "",

            title: extract("title"),

            dateStamp: dateStamp,
            created: created,
            updated: updated,
            tags: tags,
            metadata: metadata,

            // Clean up the contents of the <content>
            // tag. Evernote has quite a lot of cruft.
            // Then convert into Markdown!
            content: to_markdown(html),
          };

          post = determine_path(post);

          post = insert_metadata(post);

          fs.outputFile(post.path, post.content, function (err) {
            if (err) return callback(err);

            next();
          });
        });
        // When all the notes have been processed,
        // send them back with the rest of the blog!
      },
      callback.bind(this, null, blog)
    );
  });
};
