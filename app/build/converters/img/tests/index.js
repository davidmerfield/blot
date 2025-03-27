const img = require("../index");
const fs = require("fs-extra");

describe("img converter", function () {
    global.test.blog();

    const tests = fs
        .readdirSync(__dirname)
        .filter((i) => img.is(i));

    tests.forEach((name) => {
        it("converts img with " + name, function (done) {
            const test = this;
            const path = "/" + name;
            const expected = fs.readFileSync(__dirname + path + ".html", "utf8");

            fs.copySync(__dirname + path, test.blogDirectory + path);

            img.read(test.blog, path, function (err, result) {
                if (err) return done.fail(err);
                expect(result).toEqual(expected);
                done();
            });
        });
    });

    it("returns an error if the image does not exist", function (done) {
        const test = this;
        const path = "/test.png";

        img.read(test.blog, path, function (err) {
            expect(err).toBeTruthy();
            done();
        });
    });
});
