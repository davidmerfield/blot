var Blog = require("models/blog");

module.exports = function (done) {
  if (!this.blog || !this.blog.id) return done();
  var id = this.blog.id;

  Blog.remove(id, function (err) {
    if (err && err.message !== "No blog") {
      return done(err);
    }
    done();
  });
};
