describe("posts", function () {
  require("blog/tests/util/setup")();

  it("lists posts", async function () {
    await this.write({ path: "/a.txt", content: "Foo" });
    await this.write({ path: "/b.txt", content: "Bar" });
    await this.write({ path: "/c.txt", content: "Baz" });
    await this.write({ path: "/d.txt", content: "Qux" });
    await this.write({ path: "/e.txt", content: "Quux" });

    await this.template(
      {
        "foo.html": `{{#posts}}{{{name}}} {{/posts}}`,
      },
      {
        views: {
          "foo.html": {
            url: ["/foo", "/foo/page/:page"],
          },
        },
        locals: {
          page_size: 3,
        },
      }
    );

    const res = await this.get("/foo");
    const text = await res.text();

    expect(text.trim()).toEqual("e.txt d.txt c.txt");

    const res2 = await this.get("/foo/page/2");
    const text2 = await res2.text();
    expect(text2.trim()).toEqual("b.txt a.txt");
  });

  it("filters posts by query tag", async function () {
    await this.write({
      path: "/a.txt",
      content: "Title: A\nTags: foo\n\nA",
    });
    await this.write({
      path: "/b.txt",
      content: "Title: B\nTags: bar\n\nB",
    });
    await this.write({
      path: "/c.txt",
      content: "Title: C\nTags: foo\n\nC",
    });

    await this.template(
      {
        "foo.html": `{{#posts}}{{title}} {{/posts}}`,
      },
      {
        views: {
          "foo.html": {
            url: "/",
          },
        },
      }
    );

    const res = await this.get("/?tag=foo");
    const text = await res.text();

    expect(text.trim()).toEqual("C A");
  });

  it("filters posts by res.locals.tag", function (done) {
    const posts = require("blog/render/retrieve/posts");

    this.write({
      path: "/a.txt",
      content: "Title: A\nTags: foo\n\nA",
    })
      .then(() =>
        this.write({
          path: "/b.txt",
          content: "Title: B\nTags: bar\n\nB",
        })
      )
      .then(() => {
        const req = {
          blog: { id: this.blog.id },
          query: {},
          params: {},
          template: { locals: {} },
          log: function () {},
        };

        const res = {
          locals: {
            tag: "foo",
          },
        };

        posts(req, res, function (err, entries) {
          expect(err).toBeNull();
          expect(entries.map((entry) => entry.title)).toEqual(["A"]);
          done();
        });
      })
      .catch(done.fail);
  });

  it("filters posts by tag and path_prefix", async function () {
    await this.write({
      path: "/blog/one.txt",
      content: "Title: One\nTags: foo\n\nOne",
    });
    await this.write({
      path: "/notes/two.txt",
      content: "Title: Two\nTags: foo\n\nTwo",
    });
    await this.write({
      path: "/blog/three.txt",
      content: "Title: Three\nTags: bar\n\nThree",
    });

    await this.template(
      {
        "foo.html": `{{#posts}}{{title}} {{/posts}}`,
      },
      {
        views: {
          "foo.html": {
            url: "/",
          },
        },
        locals: {
          path_prefix: "/blog/",
        },
      }
    );

    const res = await this.get("/?tag=foo");
    const text = await res.text();

    expect(text.trim()).toEqual("One");
  });

  describe("rejects invalid page numbers", function () {
    const cases = [
      ["zero", "/page/0"],
      ["negative", "/page/-1"],
      ["decimal", "/page/1.5"],
      ["NaN", "/page/NaN"],
      ["Infinity", "/page/Infinity"],
      ["beyond MAX_SAFE_INTEGER", "/page/9007199254740999"],
      ["extreme overflow", "/page/99999999999999999999"],
      ["alphabetic", "/page/abc"],
    ];

    for (const [label, path] of cases) {
      it(`rejects ${label} (${path})`, async function () {
        const res = await this.get(path);
        expect(res.status).toEqual(400);
      });
    }
  });
});
