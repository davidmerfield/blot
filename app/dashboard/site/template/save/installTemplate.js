const Template = require("models/template");
const Blog = require("models/blog");
const localPath = require("helper/localPath");
const fs = require("fs-extra");

module.exports = function (req, res, next) {
  const templateID = req.body.template;

  Template.getMetadata(templateID, function (err, template) {
    if (err || !template) return next(err || new Error("No template"));

    Blog.set(req.blog.id, { template: templateID }, function () {
      res.message(
        "/sites/" + req.blog.handle + "/template",
        "Installed template <b>" + template.name + "</b>"
      );

      res.locals.templatesInYourFolder.forEach(async t => {
        // read the package.json file
        const pathsToPackage = [
          `/templates/${t.slug}/package.json`,
          `/Templates/${t.slug}/package.json`
        ];

        let pathToPackageJson;

        for (let i = 0; i < pathsToPackage.length; i++) {
          const path = pathsToPackage[i];
          if (await fs.pathExists(localPath(req.blog.id, path))) {
            pathToPackageJson = path;
            break;
          }
        }

        if (!pathToPackageJson) return;

        const packageJson = await fs.readJson(
          localPath(req.blog.id, pathToPackageJson)
        );

        if (t.id === templateID && packageJson.enabled === true) return;

        if (t.id !== templateID && packageJson.enabled !== true) return;

        const updatedPackageJSON = JSON.stringify(
          { ...packageJson, enabled: t.id === templateID },
          null,
          2
        );

        const client = require("clients")[req.blog.client];

        // we create a fake client to write the template files directly
        // to the blog's folder if the user has not configured a client
        if (!req.blog.client || !client) {
          fs.outputFile(
            localPath(pathToPackageJson),
            updatedPackageJSON,
            callback
          );
        } else {
          client.write(
            req.blog.id,
            pathToPackageJson,
            updatedPackageJSON,
            function (err) {
              if (err) console.log(err);
            }
          );
        }
      });
    });
  });
};
