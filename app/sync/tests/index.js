describe("sync", function () {
  var sync = require("../index");

  // Set up a test blog before each test
  global.test.blog();

  it("acquires a lease for a blog", function (testDone) {
    sync(this.blog.id, function (err, folder, done) {
      if (err) return testDone.fail(err);

      expect(folder.path).toEqual(jasmine.any(String));
      expect(folder.update).toEqual(jasmine.any(Function));
      expect(done).toEqual(jasmine.any(Function));

      done(null, testDone);
    });
  });

  it("will only allow one sync at once", function (testDone) {
    var blog = this.blog;

    sync(blog.id, function (err, folder, done) {
      if (err) return testDone.fail(err);

      sync(blog.id, function (err) {
        expect(err.message).toContain("Failed to acquire folder lock");
        done(null, testDone);
      });
    });
  }, 15 * 1000);

  it(
    "will release a lock when the process dies due to an uncaught exception",
    function (testDone) {
      var child = require("child_process").fork(__dirname + "/error", {
        execArgv: ["--unhandled-rejections=strict"],
        silent: false,
      });
      var blog = this.blog;

      // Did sync release the child's lock on the blog when the child
      // died (was killed)? We test this by trying to acquire a lock.
      child.on("close", function () {
        console.log("CLOSED CALLED! resyncing...");
        sync(blog.id, function (err, folder, done) {
          if (err) return testDone.fail(err);
          done(null, testDone);
        });
      });

      console.log("Sending a message to child");
      child.send(blog.id);
    },
    10 * 1000
  );

  it("will release a lock when the process is killed", function (testDone) {
    var child = require("child_process").fork(__dirname + "/kill");
    var blog = this.blog;

    child.send(blog.id);

    // Find out if the child managed to acquire a lock on this blog
    child.on("message", function (message) {
      if (message.error) {
        testDone.fail(message.error);
      } else {
        child.kill();
      }
    });

    // Did sync release the child's lock on the blog when the child
    // died (was killed)? We test this by trying to acquire a lock.
    child.on("close", function () {
      sync(blog.id, function (err, folder, done) {
        if (err) return testDone.fail(err);
        done(null, testDone);
      });
    });
  });

  it("will allow you to sync, release and re-sync", function (testDone) {
    var blog = this.blog;

    sync(blog.id, function (err, folder, done) {
      if (err) return testDone.fail(err);

      done(null, function (err) {
        if (err) return testDone.fail(err);

        sync(blog.id, function (err, folder, done) {
          if (err) return testDone.fail(err);

          done(null, testDone);
        });
      });
    });
  });
});
