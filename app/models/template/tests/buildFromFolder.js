describe("template", function () {
  const { promisify } = require("util");
  const fs = require("fs-extra");
  const client = require("models/client");
  const Blog = require("models/blog");

  const {
    buildFromFolder: buildFromFolderCb,
    writeToFolder: writeToFolderCb,
    getMetadata: getMetadataCb,
    setMetadata: setMetadataCb,
    setView: setViewCb,
    makeID,
  } = require("../index");

  const folderRenames = require("../folderRenames");

  const buildFromFolder = promisify(buildFromFolderCb);
  const writeToFolder = promisify(writeToFolderCb);
  const getMetadata = promisify(getMetadataCb);
  const setMetadata = promisify(setMetadataCb);
  const setView = promisify(setViewCb);
  const getBlog = promisify(Blog.get);
  const setBlog = promisify(Blog.set);
  const createShareID = promisify(require("../index").createShareID);
  const getByShareID = promisify(require("../index").getByShareID);

  require("./setup")({ createTemplate: true });

  // Installs a local template with one view, written out to the blog folder
  async function installLocalTemplate(test, install = true) {
    await setView(test.template.id, {
      name: "index.html",
      content: "<h1>Title</h1>",
    });
    await setMetadata(test.template.id, {
      localEditing: true,
      description: "Custom description",
    });
    if (install) await setBlog(test.blog.id, { template: test.template.id });
    await writeToFolder(test.blog.id, test.template.id);
  }

  const templatesDir = (test) => test.blogDirectory + "/Templates";

  const exists = async (id) => {
    try {
      await getMetadata(id);
      return true;
    } catch (e) {
      return false;
    }
  };

  const expireWindow = async (blogID) => {
    const pending = await folderRenames.readPending(blogID);
    for (const id of Object.keys(pending)) {
      pending[id].since = Date.now() - folderRenames.RENAME_WINDOW - 1000;
      await folderRenames.setPending(blogID, id, pending[id]);
    }
  };

  async function expectRenamed(test, newSlug) {
    const newID = makeID(test.blog.id, newSlug);
    const blog = await getBlog({ id: test.blog.id });
    const metadata = await getMetadata(newID);

    expect(blog.template).toEqual(newID);
    expect(metadata.localEditing).toEqual(true);
    expect(metadata.description).toEqual("Custom description");
    expect(await exists(test.template.id)).toEqual(false);
  }

  it("migrates the installed template when its folder is renamed", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.move(
      templatesDir(this) + "/" + this.template.slug,
      templatesDir(this) + "/renamed"
    );
    await buildFromFolder(this.blog.id);

    await expectRenamed(this, "renamed");
  });

  it("migrates when the new folder appears in a later sync than the removal", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.move(
      templatesDir(this) + "/" + this.template.slug,
      this.blogDirectory + "/.moved"
    );
    await buildFromFolder(this.blog.id);

    // Nothing is dropped while we wait to see if it was a rename
    expect(await exists(this.template.id)).toEqual(true);

    await fs.move(
      this.blogDirectory + "/.moved",
      templatesDir(this) + "/renamed"
    );
    await buildFromFolder(this.blog.id);

    await expectRenamed(this, "renamed");
  });

  it("migrates when the removal arrives in a later sync than the new folder", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.copy(
      templatesDir(this) + "/" + this.template.slug,
      templatesDir(this) + "/renamed"
    );
    await buildFromFolder(this.blog.id);

    await fs.remove(templatesDir(this) + "/" + this.template.slug);
    await buildFromFolder(this.blog.id);

    await expectRenamed(this, "renamed");
  });

  it("migrates when the renamed folder's files were also edited", async function () {
    await installLocalTemplate(this);
    await setView(this.template.id, { name: "entry.html", content: "<p>Entry</p>" });
    await writeToFolder(this.blog.id, this.template.id);
    await buildFromFolder(this.blog.id);

    await fs.move(
      templatesDir(this) + "/" + this.template.slug,
      templatesDir(this) + "/renamed"
    );
    await fs.outputFile(templatesDir(this) + "/renamed/index.html", "<h1>Edited</h1>");
    await buildFromFolder(this.blog.id);

    await expectRenamed(this, "renamed");
  });

  it("installs the default template if no rename is found within the window", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.remove(templatesDir(this) + "/" + this.template.slug);
    await buildFromFolder(this.blog.id);

    // Still installed while we wait
    expect((await getBlog({ id: this.blog.id })).template).toEqual(this.template.id);

    await expireWindow(this.blog.id);
    await buildFromFolder(this.blog.id);

    const blog = await getBlog({ id: this.blog.id });

    expect(blog.template).toBeTruthy();
    expect(blog.template).not.toEqual(this.template.id);
    expect(await exists(blog.template)).toEqual(true);
    expect(await exists(this.template.id)).toEqual(false);
  });

  it("drops the missing template as soon as another template is installed", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.remove(templatesDir(this) + "/" + this.template.slug);
    await buildFromFolder(this.blog.id);
    expect(await exists(this.template.id)).toEqual(true);

    await setBlog(this.blog.id, { template: "SITE:blog" });
    await buildFromFolder(this.blog.id);

    const blog = await getBlog({ id: this.blog.id });

    expect(await exists(this.template.id)).toEqual(false);
    expect(blog.template).not.toEqual(this.template.id);
    expect(await client.hGetAll(folderRenames.pendingKey(this.blog.id))).toEqual({});

    // Nothing further happens once the window has passed
    await expireWindow(this.blog.id);
    await buildFromFolder(this.blog.id);
    expect((await getBlog({ id: this.blog.id })).template).toEqual(blog.template);
  });

  it("installs the default once the window has passed and the pending record is read back from Redis", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.remove(templatesDir(this) + "/" + this.template.slug);
    await buildFromFolder(this.blog.id);

    const pending = await folderRenames.readPending(this.blog.id);
    expect(Object.keys(pending)).toEqual([this.template.id]);
    await expireWindow(this.blog.id);
    await buildFromFolder(this.blog.id);

    expect(await exists(this.template.id)).toEqual(false);
    expect((await getBlog({ id: this.blog.id })).template).not.toEqual(this.template.id);
  });

  it("keeps the pending record for longer than the rename window", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.remove(templatesDir(this) + "/" + this.template.slug);
    await buildFromFolder(this.blog.id);

    const ttl = await client.ttl(folderRenames.pendingKey(this.blog.id));

    expect(ttl * 1000).toBeGreaterThan(folderRenames.RENAME_WINDOW * 2);
  });

  it("does not migrate when several new templates resemble the old one equally", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.move(
      templatesDir(this) + "/" + this.template.slug,
      templatesDir(this) + "/copy-a"
    );
    await fs.copy(templatesDir(this) + "/copy-a", templatesDir(this) + "/copy-b");
    await buildFromFolder(this.blog.id);

    const blog = await getBlog({ id: this.blog.id });

    expect(blog.template).toEqual(this.template.id);
    expect(await exists(this.template.id)).toEqual(true);
  });

  it("keeps the share link working after a rename", async function () {
    await installLocalTemplate(this);
    const shareID = await createShareID(this.template.id);
    await buildFromFolder(this.blog.id);

    await fs.move(
      templatesDir(this) + "/" + this.template.slug,
      templatesDir(this) + "/renamed"
    );
    await buildFromFolder(this.blog.id);

    const shared = await getByShareID(shareID);

    expect(shared.id).toEqual(makeID(this.blog.id, "renamed"));
    expect(shared.shareID).toEqual(shareID);
  });

  it("does not adopt an unrelated new template as the rename", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.remove(templatesDir(this) + "/" + this.template.slug);
    await fs.outputFile(templatesDir(this) + "/other/other.html", "<p>Other</p>");
    await buildFromFolder(this.blog.id);
    await expireWindow(this.blog.id);
    await buildFromFolder(this.blog.id);

    const blog = await getBlog({ id: this.blog.id });

    expect(blog.template).not.toEqual(makeID(this.blog.id, "other"));
    expect(await exists(this.template.id)).toEqual(false);
  });

  it("drops a template which isn't installed immediately", async function () {
    await installLocalTemplate(this, false);
    await buildFromFolder(this.blog.id);

    await fs.remove(templatesDir(this) + "/" + this.template.slug);
    await buildFromFolder(this.blog.id);

    expect(await exists(this.template.id)).toEqual(false);
  });

  it("keeps a template whose folder reappears within the window", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    const dir = templatesDir(this) + "/" + this.template.slug;
    await fs.move(dir, this.blogDirectory + "/.moved");
    await buildFromFolder(this.blog.id);
    await fs.move(this.blogDirectory + "/.moved", dir);
    await buildFromFolder(this.blog.id);

    expect(await exists(this.template.id)).toEqual(true);
    expect(await client.hGetAll(folderRenames.pendingKey(this.blog.id))).toEqual({});
    expect((await getBlog({ id: this.blog.id })).template).toEqual(this.template.id);
  });
});
