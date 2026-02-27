describe("models/redirects migration", function () {
  function withMockedRedirectModules(clientImpl, run) {
    var getPath = require.resolve("../get");
    var listPath = require.resolve("../list");
    var checkPath = require.resolve("../check");
    var dropPath = require.resolve("../drop");
    var setPath = require.resolve("../set");
    var clientPath = require.resolve("models/client-new");

    var oldGet = require.cache[getPath];
    var oldList = require.cache[listPath];
    var oldCheck = require.cache[checkPath];
    var oldDrop = require.cache[dropPath];
    var oldSet = require.cache[setPath];
    var oldClient = require.cache[clientPath];

    require.cache[clientPath] = {
      id: clientPath,
      filename: clientPath,
      loaded: true,
      exports: clientImpl,
    };

    delete require.cache[getPath];
    delete require.cache[listPath];
    delete require.cache[checkPath];
    delete require.cache[dropPath];
    delete require.cache[setPath];

    try {
      run({
        get: require("../get"),
        list: require("../list"),
        check: require("../check"),
        drop: require("../drop"),
        set: require("../set"),
      });
    } finally {
      delete require.cache[getPath];
      delete require.cache[listPath];
      delete require.cache[checkPath];
      delete require.cache[dropPath];
      delete require.cache[setPath];

      if (oldClient) require.cache[clientPath] = oldClient;
      else delete require.cache[clientPath];

      if (oldGet) require.cache[getPath] = oldGet;
      if (oldList) require.cache[listPath] = oldList;
      if (oldCheck) require.cache[checkPath] = oldCheck;
      if (oldDrop) require.cache[dropPath] = oldDrop;
      if (oldSet) require.cache[setPath] = oldSet;
    }
  }

  it("set replaces redirects atomically using client-new multi command shapes", function (done) {
    var calls = [];

    withMockedRedirectModules(
      {
        zRange: async function () {
          return ["/old"];
        },
        multi: function () {
          return {
            del: function (keys) {
              calls.push(["del", keys]);
              return this;
            },
            zAdd: function (key, payload) {
              calls.push(["zAdd", key, payload]);
              return this;
            },
            set: function (key, value) {
              calls.push(["set", key, value]);
              return this;
            },
            exec: async function () {
              calls.push(["exec"]);
              return [1, 1, 1];
            },
          };
        },
      },
      function (redirects) {
        redirects.set(
          "blog-1",
          [
            { from: "/a", to: "/b" },
            { from: "/b", to: "/a" }, // dropped by loop prevention
          ],
          function (err) {
            expect(err).toBeUndefined();
            expect(calls[0]).toEqual([
              "del",
              ["blog:blog-1:redirect:/old", "blog:blog-1:redirects"],
            ]);
            expect(calls[1]).toEqual([
              "zAdd",
              "blog:blog-1:redirects",
              { score: 0, value: "/a" },
            ]);
            expect(calls[2]).toEqual([
              "set",
              "blog:blog-1:redirect:/a",
              "/b",
            ]);
            expect(calls[3]).toEqual(["exec"]);
            done();
          }
        );
      }
    );
  });

  it("list returns ordered redirects", function (done) {
    withMockedRedirectModules(
      {
        zRange: async function () {
          return ["/from-1", "/from-2"];
        },
        mGet: async function () {
          return ["/to-1", "/to-2"];
        },
      },
      function (redirects) {
        redirects.list("blog-1", function (err, allRedirects) {
          expect(err).toBeNull();
          expect(allRedirects).toEqual([
            { from: "/from-1", to: "/to-1", index: 0 },
            { from: "/from-2", to: "/to-2", index: 1 },
          ]);
          done();
        });
      }
    );
  });

  it("check resolves regex redirects after exact miss", function (done) {
    withMockedRedirectModules(
      {
        get: async function (redisKey) {
          if (redisKey === "blog:blog-1:redirect:/post/(.*)") {
            return "/new/$1";
          }

          return null;
        },
        zScan: async function () {
          return {
            cursor: "0",
            members: [{ value: "/post/(.*)", score: 0 }],
          };
        },
      },
      function (redirects) {
        redirects.check("blog-1", "/post/title", function (err, result) {
          expect(err).toBeNull();
          expect(result).toBe("/new/title");
          done();
        });
      }
    );
  });

  it("drop removes zset member and value key", function (done) {
    var calls = [];

    withMockedRedirectModules(
      {
        zRem: async function (setKey, from) {
          calls.push(["zRem", setKey, from]);
        },
        del: async function (valueKey) {
          calls.push(["del", valueKey]);
        },
      },
      function (redirects) {
        redirects.drop("blog-1", "/from", function (err) {
          expect(err).toBeUndefined();
          expect(calls).toEqual([
            ["zRem", "blog:blog-1:redirects", "/from"],
            ["del", "blog:blog-1:redirect:/from"],
          ]);
          done();
        });
      }
    );
  });

  it("forwards redis rejections to callbacks including multi exec failure", function (done) {
    var getCalls = 0;

    withMockedRedirectModules(
      {
        zRange: async function () {
          return ["/from"];
        },
        multi: function () {
          return {
            del: function () {
              return this;
            },
            zAdd: function () {
              return this;
            },
            set: function () {
              return this;
            },
            exec: async function () {
              throw new Error("exec failed");
            },
          };
        },
        mGet: async function () {
          throw new Error("mGet failed");
        },
        get: async function () {
          getCalls++;

          if (getCalls === 1) throw new Error("get failed");

          return null;
        },
        zScan: async function () {
          throw new Error("zScan failed");
        },
        zRem: async function () {
          throw new Error("zRem failed");
        },
        del: async function () {
          throw new Error("del failed");
        },
      },
      function (redirects) {
        redirects.set("blog-1", [], function (setErr) {
          expect(setErr.message).toBe("exec failed");

          redirects.list("blog-1", function (listErr) {
            expect(listErr.message).toBe("mGet failed");

            redirects.get("blog-1", "/from", function (getErr) {
              expect(getErr.message).toBe("get failed");

              redirects.check("blog-1", "/x", function (checkErr) {
                expect(checkErr.message).toBe("zScan failed");

                redirects.drop("blog-1", "/from", function (dropErr) {
                  expect(dropErr.message).toBe("zRem failed");
                  done();
                });
              });
            });
          });
        });
      }
    );
  });
});
