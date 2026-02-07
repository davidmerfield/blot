const fs = require("fs-extra");
const localPath = require("helper/localPath");
const colors = require("colors/safe");
const join = require("path").join;
const debug = require("debug")("blot:clients:google-drive:download");
const tempDir = require("helper/tempDir")();
const guid = require("helper/guid");
const computeMd5Checksum = require("../util/md5Checksum");

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
