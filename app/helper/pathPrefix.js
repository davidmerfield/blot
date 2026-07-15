function normalizePathPrefix(prefix) {
  if (typeof prefix !== "string") return null;

  var trimmed = prefix.trim();
  if (!trimmed) return null;

  return trimmed[0] === "/" ? trimmed : "/" + trimmed;
}

function filterEntryIDsByPathPrefix(entryIDs, pathPrefix) {
  var normalizedPrefix = normalizePathPrefix(pathPrefix);
  var ids = Array.isArray(entryIDs) ? entryIDs : [];

  if (!normalizedPrefix) return ids;

  return ids.filter(function (entryID) {
    return typeof entryID === "string" && entryID.startsWith(normalizedPrefix);
  });
}

module.exports = {
  normalizePathPrefix,
  filterEntryIDsByPathPrefix,
};
