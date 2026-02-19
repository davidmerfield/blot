const fs = require("fs-extra");
const localPath = require("helper/localPath");
const clients = require("clients");

describe("folder upload", function () {
  global.test.site({ login: true });

  const uploadPath = function () {
    return `/sites/${this.blog.handle}/folder/upload`;
  };

  const filePath = function (blogID, relativePath) {
    return localPath(blogID, `/${relativePath}`);
  };

  const readBlogFile = async function (blogID, relativePath) {
    return fs.readFile(filePath(blogID, relativePath), "utf8");
  };

  const postUpload = async function ({ files, fields = {}, query = "" }) {
    const form = new FormData();

    files.forEach((file, index) => {
      form.append(
        file.field || "upload",
        new Blob([file.content]),
        file.name || `file-${index}.txt`
      );
    });

    for (const [key, value] of Object.entries(fields)) {
      form.append(key, typeof value === "string" ? value : JSON.stringify(value));
    }

    const response = await this.fetch(`${uploadPath.call(this)}${query}`, {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(200);
    return response.json();
  };

  it("uploads a single file to current folder", async function () {
    const data = await postUpload.call(this, {
      files: [{ name: "single.txt", content: "single-content" }],
    });

    expect(data.dryRun).toBe(false);
    expect(await readBlogFile(this.blog.id, "single.txt")).toBe("single-content");
  });

  it("uploads multiple files in one request", async function () {
    const data = await postUpload.call(this, {
      files: [
        { name: "one.txt", content: "1" },
        { name: "two.txt", content: "2" },
      ],
      fields: {
        relativePaths: ["one.txt", "two.txt"],
      },
    });

    expect(data.results.length).toBe(2);
    expect(await readBlogFile(this.blog.id, "one.txt")).toBe("1");
    expect(await readBlogFile(this.blog.id, "two.txt")).toBe("2");
  });

  it("uploads folder structure preserving relative paths", async function () {
    await postUpload.call(this, {
      files: [
        { name: "a.txt", content: "a" },
        { name: "b.txt", content: "b" },
      ],
      fields: {
        relativePaths: ["folder/a.txt", "folder/nested/b.txt"],
      },
    });

    expect(await readBlogFile(this.blog.id, "folder/a.txt")).toBe("a");
    expect(await readBlogFile(this.blog.id, "folder/nested/b.txt")).toBe("b");
  });

  it("returns overwrite candidates in dry-run response", async function () {
    await this.write({ path: "existing.txt", content: "before" });

    const data = await postUpload.call(this, {
      files: [
        { name: "existing.txt", content: "after" },
        { name: "new.txt", content: "new" },
      ],
      fields: { dryRun: "true" },
    });

    expect(data.dryRun).toBe(true);
    expect(data.overwrite).toEqual(["existing.txt"]);
    expect(data.create).toEqual(["new.txt"]);
    expect(await readBlogFile(this.blog.id, "existing.txt")).toBe("before");
  });

  it("commit with overwrite disabled skips collisions", async function () {
    await this.write({ path: "collision.txt", content: "old" });

    const data = await postUpload.call(this, {
      files: [{ name: "collision.txt", content: "new" }],
    });

    expect(data.results[0]).toEqual(
      jasmine.objectContaining({
        path: "collision.txt",
        skipped: true,
        reason: "overwrite_not_allowed",
      })
    );

    expect(await readBlogFile(this.blog.id, "collision.txt")).toBe("old");
  });

  it("commit with overwrite enabled replaces existing files", async function () {
    await this.write({ path: "replace.txt", content: "old" });

    const data = await postUpload.call(this, {
      files: [{ name: "replace.txt", content: "new" }],
      fields: { overwrite: "true" },
    });

    expect(data.results[0]).toEqual(
      jasmine.objectContaining({
        path: "replace.txt",
        overwritten: true,
      })
    );
    expect(await readBlogFile(this.blog.id, "replace.txt")).toBe("new");
  });

  it("invokes client.write for each committed file when blog client is configured", async function () {
    const originalWrite = clients.local.write;
    const writeSpy = jasmine
      .createSpy("clientWrite")
      .and.callFake((blogID, relativePath, contents, callback) => callback(null));

    clients.local.write = writeSpy;

    try {
      await this.blog.set("client", "local");

      const data = await postUpload.call(this, {
        files: [
          { name: "client-one.txt", content: "1" },
          { name: "client-two.txt", content: "2" },
        ],
      });

      expect(data.results.length).toBe(2);
      expect(writeSpy.calls.count()).toBe(2);
      expect(writeSpy.calls.argsFor(0)[1]).toBe("client-one.txt");
      expect(writeSpy.calls.argsFor(1)[1]).toBe("client-two.txt");
    } finally {
      clients.local.write = originalWrite;
      await this.blog.set("client", null);
    }
  });

  it("rejects path traversal and absolute path attempts", async function () {
    const data = await postUpload.call(this, {
      files: [
        { name: "x.txt", content: "x" },
        { name: "y.txt", content: "y" },
      ],
      fields: {
        relativePaths: ["../escape.txt", "/absolute.txt"],
      },
    });

    expect(data.rejected).toEqual(
      jasmine.arrayContaining([
        jasmine.objectContaining({ relativePath: "../escape.txt", reason: "invalid" }),
        jasmine.objectContaining({ relativePath: "/absolute.txt", reason: "invalid" }),
      ])
    );

    expect(await fs.pathExists(filePath(this.blog.id, "escape.txt"))).toBe(false);
    expect(await fs.pathExists(filePath(this.blog.id, "absolute.txt"))).toBe(false);
  });

  it("rejects ignored file patterns", async function () {
    const data = await postUpload.call(this, {
      files: [
        { name: ".DS_Store", content: "x" },
        { name: "ok.txt", content: "ok" },
      ],
      fields: {
        relativePaths: [".DS_Store", "ok.txt"],
      },
    });

    expect(data.rejected).toEqual(
      jasmine.arrayContaining([
        jasmine.objectContaining({ relativePath: ".DS_Store", reason: "ignored" }),
      ])
    );

    expect(await fs.pathExists(filePath(this.blog.id, ".DS_Store"))).toBe(false);
    expect(await readBlogFile(this.blog.id, "ok.txt")).toBe("ok");
  });
});
