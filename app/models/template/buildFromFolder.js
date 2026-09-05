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

            console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder: reading template", dir);
            readFromFolder(blogID, dir, function (err) {
              if (err) {
                // we need to expose this error
                // on the design page!
                console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder: failed to read template", dir, err);
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
      console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder: templates in folder", templatesInFolder.length);
      console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder: removing local templates not in folder");
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
            console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder: removing template", template.slug);
            drop(blogID, template.slug, function (err) {
              if (err) {
                console.error(clfdate(), blogID.slice(0, 12), "buildFromFolder: failed to remove template", template.slug);
              }
              next();
            });
          },
          function (err) {
            if (err) return callback(err);
            console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder: complete");
            callback(null);
          }
        );
      });
    }
  );
};
