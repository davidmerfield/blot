const database = require("../database");
const sync = require("./sync");

module.exports = async (blogID, publish, update) => {
  publish = publish || function () {};
  update = update || function () {};

  const account = await database.blog.get(blogID);
  const { reset } = database.folder(account.folderId);

  // reset the database state of the folder
  await reset();

  await sync(blogID, publish, update);
};
