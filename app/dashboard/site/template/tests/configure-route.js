describe("configure view route", function () {
  global.test.blog();

  const Template = require("models/template");
  const SourceCode = require("../source-code");

  function getConfigureHandlers() {
    const layer = SourceCode.stack.find(function (stackLayer) {
      return stackLayer.route && stackLayer.route.path === "/:viewSlug/configure";
    });

    const handlers = {};

    if (!layer || !layer.route || !layer.route.stack) {
      throw new Error("Configure route stack was not found");
    }

    layer.route.stack.forEach(function (routeLayer) {
      if (routeLayer.method === "get") handlers.get = routeLayer.handle;
      if (routeLayer.method === "post") handlers.post = routeLayer.handle;
    });

    return handlers;
  }

  afterEach(function () {
    if (Template.setView.and) Template.setView.and.callThrough();
  });

  it("injects default metadata for the configure view", function () {
    const handlers = getConfigureHandlers();

    const req = {
      params: { viewSlug: "index.html" },
      view: { name: "index.html" },
      template: { id: "template", name: "Template", localEditing: false },
      blog: this.blog,
    };

    const res = {
      locals: {
        base: "/dashboard/site/template",
        getAllViews: { views: {} },
      },
      render: jasmine.createSpy("render"),
    };

    handlers.get(req, res);

    expect(res.render).toHaveBeenCalledWith(
      "dashboard/template/source-code/configure"
    );

    const parsed = JSON.parse(req.view.content);

    expect(parsed.url).toEqual("/index.html");
    expect(parsed.locals).toEqual({});
    expect(parsed.partials).toEqual({});
    expect(req.view.editorMode).toEqual("javascript");
    expect(req.view.formAction).toEqual(
      "/dashboard/site/template/source-code/index.html/configure"
    );
    expect(req.view.showingConfig).toBe(true);
    expect(req.view.showingSource).toBe(false);
  });

  it("bubbles JSON parse errors", function () {
    const handlers = getConfigureHandlers();

    const req = {
      params: { viewSlug: "index.html" },
      view: { name: "index.html" },
      template: { id: "template", name: "Template", localEditing: false },
      blog: this.blog,
      body: { content: "not json" },
    };

    const res = {
      locals: {
        base: "/dashboard/site/template",
        getAllViews: { views: {} },
      },
    };

    const next = jasmine.createSpy("next");

    handlers.post(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(next.calls.mostRecent().args[0] instanceof Error).toBe(true);
  });

  it("saves configuration updates", function (done) {
    const handlers = getConfigureHandlers();

    const req = {
      params: { viewSlug: "index.html" },
      view: { name: "index.html" },
      template: { id: "template", name: "Template", localEditing: false },
      blog: this.blog,
      body: {
        content: JSON.stringify({
          url: ["/foo", "/bar"],
          locals: { title: "Hello" },
          partials: { header: "header" },
        }),
      },
    };

    const res = {
      locals: {
        base: "/dashboard/site/template",
        getAllViews: { views: {} },
        templateForked: true,
      },
      set: jasmine.createSpy("set"),
      send: jasmine.createSpy("send").and.callFake(function () {
        expect(res.set).toHaveBeenCalledWith("X-Template-Forked", "1");
        expect(res.send).toHaveBeenCalledWith("Saved changes!");
        done();
      }),
    };

    spyOn(Template, "setView").and.callFake(function (templateID, updates, cb) {
      expect(templateID).toEqual("template");
      expect(updates).toEqual({
        name: "index.html",
        url: ["/foo", "/bar"],
        locals: { title: "Hello" },
        partials: { header: "header" },
      });
      cb();
    });

    handlers.post(req, res, function (err) {
      if (err) return done.fail(err);
    });
  });
});
