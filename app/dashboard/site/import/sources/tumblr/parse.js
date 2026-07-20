var fs = require("fs-extra");
var helper = require("dashboard/importer/helper");
var for_each = helper.for_each;
var download_images = helper.download_images;
var to_markdown = require("./to_markdown");
var determine_path = helper.determine_path;
var insert_metadata = helper.insert_metadata;

function main(blog, output_directory, callback) {
  for_each(
    blog.posts,
    function (post, next) {
      var created, updated, path_without_extension;
      var dateStamp, tags, draft, page, metadata;
      var content, title, html, url;

      switch (post.type) {
        case "link":
          post.body = '<a href="' + post.url + '">' + post.url + "</a>\n\n";
          post.body += post.description;
          break;

        case "photo":
          post.body = "";

          for (var i = post.photos.length - 1; i >= 0; i--) {
            post.body +=
              '<img src="' + post.photos[i].original_size.url + '">\n';
          }

          if (post.caption) {
            post.body += post.caption;
          }

          break;

        case "video":
          post.body = post.player[post.player.length - 1].embed_code;
          post.format = "html";
          post.body += post.caption;
          break;

        case "audio":
          post.body = post.embed;
          post.format = "html";
          post.title = post.track_name || post.summary;
          break;

        case "quote":
          post.body =
            "<blockquote>" + post.text + "</blockquote>\n" + post.source;
          post.format = "html";
          post.body += post.caption;

          break;
      }

      content = post.body;

      if (!content) {
        content = "";
        console.log(post);
      }

      title = post.title || post.source_title || post.id.toString();

      if (!title) {
        console.log(post.photos);
        throw "";
      }

      html = post.html;
      url = post.url;

      created = updated = dateStamp = post.timestamp * 1000;
      draft = page = false;
      metadata = {};
      tags = post.tags;

      post = {
        draft: false,
        page: false,

        // We don't know any of these properties
        // as far as I can tell.
        name: "",
        permalink: "",
        summary: "",
        path: path_without_extension,

        title: title,

        dateStamp: dateStamp,
        created: created,
        updated: updated,
        tags: tags,
        metadata: metadata,

        // Clean up the contents of the <content>
        // tag. Evernote has quite a lot of cruft.
        // Then convert into Markdown!
        html: content,
      };

      post = determine_path(post);

      download_images(post, function (err, post) {
        if (err) throw err;

        to_markdown(post, function (err, post) {
          if (err) throw err;

          insert_metadata(post, function (err, post) {
            if (err) throw err;

            // Add the new post to the list of posts!
            // console.log(content);

            console.log("...", post.path);
            fs.outputFile(post.path, post.content, function (err) {
              if (err) return callback(err);

              next();
            });
          });
        });
      });
    },
    function () {
      callback();
    }
  );
}

if (require.main === module) {
  var source_file = process.argv[2];
  var output_directory = process.argv[3];

  if (!source_file)
    throw new Error("Please pass source file JSON as first argument");
  if (!output_directory)
    throw new Error(
      "Please pass output directory to write blog to as second argument"
    );

  var blog = fs.readJsonSync(source_file);

  blog.posts = blog.posts.slice(0, 1000);

  // blog.posts = blog.posts.filter(function(post){
  //   return post.type !== 'photo'
  // });

  blog.posts = blog.posts.map(function (post) {
    delete post.reblog;
    delete post.can_reply;
    delete post.date;
    delete post.blog_name;
    delete post.reblog_key;
    delete post.short_url;
    delete post.can_reblog;
    delete post.is_blocks_post_format;
    delete post.recommended_source;
    delete post.recommended_color;
    delete post.note_count;
    delete post.can_send_in_message;
    delete post.can_like;
    delete post.display_avatar;
    delete post.trail;
    return post;
  });

  fs.emptyDirSync(output_directory);

  main(blog, output_directory, function (err) {
    if (err) throw err;

    process.exit();
  });
}

module.exports = main;
