describe("asset middleware", function () {
  const config = require("config");
  const fs = require("fs-extra");

  require("./util/setup")();

  it("returns files with lower-case paths against upper-case URLs", async function () {
    await this.write({ path: "/pages/first.txt", content: "Foo" });
    const res = await this.get(`/Pages/First.txt`);
    expect(await res.text()).toEqual("Foo");
  });

  it("returns files with upper-case paths against lower-case URLs", async function () {
    await this.write({ path: "/Pages/First.txt", content: "Foo" });
    const res = await this.get(`/pages/first.txt`);
    expect(await res.text()).toEqual("Foo");
  });

  it("sends a file with .html extension in the blog folder", async function () {
    const path = global.test.fake.path(".html");
    const content = global.test.fake.file();
    await this.write({ path, content });
    expect(await this.text(path.slice(0, -".html".length))).toEqual(content);
  });

  it("sends a file with an underscore prefix and .html extension", async function () {
    const path = "/Foo/_File.html";
    const pathWithoutUnderscore = "/Foo/File/";
    const content = global.test.fake.file();
    await this.write({ path, content });
    expect(await this.text(pathWithoutUnderscore)).toEqual(content);
  });

  it("will set max-age when the url has the query cache and extension", async function () {
    const path = global.test.fake.path(".txt");
    const content = global.test.fake.file();

    await this.write({ path, content });
    const res = await this.get(`${path}?cache=true&extension=.txt`);
    expect(res.headers.get("cache-control")).toEqual("public, max-age=86400");
    const body = await res.text();
    expect(body).toEqual(content);
  });

  it("sends a file in the blog folder", async function () {
    const path = global.test.fake.path(".txt");
    const content = global.test.fake.file();

    await this.write({ path, content });
    const res = await this.get(path);
    expect(res.status).toEqual(200);
    const body = await res.text();
    expect(body).toEqual(content);
  });

  it("sends a file in the static folder for this blog", async function () {
    var path = global.test.fake.path(".txt");
    var contents = global.test.fake.file();

    await fs.outputFile(
      config.blog_static_files_dir + "/" + this.blog.id + path,
      contents
    );

    expect(await this.text(path)).toEqual(contents);
  });

  it("sends a file in the global static folder", async function () {
    const response = await this.text("/robots_deny.txt");
    const expected = await fs.readFile(
      __dirname + "/../static/robots_deny.txt",
      "utf-8"
    );
    expect(response).toEqual(expected);
  });

  // This test ensures that the middleware will pass
  // the request on if it can't find a matching file.
  it("returns a 404 correctly", async function () {
    const res = await this.get("/" + global.test.fake.random.uuid());
    expect(res.status).toEqual(404);
  });

  it("won't send a file in the .git directory of the blog folder", async function () {
    const path = '/.git';
    const content = global.test.fake.file();

    await this.write({ path, content });
    const res = await this.get(path);
    expect(res.status).toEqual(404);
    const body = await res.text();
    expect(body).not.toEqual(content);
  });
});
