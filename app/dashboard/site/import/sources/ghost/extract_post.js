var moment = require("moment");
var resolve_url = require("../../helper/resolve_url");

var extract_tags = require("./extract_tags");
// var extract_author = require("./extract_author");

module.exports = function (blog, post, source_domain) {
  return function (callback) {
    
    var created, updated, metadata, permalink;
    var title, dateStamp, tags, draft, page, html;

    title = post.title;

    if (!post.html) return callback(new Error("No HTML"));

    // we need to extract tags separately
    tags = extract_tags(post, blog);

    metadata = {};

    // if (extract_author(post, blog))
    //   metadata.author = extract_author(post, blog);

    permalink = post.slug;
    draft = post.status === "draft" || post.visibility !== "public";
    page = !!post.page;
    created = moment(post.created_at).valueOf();
    updated = moment(post.updated_at || post.created_at).valueOf();
    dateStamp = moment(
      post.published_at || post.created_at || post.updated_at
    ).valueOf();

    html = post.html;

    if (post.feature_image) {
      metadata.thumbnail = require("url").resolve(
        source_domain,
        post.feature_image
      );
    }

    html = resolve_url(source_domain, html);

    // Add the new post to the list of posts!
    post = {
      draft,
      page,

      // We don't know any of these properties
      // as far as I can tell.
      name: "",
      permalink,
      summary: "",

      title: title,

      dateStamp: dateStamp,
      created: created,
      updated: updated,
      tags: tags,
      metadata: metadata,
      html: html,
    };

    callback(null, post);
  };
};
