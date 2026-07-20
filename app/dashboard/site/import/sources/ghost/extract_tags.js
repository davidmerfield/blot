module.exports = function (post, blog) {
  var tags = [];

  blog.posts_tags.forEach(function (tag) {
    if (tag.post_id !== post.id) return;

    blog.tags.forEach(function (tag_info) {
      if (tag_info.id !== tag.tag_id) return;
      if (tag_info.visibility !== "public") return;

      tags.push(tag_info.name);
    });
  });

  return tags;
};
