describe("transformer", function () {
  var fs = require("fs-extra");
  var Keys = require("../keys");
  var client = require("models/client");
  var STATIC_DIRECTORY = require("config").blog_static_files_dir;

  // Creates test environment
  require("./setup")({});

  it("transforms a file in the blog's directory", function (done) {
    this.transformer.lookup(this.path, this.transform, function (err, result) {
      if (err) return done.fail(err);

      expect(result).toEqual(jasmine.any(Object));
      expect(result.size).toEqual(jasmine.any(Number));
      done();
    });
  });

  it("transforms a file with incorrect case in the blog's directory", function (done) {
    this.path = this.path.toUpperCase();

    this.transformer.lookup(this.path, this.transform, function (err, result) {
      if (err) return done.fail(err);

      expect(result).toEqual(jasmine.any(Object));
      expect(result.size).toEqual(jasmine.any(Number));
      done();
    });
  });

  it("transforms a file with windows-style slashes and incorrect case in the blog's directory", function (done) {
    this.path = "/Hello/new world.txt";
    fs.moveSync(this.localPath, this.blogDirectory + this.path);

    this.transformer.lookup(
      "Hello\\new%20World.txt",
      this.transform,
      function (err, result) {
        if (err) return done.fail(err);

        expect(result).toEqual(jasmine.any(Object));
        expect(result.size).toEqual(jasmine.any(Number));
        done();
      },
    );
  });

  it("transforms a file whose path has been URI encoded", function (done) {
    this.path = "/Hello world.txt";
    fs.moveSync(this.localPath, this.blogDirectory + this.path);
    this.path = encodeURI(this.path);

    this.transformer.lookup(this.path, this.transform, function (err, result) {
      if (err) return done.fail(err);

      expect(result).toEqual(jasmine.any(Object));
      expect(result.size).toEqual(jasmine.any(Number));
      done();
    });
  });

  it("transforms a file whose path with incorrect case contains an accent and URI encoded characters", function (done) {
    this.path = "/Hållœ wòrld.txt";
    fs.moveSync(this.localPath, this.blogDirectory + this.path);
    this.path = encodeURI(this.path);

    this.transformer.lookup(
      this.path.toLowerCase(),
      this.transform,
      function (err, result) {
        if (err) return done.fail(err);

        expect(result).toEqual(jasmine.any(Object));
        expect(result.size).toEqual(jasmine.any(Number));
        done();
      },
    );
  });

  it("will not transform a file that does not exist", function (done) {
    var spy = jasmine.createSpy().and.callFake(this.transform);

    fs.removeSync(this.blogDirectory + "/" + this.path);

    this.transformer.lookup(this.path, spy, function (err, result) {
      expect(err instanceof Error).toBe(true);
      expect(err.code).toEqual("ENOENT");
      expect(spy).not.toHaveBeenCalled();
      expect(result).not.toBeTruthy();
      done();
    });
  });
  it("transforms a file in the blog's static directory", function (done) {
    var fullPath = this.blogDirectory + "/" + this.path;
    var path = "/" + Date.now() + "-" + this.path;
    var newFullPath = STATIC_DIRECTORY + "/" + this.blog.id + path;

    fs.copySync(fullPath, newFullPath);

    this.transformer.lookup(path, this.transform, function (err, result) {
      if (err) return done.fail(err);

      expect(result).toEqual(jasmine.any(Object));
      expect(result.size).toEqual(jasmine.any(Number));
      done();
    });
  });

  it("transforms the same file once", function (done) {
    var test = this;
    var firstTransform = jasmine.createSpy().and.callFake(test.transform);
    var secondTransform = jasmine.createSpy().and.callFake(test.transform);

    test.transformer.lookup(
      test.path,
      firstTransform,
      function (err, firstResult) {
        if (err) return done.fail(err);

        test.transformer.lookup(
          test.path,
          secondTransform,
          function (err, secondResult) {
            if (err) return done.fail(err);

            expect(firstTransform).toHaveBeenCalled();
            expect(secondTransform).not.toHaveBeenCalled();
            expect(firstResult).toEqual(secondResult);

            done();
          },
        );
      },
    );
  });

  it("re-transforms the file if its contents changes", function (done) {
    var test = this;
    var spy = jasmine.createSpy().and.callFake(test.transform);
    var path = test.blogDirectory + "/" + test.path;

    test.transformer.lookup(
      test.path,
      test.transform,
      function (err, firstResult) {
        if (err) return done.fail(err);

        // Modify the file
        fs.outputFileSync(path, Date.now().toString());

        test.transformer.lookup(test.path, spy, function (err, secondResult) {
          if (err) return done.fail(err);

          expect(spy).toHaveBeenCalled();
          expect(firstResult).not.toEqual(secondResult);

          done();
        });
      },
    );
  });

  it("transforms a url", function (done) {
    this.transformer.lookup(this.url, this.transform, function (err, result) {
      if (err) return done.fail(err);

      expect(result).toEqual(jasmine.any(Object));
      expect(result.size).toEqual(jasmine.any(Number));
      done();
    });
  });

  it("uses cached transform when the url responds with 304", function (done) {
    var test = this;
    var firstTransform = jasmine.createSpy().and.callFake(test.transform);
    var secondTransform = jasmine.createSpy().and.callFake(test.transform);

    test.transformer.lookup(
      test.url,
      firstTransform,
      function (err, firstResult) {
        if (err) return done.fail(err);

        test.transformer.lookup(
          test.url,
          secondTransform,
          function (err, secondResult) {
            if (err) return done.fail(err);

            expect(firstTransform).toHaveBeenCalled();
            expect(secondTransform).not.toHaveBeenCalled();
            expect(secondResult).toEqual(firstResult);
            done();
          },
        );
      },
    );
  });

  it("reuses cached headers when the stored response is still fresh", function (done) {
    var test = this;
    var keys = Keys(test.blog.id, "transformer");
    var headersKey = keys.url.headers(test.url);
    var firstTransform = jasmine.createSpy().and.callFake(test.transform);
    var secondTransform = jasmine.createSpy().and.callFake(test.transform);
    var futureExpires = new Date(Date.now() + 60 * 60 * 1000).toUTCString();

    test.transformer.lookup(
      test.url,
      firstTransform,
      function (err, firstResult) {
        if (err) return done.fail(err);

        client.get(headersKey, function (err, stringifiedHeaders) {
          if (err) return done.fail(err);

          var headers = {};

          try {
            headers = JSON.parse(stringifiedHeaders) || {};
          } catch (e) {
            headers = {};
          }

          headers.expires = futureExpires;
          headers.url = test.url;

          client.set(headersKey, JSON.stringify(headers), function (err) {
            if (err) return done.fail(err);

            test.transformer.lookup(
              test.url,
              secondTransform,
              function (err, secondResult) {
                if (err) return done.fail(err);

                expect(firstTransform).toHaveBeenCalled();
                expect(secondTransform).not.toHaveBeenCalled();
                expect(secondResult).toEqual(firstResult);
                done();
              },
            );
          });
        });
      },
    );
  });

  describe("url download caching", function () {
    it("stores the transformed result after a successful download", function (done) {
      var test = this;
      var body = "Initial response " + Date.now();
      var etag = '"seq-etag-' + Date.now() + '"';
      var lastModified = new Date().toUTCString();
      var firstTransform = jasmine.createSpy().and.callFake(test.transform);
      var secondTransform = jasmine.createSpy().and.callFake(test.transform);

      test.queueRemoteResponse({
        body: body,
        etag: etag,
        lastModified: lastModified,
      });
      test.queueRemoteResponse({
        status: 304,
        etag: etag,
        lastModified: lastModified,
      });

      test.transformer.lookup(
        test.sequenceUrl,
        firstTransform,
        function (err, firstResult) {
          if (err) return done.fail(err);

          test.transformer.lookup(
            test.sequenceUrl,
            secondTransform,
            function (err, secondResult) {
              if (err) return done.fail(err);

              expect(firstTransform).toHaveBeenCalled();
              expect(secondTransform).not.toHaveBeenCalled();
              expect(secondResult).toEqual(firstResult);
              expect(firstResult.size).toEqual(Buffer.byteLength(body));

              done();
            },
          );
        },
      );
    });

    it("overwrites the cached result after a subsequent successful download", function (done) {
      var test = this;
      var firstBody = "First body " + Date.now();
      var secondBody = "Second body " + Date.now();
      var firstEtag = '"seq-etag-' + Date.now() + '-1"';
      var secondEtag = '"seq-etag-' + Date.now() + '-2"';
      var firstModified = new Date().toUTCString();
      var secondModified = new Date(Date.now() + 1000).toUTCString();
      var firstTransform = jasmine.createSpy().and.callFake(test.transform);
      var secondTransform = jasmine.createSpy().and.callFake(test.transform);

      test.queueRemoteResponse({
        body: firstBody,
        etag: firstEtag,
        lastModified: firstModified,
      });
      test.queueRemoteResponse({
        body: secondBody,
        etag: secondEtag,
        lastModified: secondModified,
      });

      test.transformer.lookup(
        test.sequenceUrl,
        firstTransform,
        function (err, firstResult) {
          if (err) return done.fail(err);

          test.transformer.lookup(
            test.sequenceUrl,
            secondTransform,
            function (err, secondResult) {
              if (err) return done.fail(err);

              expect(firstTransform).toHaveBeenCalled();
              expect(secondTransform).toHaveBeenCalled();
              expect(secondResult.size).toEqual(Buffer.byteLength(secondBody));
              expect(secondResult.size).not.toEqual(firstResult.size);

              done();
            },
          );
        },
      );
    });

    it("returns the last successful result when a download fails", function (done) {
      var test = this;
      var firstBody = "First body " + Date.now();
      var secondBody = "Second body " + Date.now();
      var firstEtag = '"seq-etag-' + Date.now() + '-1"';
      var secondEtag = '"seq-etag-' + Date.now() + '-2"';
      var firstModified = new Date().toUTCString();
      var secondModified = new Date(Date.now() + 1000).toUTCString();
      var firstTransform = jasmine.createSpy().and.callFake(test.transform);
      var secondTransform = jasmine.createSpy().and.callFake(test.transform);
      var thirdTransform = jasmine.createSpy().and.callFake(test.transform);

      test.queueRemoteResponse({
        body: firstBody,
        etag: firstEtag,
        lastModified: firstModified,
      });
      test.queueRemoteResponse({
        body: secondBody,
        etag: secondEtag,
        lastModified: secondModified,
      });
      test.queueRemoteResponse({ status: 500 });

      test.transformer.lookup(
        test.sequenceUrl,
        firstTransform,
        function (err, firstResult) {
          if (err) return done.fail(err);

          test.transformer.lookup(
            test.sequenceUrl,
            secondTransform,
            function (err, secondResult) {
              if (err) return done.fail(err);

              test.transformer.lookup(
                test.sequenceUrl,
                thirdTransform,
                function (err, thirdResult) {
                  if (err) return done.fail(err);

                  expect(firstTransform).toHaveBeenCalled();
                  expect(secondTransform).toHaveBeenCalled();
                  expect(thirdTransform).not.toHaveBeenCalled();
                  expect(secondResult.size).toEqual(
                    Buffer.byteLength(secondBody),
                  );
                  expect(thirdResult).toEqual(secondResult);

                  done();
                },
              );
            },
          );
        },
      );
    });
  });
});
