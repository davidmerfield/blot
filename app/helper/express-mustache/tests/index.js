describe("express-mustache", function () {
  it("works", async function () {
    const { app, listen, fetch, outputFile } = this;

    await outputFile("/index.html", "Hello, world!");

    app.get("/", (req, res) => res.render("index"));

    await listen();

    expect(await fetch("/")).toEqual(`Hello, world!`);
  });

  it("lets you manipulate html", async function () {
    const { app, listen, fetch, outputFile } = this;

    await outputFile("/index.html", "<h1>Hello</h1>");

    const addID = ($) => {
      $("h1").each((i, node) => {
        $(node).attr("id", $(node).text().toLowerCase());
      });
      return $;
    };

    const addAnchor = ($) => {
      $("h1").each((i, node) =>
        $(node).html(`<a href="#${$(node).attr("id")}"></a>${$(node).html()}`)
      );
      return $;
    };

    const noFollow = ($) => {
      $("a").each((i, node) => $(node).attr("rel", "nofollow"));
      return $;
    };

    app.set("transformers", [addID, addAnchor]);

    app.get("/", (req, res) => {
      res.locals.transformers = [noFollow];
      res.render("index");
    });

    await listen();

    expect(await fetch("/")).toEqual(
      `<h1 id="hello"><a href="#hello" rel="nofollow"></a>Hello</h1>`
    );
  });

  it("renders a variable", async function () {
    const { app, listen, fetch, outputFile } = this;

    await outputFile("/index.html", "Hello, {{name}}!");

    app.locals.name = "David";
    app.get("/", (req, res) => res.render("index"));

    await listen();

    expect(await fetch("/")).toEqual(`Hello, David!`);
  });

  it("caches views when .enable('view cache') ", async function () {
    const { app, listen, fetch, outputFile } = this;

    await outputFile("/index.html", "Hello");
    app.enable("view cache");
    app.get("/", (req, res) => res.render("index"));
    await listen();
    expect(await fetch("/")).toEqual(`Hello`);
    await outputFile("/index.html", "Bye");
    expect(await fetch("/")).toEqual(`Hello`);
  });

  it("does not cache views when .disable('view cache') ", async function () {
    const { app, listen, fetch, outputFile } = this;

    await outputFile("/index.html", "Hello");
    app.disable("view cache");
    app.get("/", (req, res) => res.render("index"));
    await listen();
    expect(await fetch("/")).toEqual(`Hello`);
    await outputFile("/index.html", "Bye");
    expect(await fetch("/")).toEqual(`Bye`);
  });

  it("renders a view from an absolute path", async function () {
    const { app, listen, fetch, outputFile } = this;

    await outputFile("/index.html", "Hello, {{name}}!");

    app.locals.name = "David";
    app.get("/", (req, res) => res.render(this.views + "/index.html"));

    await listen();

    expect(await fetch("/")).toEqual(`Hello, David!`);
  });

  it("renders partials with an absolute path", async function () {
    const { app, listen, fetch, outputFile } = this;

    await outputFile("/index.html", "Hello {{> name}}");
    await outputFile("/sub/name.html", "David");

    app.locals.name = "David";
    app.locals.partials = { name: this.views + "/sub/name.html" };

    app.get("/", (req, res) => res.render("index"));

    await listen();

    expect(await fetch("/")).toEqual(`Hello David`);
  });

  it("renders partials as app settings", async function () {
    const { app, listen, fetch, outputFile } = this;

    await outputFile("/index.html", "Hello {{> name}}");
    await outputFile("/sub/name.html", "John");

    app.locals.name = "David";
    app.set("partials", { name: "sub/name.html" });
    app.get("/", (req, res) => res.render("index"));

    await listen();

    expect(await fetch("/")).toEqual(`Hello John`);
  });

  it("renders a partials in the partials subdirectory", async function () {
    const { app, listen, fetch, outputFile } = this;

    await outputFile("/index.html", "Hello, {{> name}}");
    await outputFile("/partials/name.html", "{{first}} {{last}}!");

    app.locals.first = "David";
    app.locals.last = "Merf";
    app.get("/", (req, res) => res.render("index"));

    await listen();

    expect(await fetch("/")).toEqual(`Hello, David Merf!`);
  });

  const fs = require("fs-extra");

  beforeEach(async function () {
    const fetch = require("node-fetch");
    const { join } = require("path");
    const port = 7766;
    const em = require("helper/express-mustache");
    const express = require("express");
    const app = express();
    const views = __dirname + "/data";

    app.set("view engine", "html");
    app.set("views", views);
    app.disable("view cache");
    app.engine("html", em);

    this.app = app;

    this.outputFile = (path, content) =>
      fs.outputFile(join(views, path), content, "utf-8");

    let server;

    this.listen = async () => {
      server = await app.listen(port);
    };

    this.close = async () => await server.close();

    this.views = views;

    this.fetch = async (path) => {
      const res = await fetch(`http://localhost:${port}${path}`);
      return await res.text();
    };
  });

  afterEach(async function () {
    await this.close();
    await fs.emptyDir(__dirname + "/data");
  });
});
