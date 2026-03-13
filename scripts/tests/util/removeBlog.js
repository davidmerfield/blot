var Blog = require("models/blog");

module.exports = function (done) {
  var id = this.blog.id;

  Blog.remove(id, function (err) {
    if (err) {
      return done(err);
    }
    
    done();
  });
};
