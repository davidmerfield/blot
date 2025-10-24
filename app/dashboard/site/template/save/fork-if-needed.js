const createTemplate = require("./create-template");
const Blog = require("models/blog");

const updateBlog = (blogID, updates) => {
    return new Promise((resolve, reject) => {
        Blog.set(blogID, updates, function (error) {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

module.exports = async (req, res, next) => {

    if (req.template.owner === req.blog.id) {
        return next();
    }

    const template = await createTemplate({
        isPublic: false,
        owner: req.blog.id,
        name: req.template.name,
        slug: req.template.slug,
        cloneFrom: req.template.id,
    });

    // if the blog used to use the forked template, we need to update the blog's template
    if (req.blog.template === req.template.id) {
        await updateBlog(req.blog.id, {
            template: template.id
        });
    }

    req.template = res.locals.template = template;
    next();
}