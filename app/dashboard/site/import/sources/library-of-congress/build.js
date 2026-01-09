const fs = require("fs-extra");
const sharp = require("sharp");
const makeSlug = require("helper/makeSlug");
const cache_directory = __dirname + "/data/cache";

const prepositions = [
  "at",
  "in",
  "on",
  "of",
  "a",
  "the",
  "found",
  "during",
  "from",
  "where"
];

module.exports = async (folder, item) => {
  // remove any slashes from the slug
  const titleWithoutTextInParentheses = item.title.replace(/\(.*\)/g, "");

  const markdownSafeTitle = item.title
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

  const words = titleWithoutTextInParentheses
    ? titleWithoutTextInParentheses.split(" ").map(w => w.replace(/\//g, ""))
    : item.title.split(" ").map(w => w.replace(/\//g, ""));

  // select the words to use in the slug
  // if there is 1 word, use it
  // if there are 2 words, use them
  // if there are three words, use all of them
  // if there are more than 3 words, use up to 4 words, as long as the last word is not a preposition
  let wordsForSlug = words.slice(0, 5);

  while (
    wordsForSlug.length > 1 &&
    prepositions.includes(wordsForSlug.at(-1))
  ) {
    wordsForSlug.pop();
  }

  const slug = makeSlug(wordsForSlug.join(" "));

  let itemFolder = `${folder}/Posts/${slug}`;
  let suffix = 1;

  while (fs.existsSync(itemFolder)) {
    suffix++;
    itemFolder = `${folder}/Posts/${slug}-${suffix}`;
  }

  // create a folder for this item
  fs.emptyDirSync(itemFolder);

  // create a jpg preview
  const previewName = `_${wordsForSlug.join(" ")}.jpg`;
  const previewPath = `${itemFolder}/${previewName}`;

  console.log("Creating preview...");

  const modifiedFileName = fs
    .readdirSync(`${cache_directory}/${item.id}`)
    .find(i => i.startsWith("modified."));

  const masterFileName = fs
    .readdirSync(`${cache_directory}/${item.id}`)
    .find(i => i.startsWith("master."));

  const path = `${cache_directory}/${item.id}/${
    modifiedFileName || masterFileName
  }`;

  // ensure the input image is no larger than 2500px in any dimension
  await sharp(path)
    .resize(2500, 2500, {
      fit: "inside",
      withoutEnlargement: true
    })
    .toFile(previewPath);

  fs.outputFileSync(
    `${itemFolder}/item.txt`,
    `Title: ${item.title}
Date: ${item.date}
Tags: ${item.tags.join(", ")}

![${markdownSafeTitle}](${previewName})

${item.summary}

Medium: ${item.medium}

Source: ${item.source}`
  );
};
