var download_images = require("../download_images");

describe("download_images naming", function () {
  var nameFrom = download_images._nameFrom;
  var filenameFromContentDisposition =
    download_images._filenameFromContentDisposition;

  it("reads a quoted Content-Disposition filename", function () {
    expect(
      filenameFromContentDisposition(
        'inline;filename="Koa Etymology Pie Chart.jpg"'
      )
    ).toEqual("Koa Etymology Pie Chart.jpg");
  });

  it("reads an RFC 5987 Content-Disposition filename", function () {
    expect(
      filenameFromContentDisposition(
        "inline; filename*=UTF-8''Koa%20Etymology%20Pie%20Chart.jpg"
      )
    ).toEqual("Koa Etymology Pie Chart.jpg");
  });

  it("prefers Content-Disposition over an extension-less URL basename", function () {
    var url =
      "https://blogger.googleusercontent.com/img/a/AVvXsEgFVMWOiw9WlUf_pZvWu1U3iko0IikKVMN_yg79hHGSISG9NmEpmKXUHSF1cgb3HnaUGwLSamO0Lrfk93DWBjrjofgY-eO_fSUpL_xRnoByt0VBxPByLREtqG_4LFaItKLclPTyAloonludCg5_aIJ3nGBO9BWK2RHg5GQVN2hmUkwitGVjNFNdmzTRjCI";

    expect(
      nameFrom(url, {
        contentType: "image/jpeg",
        contentDisposition: 'inline;filename="Koa Etymology Pie Chart.jpg"',
      })
    ).toEqual("_Koa Etymology Pie Chart.jpg");
  });

  it("uses Content-Type when the URL and disposition lack an extension", function () {
    var url = "https://example.com/img/a/opaque-id-without-extension";

    expect(
      nameFrom(url, {
        contentType: "image/png",
      })
    ).toEqual("_opaque-id-without-extension.png");
  });

  it("falls back to sharp format for extension-less URLs", function () {
    var url = "https://example.com/img/a/opaque-id-without-extension";

    expect(nameFrom(url, {}, "jpeg")).toEqual(
      "_opaque-id-without-extension.jpg"
    );
  });

  it("keeps an existing URL extension", function () {
    expect(
      nameFrom("https://example.com/photos/cat.png", {
        contentType: "image/jpeg",
      })
    ).toEqual("_cat.png");
  });
});
