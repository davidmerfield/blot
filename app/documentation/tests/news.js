const Express = require("express");

const newsPath = require.resolve("../news");

const setModuleMock = (moduleName, exportsValue, touched) => {
  const resolved = require.resolve(moduleName);
  touched.push({ resolved, previous: require.cache[resolved] });
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue,
  };
};

const restoreModuleMocks = (touched) => {
  touched.reverse().forEach(({ resolved, previous }) => {
    if (previous) {
      require.cache[resolved] = previous;
    } else {
      delete require.cache[resolved];
    }
  });
};

describe("documentation news routes", function () {
  let touched;
  let client;
  let Email;
  let server;
  const origin = "http://localhost:8928";

  beforeEach(function (done) {
    touched = [];

    client = {
      sIsMember: jasmine.createSpy("sIsMember").and.returnValue(Promise.resolve(1)),
      setEx: jasmine.createSpy("setEx").and.returnValue(Promise.resolve("OK")),
      get: jasmine.createSpy("get").and.returnValue(Promise.resolve("reader@example.com")),
      sRem: jasmine.createSpy("sRem").and.returnValue(Promise.resolve(1)),
      sAdd: jasmine.createSpy("sAdd").and.returnValue(Promise.resolve(1)),
    };

    Email = {
      NEWSLETTER_CANCELLATION_CONFIRMATION: jasmine
        .createSpy("NEWSLETTER_CANCELLATION_CONFIRMATION")
        .and.callFake((_, __, callback) => callback()),
      NEWSLETTER_CANCELLATION_CONFIRMED: jasmine
        .createSpy("NEWSLETTER_CANCELLATION_CONFIRMED")
        .and.callFake((_, __, callback) => callback()),
      NEWSLETTER_SUBSCRIPTION_CONFIRMATION: jasmine
        .createSpy("NEWSLETTER_SUBSCRIPTION_CONFIRMATION")
        .and.callFake((_, __, callback) => callback()),
      NEWSLETTER_SUBSCRIPTION_CONFIRMED: jasmine
        .createSpy("NEWSLETTER_SUBSCRIPTION_CONFIRMED")
        .and.callFake((_, __, callback) => callback()),
    };

    setModuleMock("models/client-new", client, touched);
    setModuleMock("helper/email", Email, touched);
    setModuleMock("uuid/v4", () => "123e4567-e89b-12d3-a456-426614174000", touched);
    setModuleMock("../tools/git-commits", { middleware: (req, res, next) => next() }, touched);

    delete require.cache[newsPath];

    const app = Express();

    app.use((req, res, next) => {
      res.locals.breadcrumbs = ["news", "guid"];
      res.render = function (_view) {
        this.status(200).send("rendered");
      };
      next();
    });

    app.use("/news", require("../news"));

    app.use((err, req, res, next) => {
      res.status(500).send(err.message);
    });

    server = app.listen(8928, done);
  });

  afterEach(function (done) {
    delete require.cache[newsPath];
    restoreModuleMocks(touched);
    server.close(done);
  });

  it("POST /news/sign-up redirects and stores confirmation key for 1 day", async function () {
    const response = await fetch(origin + "/news/sign-up", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "contact_gfhkj=Reader%40Example.com",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/news/sign-up?email=reader@example.com");
    expect(client.setEx).toHaveBeenCalledWith(
      "newsletter:confirm:123e4567e89b12d3a456426614174000",
      60 * 60 * 24,
      "reader@example.com"
    );
    expect(Email.NEWSLETTER_SUBSCRIPTION_CONFIRMATION).toHaveBeenCalled();
  });

  it("POST /news/sign-up fails when contact email is missing", async function () {
    const response = await fetch(origin + "/news/sign-up", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "",
      redirect: "manual",
    });

    expect(response.status).toBe(500);
    expect(client.setEx).not.toHaveBeenCalled();
  });

  it("POST /news/cancel redirects and sends cancellation confirmation", async function () {
    const response = await fetch(origin + "/news/cancel", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=Reader%40Example.com",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/news/cancel?email=reader@example.com");
    expect(client.sIsMember).toHaveBeenCalledWith("newsletter:list", "reader@example.com");
    expect(client.setEx).toHaveBeenCalledWith(
      "newsletter:cancel:123e4567e89b12d3a456426614174000",
      60 * 60 * 24,
      "reader@example.com"
    );
    expect(Email.NEWSLETTER_CANCELLATION_CONFIRMATION).toHaveBeenCalled();
  });

  it("POST /news/cancel fails when email is missing", async function () {
    const response = await fetch(origin + "/news/cancel", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "",
      redirect: "manual",
    });

    expect(response.status).toBe(500);
    expect(client.sIsMember).not.toHaveBeenCalled();
  });

  it("GET /news/confirm/:guid redirects and only sends confirmation email when added", async function () {
    client.sAdd.and.returnValue(Promise.resolve(1));

    const response = await fetch(origin + "/news/confirm/abc-guid", {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/news/confirmed");
    expect(client.get).toHaveBeenCalledWith("newsletter:confirm:abc-guid");
    expect(client.sAdd).toHaveBeenCalledWith("newsletter:list", "reader@example.com");
    expect(Email.NEWSLETTER_SUBSCRIPTION_CONFIRMED).toHaveBeenCalled();
  });

  it("GET /news/confirm/:guid fails when guid lookup has no email", async function () {
    client.get.and.returnValue(Promise.resolve(null));

    const response = await fetch(origin + "/news/confirm/missing-guid", {
      redirect: "manual",
    });

    expect(response.status).toBe(500);
    expect(client.sAdd).not.toHaveBeenCalled();
  });

  it("GET /news/cancel/:guid renders cancelled and only sends email when removed", async function () {
    client.sRem.and.returnValue(Promise.resolve(1));

    const response = await fetch(origin + "/news/cancel/abc-guid", {
      redirect: "manual",
    });

    expect(response.status).toBe(200);
    expect(client.get).toHaveBeenCalledWith("newsletter:cancel:abc-guid");
    expect(client.sRem).toHaveBeenCalledWith("newsletter:list", "reader@example.com");
    expect(Email.NEWSLETTER_CANCELLATION_CONFIRMED).toHaveBeenCalled();
  });

  it("GET /news/cancel/:guid fails when guid lookup has no email", async function () {
    client.get.and.returnValue(Promise.resolve(null));

    const response = await fetch(origin + "/news/cancel/missing-guid", {
      redirect: "manual",
    });

    expect(response.status).toBe(500);
    expect(client.sRem).not.toHaveBeenCalled();
  });
});
