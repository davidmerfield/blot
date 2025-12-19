describe("git client handle changes", function () {
  require("./setup")({
    clone: false
  });

  var fs = require("fs-extra");
  var http = require("http");
  var dataDir = require("clients/git/dataDir");
  var setBlog = require("models/blog/set");

  it("renames repos and redirects old handles", function (done) {
    var context = this;
    var oldHandle = context.blog.handle;
    var newHandle = oldHandle + "-renamed";
    var oldRepo = dataDir + "/" + oldHandle + ".git";
    var newRepo = dataDir + "/" + newHandle + ".git";

    fs.pathExists(oldRepo, function (err, exists) {
      if (err) return done.fail(err);
      expect(exists).toBe(true);

      setBlog(context.blog.id, { handle: newHandle }, function (err) {
        if (err) return done.fail(err);
        context.blog.handle = newHandle;

        fs.pathExists(newRepo, function (err, newExists) {
          if (err) return done.fail(err);
          expect(newExists).toBe(true);

          fs.pathExists(oldRepo, function (err, oldExists) {
            if (err) return done.fail(err);
            expect(oldExists).toBe(false);

            var req = http.request(
              {
                method: "GET",
                hostname: "127.0.0.1",
                port: context.server.port,
                path: "/clients/git/end/" + oldHandle + ".git",
              },
              function (res) {
                expect(res.statusCode).toBe(301);
                expect(res.headers.location).toBe(
                  "http://127.0.0.1:" +
                    context.server.port +
                    "/clients/git/end/" +
                    newHandle +
                    ".git"
                );
                res.resume();
                done();
              }
            );

            req.on("error", function (err) {
              done.fail(err);
            });
            req.end();
          });
        });
      });
    });
  });
});
