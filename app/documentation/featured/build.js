// Should only run on my machine, transforms the text-file
// which is written by humans into JSON to be read by machines
// It will build the images inside the avatars directory into
// thumbnails. This could be extended to fetch other data
// about sites featured on the homepage, like template used...

const THUMBNAIL_SIZE = 96;
const { toUnicode } = require("helper/punycode");

const sharp = require("sharp");
const spritesmith = require("spritesmith");
const fs = require("fs-extra");
const { parse } = require("url");
const { join } = require("path");

const config = require("config");
const avatarDirectory = __dirname + "/avatars";
const thumbnailDirectory = config.tmp_directory + "/featured/thumbnails";
const spriteDestination = __dirname + "/../../views/images/featured.jpg";
const verifySiteIsOnline = require("./verifySiteIsOnline");

if (require.main === module) {
  build(async (err, sites) => {
    if (err) throw err;
    await fs.outputJson(__dirname + "/featured.json", sites, { spaces: 2 });
    // purge the cached version of the featured sites
    await fs.remove(config.data_directory + "/featured");
    process.exit();
  });
}

async function build(callback) {
  const avatars = (await fs.readdir(avatarDirectory)).filter(
    (i) => !i.startsWith(".")
  );

  let sites = (await fs.readFile(__dirname + "/sites.txt", "utf-8"))
    .split("\n")
    .filter((i) => i)
    .map((line) => {
      var words = line.split(" ");
      var link = "https://" + words[1];
      var name = words.slice(2).join(" ").split(",")[0];
      var bio = tidy(
        words.slice(2).join(" ").split(",").slice(1).join(",").trim()
      );
      var host = toUnicode(parse(link).host);

      if (!avatars.find((i) => i.startsWith(host)))
        throw new Error("Missing avatar for " + host);

      return {
        link,
        host,
        name,
        bio,
        avatar: join(
          avatarDirectory,
          avatars.find((i) => i.startsWith(host))
        ),
      };
    });

  // if there are some avatars without a corresponding site
  // log them and remove them from the list
  const missingAvatars = avatars.filter(
    (avatar) => !sites.find((site) => avatar.startsWith(site.host))
  );


  // remove the avatars without a corresponding site
  for (let avatar of missingAvatars) {
    console.log("Removing avatar without corresponding site", avatar);
    await fs.remove(join(avatarDirectory, avatar));
  }

  sites = await Promise.all(
    sites.map(async (site) => {
      const isOnline = await verifySiteIsOnline(site.host);
      return isOnline ? site : null;
    })
  ).then((sites) => sites.filter((i) => i));

  sites = await generateSprite(sites);

  callback(null, sites);
}

const tidy = (bio) => {
  // if the bio ends with 'based in...' or 'from ...'
  // remove everything after that
  bio = bio.trim();

  const basedIn = bio.indexOf(" based in ");

  if (basedIn > -1) {
    bio = bio.slice(0, basedIn);
  }

  const from = bio.indexOf(" from ");

  if (from > -1) {
    bio = bio.slice(0, from);
  }

  return bio;
};

async function generateSprite(sites) {
  await fs.emptyDir(thumbnailDirectory);

  for (let site of sites) {
    const path = join(thumbnailDirectory, site.host + ".jpg");
    await sharp(site.avatar)
      .resize({
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        fit: sharp.fit.cover,
        position: sharp.strategy.entropy,
      })
      .toFormat("jpeg")
      .jpeg({
        quality: 90,
      })
      .toFile(path);

    site.thumbnail = path;
  }

  // use spritesmith to generate a sprite and output it to thumbnailDirectory/sprite.jpg
  // then append the coordinates to each site
  const { width, height } = await new Promise((resolve, reject) => {
    // how do we set the dest path of the sprite?
    // we need to set the dest path of the sprite to thumbnailDirectory/sprite.jpg
    spritesmith.run(
      {
        src: sites.map((site) => site.thumbnail),
      },
      (err, result) => {
        if (err) return reject(err);

        const { coordinates, properties } = result;
        const { width, height } = properties;

        sites.forEach((site) => {
          const { x, y } = coordinates[site.thumbnail];
          site.x = x / 2;
          site.y = y / 2;
          delete site.thumbnail;
          delete site.avatar;
        });

        fs.outputFile(spriteDestination, result.image, "binary", (err) => {
          if (err) return reject(err);
          resolve({ width, height });
        });
      }
    );
  });

  // return relative path to views directory of the sprite
  const sprite = spriteDestination.replace(__dirname + "/../../views", "");

  await fs.outputFile(
    __dirname + "/sites.filtered.txt",
    (
      await fs.readFile(__dirname + "/sites.txt", "utf-8")
    )
      .split("\n")
      .filter((i) => i)
      .filter((line) => sites.find((site) => line.includes(site.host)))
      .join("\n"),
    "utf-8"
  );

  await fs.outputFile(
    __dirname + "/sites.missing.txt",
    (
      await fs.readFile(__dirname + "/sites.txt", "utf-8")
    )
      .split("\n")
      .filter((i) => i)
      .filter((line) => !sites.find((site) => line.includes(site.host)))
      .join("\n"),
    "utf-8"
  );

  // empty the thumbnail directory
  await fs.emptyDir(thumbnailDirectory);

  return {
    width: width / 2,
    height: height / 2,
    sprite,
    sites,
    thumbnail_width: THUMBNAIL_SIZE / 2,
  };
}
