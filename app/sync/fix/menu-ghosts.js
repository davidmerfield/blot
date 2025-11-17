const Entry = require("models/entry");
const Blog = require("models/blog");
const async = require("async");
const _ = require("lodash");

function main(blog, callback) {
  const existing = {};
  const report = [];

  async.map(
    blog.menu,
    function (item, next) {
      Entry.get(blog.id, item.id, function (entry) {
        if (entry && entry.deleted) {
          report.push(["Delete", item]);
          next(null, null);
        } else if (entry && existing[entry.id] === true) {
          report.push(["Delete duplicate", item]);
          next(null, null);
        } else if (entry) {
          if (item.label !== entry.title) {
            item.label = entry.title;
            report.push(["Changed label of", item]);
          }

          if (!_.isEqual(item.metadata, entry.metadata)) {
            item.metadata = entry.metadata;
            report.push(["Changed metadata of", item]);
          }

          if (item.url !== entry.url) {
            item.url = entry.url;
            report.push(["Changed URL of", item]);
          }

          existing[entry.id] = true;
          next(null, item);
        } else {
          if (entry) existing[entry.id] = true;
          next(null, item);
        }
      });
    },
    function (err, results) {
      if (err) return callback(err);

      results = results.filter(function (item) {
        return item !== null;
      });

      if (_.isEqual(results, blog.menu)) {
        callback(null, report);
      } else {
        Blog.set(blog.id, { menu: results }, function (err) {
          if (err) return callback(err);
          callback(null, report);
        });
      }
    }
  );
}

module.exports = main;
