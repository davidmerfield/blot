const fs = require("fs-extra");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const cache_directory = __dirname + "/data/cache";

module.exports = async id => {
  const pageHTML = `${cache_directory}/${id}/page.html`;
  const pageURL = `https://www.loc.gov/pictures/item/${id}/`;

  if (!fs.existsSync(pageHTML)) {
    // wait 1 second to avoid triggering the rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));

    const page = await fetch(pageURL);

    if (page.status !== 200) {
      throw new Error("Bad status: " + page.status);
    }

    fs.outputFileSync(pageHTML, await page.text(), "utf-8");
  }

  const $ = cheerio.load(fs.readFileSync(pageHTML, "utf-8"));

  const json = await getMarcRecord(id);

  const masterURL = $("#item p:nth-child(2) a[href*='/master/']")
    .first()
    .attr("href");

  if (
    !fs
      .readdirSync(`${cache_directory}/${id}`)
      .find(i => i.startsWith("master."))
  ) {
    console.log("Downloading master image...");

    const masterPath = `${cache_directory}/${id}/master.${masterURL
      .split(".")
      .at(-1)}`;

    const master = await fetch(masterURL);
    const masterBuffer = await master.buffer();
    fs.outputFileSync(masterPath, masterBuffer);
    console.log("Master image downloaded");
  } else {
    console.log("Master image already exists");
  }

  let title = json["242"]
    ? json["242"][0][0].text
    : json["245"]
    ? json["245"][0][0].text
    : "";

  if (!title) {
    console.log(pageURL);
    console.log(JSON.stringify(json, null, 2));
    throw new Error("No title found");
  } else if (title.startsWith("[") && title.endsWith("]")) {
    title = title.slice(1, -1);
  } else {
    title = title.replace(/\s*[\(\[].*?[\)\]]/g, "");
  }

  const summary = json["520"] ? json["520"][0][0].text : "";
  const medium = json["300"][0]
    .map(i => i.text.replace(/[:;]/g, "").trim())
    .join("; ");
  const collection = json["985"][0][0].text.split("/")[1];
  let date = json["260"][0]
    .find(i => i.code === "c")
    .text.replace(/[^0-9 ]/g, "");

  // if there are multiple years in the date, use the first one
  if (
    date.includes(" ") &&
    date.split(" ").filter(i => i.length === 4).length > 1
  ) {
    date = date.split(" ").filter(i => i.length === 4)[0];
  }

  const tags = json["650"].map(i => i[0].text.replace(/[$.]/g, ""));

  const item = {
    id,
    title,
    tags,
    summary,
    medium,
    masterURL,
    collection,
    source: pageURL,
    date
  };

  return item;
};

const getMarcRecord = async id => {
  const marcHTML = `${cache_directory}/${id}/marc.html`;

  if (!fs.existsSync(marcHTML)) {
    const marcURL = `https://www.loc.gov/pictures/item/${id}/marc/`;

    // wait 1 second to avoid triggering the rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));

    const marcPage = await fetch(marcURL);

    if (marcPage.status !== 200) {
      throw new Error("Bad status: " + marcPage.status);
    }

    fs.outputFileSync(marcHTML, await marcPage.text(), "utf-8");
  }

  const $ = cheerio.load(fs.readFileSync(marcHTML, "utf-8"));

  const result = {};

  let item;

  $("tr").each((i, el) => {
    const row = $(el);

    const cells = row.find("td");

    if (!cells.length) return;

    const tag = cells.first().text().trim();
    const code = cells.eq(3).text().trim();
    const text = cells.last().text().trim();

    if (tag) {
      if (item) {
        result[item.tag] = result[item.tag] || [];
        result[item.tag].push(item.children);
      }

      item = {
        tag,
        children: [
          {
            code,
            text
          }
        ]
      };
    } else {
      item.children.push({
        code,
        text
      });
    }
  });

  return result;
};
