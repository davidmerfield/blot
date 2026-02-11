const fs = require("fs-extra");
const localPath = require("helper/localPath");
const colors = require("colors/safe");
const { join, dirname } = require("path");
const debug = require("debug")("blot:clients:google-drive:download");
const tempDir = require("helper/tempDir")();
const guid = require("helper/guid");
const computeMd5Checksum = require("../util/md5Checksum");
const config = require("config");
const hash = require("helper/hash");
const cheerio = require("cheerio");
const yauzl = require("yauzl");

const isExportSizeLimitError = (err) => {
  
  // Try to parse err.message if it's a JSON string
  let errorData = null;

  if (typeof err.message === 'string') {
    try {
      errorData = JSON.parse(err.message);
    } catch (e) {
      // Not JSON, that's fine
    }
  } else if (err.message && typeof err.message === 'object') {
    errorData = err.message;
  }
  
  return errorData?.error?.code === 403 && errorData?.error?.message?.includes("too large to be exported");
};

const ensurePlaceholderWithMtime = async (pathOnBlot, modifiedTime) => {
  await fs.ensureFile(pathOnBlot);
  // We update the date-modified time of the file to match the remote file
  // to prevent Blot re-downloading by ensuring the file is not considered stale
  try {
    debug("Setting mtime for file", pathOnBlot, "to", modifiedTime);
    debug("mtime before:", (await fs.stat(pathOnBlot)).mtime);
    const mtime = new Date(modifiedTime);
    debug("mtime to set:", mtime);
    await fs.utimes(pathOnBlot, mtime, mtime);
    debug("mtime after:", (await fs.stat(pathOnBlot)).mtime);
  } catch (e) {
    debug("Error setting mtime", e);
  }
};

const streamToFile = (readStream, filePath) => {
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    readStream.on("error", (err) => {
      writer.destroy();
      reject(err);
    });
    writer.on("error", reject);
    writer.on("finish", () => resolve());
    readStream.pipe(writer);
  });
};

const extractZip = (zipPath, extractDir) => {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (/\/$/.test(entry.fileName)) {
          fs.ensureDir(join(extractDir, entry.fileName)).then(() => {
            zipfile.readEntry();
          }, reject);
        } else {
          const destPath = join(extractDir, entry.fileName);
          zipfile.openReadStream(entry, (openErr, readStream) => {
            if (openErr) return reject(openErr);
            fs.ensureDir(dirname(destPath)).then(() => {
              const writer = fs.createWriteStream(destPath);
              readStream.pipe(writer);
              writer.on("error", reject);
              writer.on("finish", () => zipfile.readEntry());
              readStream.on("error", (e) => {
                writer.destroy();
                reject(e);
              });
            }, reject);
          });
        }
      });
      zipfile.on("end", () => resolve());
      zipfile.on("error", reject);
    });
  });
};

const resolveHtmlAndImagesDir = async (extractDir) => {
  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  let workDir = extractDir;
  if (entries.length === 1 && entries[0].isDirectory()) {
    workDir = join(extractDir, entries[0].name);
  }
  const workEntries = await fs.readdir(workDir, { withFileTypes: true });
  const htmlEntry = workEntries.find(
    (e) => !e.isDirectory() && e.name.toLowerCase().endsWith(".html")
  );
  if (!htmlEntry) throw new Error("No HTML file found in zip");
  const htmlPath = join(workDir, htmlEntry.name);
  const imagesDirPath = join(workDir, "images");
  let imagesDir = null;
  try {
    const stat = await fs.stat(imagesDirPath);
    if (stat.isDirectory()) imagesDir = imagesDirPath;
  } catch (_) {}
  return { htmlPath, imagesDir };
};

module.exports = async (
  blogID,
  drive,
  path,
  { id, md5Checksum, mimeType, modifiedTime }
) => {
  return new Promise(async function (resolve, reject) {
    let pathOnBlot = localPath(blogID, path);
    const tempPath = join(tempDir, guid());
    let settled = false;
    const settle = (action) => {
      if (settled) return;
      settled = true;
      action();
    };

    const handleExportSizeLimit = async (err) => {

      if (!isExportSizeLimitError(err)) {
        return false;
      }

      debug("EXPORT size limit exceeded for file", pathOnBlot);
      
      // For Google Docs, fetch and log exportLinks for debugging
      // if (mimeType === "application/vnd.google-apps.document") {
      //   try {
      //     const fileMetadata = await drive.files.get({
      //       fileId: id,
      //       fields: "exportLinks",
      //     });
      //     console.log("exportLinks for Google Doc:", fileMetadata.data.exportLinks);
      //   } catch (apiError) {
      //     debug("Error fetching exportLinks:", apiError);
      //   }
      // }
      
      await ensurePlaceholderWithMtime(pathOnBlot, modifiedTime);
      debug("   created empty file at:", colors.green(pathOnBlot));
      return true;
    };
    try {
      if (mimeType === "application/vnd.google-apps.folder") {
        await fs.ensureDir(pathOnBlot);
        debug("MKDIR folder");
        debug("   to:", colors.green(pathOnBlot));
        return resolve({ updated: false });
      }

      // create an empty placeholder file for Google App files
      // which are not Documents, e.g. Google Sheets, Slides, etc.
      // this is to avoid downloading them, which would fail
      // because they are not downloadable in the same way as regular files
      if (
        mimeType.startsWith("application/vnd.google-apps.") &&
        mimeType !== "application/vnd.google-apps.document"
      ) {
        await ensurePlaceholderWithMtime(pathOnBlot, modifiedTime);
        debug(
          "SKIP download of file because it is a Google App file type",
          mimeType
        );
        debug("   created empty file at:", colors.green(pathOnBlot));
        return resolve({ updated: false });
      }

      const existingMd5Checksum = await computeMd5Checksum(pathOnBlot);

      if (existingMd5Checksum && md5Checksum === existingMd5Checksum) {
        debug("DOWNLOAD file skipped because md5Checksum matches");
        debug("      path:", path);
        debug("   locally:", existingMd5Checksum);
        debug("    remote:", md5Checksum);
        return resolve({ updated: false });
      }

      debug("DOWNLOAD file");
      debug("   to:", colors.green(pathOnBlot));

      if (mimeType === "application/vnd.google-apps.document") {
        const zipPath = join(tempDir, guid());
        const extractDir = join(tempDir, guid());
        try {
          debug("getting Google Doc as zip from Drive");
          const res = await drive.files.export(
            {
              fileId: id,
              mimeType: "application/zip",
              supportsAllDrives: true,
            },
            { responseType: "stream" }
          );
          await streamToFile(res.data, zipPath);
          await extractZip(zipPath, extractDir);
          const { htmlPath, imagesDir } =
            await resolveHtmlAndImagesDir(extractDir);
          const docHash = hash(path);
          const blogDir = join(config.blog_static_files_dir, blogID);
          const assetDir = join(blogDir, "_assets", docHash);
          await fs.ensureDir(assetDir);
          if (imagesDir) {
            const imageFiles = await fs.readdir(imagesDir);
            for (const name of imageFiles) {
              const srcPath = join(imagesDir, name);
              const st = await fs.stat(srcPath);
              if (st.isFile())
                await fs.copy(srcPath, join(assetDir, name), {
                  overwrite: true,
                });
            }
          }
          const html = await fs.readFile(htmlPath, "utf-8");
          const $ = cheerio.load(html, { decodeEntities: false });
          $("img").each(function () {
            const src = $(this).attr("src");
            if (!src) return;
            const normalized = src.replace(/^\.\//, "").trim();
            if (normalized.startsWith("images/")) {
              const filename = normalized.slice(7);
              $(this).attr("src", "/_assets/" + docHash + "/" + filename);
            }
          });
          await fs.writeFile(pathOnBlot, $.html().trim(), "utf-8");
          try {
            const mtime = new Date(modifiedTime);
            await fs.utimes(pathOnBlot, mtime, mtime);
          } catch (e) {
            debug("Error setting mtime", e);
          }
          await fs.remove(zipPath).catch(() => {});
          await fs.remove(extractDir).catch(() => {});
          debug("DOWNLOAD file SUCCEEDED");
          return resolve({ updated: true });
        } catch (err) {
          await fs.remove(zipPath).catch(() => {});
          await fs.remove(extractDir).catch(() => {});
          const handled = await handleExportSizeLimit(err);
          if (handled) {
            return settle(() =>
              resolve({
                updated: false,
                skippedReason: "exportSizeLimitExceeded",
              })
            );
          }
          return settle(() => reject(err));
        }
      }

      var dest = fs.createWriteStream(tempPath);

      debug("getting file from Drive");
      let data;

      // e.g. google docs, sheets, slides
      if (mimeType === "application/vnd.google-apps.document") {
        const res = await drive.files.export(
          {
            fileId: id,
            mimeType: "text/html",
            supportsAllDrives: true,
          },
          {
            responseType: "stream",
          }
        );

        data = res.data;
      } else {
        const res = await drive.files.get(
          { fileId: id, alt: "media", supportsAllDrives: true },
          { responseType: "stream" }
        );
        data = res.data;
      }

      debug("got file from Drive");

      data
        .on("end", async () => {
          if (settled) return;
          settled = true;
          try {
            await fs.move(tempPath, pathOnBlot, { overwrite: true });
          } catch (e) {
            return reject(e);
          }

          try {
            debug("Setting mtime for file", pathOnBlot, "to", modifiedTime);
            debug("mtime before:", (await fs.stat(pathOnBlot)).mtime);
            const mtime = new Date(modifiedTime);
            debug("mtime to set:", mtime);
            await fs.utimes(pathOnBlot, mtime, mtime);
            debug("mtime after:", (await fs.stat(pathOnBlot)).mtime);
          } catch (e) {
            debug("Error setting mtime", e);
          }

          debug("DOWNLOAD file SUCCEEDED");
          resolve({ updated: true });
        })
        .on("error", (err) => {
          if (settled) return;
          settled = true;
          handleExportSizeLimit(err)
            .then((handled) => {
              if (handled) {
                return resolve({
                  updated: false,
                  skippedReason: "exportSizeLimitExceeded",
                });
              }
              return reject(err);
            })
            .catch((handleError) => reject(handleError));
        })
        .pipe(dest);
    } catch (e) {
      debug("download error", e);
      const handled = await handleExportSizeLimit(e);
      if (handled) {
        return settle(() =>
          resolve({
            updated: false,
            skippedReason: "exportSizeLimitExceeded",
          })
        );
      }
      settle(() => reject(e));
    }
  });
};
