describe("video-embed plugin", function () {
  const videoEmbed = require("../index");
  const cheerio = require("cheerio");

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
