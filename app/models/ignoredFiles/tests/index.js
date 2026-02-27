describe("models/ignoredFiles migration", function () {
  function withMockedClient(clientImpl, run) {
    var modelPath = require.resolve("../index");
    var legacyPath = require.resolve("../../ignoredFiles");
    var clientNewPath = require.resolve("models/client-new");
    var clientPath = require.resolve("models/client");

    var oldModel = require.cache[modelPath];
    var oldLegacy = require.cache[legacyPath];
    var oldClientNew = require.cache[clientNewPath];
    var oldClient = require.cache[clientPath];

    var usedOldClient = false;

    require.cache[clientPath] = {
      id: clientPath,
      filename: clientPath,
      loaded: true,
      exports: new Proxy(
        {},
        {
          get: function () {
            usedOldClient = true;
            throw new Error("models/client should not be used");
          },
        }
      ),
    };

    require.cache[clientNewPath] = {
      id: clientNewPath,
      filename: clientNewPath,
      loaded: true,
      exports: clientImpl,
    };

    delete require.cache[modelPath];
    delete require.cache[legacyPath];

    try {
      run(require("../index"), require("../../ignoredFiles"), function () {
        return usedOldClient;
      });
    } finally {
      delete require.cache[modelPath];
      delete require.cache[legacyPath];

      if (oldClientNew) require.cache[clientNewPath] = oldClientNew;
      else delete require.cache[clientNewPath];

      if (oldClient) require.cache[clientPath] = oldClient;
      else delete require.cache[clientPath];

      if (oldModel) require.cache[modelPath] = oldModel;
      if (oldLegacy) require.cache[legacyPath] = oldLegacy;
    }
  }

  it("uses models/client-new hash/del methods and normalized paths", function (done) {
    var calls = [];

    withMockedClient(
      {
        hSet: async function (key, field, value) {
          calls.push(["hSet", key, field, value]);
        },
        hDel: async function (key, field) {
          calls.push(["hDel", key, field]);
        },
        hGet: async function (key, field) {
          calls.push(["hGet", key, field]);
          return "TOO_LARGE";
        },
        hExists: async function (key, field) {
          calls.push(["hExists", key, field]);
          return 1;
        },
        del: async function (key) {
          calls.push(["del", key]);
          return 1;
        },
        hGetAll: async function (key) {
          calls.push(["hGetAll", key]);
          return {};
        },
      },
      function (ignoredFiles, legacyIgnoredFiles, usedOldClient) {
        ignoredFiles.add("b1", "folder//file.txt", "WRONG_TYPE", function () {
          ignoredFiles.drop("b1", "folder/file.txt", function () {
            ignoredFiles.getStatus("b1", "folder/file.txt", function (err, status) {
              expect(err).toBeNull();
              expect(status).toBe("TOO_LARGE");

              ignoredFiles.isIt("b1", "folder/file.txt", function (existsErr, exists) {
                expect(existsErr).toBeNull();
                expect(exists).toBe(true);

                ignoredFiles.flush("b1", function () {
                  ignoredFiles.get("b1", function (getErr, map) {
                    expect(getErr).toBeNull();
                    expect(map).toEqual({});

                    expect(usedOldClient()).toBe(false);
                    expect(legacyIgnoredFiles.add).toBe(ignoredFiles.add);
                    expect(calls).toEqual([
                      ["hSet", "blog:b1:ignored_files", "/folder/file.txt", "WRONG_TYPE"],
                      ["hDel", "blog:b1:ignored_files", "/folder/file.txt"],
                      ["hGet", "blog:b1:ignored_files", "/folder/file.txt"],
                      ["hExists", "blog:b1:ignored_files", "/folder/file.txt"],
                      ["del", "blog:b1:ignored_files"],
                      ["hGetAll", "blog:b1:ignored_files"],
                    ]);

                    done();
                  });
                });
              });
            });
          });
        });
      }
    );
  });

  it("keeps getArray reason mapping and filters unknown reasons", function (done) {
    withMockedClient(
      {
        hGetAll: async function () {
          return {
            "/media/huge.zip": "TOO_LARGE",
            "/tmp/unknown.bin": "UNKNOWN",
            "/public/logo.svg": "PUBLIC_FILE",
            "/notes/weird": "WRONG_TYPE",
          };
        },
      },
      function (ignoredFiles) {
        ignoredFiles.getArray("blog-1", function (err, list) {
          expect(err).toBeNull();
          expect(list).toEqual([
            {
              path: "media/huge.zip",
              reason: "too large",
              url: "/help",
            },
            {
              path: "public/logo.svg",
              reason: "a public file",
              url: "/help",
            },
            {
              path: "notes/weird",
              reason: "not a file Blot can process",
              url: "/help",
            },
          ]);
          done();
        });
      }
    );
  });

  it("converts hExists responses to booleans", function (done) {
    withMockedClient(
      {
        hExists: async function () {
          return 0;
        },
      },
      function (ignoredFiles) {
        ignoredFiles.isIt("blog-2", "x.txt", function (err, exists) {
          expect(err).toBeNull();
          expect(exists).toBe(false);
          done();
        });
      }
    );
  });
});
