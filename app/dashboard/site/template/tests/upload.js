describe("upload template route", function () {
  global.test.blog();

  const fs = require("fs-extra");
  const os = require("os");
  const { join } = require("path");
  const archiver = require("archiver");
  const Blog = require("models/blog");
  const Template = require("models/template");
  const uploadTemplate = require("../save/upload-template");

  let tmp;
  let uploadCount;

  beforeEach(async function () {
    tmp = await fs.mkdtemp(join(os.tmpdir(), "template-upload-test-"));
    uploadCount = 0;
  });

  afterEach(async function () {
    await fs.remove(tmp);
  });

  // Writes files where multiparty would have left them and builds the req
  // object the route sees after the dashboard's multipart middleware
  async function folderRequest(blog, files, body = {}) {
    const uploads = {};
    const relativePaths = [];
    const paths = [];

    let index = 0;

    const request = uploadCount++;

    for (const relativePath of Object.keys(files)) {
      const field = `upload-${index}`;
      const path = join(tmp, `request-${request}-upload-${index}`);
      const contents = files[relativePath];

      await fs.writeFile(
        path,
        Buffer.isBuffer(contents) ? contents : Buffer.from(contents, "utf8")
      );

      uploads[field] = [
        {
          path,
          size: (await fs.stat(path)).size,
          originalFilename: relativePath.split("/").pop(),
        },
      ];

      relativePaths.push({ field, index: 0, relativePath });
      paths.push(path);
      index++;
    }

    return {
      req: {
        blog,
        files: uploads,
        body: { relativePaths: JSON.stringify(relativePaths), ...body },
      },
      paths,
    };
  }

  async function zipRequest(blog, files, body = {}) {
    const path = join(tmp, "template.zip");
    const archive = archiver("zip", { zlib: { level: 9 } });
    const output = fs.createWriteStream(path);

    const finished = new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
    });

    archive.pipe(output);

    for (const relativePath of Object.keys(files)) {
      archive.append(files[relativePath], { name: relativePath });
    }

    archive.finalize();
    await finished;

    return {
      req: {
        blog,
        files: { zip: [{ path, size: (await fs.stat(path)).size }] },
        body,
      },
      paths: [path],
    };
  }

  // Await the handler rather than resolving when it responds: it removes the
  // temporary files after sending, so returning early would race the cleanup
  function run(req) {
    const result = { status: 200 };
    const res = {
      status: function (code) {
        result.status = code;
        return res;
      },
      json: function (body) {
        result.body = body;
        return res;
      },
    };

    return uploadTemplate(req, res).then(
      () => result,
      (err) => {
        result.thrown = err;
        return result;
      }
    );
  }

  const getViews = (templateID) =>
    new Promise((resolve, reject) => {
      Template.getAllViews(templateID, (err, views) => {
        if (err) return reject(err);
        resolve(views);
      });
    });

  const getTemplates = (blogID) =>
    new Promise((resolve, reject) => {
      Template.getTemplateList(blogID, (err, templates) => {
        if (err) return reject(err);
        resolve(templates);
      });
    });

  const getBlog = (blogID) =>
    new Promise((resolve, reject) => {
      Blog.get({ id: blogID }, (err, blog) => {
        if (err) return reject(err);
        resolve(blog);
      });
    });

  const uploaded = (templates) =>
    templates.filter((template) => template.owner === templates[0].owner);

  it("creates a template from a dropped folder", async function () {
    const { req, paths } = await folderRequest(this.blog, {
      "my-theme/index.html": "<h1>{{title}}</h1>",
      "my-theme/style.css": "body { color: red; }",
      "my-theme/package.json": JSON.stringify({
        name: "My theme",
        locals: { color: "red" },
        views: { "index.html": { url: "/" } },
      }),
    });

    const result = await run(req);

    expect(result.status).toEqual(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.name).toEqual("My theme");
    expect(result.body.redirect).toEqual(
      `/sites/${this.blog.handle}/template/my-theme`
    );
    expect(result.body.views.sort()).toEqual(["index.html", "style.css"]);

    const templateID = `${this.blog.id}:my-theme`;
    const views = await getViews(templateID);

    expect(views["index.html"].content).toEqual("<h1>{{title}}</h1>");
    expect(views["index.html"].url).toEqual("/");
    expect(views["style.css"].content).toEqual("body { color: red; }");
    // Defaulted from the view's name, matching package.generate
    expect(views["style.css"].url).toEqual("/style.css");

    const templates = await getTemplates(this.blog.id);
    const template = templates.find((t) => t.id === templateID);

    expect(template.owner).toEqual(this.blog.id);
    expect(template.localEditing).toBe(false);
    expect(template.isPublic).toBe(false);
    expect(template.locals.color).toEqual("red");

    // Every temporary file is removed, whatever the outcome
    for (const path of paths) expect(await fs.pathExists(path)).toBe(false);
  });

  it("creates a template from a dropped zip file", async function () {
    const { req, paths } = await zipRequest(this.blog, {
      "index.html": "<h1>{{title}}</h1>",
      "package.json": JSON.stringify({ name: "Zipped" }),
    });

    const result = await run(req);

    expect(result.status).toEqual(200);
    expect(result.body.name).toEqual("Zipped");

    const views = await getViews(`${this.blog.id}:zipped`);
    expect(views["index.html"].content).toEqual("<h1>{{title}}</h1>");

    for (const path of paths) expect(await fs.pathExists(path)).toBe(false);
  });

  it("strips a wrapper directory inside a zip file", async function () {
    const { req } = await zipRequest(this.blog, {
      "my-theme/index.html": "<h1>Hi</h1>",
      "my-theme/style.css": "body{}",
    });

    const result = await run(req);

    expect(result.status).toEqual(200);
    expect(result.body.views.sort()).toEqual(["index.html", "style.css"]);
  });

  it("does not install the uploaded template", async function () {
    const before = await getBlog(this.blog.id);

    const { req } = await folderRequest(this.blog, {
      "index.html": "<h1>Hi</h1>",
      "package.json": JSON.stringify({ name: "Sneaky", enabled: true }),
    });

    const result = await run(req);

    expect(result.status).toEqual(200);
    expect(result.body.warnings.join(" ")).toContain("enabled");

    const after = await getBlog(this.blog.id);
    expect(after.template).toEqual(before.template);
  });

  it("never creates a template which edits the user's folder", async function () {
    const { req } = await folderRequest(this.blog, {
      "index.html": "<h1>Hi</h1>",
      "package.json": JSON.stringify({ name: "Local", localEditing: true }),
    });

    await run(req);

    const templates = await getTemplates(this.blog.id);
    const template = templates.find((t) => t.id === `${this.blog.id}:local`);

    expect(template.localEditing).toBe(false);
  });

  it("deduplicates the name when one is already taken", async function () {
    const files = {
      "index.html": "<h1>Hi</h1>",
      "package.json": JSON.stringify({ name: "Theme" }),
    };

    const first = await run((await folderRequest(this.blog, files)).req);
    const second = await run((await folderRequest(this.blog, files)).req);
    const third = await run((await folderRequest(this.blog, files)).req);

    expect(first.body.name).toEqual("Theme");
    expect(second.body.name).toEqual("Theme 2");
    expect(third.body.name).toEqual("Theme 3");

    expect(second.body.redirect).toEqual(
      `/sites/${this.blog.handle}/template/theme-2`
    );
  });

  it("reports validation problems without creating a template", async function () {
    const { req, paths } = await folderRequest(this.blog, {
      "index.html": "{{#unclosed}}",
      "package.json": JSON.stringify({ name: "Broken" }),
    });

    const before = await getTemplates(this.blog.id);
    const result = await run(req);

    expect(result.status).toEqual(422);
    expect(result.body.problems.length).toEqual(1);
    expect(result.body.problems[0].path).toEqual("index.html");

    const after = await getTemplates(this.blog.id);
    expect(after.length).toEqual(before.length);

    for (const path of paths) expect(await fs.pathExists(path)).toBe(false);
  });

  it("rolls back the template when a view cannot be saved", async function () {
    const setView = Template.setView;

    // Fails on the second view, after the template and first view exist.
    // Stands in for the failures we cannot catch up front, such as a partial
    // dependency cycle spanning two views in the same upload.
    spyOn(Template, "setView").and.callFake(function (id, view, callback) {
      if (view.name === "second.html") {
        return callback(new Error("Could not save this view"));
      }
      return setView(id, view, callback);
    });

    const before = await getTemplates(this.blog.id);

    const { req, paths } = await folderRequest(this.blog, {
      "first.html": "<h1>Hi</h1>",
      "second.html": "<h1>There</h1>",
      "package.json": JSON.stringify({ name: "Rollback" }),
    });

    const result = await run(req);

    expect(result.status).toEqual(500);

    const after = await getTemplates(this.blog.id);
    expect(after.length).toEqual(before.length);
    expect(after.find((t) => t.id === `${this.blog.id}:rollback`)).toBe(
      undefined
    );

    for (const path of paths) expect(await fs.pathExists(path)).toBe(false);
  });

  it("rejects a request with no files", async function () {
    const result = await run({ blog: this.blog, files: {}, body: {} });

    expect(result.status).toEqual(400);
  });

  it("rejects a folder and a zip file in the same request", async function () {
    const { req } = await folderRequest(this.blog, { "index.html": "<h1>Hi</h1>" });
    req.files.zip = [{ path: join(tmp, "nope.zip"), size: 1 }];

    const result = await run(req);

    expect(result.status).toEqual(400);
  });

  it("prefers a name typed by the user", async function () {
    const { req } = await folderRequest(
      this.blog,
      {
        "my-theme/index.html": "<h1>Hi</h1>",
        "my-theme/package.json": JSON.stringify({ name: "From manifest" }),
      },
      { name: "From the form" }
    );

    const result = await run(req);

    expect(result.body.name).toEqual("From the form");
  });

  it("reports ignored files", async function () {
    const { req } = await folderRequest(this.blog, {
      "my-theme/index.html": "<h1>Hi</h1>",
      "my-theme/.DS_Store": "junk",
    });

    const result = await run(req);

    expect(result.status).toEqual(200);
    expect(result.body.ignored.length).toEqual(1);
    // Files are set aside before the wrapper directory is stripped, so an
    // ignored file is reported at the path the user actually dropped. The
    // order matters: a stray .DS_Store beside the folder rather than inside
    // it would otherwise stop the wrapper being stripped at all.
    expect(result.body.ignored[0].path).toEqual("my-theme/.DS_Store");
    expect(result.body.views).toEqual(["index.html"]);
  });
});
