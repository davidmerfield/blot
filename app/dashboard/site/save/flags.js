const blogScheme = require("models/blog/scheme");

const flagKeys = Object.keys(blogScheme.TYPE.flags || {});

const normalizeBoolean = (value) =>
  value === true || value === "true" || value === "on" || value === "1";

module.exports = (req, res, next) => {
  const submitted = req.body || {};
  const updates = {};

  flagKeys.forEach((key) => {
    updates[key] = normalizeBoolean(submitted[key]);
  });

  const mergedFlags = {
    ...(req.blog.flags || {}),
    ...updates,
  };

  req.updates = { flags: mergedFlags };
  req.body.redirect = req.body.redirect || `${res.locals.base}/settings/flags`;

  next();
};
