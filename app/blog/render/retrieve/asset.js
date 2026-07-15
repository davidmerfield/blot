module.exports = function (req, res, callback) {
  return callback(null, function () {
    return function (text, render) {
      let extension;

      if (text.lastIndexOf(".") > -1 && text.lastIndexOf(".") < text.length + 2)
        extension = text.slice(text.lastIndexOf("."));

      if (!text.startsWith("/")) text = "/" + text;

      if (extension)
        text = text + "?cache={{cacheID}}&amp;extension=" + extension;

      return render(text);
    };
  });
};
