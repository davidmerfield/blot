describe("plugin helper", function () {
  require("./util/setup")();

  it("returns CSS only for the requested enabled plugin", async function () {
    const plugins = {
      ...this.blog.plugins,
      katex: { enabled: true },
      zoom: { enabled: true },
    };

    await this.blog.update({ plugins });
    await this.template({ "style.css": "{{{plugin.katex.css}}}" });

    const css = await this.text("/style.css");

    expect(css).toContain(".katex");
    expect(css).not.toContain("zoom-overlay");
  });

  it("omits disabled plugins", async function () {
    const plugins = { ...this.blog.plugins, katex: { enabled: false } };

    await this.blog.update({ plugins });
    await this.template({ "style.css": "{{{plugin.katex.css}}}" });

    const css = await this.text("/style.css");

    expect(css.trim()).toEqual("");
  });
});
