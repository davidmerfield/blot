const config = require("config");
const { hasMustache } = require("../render/retrieve/helpers/withEntryFields");

// Async version of withEntryFields. Prefer this from async retrievers;
// the callback-based helper remains for any legacy call sites.
module.exports = async function withEntryFieldsAsync(narrowFetch, fullFetch) {
  if (!config.redis.readEntriesFromHash) {
    return narrowFetch();
  }

  const entries = await narrowFetch();
  if (hasMustache(entries)) return fullFetch();
  return entries;
};
