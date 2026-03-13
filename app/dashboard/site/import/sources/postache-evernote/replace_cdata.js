var pretty = require("pretty");
var cheerio = require("cheerio");
var fs = require("fs-extra");

module.exports = function ($) {
  $.root()
    .contents()
    .each(function replace_cdate(i, el) {
      if (el.type === "cdata") {
        console.log(
          "CDATA NODE WITH CHILDREN",
          el.children.length,
          el.children[0].data.slice(0, 100)
        );

        // var new_html = el.children.map(function(el){return el.data;}).join(' ');
        // var $el = cheerio.load(new_html);

        // This works
        //$(el.parent).remove();

        return $(el).parent().remove();
      }

      // if (el.name === 'content') {console.log(el);throw ''}

      // if (el.type === 'text' && el.parent && el.parent.type === 'cdata') {
      //   console.log('TEXT NODE WITH CDATA PARENT', el.parent && el.parent.name);
      // }

      $(el).contents().each(replace_cdate);
    });

  fs.outputFileSync(__dirname + "/test.enex", pretty($.html()));

  console.log("Done!");

  throw "";
};
