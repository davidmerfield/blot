const { renderToString, sendView } = require("../pipeline");
const { getBlog, getMetadata } = require("../../lib/models");

describe("render pipeline", function () {
  require("blog/tests/util/setup")();

  async function previewReqRes() {
    await this.template({
      "entries.html": "<html><body>Hello</body></html>",
    });

    const blog = await getBlog({ id: this.blog.id });
    const metadata = await getMetadata(blog.template);

    const req = {
      blog,
      preview: true,
      log: function () {},
      template: {
        locals: metadata.locals || {},
        id: blog.template,
        cdn: metadata.cdn || {},
      },
      query: {},
      protocol: "https",
      headers: {},
    };

    const res = { locals: { partials: {} } };

    return { req, res };
  }

  it("renderToString returns HTML without preview scripts even if req.preview is true", async function () {
    const { req, res } = await previewReqRes.call(this);
    const { output } = await renderToString(req, res, "entries.html");

    expect(output).toContain("Hello");
    expect(output).not.toContain("EventSource");
    expect(output).not.toContain("postMessage");
    expect(output).not.toContain("/__blot/preview/reload");
  });

  it("sendView injects preview EventSource and postMessage scripts on HTML", async function () {
    const { req, res } = await previewReqRes.call(this);
    let sent;

    res.header = function () {};
    res.set = function () {};
    res.send = function (output) {
      sent = output;
    };
    res.json = function () {};

    await sendView(req, res, "entries.html", function (err) {
      if (err) throw err;
    });

    expect(sent).toContain("Hello");
    expect(sent).toContain(
      "window.top.postMessage('iframe:' +  window.location.pathname, '*')"
    );
    expect(sent).toContain(
      "new EventSource('/__blot/preview/reload').onmessage"
    );
  });
});
