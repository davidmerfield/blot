"use strict";

const fs = require("fs");
const path = require("path");

const PROFILE_ROOT = path.resolve(__dirname, "../fixtures/templates");

function readTemplateProfile(profile) {
  if (profile === "default") return null;

  const directory = path.join(PROFILE_ROOT, profile);
  const packageJSON = JSON.parse(
    fs.readFileSync(path.join(directory, "package.json"), "utf8"),
  );
  const views = {};

  for (const name of fs.readdirSync(directory).sort()) {
    if (name === "package.json") continue;
    const file = path.join(directory, name);
    if (fs.statSync(file).isFile()) views[name] = fs.readFileSync(file, "utf8");
  }

  return { packageJSON, views };
}

module.exports = { readTemplateProfile };
