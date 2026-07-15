var create = require("models/template/index").create;
var getTemplateList = require("models/template/index").getTemplateList;
var setView = require("models/template/index").setView;
var dropView = require("models/template/index").dropView;
var getViewByURL = require("models/template/index").getViewByURL;

module.exports = function setup(options) {
  options = options || {};

  // Build the templates into Redis
  global.test.templates();

  // Create test blog before each test and remove it after
  global.test.blog();

  // Expose methods for creating fake files, paths, etc.
  beforeEach(function () {
    this.fake = global.test.fake;
  });

  // Create a test template
  if (options.createTemplate) {
    beforeEach(function (done) {
      var test = this;
      var name = "template";
      create(test.blog.id, name, {}, function (err) {
        if (err) return done(err);
        getTemplateList(test.blog.id, function (err, templates) {
          test.template = templates.filter(function (template) {
            return template.name === name && template.owner === test.blog.id;
          })[0];
          done();
        });
      });
    });

    beforeEach(function () {
      this.setView = (view) => {
        return new Promise((resolve, reject) => {
          setView(this.template.id, view, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      };

      this.dropView = (view) => {
        return new Promise((resolve, reject) => {
          dropView(this.template.id, view, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      };      

      this.getViewByURL = (url) => {
        return new Promise((resolve, reject) => {
          getViewByURL(
            this.template.id,
            url,
            (err, viewName, params, query) => {
              if (err) {
                reject(err);
              } else {
                resolve({ viewName, params, query });
              }
            }
          );
        });
      };
    });
  }

  // Create a test view
  if (options.createView) {
    beforeEach(function (done) {
      var test = this;
      var view = {
        name: "index.html",
        url: "/index",
        content: "<h1>Index page</h1>",
      };
      setView(test.template.id, view, function (err) {
        if (err) return done(err);
        test.view = view;
        done();
      });
    });
  }
};
