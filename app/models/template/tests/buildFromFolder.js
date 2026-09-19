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

  require("./setup")({ createTemplate: true });

  // Installs a local template with one view, written out to the blog folder
  async function installLocalTemplate(test) {
    await setView(test.template.id, {
      name: "index.html",
      content: "<h1>Title</h1>",
    });
    await setMetadata(test.template.id, {
      localEditing: true,
      description: "Custom description",
    });
    await setBlog(test.blog.id, { template: test.template.id });
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

  it("drops a template whose folder was deleted once the window has passed", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.remove(templatesDir(this) + "/" + this.template.slug);
    await buildFromFolder(this.blog.id);
    expect(await exists(this.template.id)).toEqual(true);

    await expireWindow(this.blog.id);
    await buildFromFolder(this.blog.id);
    expect(await exists(this.template.id)).toEqual(false);
  });

  it("does not migrate when the new folder's views differ", async function () {
    await installLocalTemplate(this);
    await buildFromFolder(this.blog.id);

    await fs.remove(templatesDir(this) + "/" + this.template.slug);
    await fs.outputFile(templatesDir(this) + "/other/index.html", "<p>Other</p>");
    await buildFromFolder(this.blog.id);
    await expireWindow(this.blog.id);
    await buildFromFolder(this.blog.id);

    const blog = await getBlog({ id: this.blog.id });

    expect(await exists(this.template.id)).toEqual(false);
    expect(blog.template).not.toEqual(makeID(this.blog.id, "other"));
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
  });
});
