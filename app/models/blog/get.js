var client = require("models/client");
var ensure = require("helper/ensure");
var key = require("./key");
var serial = require("./serial");
var applyImageExif = require("./util/imageExif").apply;
var applyConverters = require("./util/converters").apply;

module.exports = function get(by, callback) {
  ensure(by, "object").and(callback, "function");

  (async function () {
    try {
      var blogID;

      if (by.id) {
        ensure(by.id, "string");
        blogID = by.id;
      } else if (by.domain) {
        ensure(by.domain, "string");
        blogID = await client.get(key.domain(by.domain));
      } else if (by.handle) {
        ensure(by.handle, "string");
        blogID = await client.get(key.handle(by.handle));
      } else {
        console.log(by);
        throw "Please specify a by property";
      }

      if (!blogID) return callback(null);

      var blog = await client.hGetAll(key.info(blogID));

      if (!blog || !Object.keys(blog).length) return callback(null);

      blog = serial.de(blog);
      applyImageExif(blog);
      applyConverters(blog);

      callback(null, blog);
    } catch (err) {
      callback(err);
    }
  })();
};
