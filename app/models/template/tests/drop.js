describe("template", function () {
  require("./setup")({ createTemplate: true });

  var drop = require("../index").drop;
  var getTemplateList = require("../index").getTemplateList;
  var client = require("models/client");
  var Blog = require("models/blog");
  var key = require("../key");

  it("drops a template", function (done) {
    drop(this.blog.id, this.template.name, done);
  });

  it("drop removes a template from the list of templates", function (done) {
    var test = this;
    getTemplateList(test.blog.id, function (err, templates) {
      if (err) return done.fail(err);
      expect(templates).toContain(test.template);
      drop(test.blog.id, test.template.name, function (err) {
        if (err) return done.fail(err);
        getTemplateList(test.blog.id, function (err, templates) {
          if (err) return done.fail(err);
          expect(templates).not.toContain(test.template);
          done();
        });
      });
    });
  });

  it("drop removes the URL key for a view in the template", function (done) {
    var test = this;
    var view = {
      name: "notes.txt",
      content: "Notes content",
      url: "/notes",
    };

    require("../index").setView(test.template.id, view, function (err) {
      if (err) return done.fail(err);
      drop(test.blog.id, test.template.name, function (err) {
        if (err) return done.fail(err);
        client.keys("*" + test.template.id + "*", function (err, result) {
          if (err) return done.fail(err);
          expect(result).toEqual([]);
          done();
        });
      });
    });
  });

  it("drop removes all keys for the template", function (done) {
    var test = this;
    drop(test.blog.id, test.template.name, function (err) {
      if (err) return done.fail(err);
      client.keys("*" + test.template.id + "*", function (err, result) {
        if (err) return done.fail(err);
        expect(result).toEqual([]);
        done();
      });
    });
  });

  it("updates the cache ID of the blog which owns a template after dropping", function (done) {
    var test = this;
    var initialCacheID = test.blog.cacheID;
    drop(test.blog.id, test.template.name, function (err) {
      if (err) return done.fail(err);
      Blog.get({ id: test.template.owner }, function (err, blog) {
        if (err) return done.fail(err);
        expect(blog.cacheID).not.toEqual(initialCacheID);
        done();
      });
    });
  });

  it("cleans up references when metadata is missing", function (done) {
    var test = this;

    client.del(key.metadata(test.template.id), function (err) {
      if (err) return done.fail(err);

      drop(test.blog.id, test.template.name, function (err) {
        if (err) return done.fail(err);

        client.sismember(
          key.blogTemplates(test.blog.id),
          test.template.id,
          function (err, isMember) {
            if (err) return done.fail(err);
            expect(isMember).toEqual(0);
            done();
          }
        );
      });
    });
  });

  it("drop resolves without an error when the template does not exist", function (done) {
    var test = this;
    drop(test.blog.id, "nonexistent-template", function (err, message) {
      if (err) return done.fail(err);
      expect(typeof message).toBe("string");
      done();
    });
  });
});
