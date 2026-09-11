const avatarUrl = require("../avatar_url");
const encodeJSON = require("../encode_json");
const encodeURIComponentLocal = require("../encode_uri_component");

function run(fn, req) {
  return new Promise((resolve, reject) => {
    fn(req, {}, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function getLambda(fn, req) {
  return new Promise((resolve, reject) => {
    fn(req || {}, {}, (err, factory) =>
      err ? reject(err) : resolve(factory())
    );
  });
}

describe("simple pass-through retrieve locals", function () {
  it("avatar_url returns the blog's avatar", async function () {
    const result = await run(avatarUrl, {
      blog: { avatar: "https://cdn/avatar.png" },
    });
    expect(result).toEqual("https://cdn/avatar.png");
  });
});

describe("encode_json", function () {
  it("escapes characters mustache's default escaping leaves alone, e.g. newlines", async function () {
    const lambda = await getLambda(encodeJSON);
    const render = (text) => text;

    expect(lambda("Hello\nWorld", render)).toEqual("Hello\\nWorld");
  });

  it("returns the rendered text unchanged if it cannot be JSON encoded", async function () {
    const lambda = await getLambda(encodeJSON);
    // JSON.stringify throws on a BigInt - exercises the catch branch.
    const unserializable = 10n;
    const render = () => unserializable;

    expect(lambda("ignored", render)).toBe(unserializable);
  });
});

describe("encode_uri_component", function () {
  it("percent-encodes the rendered text", async function () {
    const lambda = await getLambda(encodeURIComponentLocal);
    const render = (text) => text;

    expect(lambda("A/B?c=d", render)).toEqual(encodeURIComponent("A/B?c=d"));
  });

  it("returns the rendered text unchanged if it cannot be encoded", async function () {
    const lambda = await getLambda(encodeURIComponentLocal);
    // A lone surrogate makes encodeURIComponent throw a URIError.
    const malformed = "\uD800";
    const render = () => malformed;

    expect(lambda("ignored", render)).toEqual(malformed);
  });
});
