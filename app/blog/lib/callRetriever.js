// Invoke a retriever that may be either:
//   - async (req, res) => value
//   - (req, res, callback) => callback(err, value)
// Returns a Promise that resolves to the retrieved value.
module.exports = async function callRetriever(fn, req, res) {
  let settled = false;

  return new Promise((resolve, reject) => {
    let result;

    try {
      result = fn(req, res, (err, value) => {
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
