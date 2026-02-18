var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var serial = require("./serial");
var applyImageExif = require("./util/imageExif").apply;
var applyConverters = require("./util/converters").apply;

module.exports = function get(by, callback) {
  ensure(by, "object").and(callback, "function");

  if (by.id) {
    ensure(by.id, "string");
    then(null, by.id);
  } else if (by.domain) {
    ensure(by.domain, "string");
    client.get(key.domain(by.domain), then);
  } else if (by.handle) {
    ensure(by.handle, "string");
    client.get(key.handle(by.handle), then);
  } else {
    console.log(by);
    throw "Please specify a by property";
  }

  function then(err, blogID) {
    if (err) return callback(err);

    if (!blogID) return callback(null);

    client.hgetall(key.info(blogID), function (err, blog) {
      if (err) return callback(err);

      if (!blog) return callback(null);

      blog = serial.de(blog);
      applyImageExif(blog);
      applyConverters(blog);

      callback(null, blog);
    });
  }
};
