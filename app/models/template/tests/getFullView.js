describe("template", function () {
  require("./setup")({ createTemplate: true });

  var async = require("async");
  var getFullView = require("../index").getFullView;
  var setView = require("../index").setView;

  it("gets a full view", function (done) {
    var test = this;

    var header = {
      name: "header.html",
      content: "<header>Header content</header>",
    };

    var view = {
      name: "page.html",
      locals: { words: "test words" },
      content: "Page content {{> " + header.name + "}}",
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


  it("merges projected allEntries fields from view and partials", function (done) {
    var test = this;

    var partial = {
      name: "entry-url.html",
      content: "{{#allEntries}}{{url}}{{/allEntries}}",
    };

    var view = {
      name: "entries.html",
      content: "{{#allEntries}}{{title}}{{/allEntries}}{{> " + partial.name + "}}",
    };

    async.map([view, partial], setView.bind(null, test.template.id), function (err) {
      if (err) return done.fail(err);

      getFullView(test.blog.id, test.template.id, view.name, function (err, fullView) {
        if (err) return done.fail(err);

        expect(fullView[2]).toEqual({
          allEntries: { fields: { title: true, url: true } },
        });

        done();
      });
    });
  });


  it("handles partial usage inside allEntries sections", function (done) {
    var test = this;

    var partial = {
      name: "entry-partial.html",
      content: "{{{html}}}",
    };

    var view = {
      name: "entries-with-partial.html",
      content: "{{#allEntries}}{{> " + partial.name + "}}{{/allEntries}}",
    };

    async.map([view, partial], setView.bind(null, test.template.id), function (err) {
      if (err) return done.fail(err);

      getFullView(test.blog.id, test.template.id, view.name, function (err, fullView) {
        if (err) return done.fail(err);

        expect(fullView[2]).toEqual({
          allEntries: { fields: { html: true } },
        });

        done();
      });
    });
  });


  it("handles nested allEntries context in partials without top-level leakage", function (done) {
    var test = this;

    var partial = {
      name: "entry-thumbnail-partial.html",
      content: "{{{html}}}",
    };

    var view = {
      name: "entries-thumbnail-with-partial.html",
      content:
        "{{#allEntries}}{{#thumbnail}}{{> " +
        partial.name +
        "}}{{/thumbnail}}{{/allEntries}}",
    };

    async.map([view, partial], setView.bind(null, test.template.id), function (err) {
      if (err) return done.fail(err);

      getFullView(test.blog.id, test.template.id, view.name, function (err, fullView) {
        if (err) return done.fail(err);

        expect(fullView[2]).toEqual({
          allEntries: { fields: { thumbnail: true } },
        });

        done();
      });
    });
  });

});
