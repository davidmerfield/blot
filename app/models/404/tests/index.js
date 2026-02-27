describe("models/404 migration", function () {
  function withMockedClient(clientImpl, run) {
    var listPath = require.resolve("../list");
    var setPath = require.resolve("../set");
    var ignorePath = require.resolve("../ignore");
    var unignorePath = require.resolve("../unignore");
    var clientPath = require.resolve("models/client-new");

    var oldList = require.cache[listPath];
    var oldSet = require.cache[setPath];
    var oldIgnore = require.cache[ignorePath];
    var oldUnignore = require.cache[unignorePath];
    var oldClient = require.cache[clientPath];

    require.cache[clientPath] = {
      id: clientPath,
      filename: clientPath,
      loaded: true,
      exports: clientImpl,
    };

    delete require.cache[listPath];
    delete require.cache[setPath];
    delete require.cache[ignorePath];
    delete require.cache[unignorePath];

    try {
      run({
        list: require("../list"),
        set: require("../set"),
        ignore: require("../ignore"),
        unignore: require("../unignore"),
      });
    } finally {
      delete require.cache[listPath];
      delete require.cache[setPath];
      delete require.cache[ignorePath];
      delete require.cache[unignorePath];

      if (oldClient) require.cache[clientPath] = oldClient;
      else delete require.cache[clientPath];

      if (oldList) require.cache[listPath] = oldList;
      if (oldSet) require.cache[setPath] = oldSet;
      if (oldIgnore) require.cache[ignorePath] = oldIgnore;
      if (oldUnignore) require.cache[unignorePath] = oldUnignore;
    }
  }

  it("set records a URL and prunes/trims in a single multi exec", function (done) {
    var calls = [];

    withMockedClient(
      {
        multi: function () {
          return {
            zAdd: function (key, payload) {
              calls.push(["zAdd", key, payload]);
              return this;
            },
            zRemRangeByScore: function (key, min, max) {
              calls.push(["zRemRangeByScore", key, min, max]);
              return this;
            },
            zRemRangeByRank: function (key, start, stop) {
              calls.push(["zRemRangeByRank", key, start, stop]);
              return this;
            },
            exec: async function () {
              calls.push(["exec"]);
              return [1, 0, 0];
            },
          };
        },
      },
      function (models404) {
        models404.set("blog-1", "/missing", function (err) {
          expect(err).toBeUndefined();

          expect(calls.length).toBe(4);
          expect(calls[0][0]).toBe("zAdd");
          expect(calls[0][1]).toBe("blog:blog-1:404:everything");
          expect(calls[0][2].value).toBe("/missing");
          expect(typeof calls[0][2].score).toBe("number");

          expect(calls[1][0]).toBe("zRemRangeByScore");
          expect(calls[1][1]).toBe("blog:blog-1:404:everything");
          expect(calls[1][2]).toBe("-inf");
          expect(typeof calls[1][3]).toBe("number");
          expect(calls[2]).toEqual([
            "zRemRangeByRank",
            "blog:blog-1:404:everything",
            0,
            -500,
          ]);
          expect(calls[3]).toEqual(["exec"]);

          done();
        });
      }
    );
  });

  it("list returns active and ignored entries based on ignore-set membership", function (done) {
    withMockedClient(
      {
        sMembers: async function () {
          return ["/favicon.ico"];
        },
        zRangeWithScores: async function () {
          return [
            { value: "/missing", score: Date.now() },
            { value: "/favicon.ico", score: Date.now() - 1000 },
          ];
        },
      },
      function (models404) {
        models404.list("blog-1", function (err, list, ignored) {
          expect(err).toBeNull();
          expect(list.length).toBe(1);
          expect(ignored.length).toBe(1);
          expect(list[0].url).toBe("/missing");
          expect(ignored[0].url).toBe("/favicon.ico");
          expect(typeof list[0].time).toBe("string");
          done();
        });
      }
    );
  });

  it("ignore and unignore toggle set membership with callback results", function (done) {
    var ignored = new Set();

    withMockedClient(
      {
        sAdd: async function (_key, value) {
          var before = ignored.size;
          ignored.add(value);
          return ignored.size > before ? 1 : 0;
        },
        sRem: async function (_key, value) {
          var existed = ignored.has(value);
          ignored.delete(value);
          return existed ? 1 : 0;
        },
      },
      function (models404) {
        models404.ignore("blog-1", "/foo", function (err, added) {
          expect(err).toBeNull();
          expect(added).toBe(1);
          expect(ignored.has("/foo")).toBe(true);

          models404.unignore("blog-1", "/foo", function (unignoreErr, removed) {
            expect(unignoreErr).toBeNull();
            expect(removed).toBe(1);
            expect(ignored.has("/foo")).toBe(false);
            done();
          });
        });
      }
    );
  });

  it("passes Redis errors through callbacks with client-new method names", function (done) {
    withMockedClient(
      {
        multi: function () {
          return {
            zAdd: function () {
              return this;
            },
            zRemRangeByScore: function () {
              return this;
            },
            zRemRangeByRank: function () {
              return this;
            },
            exec: async function () {
              throw new Error("exec failed");
            },
          };
        },
        sMembers: async function () {
          throw new Error("sMembers failed");
        },
        zRangeWithScores: async function () {
          return [];
        },
        sAdd: async function () {
          throw new Error("sAdd failed");
        },
        sRem: async function () {
          throw new Error("sRem failed");
        },
      },
      function (models404) {
        models404.set("blog-1", "/foo", function (setErr) {
          expect(setErr.message).toBe("exec failed");

          models404.list("blog-1", function (listErr) {
            expect(listErr.message).toBe("sMembers failed");

            models404.ignore("blog-1", "/foo", function (ignoreErr) {
              expect(ignoreErr.message).toBe("sAdd failed");

              models404.unignore("blog-1", "/foo", function (unignoreErr) {
                expect(unignoreErr.message).toBe("sRem failed");
                done();
              });
            });
          });
        });
      }
    );
  });
});
