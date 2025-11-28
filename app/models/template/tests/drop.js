describe("template", function () {
  require("./setup")({ createTemplate: true });

  const { promisify } = require("util");
  var drop = require("../index").drop;
  var getTemplateList = require("../index").getTemplateList;
  var getMetadata = require("../index").getMetadata;
  var setView = require("../index").setView;
  var client = require("models/client");
  var Blog = require("models/blog");
  var key = require("../key");
  const path = require("path");
  const fs = require("fs-extra");
  const config = require("config");

  const dropAsync = promisify(drop);
  const setViewAsync = promisify(setView);
  const getMetadataAsync = promisify(getMetadata);
  const blogSetAsync = promisify(Blog.set).bind(Blog);
  const getAsync = promisify(client.get).bind(client);

  const RENDERED_OUTPUT_BASE_DIR = path.join(
    config.data_directory,
    "cdn",
    "template"
  );

  function getRenderedOutputPath(hash, viewName) {
    const viewBaseName = path.basename(viewName);
    const dir1 = hash.substring(0, 2);
    const dir2 = hash.substring(2, 4);
    const hashRemainder = hash.substring(4);
    return path.join(RENDERED_OUTPUT_BASE_DIR, dir1, dir2, hashRemainder, viewBaseName);
  }

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

  it("removes CDN rendered output when dropping a template", async function () {
    const test = this;

    await blogSetAsync(test.blog.id, { template: test.template.id });

    await setViewAsync(test.template.id, {
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    await setViewAsync(test.template.id, {
      name: "style.css",
      content: "body{color:red}",
    });

    const metadata = await getMetadataAsync(test.template.id);
    const hash = metadata.cdn["style.css"];
    const renderedKey = key.renderedOutput(hash);
    const filePath = getRenderedOutputPath(hash, "style.css");

    expect(await getAsync(renderedKey)).toBe("body{color:red}");
    expect(await fs.pathExists(filePath)).toBe(true);

    await dropAsync(test.blog.id, test.template.name);

    expect(await getAsync(renderedKey)).toBeNull();
    expect(await fs.pathExists(filePath)).toBe(false);
  });
});
