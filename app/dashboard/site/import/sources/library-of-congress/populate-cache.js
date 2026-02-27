const fs = require("fs-extra");
const cache_dir = __dirname + "/data/cache";

const populateCache = async () => {
  const collections = fs
    .readdirSync(__dirname + "/data")
    .filter(i => !i.startsWith("."))
    .filter(i => i !== "cache");

  for (const collection of collections) {
    console.log("Collection: " + collection);
    const items = fs
      .readdirSync(__dirname + "/data/" + collection)
      .filter(i =>
        fs.statSync(__dirname + "/data/" + collection + "/" + i).isDirectory()
      );
    for (const item of items) {
      console.log("Item: " + item);
      const pathToItem =
        __dirname + "/data/" + collection + "/" + item + "/item.txt";
      const masterFile =
        __dirname + "/data/" + collection + "/" + item + "/master.tif";

      if (!fs.existsSync(pathToItem)) {
        console.log("No item.txt found");
        continue;
      }

      if (!fs.existsSync(masterFile)) {
        console.log("No master.tif found");
        continue;
      }

      const fileContents = fs.readFileSync(pathToItem, "utf-8");

      // there is a line inside which contains the string 'Source: https...' so extract the url up to the end of the line without including 'Source: '
      const source = fileContents.match(/Source: (.*)/)[1];
      // source url contains the string /item/$ID so extract the ID without the trailing slash
      const id = source.match(/\/item\/(.*)\//)[1];

      console.log("ID: " + id);
      console.log("Source: " + source);

      fs.copySync(masterFile, cache_dir + "/" + id + "/master.tif");
    }
  }
};

if (require.main === module) {
  populateCache();
}
