describe("localPath", function () {
  const localPath = require("../localPath");
  const BLOG_ID = "XYZ";
  const BLOG_DIR = require("config").blog_folder_dir;

  it("resolves root of blog folder when passed an empty string", function () {
    expect(localPath(BLOG_ID, "")).toEqual(`${BLOG_DIR}/${BLOG_ID}/`);
  });

  it("resolves a local path", function () {
    expect(localPath(BLOG_ID, "/foo")).toEqual(`${BLOG_DIR}/${BLOG_ID}/foo`);
  });

  it("resolves root of blog folder with trailing slash", function () {
    expect(localPath(BLOG_ID, "/")).toEqual(`${BLOG_DIR}/${BLOG_ID}/`);
  });

  it("resolves paths with a dot and a slash", function () {
    expect(localPath(BLOG_ID, "./bar")).toEqual(`${BLOG_DIR}/${BLOG_ID}/bar`);
  });

  it("resolves a local path without leading slash", function () {
    expect(localPath(BLOG_ID, "foo")).toEqual(`${BLOG_DIR}/${BLOG_ID}/foo`);
  });

  it("resolves a local path with trailing slash", function () {
    expect(localPath(BLOG_ID, "foo/")).toEqual(`${BLOG_DIR}/${BLOG_ID}/foo`);
  });

  it("resolves a local path with dots inside the blog folder", function () {
    expect(localPath(BLOG_ID, "/foo/bar/../baz")).toEqual(
      `${BLOG_DIR}/${BLOG_ID}/foo/baz`
    );
  });

  it("will not resolves a local path with dots outside the blog folder", function () {
    expect(localPath(BLOG_ID, "/foo/bar/../baz/../../../")).toEqual(
      `${BLOG_DIR}/${BLOG_ID}/`
    );
  });

  it("will not resolves a local path with dots outside the blog folder", function () {
    expect(localPath(BLOG_ID, "/../../")).toEqual(`${BLOG_DIR}/${BLOG_ID}/`);
  });

  it("will not resolves a local path outside the blog folder", function () {
    expect(localPath(BLOG_ID, "/Users/David/Projects/blot/blogs")).toEqual(
      `${BLOG_DIR}/${BLOG_ID}/Users/David/Projects/blot/blogs`
    );
  });
});
