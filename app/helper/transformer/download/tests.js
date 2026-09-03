const http = require("http");
const fs = require("fs");
const download = require("./index");

describe("transformer download", function () {
  it("rejects file URLs before fetching", function (done) {
    download("file:///etc/passwd", {}, function (err) {
      expect(err).toBeTruthy();
      expect(err.message).toMatch(/Invalid URL/);
      done();
    });
  });

  it("rejects link-local IP literals", function (done) {
    download("http://169.254.169.254/latest/meta-data/", {}, function (err) {
      expect(err).toBeTruthy();
      expect(err.code).toEqual("ERR_SSRF");
      done();
    });
  });

  it("does not follow a redirect onto a link-local address", function (done) {
    const server = http.createServer(function (req, res) {
      res.statusCode = 302;
      res.setHeader("Location", "http://169.254.169.254/latest/meta-data/");
      res.end();
    });

    server.listen(0, "127.0.0.1", function () {
      const port = server.address().port;
      const url = "http://127.0.0.1:" + port + "/redir";

      download(url, {}, function (err, path) {
        server.close();
        expect(err).toBeTruthy();
        expect(err.code).toEqual("ERR_SSRF");
        expect(path).toBeFalsy();
        done();
      });
    });
  });

  it("still downloads from a local test origin", function (done) {
    const body = "hello-ssrf";
    const server = http.createServer(function (req, res) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain");
      res.end(body);
    });

    server.listen(0, "127.0.0.1", function () {
      const port = server.address().port;
      const url = "http://127.0.0.1:" + port + "/ok";

      download(url, {}, function (err, path) {
        server.close();
        if (err) return done.fail(err);
        expect(path).toBeTruthy();
        expect(fs.readFileSync(path, "utf8")).toEqual(body);
        fs.unlinkSync(path);
        done();
      });
    });
  });
});
