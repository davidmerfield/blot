const eachBlog = require("./blog");
const getBlog = require("../get/blog");

/**
 * Processes either a single blog (if identifier provided) or all blogs (if no identifier).
 * 
 * @param {Function} processBlog - Async function that takes a blog object and processes it
 * @returns {Promise} Resolves when processing is complete
 */
module.exports = function eachBlogOrOneBlog(processBlog) {
  const identifier = process.argv[2];

  if (identifier) {
    // Process a single blog
    return new Promise((resolve, reject) => {
      getBlog(identifier, (err, _user, blog) => {
        if (err || !blog) {
          return reject(new Error(`No blog: ${identifier}`));
        }

        processBlog(blog)
          .then(() => resolve())
          .catch((processErr) => reject(processErr));
      });
    });
  } else {
    // Process all blogs
    return new Promise((resolve, reject) => {
      eachBlog(
        async (_user, blog, next) => {
          try {
            await processBlog(blog);
            next();
          } catch (err) {
            console.error(`Error processing blog ${blog.id}:`, err.message);
            next();
          }
        },
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }
};

