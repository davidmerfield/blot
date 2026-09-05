const fs = require("fs");
const path = require("path");
const mustache = require("mustache");

describe("profile homepage h-card", function () {
  const template = fs.readFileSync(
    path.join(__dirname, "../source/profile/entries.html"),
    "utf8"
  );

  const partials = {
    title: "{{title}}",
    navigation: "",
    footer: "",
    "post-list": "",
  };

  function render(view) {
    return mustache.render(template, view, partials);
  }

  function hcard(html) {
    const match = html.match(/<header class="h-card">([\s\S]*?)<\/header>/);
    expect(match).not.toBeNull();
    return match[1];
  }

  it("omits the avatar image when avatar is missing", function () {
    const html = hcard(render({ title: "David", description: "Writer" }));
    expect(html).not.toMatch(/<img\b/);
    expect(html).not.toMatch(/src=""/);
  });

  it("omits the avatar image when avatar is empty", function () {
    const html = hcard(
      render({ title: "David", description: "Writer", avatar: "" })
    );
    expect(html).not.toMatch(/<img\b/);
    expect(html).not.toMatch(/src=""/);
  });

  it("keeps an h-card u-url when avatar is missing", function () {
    const html = hcard(render({ title: "David", description: "Writer" }));
    expect(html).toMatch(/<a class="u-url" href="\/" rel="me">David<\/a>/);
  });

  it("renders the avatar and u-url when avatar is present", function () {
    const html = hcard(
      render({
        title: "David",
        description: "Writer",
        avatar: "/avatar.jpg",
      })
    );
    expect(html).toMatch(/id="avatar"/);
    expect(html).toMatch(/class="u-photo"/);
    expect(html).toMatch(/src="\/avatar.jpg"/);
    expect(html).toMatch(/<a class="u-url" href="\/" rel="me">David<\/a>/);
  });

  it("renders the bio when description is set", function () {
    const html = hcard(render({ title: "David", description: "Writer" }));
    expect(html).toMatch(/<h4 class="p-role">Writer<\/h4>/);
  });

  it("omits the bio when description is missing", function () {
    const html = hcard(render({ title: "David" }));
    expect(html).not.toMatch(/<h4\b/);
    expect(html).not.toMatch(/A short description/);
  });

  it("omits the bio when description is empty", function () {
    const html = hcard(render({ title: "David", description: "" }));
    expect(html).not.toMatch(/<h4\b/);
  });
});

describe("profile template defaults", function () {
  const locals = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../source/profile/package.json"),
      "utf8"
    )
  ).locals;
  const css = fs.readFileSync(
    path.join(__dirname, "../source/profile/style.css"),
    "utf8"
  );

  it("does not ship placeholder author, bio, email, or micro.blog values", function () {
    expect(locals.author).toBe("");
    expect(locals.description).toBe("");
    expect(locals.email).toBe("");
    expect(locals.microblog_user).toBe("");
  });

  it("paints an opaque white page so gallery screenshots are not transparent", function () {
    expect(css).toMatch(/html,\s*body\s*\{[^}]*background:\s*#fff/);
    expect(css).toMatch(/\nbody\s*\{[^}]*background:\s*#fff/);
  });
});
