// usage
// node index.js collection-label <URL_TO_ITEM_OR_COLLECTION>

const cache_directory = __dirname + "/data/cache";
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const sharp = require("sharp");
const fs = require("fs-extra");
const makeSlug = require("helper/makeSlug");
const fetchItem = require("./fetchItem");
// https://www.loc.gov/pictures/search/?q=California&fa=displayed%3Aanywhere&sp=1&co=pga


const buildItem = async item => {
  // create a folder for the collection
  const folder = `./data/${collection}`;
  fs.ensureDirSync(folder);

  // create a folder for this item
  const itemFolder = `${folder}/${makeSlug(title)}`;

  fs.ensureDirSync(itemFolder);

  // download the master image

  // create a jpg preview
  const previewPath = `${itemFolder}/image.jpg`;
  console.log("Creating preview...");
  const modifiedFileName = fs
    .readdirSync(itemFolder)
    .find(i => i.startsWith("modified."));

  const masterFileName = fs
    .readdirSync(itemFolder)
    .find(i => i.startsWith("master."));

  const path = `${itemFolder}/${modifiedFileName || masterFileName}`;

  // ensure the input image is no larger than 2500px in any dimension
  await sharp(path)
    .resize(2500, 2500, {
      fit: "inside"
    })
    .jpeg({
      mozjpeg: true
    })
    .toFile(previewPath);

  fs.outputFileSync(
    `${itemFolder}/item.txt`,
    `Title: ${title}
    Date: ${date}
    Tags: ${tags.join(", ")}
    Source: ${source}
    Collection: ${collection}
    Medium: ${medium}
    
    ![${title}](image.jpg)
    
    ${summary}
    `
  );
};

// in series, fetch each url after,
// log the index of the current url against the total number of urls
// and then wait 2 seconds before fetching the next url
// if getItem throws an error, re-attempt it twice before giving up
// and proceed to the next url after logging the error
const fetchURLs = async urls => {
  for (let i = 0; i < urls.length; i++) {
    console.log(`Fetching ${i + 1} of ${urls.length}`);
    // the url path will somewhere contain the substring "/item/${itemID}"
    // so extract the itemID from the url with a regex
    const itemID = urls[i].match(/\/item\/(\d+)\//)[1];

    if (!itemID) {
      console.log("Invalid URL");
      continue;
    }

    try {
      await fetchItem(itemID);
    } catch (e) {
      console.error(e);
      console.log("Retrying...");
      try {
        await fetchItem(itemID);
      } catch (e) {
        console.error(e);
        console.log("Retrying...");
        try {
          await fetchItem(itemID);
        } catch (e) {
          console.error(e);
          console.log("Skipping...");
        }
      }
    }
  }
  console.log("Done");
};

if (require.main === module) {
  const url = process.argv[2];

  if (fs.existsSync(url)) {
    const urls = fs.readFileSync(url, "utf-8").split("\n");
    fetchURLs(urls);
  } else if (url && url.startsWith("http")) {
    // if the url contains the substring "/item/", then it's an item
    // otherwise, it's a search page
    if (url.includes("/item/")) {
      fetchURLs([url]);
    } else {
      listItemsFromSearch(url).then(fetchURLs);
    }
  } else {
    console.log("Invalid URL");
    console.log("Usage: node index.js <URL_TO_ITEM_OR_COLLECTION>");
    process.exit(1);
  }
}
