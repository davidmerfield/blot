describe("dropbox client", function () {
  // Create test user and tmp directory
  require("./setup")();

  var fs = require("fs-extra");
  var write = require("../write");

  beforeEach(function () {
    this.path = this.fake.path(".txt");
    this.path = this.fake.path(".txt");
    this.contents = this.fake.file();
  });

  afterEach(function (done) {
    var contents = this.contents;
    expect(
      fs.readFileSync(this.blogDirectory + this.path).toString("utf-8")
    ).toEqual(contents);
    this.client
      .filesDownload({ path: this.folder + this.path })
      .then(function (res) {
        // Check file exists in blog directory in Dropbox
        expect(res.fileBinary.toString("utf-8")).toEqual(contents);
        done();
      })
      .catch(function (err) {
        done(new Error(err));
      });
  });

  xit("writes a file", function (done) {
    write(this.blog.id, this.path, this.contents, done);
  });
});
