describe("clients/git/database", function () {
  function withMockedClient(clientImpl, run) {
    var databasePath = require.resolve("../database");
    var clientPath = require.resolve("models/client-new");

    var oldDatabase = require.cache[databasePath];
    var oldClient = require.cache[clientPath];

    require.cache[clientPath] = {
      id: clientPath,
      filename: clientPath,
      loaded: true,
      exports: clientImpl,
    };

    delete require.cache[databasePath];

    try {
      run(require("../database"));
    } finally {
      delete require.cache[databasePath];

      if (oldClient) require.cache[clientPath] = oldClient;
      else delete require.cache[clientPath];

      if (oldDatabase) require.cache[databasePath] = oldDatabase;
    }
  }

  it("createToken keeps callback API and setNX created semantics", function (done) {
    withMockedClient(
      {
        setNX: async function () {
          return true;
        },
      },
      function (database) {
        database.createToken("user-1", function (err, created) {
          expect(err).toBeNull();
          expect(created).toBe(1);
          done();
        });
      }
    );
  });

  it("createToken keeps callback API and setNX existing semantics", function (done) {
    withMockedClient(
      {
        setNX: async function () {
          return false;
        },
      },
      function (database) {
        database.createToken("user-1", function (err, created) {
          expect(err).toBeNull();
          expect(created).toBe(0);
          done();
        });
      }
    );
  });

  it("routes promise rejections to callbacks", function (done) {
    withMockedClient(
      {
        setNX: async function () {
          throw new Error("setNX failed");
        },
        set: async function () {
          throw new Error("set failed");
        },
        get: async function () {
          throw new Error("get failed");
        },
        del: async function () {
          throw new Error("del failed");
        },
      },
      function (database) {
        database.createToken("user-1", function (createErr) {
          expect(createErr.message).toBe("setNX failed");

          database.refreshToken("user-1", function (refreshErr) {
            expect(refreshErr.message).toBe("set failed");

            database.getToken("user-1", function (getErr) {
              expect(getErr.message).toBe("get failed");

              database.flush("user-1", function (flushErr) {
                expect(flushErr.message).toBe("del failed");

                database.setStatus("blog-1", "syncing", function (setStatusErr) {
                  expect(setStatusErr.message).toBe("set failed");

                  database.getStatus("blog-1", function (getStatusErr) {
                    expect(getStatusErr.message).toBe("get failed");

                    database.removeStatus("blog-1", function (removeStatusErr) {
                      expect(removeStatusErr.message).toBe("del failed");
                      done();
                    });
                  });
                });
              });
            });
          });
        });
      }
    );
  });
});
