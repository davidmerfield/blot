describe("bandcamp embeds", function () {
  const bandcamp = require("../bandcamp");
  const nock = require("nock");
  const bandcampOgHtml = ({ src, width, height }) => `<!doctype html>
    <html>
      <head>
        <meta property="og:video" content="${src}">
        <meta property="og:video:width" content="${width}">
        <meta property="og:video:height" content="${height}">
      </head>
      <body></body>
    </html>`;

  beforeEach(function () {
    nock.disableNetConnect();
  });

  afterEach(function () {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("handles an empty href", function (done) {
    const href = "";
    bandcamp(href, (err, template) => {
      expect(err.message).toEqual("Could not retrieve song properties");
      expect(template).toEqual(undefined);
      done();
    });
  });

  it("handles an invalid href", function (done) {
    const href = "https://bandcamp.com";
    bandcamp(href, (err, template) => {
      expect(err.message).toEqual("Could not retrieve song properties");
      expect(template).toEqual(undefined);
      done();
    });
  });

  it("handles an invalid path", function (done) {
    const href = "https://bandcamp.com/invalid";
    bandcamp(href, (err, template) => {
      expect(err.message).toEqual("Could not retrieve song properties");
      expect(template).toEqual(undefined);
      done();
    });
  });

  it("handles a valid link to an album on a bandcamp subdomain", function (done) {
    const href = "https://oliviachaney.bandcamp.com/album/circus-of-desire";
    nock("https://oliviachaney.bandcamp.com")
      .get("/album/circus-of-desire")
      .reply(
        200,
        bandcampOgHtml({
          src: "https://bandcamp.com/EmbeddedPlayer/v=2/album=2447688282/size=large/tracklist=false/artwork=small/",
          width: 400,
          height: 120,
        })
      );
    bandcamp(href, (err, template) => {
      expect(err).toEqual(null);
      expect(template).toEqual(
        `<div style="width:0;height:0"> </div><div class="videoContainer bandcamp" style="padding-bottom: 120px"><iframe width="400" height="120" src="https://bandcamp.com/EmbeddedPlayer/v=2/album=2447688282/size=large/tracklist=false/artwork=small/" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>`
      );
      done();
    });
  });

  it("handles a valid link to a track on a bandcamp subdomain", function (done) {
    const href = "https://cloquet.bandcamp.com/track/new-drugs";
    nock("https://cloquet.bandcamp.com")
      .get("/track/new-drugs")
      .reply(
        200,
        bandcampOgHtml({
          src: "https://bandcamp.com/EmbeddedPlayer/v=2/track=2483181576/size=large/tracklist=false/artwork=small/",
          width: 400,
          height: 120,
        })
      );
    bandcamp(href, (err, template) => {
      expect(err).toEqual(null);
      expect(template).toEqual(
        `<div style="width:0;height:0"> </div><div class="videoContainer bandcamp" style="padding-bottom: 120px"><iframe width="400" height="120" src="https://bandcamp.com/EmbeddedPlayer/v=2/track=2483181576/size=large/tracklist=false/artwork=small/" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>`
      );
      done();
    });
  });
});
