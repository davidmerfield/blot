const img = require("../index");
const fs = require("fs-extra");
const exif = require("../exif");
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

    it("omits EXIF data when disabled", function (done) {
        const test = this;
        const path = "/bunny.png";

        const sampleExif = {
            image: { Make: "Canon" },
            gps: { Latitude: 51.5, Longitude: -0.1 },
        };

        const parseSpy = spyOn(exif, "parseExif").and.returnValue(sampleExif);

        fs.copySync(__dirname + path, test.blogDirectory + path);
        test.blog.imageExif = "off";

        img.read(test.blog, path, function (err, html, stat, extras) {
            parseSpy.and.callThrough();
            if (err) return done.fail(err);
            expect(extras).toBeUndefined();
            done();
        });
    });

    it("returns sanitized EXIF data in basic mode", function (done) {
        const test = this;
        const path = "/bunny.png";

        const sampleExif = {
            image: { Make: "Canon", Model: "5D" },
            exif: {
                LensModel: "EF 50mm",
                SerialNumber: "123456",
                DateTimeOriginal: new Date("2024-01-01T00:00:00Z"),
                ExposureTime: 0.01,
            },
            gps: { Latitude: 51.5, Longitude: -0.1 },
        };

        const parseSpy = spyOn(exif, "parseExif").and.returnValue(sampleExif);

        fs.copySync(__dirname + path, test.blogDirectory + path);
        test.blog.imageExif = "basic";

        img.read(test.blog, path, function (err, html, stat, extras) {
            parseSpy.and.callThrough();
            if (err) return done.fail(err);

            expect(extras).toEqual({
                exif: {
                    image: { Make: "Canon", Model: "5D" },
                    exif: {
                        LensModel: "EF 50mm",
                        DateTimeOriginal: "2024-01-01T00:00:00.000Z",
                        ExposureTime: 0.01,
                    },
                },
            });
            done();
        });
    });

    it("returns full EXIF data in full mode", function (done) {
        const test = this;
        const path = "/bunny.png";

        const sampleExif = {
            image: { Make: "Canon", Model: "5D" },
            exif: {
                LensModel: "EF 50mm",
                SerialNumber: "123456",
                DateTimeOriginal: new Date("2024-01-01T00:00:00Z"),
            },
            gps: { Latitude: 51.5, Longitude: -0.1 },
        };

        const parseSpy = spyOn(exif, "parseExif").and.returnValue(sampleExif);

        fs.copySync(__dirname + path, test.blogDirectory + path);
        test.blog.imageExif = "full";

        img.read(test.blog, path, function (err, html, stat, extras) {
            parseSpy.and.callThrough();
            if (err) return done.fail(err);

            expect(extras).toEqual({
                exif: {
                    image: { Make: "Canon", Model: "5D" },
                    exif: {
                        LensModel: "EF 50mm",
                        SerialNumber: "123456",
                        DateTimeOriginal: "2024-01-01T00:00:00.000Z",
                    },
                    gps: { Latitude: 51.5, Longitude: -0.1 },
                },
            });
            done();
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

    it("restores missing cached conversions using cached path", function (done) {
        const test = this;
        const firstPath = "/land.avif";
        const secondPath = "/land-copy.avif";

        fs.copySync(__dirname + firstPath, test.blogDirectory + firstPath);

        img.read(test.blog, firstPath, function (err) {
            if (err) return done.fail(err);

            const cachedAssetPath = path.join(
                config.blog_static_files_dir,
                test.blog.id,
                "_assets",
                hash(firstPath),
                path.basename(firstPath) + ".png"
            );

            expect(fs.existsSync(cachedAssetPath)).toBe(true);

            fs.removeSync(cachedAssetPath);

            const fallbackAssetPath = path.join(
                config.blog_static_files_dir,
                test.blog.id,
                "_assets",
                hash(secondPath),
                path.basename(secondPath) + ".png"
            );

            if (fs.existsSync(fallbackAssetPath)) {
                fs.removeSync(fallbackAssetPath);
            }

            fs.copySync(__dirname + firstPath, test.blogDirectory + secondPath);

            img.read(test.blog, secondPath, function (err, result) {
                if (err) return done.fail(err);

                const expectedSrc = encodeURI(
                    `/_assets/${hash(firstPath)}/${path.basename(firstPath)}.png`
                );

                expect(result).toContain(`src="${expectedSrc}"`);
                expect(fs.existsSync(cachedAssetPath)).toBe(true);
                expect(fs.existsSync(fallbackAssetPath)).toBe(false);

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
