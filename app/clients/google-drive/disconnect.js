const Blog = require("models/blog");
const database = require("./database");

module.exports = async (blogID, callback) => {
  
    await database.blog.delete(blogID);

    Blog.set(blogID, { client: "" }, async function (err) {
        callback();
    });
};