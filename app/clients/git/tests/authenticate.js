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
  var http = require("http");
  var url = require("url");
  var async = require("async");
  var Blog = require("models/blog");
  var User = require("models/user");
  var dataDir = require("clients/git/dataDir");
  var createRepository = require("clients/git/create");

  var otherBlog;
  var otherUser;

  afterEach(function (done) {
    async.series(
      [
        function (next) {
          if (!otherBlog) return next();
          fs.remove(dataDir + "/" + otherBlog.handle + ".git", next);
        },
        function (next) {
          if (!otherBlog) return next();
          Blog.remove(otherBlog.id, next);
        },
        function (next) {
          if (!otherUser) return next();
          User.remove(otherUser.uid, next);
        },
      ],
      function (err) {
        otherBlog = null;
        otherUser = null;
        done(err);
      }
    );
  });

  it("rejects unauthenticated and noncanonical Git endpoints before Pushover", function (done) {
    var dataDir = require("clients/git/dataDir");
    var repos = require("clients/git/routes").repos;
    var handle = this.blog.handle;
    var handleSpy = spyOn(repos, "handle").and.callThrough();
    var requests = [
      { path: "/clients/git/end/" + handle + ".git/info/refs?service=git-upload-pack", status: 401 },
      { path: "/clients/git/end/" + handle + ".git/git-receive-pack", method: "POST", status: 401 },
      { path: "/clients/git/end//" + handle + ".git/info/refs", status: 404 },
      { path: "/clients/git/end/./" + handle + ".git/info/refs", status: 404 },
      { path: "/clients/git/end/%2f" + handle + ".git/info/refs", status: 404 },
      { path: "/clients/git/end/../" + handle + ".git/info/refs", status: 404 },
      { path: "/clients/git/end/prefix/" + handle + ".git/info/refs", status: 404 },
      { path: "/clients/git/end/" + handle + ".git/../info/refs", status: 404 },
    ];

    function next() {
      var request = requests.shift();

      if (!request) {
        expect(handleSpy).not.toHaveBeenCalled();
        expect(fs.existsSync(dataDir + "/prefix.git")).toBe(false);
        return done();
      }

      var req = http.request(
        {
          hostname: "127.0.0.1",
          port: this.server.port,
          method: request.method || "GET",
          path: request.path,
        },
        function (res) {
          res.resume();
          res.on("end", function () {
            expect(res.statusCode).toBe(request.status);
            next.call(this);
          }.bind(this));
        }.bind(this)
      );

      req.on("error", done.fail);
      req.end();
    }

    next.call(this);
  });

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

    async.waterfall(
      [
        function (next) {
          User.hashPassword("other-users-password", next);
        },
        function (passwordHash, next) {
          User.create(
            "other-git-user@example.com",
            passwordHash,
            {},
            {},
            next
          );
        },
        function (user, next) {
          otherUser = user;
          Blog.create(user.uid, { handle: "othergitrepo" }, next);
        },
        function (blog, next) {
          otherBlog = blog;
          createRepository(blog, next);
        },
        function (next) {
          repoUrl = url.parse(repoUrl);
          repoUrl.pathname = repoUrl.pathname
            .split(this.blog.handle)
            .join(otherBlog.handle);
          repoUrl = url.format(repoUrl);

          Git(tmp).silent(true).clone(repoUrl, next);
        }.bind(this),
      ],
      function (err) {
        expect(err).not.toBe(null);
        expect(err && err.message).toContain("401 Unauthorized");
        expect(fs.readdirSync(tmp)).toEqual([]);
        done();
      }
    );
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
