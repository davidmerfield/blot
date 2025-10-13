const eachBlog = require("../each/blog");
const Blog = require("models/blog");
const client = require("models/client");
const key = require("models/blog/key");
const { normalize } = require("models/blog/util/imageExif");

const FALLBACK_MODE = "off";

function parseStoredValue(value) {
  if (value === null || value === undefined) return undefined;

  const trimmed = typeof value === "string" ? value.trim() : value;

  if (typeof trimmed === "string" && trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      console.log("Could not parse stored JSON for imageExif", err.message);
      return undefined;
    }
  }

  if (typeof trimmed === "string") return trimmed;

  return undefined;
}

eachBlog(
  (user, blog, next) => {
    client.hget(key.info(blog.id), "imageExif", (err, storedValue) => {
      if (err) return next(err);

      const parsed = parseStoredValue(storedValue);

      const normalized = normalize(parsed, {
        fallback: FALLBACK_MODE,
      });

      const alreadyNormalized =
        typeof storedValue === "string" && storedValue === normalized;

      if (alreadyNormalized) return next();

      Blog.set(blog.id, { imageExif: normalized }, (setErr) => {
        if (setErr) return next(setErr);

        console.log(
          "Updated blog",
          blog.id,
          "(" + blog.handle + ")",
          "->",
          normalized,
        );

        next();
      });
    });
  },
  (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log("Finished ensuring imageExif is stored for all blogs.");
    process.exit(0);
  },
);
