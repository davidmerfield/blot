describe("video-embed plugin", function () {
  const videoEmbed = require("../index");
  const cheerio = require("cheerio");
  const nock = require("nock");

  beforeEach(function () {
    nock("https://vimeo.com")
      .get("/api/oembed.json")
      .query(true)
      .reply(function (uri) {
        const requestUrl = new URL(`https://vimeo.com${uri}`).searchParams.get(
          "url"
        );

        if (requestUrl && requestUrl.startsWith("https://vimeo.com/87952436")) {
          return [
            200,
            {
              video_id: 87952436,
              width: 16,
              height: 9,
              thumbnail_url:
                "https://i.vimeocdn.com/video/466717816-33ad450eea4c71be9149dbe2e0d18673874917cadd5f1af29de3731e4d22a77f-d_295x166?region=us",
            },
          ];
        }

        return [404, {}];
      });
  });

  afterEach(function () {
    nock.cleanAll();
  });

  it("embeds videos from youtube, vimeo and music from bandcamp", function (done) {
    const $ = cheerio.load(
      `<a href="https://www.youtube.com/watch?v=MJ62hh0a9U4">https://www.youtube.com/watch?v=MJ62hh0a9U4</a>
        <a href="https://vimeo.com/87952436">https://vimeo.com/87952436</a>
        <a href="https://oliviachaney.bandcamp.com/album/circus-of-desire">https://oliviachaney.bandcamp.com/album/circus-of-desire</a>
        <a href="https://cloquet.bandcamp.com/track/new-drugs">https://cloquet.bandcamp.com/track/new-drugs</a>
        <a href="https://foo.com/87952436">https://foo.com/87952436</a>
      `,
      { decodeEntities: false },
      false
    );
    videoEmbed.render($, function (err) {
      expect(err).toEqual(null);
      expect($("iframe").length).toEqual(4);
      done();
    });
  });
});
