const Blog = require("models/blog");
const Template = require("models/template");
const localPath = require("helper/localPath");
const fs = require("fs-extra");
const path = require("path");

async function setup(blogHandle) {
  try {
    // Get blog by handle
    console.log("Looking up blog with handle:", blogHandle);
    const blog = await new Promise((resolve, reject) => {
      Blog.get({ handle: blogHandle }, (err, blog) => {
        if (err || !blog)
          return reject(new Error("No blog found with handle: " + blogHandle));
        resolve(blog);
      });
    });

    console.log("Found blog:", blog.id, blog.handle);
    console.log("Blog client:", blog.client);

    // Generate template name
    const timestamp = Date.now();
    const templateName = "test-restore-" + timestamp;
    console.log("Creating template:", templateName);

    // Create template
    const template = await new Promise((resolve, reject) => {
      Template.create(blog.id, templateName, {}, (err, template) => {
        if (err) return reject(err);
        resolve(template);
      });
    });

    console.log("Template created:", template.id);

    // Enable local editing (this triggers writeToFolder)
    console.log("Enabling local editing...");
    await new Promise((resolve, reject) => {
      Template.setMetadata(template.id, { localEditing: true }, (err) => {
        if (err) return reject(err);
        console.log("Writing to folder...");
        Template.writeToFolder(blog.id, template.id, function (err) {
          if (err) return reject(err);
          console.log("Written to folder...");
          resolve(); 
        });        
      });
    });

    console.log("Local editing enabled, template written to folder");

    // Determine template folder path
    const templateBase = fs.existsSync(localPath(blog.id, "/Templates"))
      ? "Templates"
      : "templates";
    const templateDir = localPath(
      blog.id,
      path.join("/", templateBase, template.slug)
    );

    console.log("Template directory:", templateDir);
    console.log("");
    console.log("Setup complete!");
    console.log("Blog ID:", blog.id);
    console.log("Blog Handle:", blog.handle);
    console.log("Blog Client:", blog.client);
    console.log("Template ID:", template.id);
    console.log("Template Name:", templateName);
    console.log("Template Slug:", template.slug);
    console.log("Template Base:", templateBase);
    console.log("Template Directory:", templateDir);
    console.log("");
    console.log("Output for shell script:");
    console.log("BLOG_ID=" + blog.id);
    console.log("BLOG_CLIENT=" + blog.client);
    console.log("TEMPLATE_ID=" + template.id);
    console.log("TEMPLATE_SLUG=" + template.slug);
    console.log("TEMPLATE_BASE=" + templateBase);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  const blogHandle = process.argv[2];
  if (!blogHandle) {
    console.error("Usage: node setup-restore-git-test.js <blog-handle>");
    process.exit(1);
  }
  setup(blogHandle)
    .then(() => {
      // Force exit to ensure clean shutdown
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}

module.exports = setup;

