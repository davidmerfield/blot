var yaml = require("js-yaml");
var async = require("async");

module.exports = function (result, callback) {
  var frontmatter = result.source.split("---")[1];
  var missingHandlers = {};
  var metadata = {};

  try {
    // we can't pass in entire document, need to extract stuff between the ---s
    frontmatter = yaml.safeLoad(frontmatter);
  } catch (e) {
    return callback(e);
  }

  // Merges tags and categories
  if (frontmatter.categories) {
    frontmatter.tags = frontmatter.tags || [];
    frontmatter.tags = frontmatter.tags.concat(frontmatter.categories);
    delete frontmatter.categories;
  }

  // This is a kerim specific bug that was driving me crazy, not sure how he did it
  if (frontmatter["categories:"]) {
    console.log(frontmatter);
    frontmatter.tags = frontmatter.tags || [];
    frontmatter.tags = frontmatter.tags.concat(frontmatter["categories:"]);
    delete frontmatter["categories:"];
  }

  async.eachOf(
    frontmatter,
    function (value, key, next) {
      if (key === "tags") {
        if (Array.isArray(value)) {
          value = value
            .filter(function (tag) {
              if (["blog-post"].indexOf(tag.toLowerCase()) > -1) return false;
              return true;
            })
            .map(function (tag) {
              if (tag.indexOf("-") > -1)
                console.log("Warning tag with dash:", tag);

              if (tag[0].toLowerCase() === tag[0]) {
                if (["iphone"].indexOf(tag.toLowerCase) === -1) {
                  tag[0] = tag[0].toUpperCase();
                  console.log("Warning uppercased tag", tag);
                }
              }

              return tag;
            });

          if (value.length) metadata.Tags = value.join(", ");
        } else {
          console.log("Unexpected type for Tags", typeof value, value);
        }
      } else if (key === "permalink") {
        // We could remove trailing slash here...
        // if (value.slice(-1) === '/') value = value.slice(0, -1);
        metadata.Permalink = value;
      } else if (key === "title") {
        result.title = value;
      } else if (key === "layout") {
        if (value !== "post") {
          result.warnings.push("Not a post, it has layout property:" + value);
        }
      } else if (key === "published") {
        if (value === false) result.draft = true;
      } else {
        result.warnings.push(key + " (" + value + ") has no handler");
      }

      next();
    },
    function (err) {
      result.metadata = metadata;
      result.missingHandlers = missingHandlers;
      callback(err, result);
    }
  );
};
