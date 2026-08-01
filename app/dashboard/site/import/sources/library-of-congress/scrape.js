// usage
// node scrape.js <LABEL>

// will look inside directory ./data/<LABEL> for a file:
// index-urls.txt

// for each url in the file, it will fetch any item URLs from the index url
// and then concatenate them with the item URLs already defined in the file:
// urls.txt

// with this master list of item URLs, it will then scrape
// the loc item pages and marc records for each item, and then save those to
// the cache directory for the collection

const fs = require("fs-extra");
const DATA_DIR = __dirname + "/data";
const fetchItemURLs = require("./fetchItemURLs");
const fetchItem = require("./fetchItem");
const build = require("./build");

const main = async label => {
  if (!label) {
    console.log("No label provided");
    process.exit(1);
  }

  const folder = `${DATA_DIR}/${label}`;

  if (!fs.existsSync(folder)) {
    console.log(`No data directory found for ${label} at ${folder}`);
    process.exit(1);
  }

  const indexURLFile = `${folder}/index-urls.txt`;
  const itemURLFile = `${folder}/urls.txt`;

  const itemURLs = [];

  const indexURLs = [];

  if (fs.existsSync(itemURLFile)) {
    itemURLs.push(...fs.readFileSync(itemURLFile, "utf-8").split("\n"));
  }

  if (fs.existsSync(indexURLFile)) {
    indexURLs.push(...fs.readFileSync(indexURLFile, "utf-8").split("\n"));
  }

  for (const indexURL of indexURLs) {
    const urls = await fetchItemURLs(indexURL);
    itemURLs.push(...urls);
  }

  const ids = Array.from(
    new Set(
      itemURLs.map(url => {
        const id = url.match(/\/item\/(\d+)/)[1];
        console.log(id, url);

        return id;
      })
    )
  ).sort();

  console.log(`Found ${ids.length} unique items`);

  console.log(`Emptying ${folder}/Posts`);
  await fs.emptyDirSync(folder + "/Posts");

  for (const id of ids) {
    const item = await fetchItem(id);
    await build(folder, item);
  }
};

if (require.main === module) {
  main(process.argv[2]);
}
