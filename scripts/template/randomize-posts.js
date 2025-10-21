// will randomize all the dates associated with each blog post
// useful for testing template designs

var get = require("../get/blog");
var moment = require("moment");
var Entries = require("models/entries");
var Entry = require("models/entry");

var identifier = process.argv[2];
var limit = process.argv[3];
var end = moment();

if (limit) {
  limit = moment(new Date(limit));
} else {
  limit = moment().subtract(2, "years");
}

console.log("Randomizing dates for all entries without date metadata...");
console.log("Start date: " + limit.format());
console.log("End date: " + end.format());

get(identifier, function (err, user, blog) {
  Entries.each(
    blog.id,
    function (entry, next) {
      if (entry.deleted || entry.draft || entry.scheduled || entry.page)
        return next();

      // if (entry.metadata.date) return next();

      var newDateStamp =
        limit.valueOf() +
        Math.floor(Math.random() * (end.valueOf() - limit.valueOf()));

      // console.log(newDateStamp, moment(newDateStamp).format(), entry.path);

      Entry.set(blog.id, entry.path, { dateStamp: newDateStamp }, next);
    },
    function (err) {
      if (err) throw err;

      console.log("Complete!");
      process.exit();
    }
  );
});
