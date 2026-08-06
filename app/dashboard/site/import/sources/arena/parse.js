const { join, extname } = require("path");
const moment = require("moment");
const fs = require("fs-extra");
const sharp = require("sharp");
const sanitize = require("./sanitize");

async function parse({ outputDirectory, posts, status }) {
  if (posts.length === 0) {
    status("No channel items were found");
    throw new Error("No importable items were found in this Are.na channel.");
  }

  let done = 0;

  for (const item of posts) {
    status(`(${++done}/${posts.length}) Processing ${item.title}`);
    try {
      if (item.class === "Image") {
        await image(item, outputDirectory);
      } else if (item.class === "Link") {
        await link(item, outputDirectory);
      } else {
        console.log("Cannot process", item);
      }
    } catch (e) {
      // A failed image download must not discard the source. Preserve it as a
      // web location so the user can retry or visit the externally hosted asset.
      if (item.class === "Image" && item.image && item.image.original) {
        await link(
          {
            ...item,
            source: {
              title: item.title || item.generated_title || "Untitled",
              url: item.image.original.url,
            },
          },
          outputDirectory
        );
      }
    }
  }
}

async function link(item, outputDirectory) {
  const createdDate = new Date(item.created_at);
  const created = createdDate.valueOf();
  const draft = item.visibility !== "public";
  const title = item.source.title || item.title || "Untitled";
  const url = item.source.url;
  const name = `${sanitize(title)}.webloc`;

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>URL</key>
  <string>${url}</string>
</dict>
</plist>
`;

  const path = await getPath({ outputDirectory, draft, name, created });
  await fs.outputFile(path, content, "utf-8");
  await fs.utimes(path, createdDate, createdDate);
}

async function image(item, outputDirectory) {
  const response = await fetch(item.image.original.url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.buffer();
  const title = item.title || item.generated_title || "Untitled";

  // TODO, take advantage of item.source to show where the
  // image was downloaded from
  const createdDate = new Date(item.created_at);
  const created = createdDate.valueOf();
  const draft = item.visibility !== "public";

  const extension =
    extname(item.image.filename) || "." + (await sharp(data).metadata).format;

  const name = sanitize(title) + extension;

  const path = await getPath({ outputDirectory, draft, name, created });
  await fs.outputFile(path, data);
  await fs.utimes(path, createdDate, createdDate);
}

async function getPath({ outputDirectory, draft, name, created }) {
  const initial = join(
    outputDirectory,
    (draft ? "[draft]" : "") + moment(created).format("YYYY-MM-DD") + " " + name
  );
  const extension = extname(initial);
  const stem = initial.slice(0, -extension.length || undefined);
  let candidate = initial;
  let suffix = 2;
  while (await fs.pathExists(candidate)) {
    candidate = `${stem}-${suffix++}${extension}`;
  }
  return candidate;
}

module.exports = parse;
