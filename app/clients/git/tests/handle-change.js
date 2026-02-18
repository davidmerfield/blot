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
    var newHandle = oldHandle + "renamed";
    var oldRepo = dataDir + "/" + oldHandle + ".git";
    var newRepo = dataDir + "/" + newHandle + ".git";
    var redirectStatus = 308;

    var assertRedirect = function (path, expectedLocation, callback) {
      var req = http.request(
        {
          method: "GET",
          hostname: "127.0.0.1",
          port: context.server.port,
          path,
        },
        function (res) {
          expect(res.statusCode).toBe(redirectStatus);
          expect(res.headers.location).toBe(expectedLocation);
          res.resume();
          callback();
        }
      );

      req.on("error", function (err) {
        done.fail(err);
      });
      req.end();
    };

    fs.pathExists(oldRepo, function (err, exists) {
      if (err) return done.fail(err);
      expect(exists).toBe(true);

      setBlog(context.blog.id, { handle: newHandle, client: "git" }, function (err) {
        if (err) return done.fail(err);
        context.blog.handle = newHandle;

        fs.pathExists(newRepo, function (err, newExists) {
          if (err) return done.fail(err);
          expect(newExists).toBe(true);

          fs.pathExists(oldRepo, function (err, oldExists) {
            if (err) return done.fail(err);
            expect(oldExists).toBe(false);

            assertRedirect(
              "/clients/git/end/" + oldHandle + ".git",
              "http://127.0.0.1:" +
                context.server.port +
                "/clients/git/end/" +
                newHandle +
                ".git",
              function () {
                assertRedirect(
                  "/clients/git/end/" +
                    oldHandle +
                    ".git/info/refs?service=git-receive-pack",
                  "http://127.0.0.1:" +
                    context.server.port +
                    "/clients/git/end/" +
                    newHandle +
                    ".git/info/refs?service=git-receive-pack",
                  function () {
                    assertRedirect(
                      "/clients/git/end/" +
                        oldHandle +
                        ".git/git-receive-pack",
                      "http://127.0.0.1:" +
                        context.server.port +
                        "/clients/git/end/" +
                        newHandle +
                        ".git/git-receive-pack",
                      done
                    );
                  }
                );
              }
            );
          });
        });
      });
    });
  });
});
