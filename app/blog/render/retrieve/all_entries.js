const getAllCached = require("./helpers/getAllCached");
const projectEntryFields = require("./helpers/projectEntryFields");
const asRetriever = require("../../lib/asRetriever");

async function allEntries(req, res) {
  const allEntriesList = await getAllCached(req.blog);

  return projectEntryFields(allEntriesList, req.retrieve, [
    "allEntries",
    "all_entries",
  ]);
};

module.exports = asRetriever(allEntries);
