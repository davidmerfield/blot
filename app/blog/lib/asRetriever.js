// Wrap an async retriever so it supports both:
//   await retriever(req, res)
//   retriever(req, res, (err, value) => ...)
// Existing tests and route code use the callback form.
module.exports = function asRetriever(fn) {
  return function (req, res, callback) {
    const promise = Promise.resolve().then(() => fn(req, res));

    if (typeof callback === "function") {
      promise.then((value) => callback(null, value), callback);
      return;
    }

    return promise;
  };
};
