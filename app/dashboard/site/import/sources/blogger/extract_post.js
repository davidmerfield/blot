// var moment = require("moment");

module.exports = function (post) {
  return function (callback) {
    var created, updated, metadata, permalink;
    var title, dateStamp, tags, draft, page, html;

// console.log(Object.keys(post));
    title = post.title[0]._;

    if (!post.content || !post.content[0]._) return callback(new Error("No content"));

    // console.log("id", post.id);
    // console.log("published", post.published, new Date(post.published[0]));
    // console.log("link");
    // console.log("id", post.id);
    // console.log("author", post.author);
    // console.log(post["media:thumbnail"]);

    metadata = {};

    // if (extract_author(post, blog))
    //   metadata.author = extract_author(post, blog);

    let link = '';

    try {
      link = require("url").parse(
      post.link.filter((item) => item.$.TYPE === "text/html")[0].$.HREF
    ).pathname
    } catch (e) {
      console.log(e);
      console.log(post.link);
    }

    permalink = link;

    // draft = post.status === "draft" || post.visibility !== "public";
    draft = false;
    // page = !!post.page;
    page = false;
    created = new Date(post.published[0]).getTime();
    updated = new Date(post.updated[0]).getTime();
    dateStamp = new Date(post.published[0]).getTime();
    tags = [];
    html = post.content[0]._;

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
