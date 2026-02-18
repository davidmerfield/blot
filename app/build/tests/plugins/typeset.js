describe("typeset plugin", function () {
  require("./util/setup")();

  it("treats string false values as disabled for punctuation and small caps", async function (done) {
    const path = "/typeset-disabled.txt";
    const content = 'He said "Hello" -- and NASA.';

    this.blog.plugins.typeset = {
      enabled: true,
      options: {
        punctuation: "off",
        smallCaps: "false",
      },
    };

    await this.blog.write({ path, content });
    await this.blog.rebuild();

    const entry = await this.blog.check({ path });

    expect(entry.html).toContain('" -- and NASA.');
    expect(entry.html).not.toContain("&mdash;");
    expect(entry.html).not.toContain("“");
    expect(entry.html).not.toContain('<span class="small-caps">');

    done();
  });

  it("treats string true values as enabled for punctuation and small caps", async function (done) {
    const path = "/typeset-enabled.txt";
    const content = 'He said "Hello" -- and NASA.';

    this.blog.plugins.typeset = {
      enabled: "true",
      options: {
        punctuation: "on",
        smallCaps: "1",
      },
    };

    await this.blog.write({ path, content });
    await this.blog.rebuild();

    const entry = await this.blog.check({ path });

    expect(entry.html).toContain("&mdash;");
    expect(entry.html).toContain('<span class="small-caps">NASA</span>');

    done();
  });
});
