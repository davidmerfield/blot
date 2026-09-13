var ensure = require("helper/ensure");
var localPath = require("helper/localPath");
var fs = require("fs-extra");
var readFromFolder = require("./readFromFolder");
var async = require("async");
var getTemplateList = require("./getTemplateList");
var drop = require("./drop");
const shouldIgnoreFile = require("clients/util/shouldIgnoreFile");
var clfdate = require("helper/clfdate");

module.exports = function (blogID, callback) {
  ensure(blogID, "string").and(callback, "function");

  var templateDirs = [
    localPath(blogID, "/templates"),
    localPath(blogID, "/Templates")
  ];

  const templatesInFolder = [];

  async.eachSeries(
    templateDirs,
    function (templateDir, next) {
      fs.readdir(templateDir, function (err, templates) {
        if (err || !templates) return next();

        async.eachSeries(
          templates,
          function (template, next) {
            if (template.startsWith('.') || shouldIgnoreFile(template)) return next();

            var dir = templateDir + "/" + template;

            readFromFolder(blogID, dir, function (err) {
              if (err) {
                // we need to expose this error
                // on the design page!
                console.error(clfdate(), blogID.slice(0, 12), "buildFromFolder: failed to read template", dir, err);
              }

              templatesInFolder.push(template);
              next();
            });
          },
          next
        );
      });
    },
    function (err) {
      getTemplateList(blogID, function (err, templates) {

        if (err) {
          return callback();
        }

        if (!templates) {
          return callback();
        }
        
        const localTemplatesToRemove = templates.filter(
          template =>
            template.localEditing === true &&
            template.owner === blogID &&
            !templatesInFolder.includes(template.slug)
        );

        async.eachSeries(
          localTemplatesToRemove,
          function (template, next) {
            drop(blogID, template.slug, function (err) {
              if (err) {
                console.error(clfdate(), blogID.slice(0, 12), "buildFromFolder: failed to remove template", template.slug);
              }
              next();
            });
          },
          function (err) {
            if (err) return callback(err);
            callback(null);
          }
        );
      });
    }
  );
};
