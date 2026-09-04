describe("redirect conflicts", function () {
  const { promisify } = require("util");
  const Redirects = require("models/redirects");
  const Template = require("models/template");
  const Blog = require("models/blog");

  const conflicts = promisify(Redirects.conflicts);
  const createTemplate = promisify(Template.create);
  const setView = promisify(Template.setView);
  const setBlog = promisify(Blog.set);

  global.test.blog();

  it("does not warn for a path that nothing else uses", async function () {
    const annotated = await conflicts(this.blog, [
      { from: "/old-cms-url", to: "/" },
    ]);

    expect(annotated[0].conflict).toBeUndefined();
  });

  it("skips regex redirects", async function () {
    const annotated = await conflicts(this.blog, [
      { from: "/posts/(.*)", to: "/blog/$1" },
    ]);

    expect(annotated[0].conflict).toBeUndefined();
  });

  it("warns when a from path matches a post", async function () {
    await this.blog.write({
      path: "/Hello.txt",
      content: "Link: /hello\n\nHello world",
    });
    await this.blog.rebuild();

    const annotated = await conflicts(this.blog, [
      { from: "/hello", to: "/elsewhere" },
      { from: "/free", to: "/" },
    ]);

    expect(annotated[0].conflict.type).toEqual("post");
    expect(annotated[0].conflict.message).toMatch(/won't run/i);
    expect(annotated[0].conflict.message).toMatch(/post/i);
    expect(annotated[1].conflict).toBeUndefined();
  });

  it("warns when a from path matches a page", async function () {
    await this.blog.write({
      path: "/About.txt",
      content: "Page: yes\nLink: /about\n\nAbout this site",
    });
    await this.blog.rebuild();

    const annotated = await conflicts(this.blog, [
      { from: "/about", to: "/" },
    ]);

    expect(annotated[0].conflict.type).toEqual("page");
    expect(annotated[0].conflict.message).toMatch(/page/i);
  });

  it("does not warn for a draft at the same URL", async function () {
    await this.blog.write({
      path: "/Secret.txt",
      content: "Draft: yes\nLink: /secret\n\nSecret",
    });
    await this.blog.rebuild();

    const annotated = await conflicts(this.blog, [
      { from: "/secret", to: "/" },
    ]);

    expect(annotated[0].conflict).toBeUndefined();
  });

  it("warns for built-in routes", async function () {
    const annotated = await conflicts(this.blog, [
      { from: "/", to: "/elsewhere" },
      { from: "/search", to: "/" },
      { from: "/page/2", to: "/" },
      { from: "/tagged/foo", to: "/" },
    ]);

    expect(annotated[0].conflict.type).toEqual("route");
    expect(annotated[0].conflict.message).toMatch(/homepage/i);
    expect(annotated[1].conflict.type).toEqual("route");
    expect(annotated[1].conflict.message).toMatch(/search/i);
    expect(annotated[2].conflict.type).toEqual("route");
    expect(annotated[3].conflict.type).toEqual("route");
  });

  it("warns when a from path matches a template view", async function () {
    const template = await createTemplate(this.blog.id, "conflict-theme", {});

    await setView(template.id, {
      name: "archives.html",
      content: "archives",
      url: "/archives",
    });

    await setBlog(this.blog.id, { template: template.id });
    this.blog.template = template.id;

    const annotated = await conflicts(this.blog, [
      { from: "/archives", to: "/" },
    ]);

    expect(annotated[0].conflict.type).toEqual("template");
    expect(annotated[0].conflict.view).toEqual("archives.html");
    expect(annotated[0].conflict.message).toMatch(/template/i);
  });

  it("warns when a from path matches a file in the folder", async function () {
    await this.blog.write({
      path: "/notes.pdf",
      content: "not-an-entry",
    });

    const annotated = await conflicts(this.blog, [
      { from: "/notes.pdf", to: "/" },
    ]);

    expect(annotated[0].conflict.type).toEqual("file");
    expect(annotated[0].conflict.message).toMatch(/file/i);
  });

  it("prefers a post over a template view at the same URL", async function () {
    const template = await createTemplate(this.blog.id, "prefer-post", {});

    await setView(template.id, {
      name: "about.html",
      content: "about view",
      url: "/about",
    });

    await setBlog(this.blog.id, { template: template.id });
    this.blog.template = template.id;

    await this.blog.write({
      path: "/About.txt",
      content: "Link: /about\n\nAbout the author",
    });
    await this.blog.rebuild();

    const annotated = await conflicts(this.blog, [
      { from: "/about", to: "/" },
    ]);

    expect(annotated[0].conflict.type).toEqual("post");
  });
});
