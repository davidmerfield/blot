var eachBlog = require("../each/blog");
var Blog = require("models/blog");
var forkSiteTemplate = require("models/template/util/forkSiteTemplate");
var { promisify } = require("util");

var setAsync = promisify(Blog.set);

async function handleBlog(blog) {
  if (!blog.template || blog.template.indexOf("SITE:") !== 0) return null;

  var forkedTemplateID = await forkSiteTemplate(blog.id, blog.template);

  if (forkedTemplateID && forkedTemplateID !== blog.template) {
    await setAsync(blog.id, { template: forkedTemplateID });
    return forkedTemplateID;
  }

  return null;
}

function main(callback) {
  var processed = 0;
  var forked = 0;

  eachBlog(
    function (user, blog, next) {
      handleBlog(blog)
        .then(function (forkedTemplateID) {
          processed += 1;

          if (forkedTemplateID) {
            forked += 1;
            console.log(
              "Forked",
              blog.template,
              "for blog",
              blog.id,
              "->",
              forkedTemplateID
            );
          }

          next();
        })
        .catch(function (err) {
          console.error("Error processing blog", blog.id, err);
          next();
        });
    },
    function (err) {
      if (err) return callback(err);

      console.log(
        "Processed",
        processed,
        "blogs. Created",
        forked,
        "forked templates."
      );

      callback();
    }
  );
}

if (require.main === module) {
  main(function (err) {
    if (err) throw err;

    process.exit();
  });
}

module.exports = main;
