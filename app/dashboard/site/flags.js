const Blog = require("models/blog");
const blogScheme = require("models/blog/scheme");
const blogDefaults = require("models/blog/defaults");

const flagKeys = Object.keys(blogScheme.TYPE.flags || {});
const defaultFlags = blogDefaults.flags || {};

const labelize = (key) =>
  key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeBoolean = (value) => {
  if (value === true || value === "true" || value === "on" || value === "1") {
    return true;
  }

  return false;
};

exports.get = (req, res) => {
  const currentFlags = {
    ...defaultFlags,
    ...(req.blog.flags || {}),
  };

  const flags = flagKeys.map((key) => ({
    key,
    label: labelize(key),
    value: !!currentFlags[key],
    defaultValue: !!defaultFlags[key],
  }));

  res.locals.breadcrumbs.add("Flags", "flags");
  res.locals.formAction = `${res.locals.base}/settings/flags`;

  res.render("dashboard/site/settings/flags", {
    title: "Flags",
    flags,
  });
};

exports.post = (req, res, next) => {
  const submitted = req.body || {};
  const updates = {};

  flagKeys.forEach((key) => {
    updates[key] = normalizeBoolean(submitted[key]);
  });

  const mergedFlags = {
    ...(req.blog.flags || {}),
    ...updates,
  };

  Blog.set(req.blog.id, { flags: mergedFlags }, (error) => {
    if (error) {
      return res.message(
        `${res.locals.base}/settings/flags`,
        error
      );
    }

    res.message(`${res.locals.base}/settings/flags`, "Updated flags");
  });
};
