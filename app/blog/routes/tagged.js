module.exports = function register(blog) {
  blog.get(["/tagged/:tag", "/tagged/:tag/page/:page"], function (req, res, next) {
    res.renderView("tagged.html", next);
  });
};
