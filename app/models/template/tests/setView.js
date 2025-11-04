const exp = require("constants");
const { promisify } = require("util");

describe("template", function () {
  require("./setup")({ createTemplate: true });

  const setView = promisify(require("../index").setView);
  const getView = promisify(require("../index").getView);
  const Blog = require("models/blog");
  const client = require("models/client");
  const hdel = promisify(client.hdel).bind(client);
  const key = require("../key");

  it("sets a view", async function () {
    const test = this;
    const view = {
      name: test.fake.random.word() + ".txt",
      content: test.fake.random.word(),
    };

    await setView(test.template.id, view);
    const savedView = await getView(test.template.id, view.name);

    expect(savedView.name).toEqual(view.name);
    expect(savedView.content).toEqual(view.content);
  });

  it("sets changes to an existing view", async function () {
    const test = this;
    const view = {
      name: test.fake.random.word(),
      content: test.fake.random.word(),
    };

    await setView(test.template.id, view);
    let savedView = await getView(test.template.id, view.name);

    expect(savedView.name).toEqual(view.name);
    expect(savedView.content).toEqual(view.content);

    view.content = test.fake.random.word();
    await setView(test.template.id, view);

    savedView = await getView(test.template.id, view.name);

    expect(savedView.content).toEqual(view.content);
  });

  it("won't set a view with invalid mustache content", async function () {
    const test = this;
    const view = {
      name: test.fake.random.word(),
      content: "{{#x}}", // without the closing {{/x}} mustache will err.
    };

    try {
      await setView(test.template.id, view);
    } catch (err) {
      expect(err instanceof Error).toBe(true);
    }
  });

  it("won't set a view with infinitely nested partials", async function () {
    const test = this;
    const view = {
      name: test.fake.random.word(),
      content: "{{> first}}",
      partials: {
        first: "{{> second}}",
        second: "{{> first}}",
      },
    };

    try {
      await setView(test.template.id, view);
      throw new Error("Expected setView to fail");
    } catch (err) {
      expect(err instanceof Error).toBe(true);
      expect(err.message).toContain("infinitely nested partials");
    }
  });

  it("won't set views that reference each other infinitely", async function () {
    const test = this;
    const baseName = test.fake.random.word();
    const headerName = `${baseName}-header.html`;
    const entriesName = `${baseName}-entries.html`;

    await setView(test.template.id, {
      name: headerName,
      content: `{{> ${entriesName}}}`,
    });

    try {
      await setView(test.template.id, {
        name: entriesName,
        content: `{{> ${headerName}}}`,
      });

      throw new Error("Expected setView to fail");
    } catch (err) {
      expect(err instanceof Error).toBe(true);
      expect(err.message).toContain("infinitely nested partials");
    }
  });

  it("won't set a view against a template that does not exist", async function () {
    const test = this;
    const view = { name: test.fake.random.word() };

    try {
      await setView(test.fake.random.word(), view);
    } catch (err) {
      expect(err instanceof Error).toBe(true);
    }
  });

  // In future this should return an error to the callback, lol
  it("won't set a view with a name that is not a string", async function () {
    const test = this;

    try {
      await setView(test.template.id, { name: null });
    } catch (err) {
      expect(err instanceof Error).toBe(true);
    }
  });

  it("updates the cache ID of the blog which owns a template after setting a view", async function () {
    const test = this;
    const initialCacheID = test.blog.cacheID;
    const view = { name: test.fake.random.word() };

    await setView(test.template.id, view);
    const blog = await promisify(Blog.get)({ id: test.template.owner });

    expect(blog.cacheID).not.toEqual(initialCacheID);
  });

  it("will save a view with a url array", async function () {
    await setView(this.template.id, {
      name: "index.html",
      url: ["/a", "/b"],
    });

    const view1 = await getView(this.template.id, "index.html");

    expect(view1.urlPatterns).toEqual(["/a", "/b"]);
    expect(view1.url).toEqual("/a");

    await setView(this.template.id, {
      name: "index.html",
      url: "/a",
    });

    const view2 = await getView(this.template.id, "index.html");

    expect(view2.urlPatterns).toEqual(["/a"]);
    expect(view2.url).toEqual("/a");
  });

  it("will get and set a view with or without the internal urlPatterns array", async function () {
    await setView(this.template.id, {
      name: "index.html",
      content: "123",
      url: "/a",
    });

    const view1 = await getView(this.template.id, "index.html");

    expect(view1.content).toEqual("123");

    const res = await hdel(key.urlPatterns(this.template.id), "index.html");

    expect(res).toEqual(1);

    await setView(this.template.id, {
      name: "index.html",
      content: "456",
    });

    const view2 = await getView(this.template.id, "index.html");

    expect(view2.content).toEqual("456");
  });
});
