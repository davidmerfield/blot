const database = require("clients/icloud/database");

module.exports = async function validateBlog(req, res, next) {
  const blogID = req.header("blogID");

  if (!blogID) {
    console.log("Missing blogID header");
    return res.status(400).send("Missing blogID header");
  }

  // Check with the database that the blog is connected to the iCloud Drive
  const account = await database.get(blogID);

  if (!account || !account.sharingLink) {
    console.log("Blog is not connected to iCloud Drive");
    return res.status(400).send("Blog is not connected to iCloud Drive");
  }

  req.account = account;
  next();
};
