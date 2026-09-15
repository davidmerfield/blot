const Blog = require("models/blog");
const blogDefaults = require("models/blog/defaults");
const { renderToString } = require("./pipeline");
const { getMetadata, getBlog } = require("../lib/models");

/**
 * Render a view for CDN manifest generation
 * @param {string} templateID - The template ID
 * @param {string} viewName - The name of the view to render
 * @returns {Promise<string|null>} - The rendered output or null if error/missing
 */
async function renderView(templateID, viewName) {
  try {
    const metadata = await getMetadata(templateID);
    if (!metadata) {
      return null; // Missing metadata - skip in manifest
    }

    if (!metadata.owner) {
      return null; // Missing owner - skip in manifest
    }

    const ownerID = metadata.owner;

    // Fetch or create blog object
    let blogData;
    if (ownerID === "SITE") {
      blogData = { id: "SITE" };
    } else {
      blogData = await getBlog({ id: ownerID });
      if (!blogData) {
        return null; // Missing blog - skip in manifest
      }
    }

    const blog = Blog.extend(Object.assign({}, blogDefaults, blogData));

    const req = {
      blog: blog,
      preview: false,
      log: () => {},
      template: {
        locals: metadata.locals || {},
        id: templateID,
        cdn:
          metadata.cdn && typeof metadata.cdn === "object" ? metadata.cdn : {},
      },
      query: {},
      protocol: "https",
      headers: {},
    };

    const res = {
      locals: { partials: {} },
    };

    let renderedOutput;

    try {
      const result = await renderToString(req, res, viewName);
      if (result.noTemplate) {
        return null;
      }
      renderedOutput = result.output;
    } catch (err) {
      if (err && err.code === "NO_VIEW") {
        return null; // Missing view - skip in manifest (not an error)
      }
      console.error(`Error rendering view ${viewName} for CDN:`, err);
      return null;
    }

    if (renderedOutput === undefined || renderedOutput === null) {
      return null;
    }

    return typeof renderedOutput === "string"
      ? renderedOutput
      : String(renderedOutput);
  } catch (err) {
    console.error(`Error in renderView for ${viewName}:`, err);
    return null;
  }
}

module.exports = renderView;
