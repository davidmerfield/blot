const { watch } = require("../watcher");
const clfdate = require("helper/clfdate");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  
  // watch the blog
  await watch(blogID);

  console.log(clfdate(), `Recieved watch request for: ${blogID}`);
  res.sendStatus(200);
};
