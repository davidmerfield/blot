const screenshot = require("helper/screenshot");
const config = require("config");
const { dirname } = require("path");
const root = require("helper/rootDir");
const fs = require("fs-extra");
const TEMPLATES_DIRECTORY = root + "/app/templates/source";
const IMAGE_DIRECTORY = root + "/app/views/images/examples";
// Template gallery previews use a fixed 1060x780 viewport; this is independent
// of entry thumbnail sizing or OG image dimensions.
const TEMPLATE_SCREENSHOT_WIDTH = 1060;
const TEMPLATE_SCREENSHOT_HEIGHT = 780;


const templates = fs
  .readdirSync(TEMPLATES_DIRECTORY)
  .filter((i) => !i.startsWith(".") && !i.endsWith(".md"))
  .map((i) => {
    const template = i;
    const json = fs.readJSONSync(TEMPLATES_DIRECTORY + '/' + template + '/package.json');
    const handle = json.locals.demo_folder || "david";
    const pages = ["/"];

    return pages.map((page, index) => {
      return {
        url: `${config.protocol}preview-of-${template}-on-${handle}.${config.host}${page}`,
        destination: `${IMAGE_DIRECTORY}/${template}/${index}`,
      };
    });
  });


const screenshots = templates.flat();

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
  await screenshot(url, path, {
    width: TEMPLATE_SCREENSHOT_WIDTH,
    height: TEMPLATE_SCREENSHOT_HEIGHT,
  });

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
