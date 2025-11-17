describe("template", function () {
  require("./setup")();

  var create = require("models/template/index").create;
  var getTemplateList = require("models/template/index").getTemplateList;
  var async = require("async");

  it("creates a template", function (done) {
    create(this.blog.id, this.fake.random.word(), {}, done);
  });

  it("throws an error if you try to create a template with no name", function (done) {
    expect(function () {
      create(this.blog.id, null, null, function () {});
    }).toThrow();

    done();
  });

  it("creates a template whose name contains a slash", function (done) {
    var test = this;
    var name = this.fake.random.word() + "/" + this.fake.random.word();
    create(test.blog.id, name, {}, function (err) {
      if (err) return done.fail(err);
      getTemplateList(test.blog.id, function (err, templates) {
        if (err) return done.fail(err);

        expect(
          templates.filter(function (template) {
            return template.name === name;
          }).length
        ).toEqual(1);

        done();
      });
    });
  });

  it("creates multiple templates in parallel", function (done) {
    var test = this;
    var templateNames = [];

    while (templateNames.length < 1000)
      templateNames.push(test.fake.random.uuid());

    async.map(
      templateNames,
      function (templateName, next) {
        create(test.blog.id, templateName, {}, next);
      },
      function (err) {
        if (err) return done.fail(err);
        getTemplateList(test.blog.id, function (err, templates) {
          if (err) return done.fail(err);

          expect(
            templates.filter(function (template) {
              return templateNames.indexOf(template.name) > -1;
            }).length
          ).toEqual(1000);

          done();
        });
      }
    );
  });

  it("returns an error if you try to create a template which already exists", function (done) {
    var name = this.fake.random.word();
    var test = this;
    create(this.blog.id, name, {}, function (err) {
      if (err) return done.fail(err);
      create(test.blog.id, name, {}, function (err) {
        expect(err instanceof Error).toEqual(true);
        done();
      });
    });
  });

  it("creates a template from an existing template", function (done) {
    var test = this;
    var blogID = test.blog.id;
    var original = this.fake.random.word();
    var cloned = Date.now().toString(); // prevents same name as original
    var description = this.fake.random.word();
    var originalTemplate, clonedTemplate;

    create(
      blogID,
      original,
      { locals: { description: description } },
      function (err) {
        if (err) return done.fail(err);

        getTemplateList(test.blog.id, function (err, templates) {
          originalTemplate = templates.filter(function (template) {
            return template.name === original;
          })[0];

          create(blogID, cloned, { cloneFrom: originalTemplate.id }, function (
            err
          ) {
            if (err) return done.fail(err);

            getTemplateList(test.blog.id, function (err, templates) {
              if (err) return done.fail(err);

              clonedTemplate = templates.filter(function (template) {
                return template.name === cloned;
              })[0];

              expect(originalTemplate.locals).toEqual(clonedTemplate.locals);

              done();
            });
          });
        });
      }
    );
  });

  // There is a bug with the clone function at the moment
  // It does a truthy check against an empty object in the
  // case of an attempt to clone a non-existent template.
  // if (err || !allViews)  where all views is {}
  // Fix this in future and enable the spec.
  xit("returns an error if you try to clone a template that does not exist", function (done) {
    create(
      this.blog.id,
      this.fake.random.word(),
      { cloneFrom: this.fake.random.word() },
      function (err) {
        console.log(err);
        expect(err instanceof Error).toBe(true);
        done();
      }
    );
  });
});
