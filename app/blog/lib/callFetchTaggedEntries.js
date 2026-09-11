// Invoke fetchTaggedEntries whether it is:
//   - async and returns a Promise (production helper)
//   - callback-style (test stubs that never return a Promise)
module.exports = function callFetchTaggedEntries(fetchTaggedEntries, blogID, tags, options) {
  return new Promise((resolve, reject) => {
    let settled = false;

    let result;
    try {
      result = fetchTaggedEntries(blogID, tags, options, (err, value) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(value);
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        reject(err);
      }
      return;
    }

    if (result && typeof result.then === "function") {
      result.then(
        (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        },
        (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        }
      );
    }
  });
};
