const fs = require("fs-extra");
const moment = require("moment");
const prettySize = require("helper/prettySize");
const tempDir = require("helper/tempDir")();
const { join } = require("path");

// Lists all the imports for a given blog
module.exports = async function (req, res, next) {
  try {
    const imports = await fs.readdir(join(tempDir, "import", req.blog.id));

    res.locals.imports = imports
      .map((i) => {
        let size;
        let started;
        let importedOn;
        let identifier;
        let name;
        let lastStatus;
        let error;
        let cancelled;

        try {
          size = prettySize(
            Math.round(
              fs.statSync(join(tempDir, "import", req.blog.id, i, "result.zip"))
                .size / 1000
            )
          );
        } catch (e) {}

        try {
          const lastDash = i.lastIndexOf("-");
          name = i.slice(0, lastDash);
          const timestamp = parseInt(i.slice(lastDash + 1), 10);
          started = moment(timestamp).fromNow();
          importedOn = moment(timestamp).format("MMM D, YYYY");
        } catch (e) {}

        try {
          cancelled = fs.readFileSync(
            join(tempDir, "import", req.blog.id, i, "cancelled.txt"),
            "utf-8"
          );
        } catch (e) {}

        try {
          identifier = fs.readFileSync(
            join(tempDir, "import", req.blog.id, i, "identifier.txt"),
            "utf-8"
          );
        } catch (e) {}

        try {
          error = fs.readFileSync(
            join(tempDir, "import", req.blog.id, i, "error.txt"),
            "utf-8"
          );
        } catch (e) {}

        try {
          lastStatus = fs.readFileSync(
            join(tempDir, "import", req.blog.id, i, "status.txt"),
            "utf-8"
          );
        } catch (e) {}

        return {
          id: i,
          name,
          icon: name
            ? "/images/configure/" +
                (name.toLowerCase() === "blogger"
                  ? "blogger.svg"
                  : name.toLowerCase() + ".png")
            : undefined,
          identifier,
          cancelled,
          size,
          error,
          lastStatus: !!error ? error : lastStatus,
          started,
          importedOn,
          complete: !!size || !!error,
        };
      })
      .filter((i) => !!i && !!i.name && i.cancelled === undefined);
  } catch (e) {
    //
  }
  next();
};
