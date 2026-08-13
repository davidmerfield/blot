const yauzl = require("yauzl");
const UploadValidationError = require("./upload-validation-error");
const {
  UPLOAD_MAX_RAW_FILES,
  UPLOAD_MAX_TOTAL_BYTES,
} = require("./constants");

// Reads an uploaded zip into the same { relativePath, buffer } records a
// folder drop produces, so everything downstream is identical.
//
// This is only responsible for not letting a hostile archive exhaust memory.
// Path policy — absolute paths, upward navigation, hidden files, nesting —
// belongs to parse-uploaded-template, so a zip and a folder are judged by
// exactly the same rules and produce the same messages.

const readEntry = (zipfile, entry) =>
  new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) return reject(err);

      const chunks = [];
      let size = 0;

      stream.on("data", (chunk) => {
        size += chunk.length;

        // The header can lie about uncompressedSize, so cap what we actually
        // read as well as what the archive claims
        if (size > UPLOAD_MAX_TOTAL_BYTES) {
          stream.destroy();
          return reject(
            new UploadValidationError([
              {
                path: entry.fileName,
                reason: "size",
                message: "This zip file contains more than it declares",
              },
            ])
          );
        }

        chunks.push(chunk);
      });

      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  });

module.exports = function unzipUpload (zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        return reject(
          new UploadValidationError([
            {
              reason: "zip",
              message: "This file is not a zip archive we can read",
            },
          ])
        );
      }

      const entries = [];
      let declaredBytes = 0;
      let scanned = 0;
      let settled = false;

      const fail = (error) => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(error);
      };

      zipfile.on("error", () =>
        fail(
          new UploadValidationError([
            {
              reason: "zip",
              message: "This zip archive could not be read",
            },
          ])
        )
      );

      zipfile.on("entry", async (entry) => {
        // Count every record, not only the ones which become files. A
        // directory-only tree costs almost nothing to store but still has to
        // be walked, so skipping the count here would leave the cap
        // bypassable by an archive well inside the size limit.
        scanned++;

        if (scanned > UPLOAD_MAX_RAW_FILES) {
          return fail(
            new UploadValidationError([
              {
                reason: "count",
                message: "This zip file contains far more than a template can use",
              },
            ])
          );
        }

        // Directory entries carry no content of their own
        if (entry.fileName.endsWith("/")) return zipfile.readEntry();

        declaredBytes += entry.uncompressedSize || 0;

        if (declaredBytes > UPLOAD_MAX_TOTAL_BYTES) {
          return fail(
            new UploadValidationError([
              {
                reason: "size",
                message: "This zip file contains too much to be a template",
              },
            ])
          );
        }

        try {
          const buffer = await readEntry(zipfile, entry);
          entries.push({ relativePath: entry.fileName, buffer });
          zipfile.readEntry();
        } catch (readError) {
          fail(readError);
        }
      });

      zipfile.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(entries);
      });

      zipfile.readEntry();
    });
  });
};
