var blogID = process.argv[2];
var addToUserID = process.argv[3];

var User = require("models/user");

var getUser = require("../get/user");
var getBlog = require("../get/blog");

if (!blogID) throw new Error("Please pass blog identifier as first argument");
if (!addToUserID)
  throw new Error(
    "Please pass user identifer to move the blog to as second argument"
  );

getBlog(blogID, function (err, user, blog, url) {
  if (err || !user || !blog)
    throw err || new Error("No blog with identifer " + blogID);

  getUser(addToUserID, function (err, newOwnerUser, newOwnerURL) {
    if (err || !user)
      throw err || new Error("No user with identifer " + addToUserID);

    if (user.blogs.indexOf(blog.id) === -1)
      throw err || new Error("User does not own this blog");

    if (newOwnerUser.blogs.indexOf(blog.id) !== -1)
      throw err || new Error("New user already owns this blog");

    // Remove blog from list of blogs controlled by existing owner
    user.blogs = user.blogs.filter(function (otherBlogID) {
      return otherBlogID !== blog.id;
    });

    // Add blog to list of blogs controlled by new owner
    newOwnerUser.blogs.push(blog.id);

    User.set(user.uid, { blogs: user.blogs }, function (err) {
      if (err) throw err;

      User.set(newOwnerUser.uid, { blogs: newOwnerUser.blogs }, function (err) {
        if (err) throw err;

        console.log("Migration complete!");
        console.log("Dashboard for:", user.email, url);
        console.log("Dashboard for:", newOwnerUser.email, newOwnerURL);
        console.log("");
        console.log("Warning!");
        console.log("This did not affect the user's subscription settings");
        console.log("Make sure to adjust their bill");

        process.exit();
      });
    });
  });
});
