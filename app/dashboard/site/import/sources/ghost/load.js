var fs = require("fs-extra");

module.exports = function (path_to_source_file, callback) {
  fs.readJson(path_to_source_file, function (err, data) {
    if (err) return callback(err);

    callback(null, {
      posts: data.db[0].data.posts,
      users: data.db[0].data.users,
      tags: data.db[0].data.tags,
      posts_tags: data.db[0].data.posts_tags,
    });
  });
};
