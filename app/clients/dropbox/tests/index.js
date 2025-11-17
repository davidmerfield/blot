describe("dropbox client", function () {
  // Create test user and tmp directory
  require("./setup")();

  xit("syncs a removed file", function (done) {
    var client = this.client;
    var webhook = this.webhook;
    var path = this.fake.path(".txt");
    var contents = this.fake.file();
    var blogDirectory = this.blogDirectory;
    var fs = require("fs-extra");
    var afterSync = this.afterSync;
    var otherContents;
    var folder = this.folder;

    client
      .filesUpload({ path: folder + path, contents: contents })
      .then(function () {
        webhook(function (err) {
          if (err) return done.fail(err);

          afterSync(function (err) {
            if (err) return done.fail(err);

            client
              .filesDelete({ path: folder + path })
              .then(function () {
                webhook(function (err) {
                  if (err) return done.fail(err);

                  afterSync(function (err) {
                    if (err) return done.fail(err);

                    expect(
                      fs.existsSync(blogDirectory + path)
                    ).toEqual(false);
                    done();
                  });
                });
              })
              .catch(function (err) {
                return done.fail(new Error(err.message));
              });
          });
        });
      })
      .catch(function (err) {
        return done.fail(new Error(err.message));
      });
  });

  xit("syncs a new file", function (done) {
    var client = this.client;
    var webhook = this.webhook;
    var path = this.fake.path(".txt");
    var contents = this.fake.file();
    var blogDirectory = this.blogDirectory;
    var fs = require("fs-extra");
    var afterSync = this.afterSync;
    var otherContents;

    client
      .filesUpload({ path: this.folder + path, contents: contents })
      .then(function () {
        webhook(function (err) {
          if (err) return done.fail(err);

          afterSync(function (err) {
            if (err) return done.fail(err);

            try {
              otherContents = fs.readFileSync(
                blogDirectory + path,
                "utf-8"
              );
            } catch (e) {
              return done.fail(e);
            }

            expect(otherContents).toEqual(contents);

            done();
          });
        });
      })
      .catch(function (err) {
        console.log(err);
        return done.fail(new Error(err.message));
      });
  });
});
