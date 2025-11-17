xdescribe("remove inline images", function () {
  var remove_inline_images = require("../item/remove_inline_images");

  it("should remove inline images", function () {
    var html = '<p><img src="x">Hey</p>';

    expect(remove_inline_images(html)).toEqual(
      '<p><img src="x"></p><p>Hey</p>'
    );
  });

  it("should preserve links around images", function () {
    var html = '<p><a href=""><img src="x"></a>Hey</p>';

    expect(remove_inline_images(html)).toEqual(
      '<p><a href=""><img src="x"></a></p><p>Hey</p>'
    );
  });
});
