
describe("render middleware", function() {

  require('blog/tests/util/setup')();
  const config = require("config");

  // it("should handle errors in retrieving the full view", function() {

  // });

  // it("should handle non-existing views", function() {

  // });

  it("rewrites CDN links to http for requests served over http", async function () {
    // forceSSL defaults to true, and vhosts.js redirects any plain-http
    // request to https before it reaches this middleware - disable it so
    // the request actually reaches the CDN-link rewrite branch below.
    await this.blog.update({ forceSSL: false });
    await this.template({ "entries.html": "{{{cdn}}}" });

    const res = await this.get("/", {
      headers: { "x-forwarded-proto": "http" },
    });
    const body = await res.text();

    expect(res.status).toEqual(200);
    expect(body).toEqual(config.cdn.origin.split("https://").join("http://"));
  });

  it("leaves CDN links as https for requests served over https", async function () {
    await this.template({ "entries.html": "{{{cdn}}}" });

    const body = await this.text("/");

    expect(body).toEqual(config.cdn.origin);
  });

  it("sends json when the query string debug or json is present", async function() {

    await this.write({path: '/a.txt', content: 'Link: /foo\n\nHello, world!'});
    await this.template({
      'entry.html': `Entry`
    });

    const res = await this.get('/foo?json=true');
    const body = await res.json();

    expect(res.status).toEqual(200);
    console.log(body);
    // expect body to be a json object
    expect(body.entry.path).toEqual('/a.txt');
    expect(body.feedURL).toEqual('/feed.rss');
    expect(body.handle).toEqual(this.blog.handle);
    expect(body.cacheID).toEqual(jasmine.any(Number));
  });

  it("replays a cached 301 redirect", async function () {
    const { set } = require("models/redirects");
    const { promisify } = require("util");
    await promisify(set)(this.blog.id, [{ from: "/go", to: "/somewhere" }]);

    const first = await this.get("/go", { redirect: "manual" });
    expect(first.status).toEqual(301);
    expect(first.headers.get("location")).toEqual("/somewhere");

    const second = await this.get("/go", { redirect: "manual" });
    expect(second.status).toEqual(301);
    expect(second.headers.get("location")).toEqual("/somewhere");
  });

  it("reuses a rendered page for the same cacheID without rendering twice", async function () {
    const Mustache = require("mustache");
    await this.template({
      "entries.html": "<p>Cached page</p>",
    });

    spyOn(Mustache, "render").and.callThrough();

    const first = await this.text("/");
    const rendersAfterFirst = Mustache.render.calls.count();
    const second = await this.text("/");

    expect(first).toContain("Cached page");
    expect(second).toEqual(first);
    expect(Mustache.render.calls.count()).toEqual(rendersAfterFirst);
  });

});