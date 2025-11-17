describe("create", function () {
  global.test.blog();
  global.test.tmp();

  var create = require("build/thumbnail/create");
  var config = require("config");
  var fs = require("fs-extra");

  // metadata should be at top of queue
  // then the images in the html if there are any
  // in the order they appear in the post
  it("creates thumbnails", function (done) {
    var test = this;
    var path = __dirname + "/images/portrait.jpg";
    var ratio, thumbnail, thumbnailPath;

    // {density: 2400} is only for svg images, but it doesn't
    // currently cause any trouble if we pass this for all formats
    // the number itself could be tuned based on the size of the source
    // image but I'd need to do more research about the meaning:
    // https://github.com/lovell/sharp/issues/1421#issuecomment-514446234
    require("sharp")(path, { density: 2400 }).metadata(function (
      err,
      metadata
    ) {
      if (err) return done.fail(err);
      ratio = Math.floor(metadata.width / metadata.height);

      create(test.blog.id, path, function (err, thumbnails) {
        if (err) return done.fail(err);
        expect(thumbnails).toEqual(jasmine.any(Object));

        // Square thumbnail is square
        expect(thumbnails.square.width).toEqual(thumbnails.square.height);

        // Other thumbnails preserve original aspect ratio
        expect(
          Math.floor(thumbnails.large.width / thumbnails.large.height)
        ).toEqual(ratio);
        expect(
          Math.floor(thumbnails.medium.width / thumbnails.medium.height)
        ).toEqual(ratio);
        expect(
          Math.floor(thumbnails.small.width / thumbnails.small.height)
        ).toEqual(ratio);
        expect(thumbnails.square.name).toEqual("square.jpg");

        for (var size in thumbnails) {
          thumbnail = thumbnails[size];
          thumbnailPath =
            config.blog_static_files_dir + "/" + test.blog.id + thumbnail.path;

          expect(fs.statSync(thumbnailPath).isFile()).toBe(true);
        }

        done();
      });
    });
  });
});
