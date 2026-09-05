const Blog = require("models/blog");
const writeToFolder = require("models/template").writeToFolder;
const { promisify } = require("util");

const writeToFolderAsync = promisify(writeToFolder);

async function triggerWriteToFolder(blogHandle, templateID) {
  try {
    // Get blog by handle
    const blog = await new Promise((resolve, reject) => {
      Blog.get({ handle: blogHandle }, (err, blog) => {
        if (err || !blog)
          return reject(new Error("No blog found with handle: " + blogHandle));
        resolve(blog);
      });
    });

    console.log("Found blog:", blog.id, blog.handle);
    console.log("Triggering writeToFolder for template:", templateID);
    console.log("This will cause the bug (delete .git files)...");

    // Run writeToFolder to trigger the bug (delete .git files)
    await writeToFolderAsync(blog.id, templateID);

    console.log("writeToFolder completed");
    console.log("The .git directory should now have deleted files.");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  const blogHandle = process.argv[2];
  const templateID = process.argv[3];
  
  if (!blogHandle || !templateID) {
    console.error("Usage: node trigger-write-to-folder.js <blog-handle> <template-id>");
    process.exit(1);
  }
  
  triggerWriteToFolder(blogHandle, templateID)
    .then(() => {
      // Force exit to ensure clean shutdown
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}

module.exports = triggerWriteToFolder;

