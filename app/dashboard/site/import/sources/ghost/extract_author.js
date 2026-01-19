module.exports = function (post, blog) {
  var author = null;

  if (post.published_by)
    author = blog.users.filter(function (user) {
      return user.id === post.published_by;
    })[0].name;

  return author;
};
