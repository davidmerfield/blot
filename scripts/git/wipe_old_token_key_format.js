var redis = require("redis").createClient();
var each = require("../each/blog");

each(function (user, blog, next) {
  redis.del("blog:" + blog.id + ":git:token", function (err, stat) {
    if (err) throw err;
    if (stat) console.log("DEL: blog:" + blog.id + ":git:token");
    next();
  });
}, process.exit);
