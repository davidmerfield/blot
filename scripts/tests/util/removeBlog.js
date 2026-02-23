var Blog = require("models/blog");

module.exports = function (done) {
  var started = Date.now();
  if (!this.blog || !this.blog.id) return done();
  var id = this.blog.id;
  console.log("[test.blog.removeBlog] start", id);

  Blog.remove(id, function (err) {
    if (err && err.message !== "No blog") {
      console.log("[test.blog.removeBlog] fail", id, err.message);
      return done(err);
    }
    console.log("[test.blog.removeBlog] done", id, Date.now() - started + "ms");
    done();
  });
};
