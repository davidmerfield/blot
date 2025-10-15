const img = require("../index");
const fs = require("fs-extra");
const path = require("path");
const config = require("config");
const hash = require("helper/hash");

describe("img converter", function () {
    global.test.blog();

    const tests = fs
        .readdirSync(__dirname)
        .filter((i) => img.is(i));

    tests.forEach((name) => {
        it("converts img with " + name, function (done) {
            const test = this;
            const relativePath = "/" + name;
            const expected = fs.readFileSync(__dirname + relativePath + ".html", "utf8");

            fs.copySync(__dirname + relativePath, test.blogDirectory + relativePath);

            img.read(test.blog, relativePath, function (err, result) {
                if (err) return done.fail(err);
                expect(result).toEqual(expected);
                done();
            });
        });
    });

    it("reuses cached conversions on repeat builds", function (done) {
        const test = this;
        const relativePath = "/land.avif";

        fs.copySync(__dirname + relativePath, test.blogDirectory + relativePath);

        img.read(test.blog, relativePath, function (err, firstResult) {
            if (err) return done.fail(err);

            const assetPath = path.join(
                config.blog_static_files_dir,
                test.blog.id,
                "_assets",
                hash(relativePath),
                path.basename(relativePath) + ".png"
            );

            const firstStat = fs.statSync(assetPath);

            img.read(test.blog, relativePath, function (err, secondResult) {
                if (err) return done.fail(err);

                const secondStat = fs.statSync(assetPath);

                expect(secondResult).toEqual(firstResult);
                expect(secondStat.mtimeMs).toEqual(firstStat.mtimeMs);

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
