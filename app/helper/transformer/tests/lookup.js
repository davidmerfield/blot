describe("transformer", function () {
  var fs = require("fs-extra");
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

    this.transformer.lookup('Hello\\new%20World.txt', this.transform, function (err, result) {
      if (err) return done.fail(err);

      expect(result).toEqual(jasmine.any(Object));
      expect(result.size).toEqual(jasmine.any(Number));
      done();
    });
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

    this.transformer.lookup(this.path.toLowerCase(), this.transform, function (
      err,
      result
    ) {
      if (err) return done.fail(err);

      expect(result).toEqual(jasmine.any(Object));
      expect(result.size).toEqual(jasmine.any(Number));
      done();
    });
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

    test.transformer.lookup(test.path, firstTransform, function (
      err,
      firstResult,
      firstHash
    ) {
      if (err) return done.fail(err);

      test.transformer.lookup(test.path, secondTransform, function (
        err,
        secondResult,
        secondHash
      ) {
        if (err) return done.fail(err);

        expect(firstTransform).toHaveBeenCalled();
        expect(secondTransform).not.toHaveBeenCalled();
        expect(firstResult).toEqual(secondResult);
        expect(firstHash).toEqual(jasmine.any(String));
        expect(secondHash).toEqual(firstHash);

        done();
      });
    });
  });

  it("re-transforms the file if its contents changes", function (done) {
    var test = this;
    var spy = jasmine.createSpy().and.callFake(test.transform);
    var path = test.blogDirectory + "/" + test.path;

    test.transformer.lookup(test.path, test.transform, function (
      err,
      firstResult
    ) {
      if (err) return done.fail(err);

      // Modify the file
      fs.outputFileSync(path, Date.now().toString());

      test.transformer.lookup(test.path, spy, function (err, secondResult) {
        if (err) return done.fail(err);

        expect(spy).toHaveBeenCalled();
        expect(firstResult).not.toEqual(secondResult);

        done();
      });
    });
  });

  it("transforms a url", function (done) {
    this.transformer.lookup(this.url, this.transform, function (err, result) {
      if (err) return done.fail(err);

      expect(result).toEqual(jasmine.any(Object));
      expect(result.size).toEqual(jasmine.any(Number));
      done();
    });
  });
});
