// TODO add test to ensure case-sensitive lowercase paths
// work because dev machine has case-insensitive file-system
// but test server and production server do not.

describe("thumbnail", function () {
  global.test.blog();
  global.test.tmp();

  var he = require("he");
  var localPath = require("helper/localPath");
  var fs = require("fs-extra");
  var sharp = require("sharp");
  var config = require("config");

  it("creates thumbnails", function (done) {
    var thumbnail = require("../index");
    var metadata = {};
    var imagePath = "/portrait.jpg";
    var html = '<img src="' + imagePath + '">';
    var path = "/post.txt";

    fs.copyFileSync(
      __dirname + "/images/" + imagePath,
      localPath(this.blog.id, imagePath)
    );

    thumbnail(this.blog, path, metadata, html, function (err, result) {
      expect(err).toBe(null);
      expect(result).toEqual(jasmine.any(Object));
      expect(result.small).toEqual(jasmine.any(Object));

      done();
    });
  });

  it("creates thumbnails from svg images", function (done) {
    var thumbnail = require("../index");
    var metadata = {};
    var imagePath = "/chart.svg";
    var html = '<img src="' + imagePath + '">';
    var path = "/post.txt";

    fs.copyFileSync(
      __dirname + "/images/" + imagePath,
      localPath(this.blog.id, imagePath)
    );

    thumbnail(this.blog, path, metadata, html, function (err, result) {
      expect(err).toBe(null);
      expect(result).toEqual(jasmine.any(Object));
      expect(result.small).toEqual(jasmine.any(Object));

      done();
    });
  });

  it("creates thumbnails from gif images", function (done) {
    var thumbnail = require("../index");
    var metadata = {};
    var imagePath = "/cube.gif";
    var html = '<img src="' + imagePath + '">';
    var path = "/post.txt";

    fs.copyFileSync(
      __dirname + "/images/" + imagePath,
      localPath(this.blog.id, imagePath)
    );

    thumbnail(this.blog, path, metadata, html, function (err, result) {
      expect(err).toBe(null);
      expect(result).toEqual(jasmine.any(Object));
      expect(result.small).toEqual(jasmine.any(Object));

      done();
    });
  });

  it("creates a thumbnail for photos whose name has been HTML encoded", function (done) {
    var thumbnail = require("../index");
    var metadata = {};
    var imagePath = "/portrait's.jpg";
    var html = `<img src="${he.encode(imagePath)}">`;
    var path = "/post.txt";

    fs.copyFileSync(
      __dirname + "/images/portrait.jpg",
      localPath(this.blog.id, imagePath)
    );

    thumbnail(this.blog, path, metadata, html, function (err, result) {
      expect(err).toBe(null);
      expect(result).toEqual(jasmine.any(Object));
      expect(result.small).toEqual(jasmine.any(Object));

      done();
    });
  });

  it("does not create thumbnails if there are none", function (done) {
    var thumbnail = require("../index");
    var metadata = {};
    var html = "<p>Hello, world!</p>";
    var path = "/post.txt";

    thumbnail(this.blog, path, metadata, html, function (err, result) {
      expect(err).toBe(null);
      expect(result).toBe(null);

      done();
    });
  });

  it('should preserve the P3 ICC profile of the input image', function (done) {

    var thumbnail = require("../index");
    var metadata = {};
    var imagePath = "/p3.jpg";
    var html = `<img src="${imagePath}">`;
    var path = "/post.txt";

    fs.copyFileSync(
      __dirname + "/images/p3.jpg",
      localPath(this.blog.id, imagePath)
    );

    thumbnail(this.blog, path, metadata, html, async (err, result) => {
      expect(err).toBe(null);
      expect(result).toEqual(jasmine.any(Object));
      expect(result.small).toEqual(jasmine.any(Object));

      const outputPath = config.blog_static_files_dir + "/" + this.blog.id + '/' + result.large.path;
      const outputMetadata = await sharp(outputPath).metadata();

      expect(outputMetadata.icc).toBeDefined();
      expect(outputMetadata.icc).toContain('P3'); // Ensure it is preserved

      done();
    });
  });
});
