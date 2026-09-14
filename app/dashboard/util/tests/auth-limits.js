const {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  emailIsTooLong,
  passwordIsTooLong,
} = require("../auth-limits");
const express = require("express");
const http = require("http");
const parseAuth = require("../parse-auth");

describe("authentication form limits", function () {
  it("accepts an email at the maximum length", function () {
    expect(emailIsTooLong("a".repeat(MAX_EMAIL_LENGTH))).toBe(false);
  });

  it("rejects an email over the maximum length", function () {
    expect(emailIsTooLong("a".repeat(MAX_EMAIL_LENGTH + 1))).toBe(true);
  });

  it("accepts a password at the maximum byte length", function () {
    expect(passwordIsTooLong("a".repeat(MAX_PASSWORD_LENGTH))).toBe(false);
  });

  it("rejects a password over the maximum byte length", function () {
    expect(passwordIsTooLong("a".repeat(MAX_PASSWORD_LENGTH + 1))).toBe(true);
  });

  it("counts multi-byte password characters toward the byte limit", function () {
    expect(passwordIsTooLong("é".repeat(MAX_PASSWORD_LENGTH / 2 + 1))).toBe(
      true
    );
  });

  it("rejects request bodies over the auth form limit", async function () {
    const app = express();
    app.post("/", parseAuth, function (req, res) {
      res.sendStatus(200);
    });
    app.use(function (err, req, res, next) {
      res.sendStatus(err.status || 500);
    });

    const server = await new Promise(function (resolve) {
      const server = app.listen(0, function () {
        resolve(server);
      });
    });

    try {
      const response = await new Promise(function (resolve, reject) {
        const body = "field=" + "a".repeat(4096);
        const request = http.request({
          method: "POST",
          port: server.address().port,
          path: "/",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
          },
        }, resolve);
        request.on("error", reject);
        request.end(body);
      });

      expect(response.statusCode).toBe(413);
      response.resume();
    } finally {
      await new Promise(function (resolve) {
        server.close(resolve);
      });
    }
  });
});
