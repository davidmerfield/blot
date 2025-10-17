const config = require("config");
const { join, dirname, basename, extname } = require("path");
const fs = require("fs-extra");
const chokidar = require("chokidar");
const html = require("./html");
const favicon = require("./favicon");
const recursiveReadDir = require("../../helper/recursiveReadDirSync");
const clfdate = require("helper/clfdate");

const SOURCE_DIRECTORY = join(__dirname, "../../views");
const DESTINATION_DIRECTORY = config.views_directory;

const buildCSS = require("./css")({
  source: SOURCE_DIRECTORY,
  destination: DESTINATION_DIRECTORY,
});
const buildJS = require("./js")({
  source: SOURCE_DIRECTORY,
  destination: DESTINATION_DIRECTORY,
});

const zip = require("templates/folders/zip");
const tools = require("./tools");
const generateThumbnail = require("./generate-thumbnail");
const gitCommits = require("../tools/git-commits").build;

const handle =
  (initial = false) =>
  async (path) => {
    try {
      console.time("Processed " + path);

      if (path.endsWith("README")) {
        console.timeEnd("Processed " + path);
        return;
      }

      if (path.includes("tools/")) {
        if (initial) {
          console.timeEnd("Processed " + path);
          return;
        }
        console.log("Rebuilding tools");
        await tools();
        console.timeEnd("Processed " + path);
        return;
      }

      if (path.includes("images/examples") && path.endsWith(".png")) {
        await fs.copy(
          join(SOURCE_DIRECTORY, path),
          join(DESTINATION_DIRECTORY, path)
        );
        await generateThumbnail(
          join(SOURCE_DIRECTORY, path),
          join(
            DESTINATION_DIRECTORY,
            dirname(path),
            basename(path, extname(path)) + "-thumb.png"
          )
        );
         await generateThumbnail(
          join(SOURCE_DIRECTORY, path),
          join(
            DESTINATION_DIRECTORY,
            dirname(path),
            basename(path, extname(path)) + "-icon.png"
          ),
          { width: 48 }
        );
      } else if (path.endsWith(".html") && !path.includes("dashboard/")) {
        await buildHTML(path);
      } else if (path.endsWith(".css") && !initial) {
        await fs.copy(
          join(SOURCE_DIRECTORY, path),
          join(DESTINATION_DIRECTORY, path)
        );
        await buildCSS();
      } else if (path.endsWith(".js") && !initial) {
        await fs.copy(
          join(SOURCE_DIRECTORY, path),
          join(DESTINATION_DIRECTORY, path)
        );
        await buildJS();
      } else {
        await fs.copy(
          join(SOURCE_DIRECTORY, path),
          join(DESTINATION_DIRECTORY, path)
        );
      }
      console.timeEnd("Processed " + path);
    } catch (e) {
      console.error(e);
      console.timeEnd("Processed " + path);
    }
  };

module.exports = async ({ watch = false } = {}) => {
  const now = Date.now();

  // we only reset the destination directory in production
  if (config.environment !== "development") {
    await fs.emptyDir(DESTINATION_DIRECTORY);
  } else {
    await fs.ensureDir(DESTINATION_DIRECTORY);
  }

  console.log(clfdate(), "Building documentation from", SOURCE_DIRECTORY);

  await zip();

  console.log(clfdate(), "Generating favicon.ico from logo.svg");
  await favicon(
    join(SOURCE_DIRECTORY, "images/logo.svg"),
    join(DESTINATION_DIRECTORY, "favicon.ico")
  );

  const paths = recursiveReadDir(SOURCE_DIRECTORY).map((path) =>
    path.slice(SOURCE_DIRECTORY.length + 1)
  );

  const initialHandler = handle(true);

  console.log(clfdate(), "Processing", paths.length, "files");
  await Promise.all(paths.map(initialHandler));

  console.log(clfdate(), "Generating tools documentation");
  await tools();

  console.log(clfdate(), "Building CSS");
  await buildCSS();

  console.log(clfdate(), "Building JS");
  await buildJS();

  try {
    console.log(clfdate(), "Generating list of recent activity for the news page");
    await gitCommits();
    console.log(clfdate(), "Generated list of recent activity for the news page");
  } catch (e) {
    console.error(
      "Failed to generate list of recent activity for the news page"
    );
    console.error(e);
  }

  console.log(clfdate(), "Build completed in", (Date.now() - now) / 1000, "seconds");

  if (watch) {
    const handler = handle();

    chokidar
      .watch(SOURCE_DIRECTORY, {
        cwd: SOURCE_DIRECTORY,
        ignoreInitial: true,
      })
      .on("all", async (event, path) => {
        if (path) handler(path);
      });
  }
};

async function buildHTML(path) {
  const contents = await fs.readFile(join(SOURCE_DIRECTORY, path), "utf-8");
  const result = await html(contents);

  await fs.outputFile(join(DESTINATION_DIRECTORY, path), result);
}

if (require.main === module) {
  console.log("Building documentation");
  module.exports();
  console.log("Documentation built");
}
