var Template = require("models/template");
var getCachedFullView = require("../full-view-cache");

describe("full view cache", function () {
  beforeEach(function () {
    getCachedFullView._clear();
  });

  it("reuses cached full view responses for identical inputs", function (done) {
    var response = [{ title: "Hello" }, { head: "" }, [], "text/html", "{{title}}"];

    spyOn(Template, "getFullView").and.callFake(function (
      blogID,
      templateID,
      viewName,
      callback
    ) {
      callback(null, response);
    });

    var options = {
      blog: { id: "blog-1", cacheID: 111 },
      template: { id: "template-1" },
      viewName: "entry.html",
    };

    getCachedFullView(options, function (err, firstResult) {
      expect(err).toBeNull();
      expect(firstResult).toBe(response);

      getCachedFullView(options, function (secondErr, secondResult) {
        expect(secondErr).toBeNull();
        expect(secondResult).toBe(response);
        expect(Template.getFullView).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  it("misses the cache when blog/template/view inputs differ", function (done) {
    spyOn(Template, "getFullView").and.callFake(function (
      blogID,
      templateID,
      viewName,
      callback
    ) {
      callback(null, [
        { blogID: blogID, templateID: templateID, viewName: viewName },
        {},
        [],
        "text/html",
        "",
      ]);
    });

    getCachedFullView(
      {
        blog: { id: "blog-1", cacheID: 111 },
        template: { id: "template-1" },
        viewName: "entry.html",
      },
      function () {
        getCachedFullView(
          {
            blog: { id: "blog-2", cacheID: 111 },
            template: { id: "template-2" },
            viewName: "index.html",
          },
          function () {
            expect(Template.getFullView).toHaveBeenCalledTimes(2);
            done();
          }
        );
      }
    );
  });

  it("recomputes when blog.cacheID changes", function (done) {
    spyOn(Template, "getFullView").and.callFake(function (
      blogID,
      templateID,
      viewName,
      callback
    ) {
      callback(null, [{ cacheID: Date.now() }, {}, [], "text/html", ""]);
    });

    getCachedFullView(
      {
        blog: { id: "blog-1", cacheID: 111 },
        template: { id: "template-1" },
        viewName: "entry.html",
      },
      function () {
        getCachedFullView(
          {
            blog: { id: "blog-1", cacheID: 222 },
            template: { id: "template-1" },
            viewName: "entry.html",
          },
          function () {
            expect(Template.getFullView).toHaveBeenCalledTimes(2);
            done();
          }
        );
      }
    );
  });
});
