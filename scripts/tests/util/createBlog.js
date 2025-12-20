var Blog = require("models/blog");
var randomString = require("./randomString");
var localPath = require("helper/localPath");
const fs = require("fs-extra");
const { join } = require("path");
const { promisify } = require("util");
const rebuild = promisify(require("sync/rebuild"));
const checkEntry = require("./checkEntry");

module.exports = function (done) {
  var context = this;

  Blog.create(context.user.uid, { handle: randomString(16) }, function (
    err,
    blog
  ) {
    if (err) {
      console.log('HERE',err);
      return done(new Error(err.handle));
    }

    context.blogDirectory = localPath(blog.id, "/");

    if (context.blogDirectory.slice(-1) === "/")
      context.blogDirectory = context.blogDirectory.slice(0, -1);

    context.blog = blog;

    context.blog.update = async (updates) => {
      await promisify(Blog.set)(context.blog.id, updates);
    };

    context.blog.write = async ({ path, content }) => {
      await fs.outputFile(join(context.blogDirectory, path), content);
    };

    context.blog.remove = async (path) => {
      await fs.remove(join(context.blogDirectory, path));
    };
    
    context.blog.rebuild = async (options = {}) =>
      await rebuild(context.blog.id, options);

    context.blog.check = async (entry) =>
      await promisify(checkEntry(context.blog.id))(entry);

    if (context.write === undefined) context.write = context.blog.write;

    if (context.remove === undefined) context.remove = context.blog.remove;

    if (context.publish === undefined) context.publish = async ({ path, content }) => {
      await context.blog.write({ path, content });
      await context.blog.rebuild();
    };
    
    done(err);
  });
};
