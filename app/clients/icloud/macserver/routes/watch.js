const { watch } = require("../watcher");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");

  // watch the blog
  await watch(blogID);

  console.log(`Recieved watch request for: ${blogID}`);
  res.sendStatus(200);
};
