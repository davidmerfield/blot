describe("template", function () {
  require("./setup")({ createTemplate: true });

  var async = require("async");
  var getFullView = require("../index").getFullView;
  var setView = require("../index").setView;

  it("gets a full view", function (done) {
    var test = this;

    var header = {
      name: "header " + test.fake.random.word(),
      content: test.fake.random.word(),
    };

    var view = {
      name: "main view " + test.fake.random.word(),
      locals: { words: test.fake.random.word() },
      content: test.fake.random.word() + " {{> " + header.name + "}}",
    };

    var views = [view, header];

    async.map(views, setView.bind(null, test.template.id), function (err) {
      if (err) return done.fail(err);

      getFullView(test.blog.id, test.template.id, view.name, function (
        err,
        fullView
      ) {
        if (err) return done.fail(err);

        expect(fullView).toEqual(jasmine.any(Array));

        var allPartials = {};
        allPartials[header.name] = header.content;

        expect(fullView[0]).toEqual(view.locals); // view.locals
        expect(fullView[1]).toEqual(allPartials); // allPartials
        expect(fullView[2]).toEqual({}); // view.retrieve
        expect(fullView[3]).toEqual("text/html"); // view.type
        expect(fullView[4]).toEqual(view.content);

        done();
      });
    });
  });
});
