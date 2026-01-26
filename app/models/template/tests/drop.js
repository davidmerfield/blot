describe("template", function () {
  require("./setup")({ createTemplate: true });

  var drop = require("../index").drop;
  var getTemplateList = require("../index").getTemplateList;
  var client = require("models/client");
  var Blog = require("models/blog");
  var key = require("../key");
  var generateCdnUrl = require("../util/generateCdnUrl");
  var config = require("config");
  var fs = require("fs-extra");
  var path = require("path");
  var getMetadata = require("../index").getMetadata;
  var { promisify } = require("util");

  var purgeModulePath = require.resolve("helper/purgeCdnUrls");
  var cleanupUtilPath = require.resolve("../util/cleanupTemplateCdnAssets");
  var dropModulePath = require.resolve("../drop");
  var indexModulePath = require.resolve("../index");
  var originalPurge = require(purgeModulePath);
  var getAsync = promisify(client.get).bind(client);
  var blogSetAsync = promisify(Blog.set).bind(Blog);
  var getMetadataAsync = promisify(getMetadata).bind(getMetadata);
  var dropTemplate = function (dropFn, owner, templateName) {
    return new Promise(function (resolve, reject) {
      dropFn(owner, templateName, function (err, message) {
        if (err) return reject(err);
        resolve(message);
      });
    });
  };
  var sleep = function (ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  };

  var getRenderedOutputPath = function (hash, viewName) {
    const viewBaseName = path.basename(viewName);
    const dir1 = hash.substring(0, 2);
    const dir2 = hash.substring(2, 4);
    const hashRemainder = hash.substring(4);
    return path.join(
      config.data_directory,
      "cdn",
      "template",
      dir1,
      dir2,
      hashRemainder,
      viewBaseName
    );
  };

  var reloadDrop = function () {
    delete require.cache[cleanupUtilPath];
    delete require.cache[dropModulePath];
    delete require.cache[indexModulePath];
    return require("../index").drop;
  };

  afterEach(function () {
    require.cache[purgeModulePath] = { exports: originalPurge };
    delete require.cache[cleanupUtilPath];
    delete require.cache[dropModulePath];
    delete require.cache[indexModulePath];
  });

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

  it("purges CDN URLs when dropping a template with a manifest", async function () {
    var test = this;

    await blogSetAsync(test.blog.id, { template: test.template.id });

    await test.setView({
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    await test.setView({
      name: "style.css",
      content: "body{color:red}",
    });

    var metadata = await getMetadataAsync(test.template.id);
    var hash = metadata.cdn["style.css"];
    var expectedUrl = generateCdnUrl("style.css", hash);

    var purgeSpy = jasmine.createSpy("purgeCdnUrls").and.resolveTo();
    require.cache[purgeModulePath] = { exports: purgeSpy };

    var dropWithCleanup = reloadDrop();

    await dropTemplate(dropWithCleanup, test.blog.id, test.template.name);
    await sleep(20);

    expect(purgeSpy).toHaveBeenCalledWith([expectedUrl]);
  });

  it("continues dropping even if CDN purge fails", async function () {
    var test = this;

    await blogSetAsync(test.blog.id, { template: test.template.id });

    await test.setView({
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    await test.setView({
      name: "style.css",
      content: "body{color:red}",
    });

    var purgeSpy = jasmine
      .createSpy("purgeCdnUrls")
      .and.callFake(function () {
        return Promise.reject(new Error("purge failed"));
      });
    require.cache[purgeModulePath] = { exports: purgeSpy };

    var dropWithCleanup = reloadDrop();

    await dropTemplate(dropWithCleanup, test.blog.id, test.template.name);

    expect(purgeSpy).toHaveBeenCalled();
  });

  it("skips CDN cleanup when no manifest is present", async function () {
    var test = this;

    await blogSetAsync(test.blog.id, { template: test.template.id });

    var purgeSpy = jasmine.createSpy("purgeCdnUrls").and.resolveTo();
    require.cache[purgeModulePath] = { exports: purgeSpy };

    var dropWithCleanup = reloadDrop();

    await dropTemplate(dropWithCleanup, test.blog.id, test.template.name);

    expect(purgeSpy).not.toHaveBeenCalled();
  });

  it("cleans up rendered output files and Redis keys on drop", async function () {
    var test = this;

    await blogSetAsync(test.blog.id, { template: test.template.id });

    await test.setView({
      name: "entries.html",
      content: "{{#cdn}}/style.css{{/cdn}}",
    });

    await test.setView({
      name: "style.css",
      content: "body{color:red}",
    });

    var metadata = await getMetadataAsync(test.template.id);
    var hash = metadata.cdn["style.css"];
    var renderedPath = getRenderedOutputPath(hash, "style.css");
    var renderedKey = key.renderedOutput(hash);

    var purgeSpy = jasmine.createSpy("purgeCdnUrls").and.resolveTo();
    require.cache[purgeModulePath] = { exports: purgeSpy };

    var dropWithCleanup = reloadDrop();

    await dropTemplate(dropWithCleanup, test.blog.id, test.template.name);
    await sleep(20);

    var fileExists = await fs.pathExists(renderedPath);
    var redisValue = await getAsync(renderedKey);

    expect(fileExists).toBe(false);
    expect(redisValue).toBeNull();
  });
});
