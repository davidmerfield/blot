describe("entry.get", function () {
  function withRedisMock(redisImpl, run) {
    const modulePath = require.resolve("../get");
    const redisPath = require.resolve("models/client-new");

    const oldGet = require.cache[modulePath];
    const oldRedis = require.cache[redisPath];

    require.cache[redisPath] = {
      id: redisPath,
      filename: redisPath,
      loaded: true,
      exports: redisImpl,
    };

    delete require.cache[modulePath];

    try {
      const get = require("../get");
      run(get);
    } finally {
      delete require.cache[modulePath];

      if (oldRedis) require.cache[redisPath] = oldRedis;
      else delete require.cache[redisPath];

      if (oldGet) require.cache[modulePath] = oldGet;
      else delete require.cache[modulePath];
    }
  }

  it("handles mGet rejection without throwing and returns predictable fallback", function (done) {
    const unhandled = jasmine.createSpy("unhandledRejection");
    process.on("unhandledRejection", unhandled);
    spyOn(console, "error");

    withRedisMock(
      {
        mGet: function () {
          return Promise.reject(new Error("redis down"));
        },
      },
      function (get) {
        expect(function () {
          get("blog-id", ["/one"], function (entries) {
            expect(entries).toEqual([]);

            setTimeout(function () {
              expect(console.error).toHaveBeenCalled();
              expect(unhandled).not.toHaveBeenCalled();
              process.removeListener("unhandledRejection", unhandled);
              done();
            }, 0);
          });
        }).not.toThrow();
      }
    );
  });
});
