const Template = require("models/template");
const Mustache = require("mustache");
const fs = require("fs-extra");
const promisify = require("util").promisify;
const getMetadata = promisify(Template.getMetadata);
const config = require("config");
const path = require("path");
const url = require("models/blog/url");

const HASH_LENGTH = 7;

module.exports = async function (req, res, next) {
    // We care about template metadata for template
    // locals. Stuff like page-size is set here.
    // Also global colors etc...
    if (!req.blog.template) return next();

    req.log("Loading template", req.blog.template);
    
    let metadata;

    try {
        metadata = await getMetadata(req.blog.template);
    } catch (err) {
        const error = new Error("This template does not exist.");
        error.code = "NO_TEMPLATE";
        return next(error);    
    }

    // If we're in preview mode and there are errors then let's show them
    if (req.preview && metadata.errors && Object.keys(metadata.errors).length > 0) {

        const template = await fs.readFile(__dirname + "/views/template-error.html", "utf-8");

        const errors = Object.keys(metadata.errors).map(view => {
            return { view, error: metadata.errors[view] };
        });

        const html = Mustache.render(template, {
            errors,
            name: metadata.name,
            path: metadata.localEditing ? "Templates/" + metadata.slug + "/" : ""
        });

        return res.status(400).send(html);
    }

    const template = {
        locals: metadata.locals,
        id: req.blog.template,
        cdn: metadata.cdn || {}
    };

    req.template = template;

    // Compute CDN URLs for style.css and script.js
    // This replaces the old cssURL/scriptURL properties from the blog model
    if (req.blog) {
        // Ensure blog.locals exists (should be set by Blog.extend, but be defensive)
        if (!req.blog.locals) {
            req.blog.locals = {};
        }
        const manifest = template.cdn || {};
        
        // Helper function to generate CDN URL from manifest (same logic as CDN function)
        function generateCdnUrl(filePath) {
            const normalized = filePath.startsWith("/") ? filePath.slice(1) : filePath;
            
            if (template.id && Object.prototype.hasOwnProperty.call(manifest, normalized)) {
                const hash = manifest[normalized].slice(0, HASH_LENGTH);
                const ext = path.extname(normalized) || "";
                const viewNameWithoutExtension = ext
                    ? normalized.slice(0, -ext.length)
                    : normalized;
                const encodedView = encodeViewSegment(viewNameWithoutExtension);
                const encodedTemplate = encodeURIComponent(template.id);
                
                return (
                    config.cdn.origin +
                    "/template/" +
                    req.blog.id +
                    "/" +
                    encodedTemplate +
                    "/" +
                    encodedView +
                    "." +
                    hash +
                    ext
                );
            }
            
            // Fall back to old URL format if not in manifest
            return null;
        }
        
        // Generate CDN URLs
        const cssCdnUrl = generateCdnUrl("/style.css");
        const scriptCdnUrl = generateCdnUrl("/script.js");
        
        // Set locals with CDN URLs or fallback to old format
        req.blog.locals.cssURL = cssCdnUrl || url.css(req.blog.cacheID);
        req.blog.locals.scriptURL = scriptCdnUrl || url.js(req.blog.cacheID);
        
        // Also set underscore aliases for consistency
        req.blog.locals.css_url = req.blog.locals.cssURL;
        req.blog.locals.script_url = req.blog.locals.scriptURL;
    }

    req.log("Loaded template", req.blog.template);
    return next();
};

function encodeViewSegment(segment) {
    if (!segment) return "";
    
    return segment
        .split("/")
        .map(function (part) {
            return encodeURIComponent(part);
        })
        .join("/");
}
