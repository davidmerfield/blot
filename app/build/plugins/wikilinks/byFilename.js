const fs = require("fs");
const { dirname, join, basename, normalize } = require("path");
const localPath = require("helper/localPath");
const caseSensitivePath = require("helper/caseSensitivePath");

module.exports = function byFilename(
  blogID,
  pathOfPost,
  href,
  isLink,
  callback
) {
  if (!href) return callback(new Error("No filename provided"));

  const stripped = href.split("|")[0].trim();
  const targetName = basename(stripped);

  if (!targetName) return callback(new Error("No filename"));

  const root = localPath(blogID, "/");
  const getEntry = require("models/entry").get;
  const startDir = normalizeDir(dirname(pathOfPost));
  const visited = new Set();
  const queue = [];

  function normalizeDir(dir) {
    if (!dir || dir === ".") return "/";
    let normalizedPath = normalize(dir).replace(/\\+/g, "/");

    if (!normalizedPath.startsWith("/")) normalizedPath = "/" + normalizedPath;

    return normalizedPath;
  }

  function enqueue(dir) {
    const normalized = normalizeDir(dir);
    if (!visited.has(normalized)) {
      visited.add(normalized);
      queue.push(normalized);
    }
  }

  enqueue(startDir);

  function searchNext() {
    if (!queue.length) return callback(new Error("No entry found by filename"));

    const current = queue.shift();
    const parent = dirname(current);

    if (parent && parent !== current) enqueue(parent);

    const absoluteDir = localPath(blogID, current);

    fs.readdir(
      absoluteDir,
      { withFileTypes: true },
      function handleDir(err, entries = []) {
        if (!err) {
          entries.forEach((dirent) => {
            if (dirent.isDirectory()) enqueue(join(current, dirent.name));
          });
        }

        caseSensitivePath(
          root,
          join(current, targetName),
          function (matchErr, matchPath) {
            if (!matchErr && matchPath && matchPath.startsWith(root)) {
              const resolvedPath = "/" + matchPath.slice(root.length);

              return getEntry(blogID, resolvedPath, function (entry) {
                if (entry) {
                  return callback(null, entry);
                } else {
                  return callback(null, {
                    url: resolvedPath,
                    title: targetName,
                    path: resolvedPath,
                  });
                }
              });
            }

            searchNext();
          }
        );
      }
    );
  }

  searchNext();
};
