// todo turn this into a github action? runs when changes made automatically?

const screenshot = require("helper/screenshot");
const config = require("config");
const { dirname } = require("path");
const root = require("helper/rootDir");
const fs = require("fs-extra");
const TEMPLATES_DIRECTORY = root + "/app/templates/source";
const FOLDERS_DIRECTORY = root + "/app/templates/folders";
const IMAGE_DIRECTORY = root + "/app/views/images/examples";

const templateOptions = {
  blog: {
    handle: "david",
  },
  magazine: {
    handle: "plants",
  },
  grid: {
    handle: "botanist",
  },
  photo: {
    handle: "william",
  },
  portfolio: {
    handle: "bjorn",
  },
  "photo-old": {
    handle: "photographer",
  },
  scroll: {
    handle: "illustrator",
  },
  terminal: {
    handle: "photographer",
  },
  reference: {
    handle: "bjorn",
  },
  blank: {
    handle: "david",
  },
  isola: {
    handle: "writer",
  },
  marfa: {
    handle: "david",
  },
};

// you don't need to do this for folders with
// a template in the Templates folder
const foldersOptions = {
  bjorn: {
    template: "portfolio",
  },
  david: {
    template: "blog",
  },
};

const templates = fs
  .readdirSync(TEMPLATES_DIRECTORY)
  .filter((i) => !i.startsWith(".") && !i.endsWith(".md"))
  .map((i) => {
    const handle = templateOptions[i] ? templateOptions[i].handle : "david";
    const template = i;
    const pages =
      templateOptions[i] && templateOptions[i].pages
        ? templateOptions[i].pages
        : ["/"];

    return pages.map((page, index) => {
      return {
        url: `${config.protocol}preview-of-${template}-on-${handle}.${config.host}${page}`,
        destination: `${IMAGE_DIRECTORY}/${template}/${index}`,
      };
    });
  });

const folders = fs
  .readdirSync(FOLDERS_DIRECTORY)
  .filter((i) => !i.startsWith(".") && !i.endsWith(".md") && !i.endsWith(".js"))
  .map((folder) => {
    const pages =
      foldersOptions[folder] && foldersOptions[folder].pages
        ? foldersOptions[folder].pages
        : ["/"];
    const template =
      foldersOptions[folder] && foldersOptions[folder].template
        ? foldersOptions[folder].template
        : fs.existsSync(`${FOLDERS_DIRECTORY}/${folder}/Templates`)
        ? `my-${
            fs
              .readdirSync(`${FOLDERS_DIRECTORY}/${folder}/Templates`)
              .filter((i) => !i.startsWith("."))[0]
          }`
        : "blog";
    return pages.map((page, index) => {
      return {
        url: `${config.protocol}preview-of-${template}-on-${folder}.${config.host}${page}`,
        destination: `${IMAGE_DIRECTORY}/${folder}/${index}`,
      };
    });
  });

const screenshots = templates.concat(folders).flat();

const main = async () => {
  console.log(screenshots);

  console.log("Emptying image directory", IMAGE_DIRECTORY);
  await fs.emptyDir(IMAGE_DIRECTORY);

  console.log("Taking screenshots");
  for (const screenshot of screenshots) {
    try {
      // if the screenshot takes longer than 15 seconds, it's probably not going to work
      // so we should just skip it
      await Promise.race([
        takeScreenshot(screenshot),
        new Promise((resolve, reject) => {
          setTimeout(() => reject("Timeout"), 15000);
        }),
      ]);
    } catch (error) {
      console.error(error);
    }
  }
};

const takeScreenshot = async ({ url, destination }) => {
  await fs.ensureDir(dirname(destination));

  const path = `${destination}.png`;

  console.log(`Taking screenshot of ${url} to ${path}`);
  await screenshot(url, path, { width: 1060, height: 780 });

  const mobilePath = `${destination}.mobile.png`;
  console.log(`Taking mobile screenshot of ${url} to ${mobilePath}`);
  await screenshot(url, mobilePath, { mobile: true });
};

module.exports = main;

if (require.main === module) {
  main()
    .then(() => {
      console.log("Done!");
      process.exit();
    })
    .catch(console.error);
}
