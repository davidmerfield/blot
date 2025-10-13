const img = require("../index");
const fs = require("fs-extra");
const exif = require("../exif");

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
