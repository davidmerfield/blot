describe("git client authenticate", function () {
  // Sets up a clean test blog (this.blog) for each test,
  // sets the blog's client to git (this.client), then creates
  // a test server with the git client's routes exposed, then
  // cleans everything up when each test has finished.
  require("./setup")({
    clone: false // dont clone repo into tmp dir
  });

  var fs = require("fs-extra");
  var Git = require("simple-git");
  var url = require("url");

  it("allows a user with good credentials to clone a repo", function (done) {
    var tmp = this.tmp;
    var handle = this.blog.handle;

    Git(tmp)
      .silent(true)
      .clone(this.repoUrl, function (err) {
        if (err) return done.fail(err);

        // Verify that there actually is a new repo on the user's file system
        expect(fs.readdirSync(tmp)).toEqual([handle]);
        expect(fs.readdirSync(tmp + "/" + handle)).toEqual([".git"]);
        done();
      });
  });

  it("prevents a user with good credentials from accessing someone else's repo", function (done) {
    var repoUrl = this.repoUrl;
    var tmp = this.tmp;

    repoUrl = url.parse(repoUrl);
    repoUrl.pathname = repoUrl.pathname.split(this.blog.handle).join("not_you");
    repoUrl = url.format(repoUrl);

    Git(tmp)
      .silent(true)
      .clone(repoUrl, function (err) {
        expect(err.message).toContain("401 Unauthorized");
        expect(fs.readdirSync(tmp)).toEqual([]);
        done();
      });
  });

  it("prevents a user with invalid credentials from accessing someone else's repo", function (done) {
    var tmp = this.tmp;
    var repoUrl = this.repoUrl;

    repoUrl = url.parse(repoUrl);
    repoUrl.auth = "not_you:not_your_password";
    repoUrl = url.format(repoUrl);

    Git(tmp)
      .silent(true)
      .clone(repoUrl, function (err) {
        expect(err.message).toContain("401 Unauthorized");
        expect(fs.readdirSync(tmp)).toEqual([]);
        done();
      });
  });

  it("prevents a user with an expired token from accessing their repo", function (done) {
    var tmp = this.tmp;
    var repoUrl = this.repoUrl;

    // Now the repoUrl, which contains the token, should be invalid
    require("clients/git/database").refreshToken(
      this.blog.owner,
      function (err) {
        if (err) return done.fail(err);

        Git(tmp)
          .silent(true)
          .clone(repoUrl, function (err) {
            expect(err.message).toContain("401 Unauthorized");
            expect(fs.readdirSync(tmp)).toEqual([]);
            done();
          });
      }
    );
  });
});
