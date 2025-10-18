module.exports = {
  all: function (blogID) {
    return "blog:" + blogID + ":tags:all";
  },
  tag: function (blogID, normalizedTag) {
    return "blog:" + blogID + ":tags:entries:" + normalizedTag;
  },
  sortedTag: function (blogID, normalizedTag) {
    return "blog:" + blogID + ":tags:entries-by-dateStamp:" + normalizedTag;
  },
  entry: function (blogID, entryID) {
    return "blog:" + blogID + ":tags:entry:" + entryID;
  },
  name: function (blogID, normalizedTag) {
    return "blog:" + blogID + ":tags:name:" + normalizedTag;
  },
};
