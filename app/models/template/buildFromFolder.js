var ensure = require("helper/ensure");
var localPath = require("helper/localPath");
var fs = require("fs-extra");
var readFromFolder = require("./readFromFolder");
var async = require("async");
var getTemplateList = require("./getTemplateList");
var drop = require("./drop");
var promisify = require("util").promisify;
var folderRenames = require("./folderRenames");
var renameLocalTemplate = require("./renameLocalTemplate");
var makeID = require("./util/makeID");
var getMetadata = require("./getMetadata");

var dropTemplate = promisify(drop);
var getTemplateList_ = promisify(getTemplateList);
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
            var id = makeID(blogID, template);

            getMetadata(id, function (metadataErr, existing) {
              var isNew = !!metadataErr || !existing;

              readFromFolder(blogID, dir, function (err) {
                if (err) {
                  // we need to expose this error
                  // on the design page!
                  console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder: failed to read template", dir, err);
                }

                templatesInFolder.push(template);

                if (!isNew || err) return next();

                folderRenames.markFresh(blogID, id).then(function () { next(); }, function () { next(); });
              });
            });
          },
          next
        );
      });
    },
    function (err) {
      console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder: templates in folder", templatesInFolder.length);
      console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder: removing local templates not in folder");

      removeMissing(blogID, templatesInFolder).then(
        function () {
          console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder: complete");
          callback(null);
        },
        function (err) {
          console.error(clfdate(), blogID.slice(0, 12), "buildFromFolder: failed to remove templates", err);
          callback();
        }
      );
    }
  );
};

// A local template whose folder has gone missing might have been renamed
// rather than deleted. We hold off dropping it for RENAME_WINDOW and, if a
// newly created template with identical views appears in that time, migrate
// the old template's settings to it instead.
async function removeMissing(blogID, templatesInFolder) {
  const log = (...args) => console.log(clfdate(), blogID.slice(0, 12), "buildFromFolder:", ...args);
  const templates = (await getTemplateList_(blogID)) || [];
  const now = Date.now();

  const local = templates.filter(
    template => template.localEditing === true && template.owner === blogID
  );
  const orphans = local.filter(template => !templatesInFolder.includes(template.slug));
  const orphanIDs = orphans.map(template => template.id);

  // Forget pending templates which have reappeared or been removed elsewhere
  const pending = await folderRenames.readPending(blogID);
  for (const id of Object.keys(pending)) {
    if (!orphanIDs.includes(id)) {
      await folderRenames.clear(blogID, id);
      delete pending[id];
    }
  }

  for (const orphan of orphans) {
    if (!pending[orphan.id]) {
      pending[orphan.id] = {
        since: now,
        fingerprint: await folderRenames.fingerprint(orphan.id),
      };
      await folderRenames.setPending(blogID, orphan.id, pending[orphan.id]);
    }
  }

  const fresh = await folderRenames.readFresh(blogID);
  const candidates = [];
  for (const template of local) {
    if (orphanIDs.includes(template.id)) continue;
    if (!templatesInFolder.includes(template.slug)) continue;
    if (!(now - fresh[template.id] < folderRenames.RENAME_WINDOW)) continue;
    candidates.push({ id: template.id, fingerprint: await folderRenames.fingerprint(template.id) });
  }

  const count = (list, fingerprint) =>
    list.filter(item => item.fingerprint === fingerprint).length;
  const orphanRecords = orphans.map(o => ({ id: o.id, slug: o.slug, fingerprint: pending[o.id].fingerprint, since: pending[o.id].since }));

  for (const orphan of orphanRecords) {
    // Only migrate when the pairing is unambiguous
    const match =
      orphan.fingerprint &&
      count(orphanRecords, orphan.fingerprint) === 1 &&
      count(candidates, orphan.fingerprint) === 1 &&
      candidates.find(candidate => candidate.fingerprint === orphan.fingerprint);

    try {
      if (match) {
        log("template folder renamed", orphan.id, "->", match.id);
        await renameLocalTemplate(blogID, orphan.id, match.id);
        await folderRenames.clear(blogID, orphan.id);
        await folderRenames.clear(blogID, match.id);
      } else if (now - orphan.since >= folderRenames.RENAME_WINDOW) {
        log("removing template", orphan.slug);
        await dropTemplate(blogID, orphan.slug);
        await folderRenames.clear(blogID, orphan.id);
      } else {
        log("template folder missing, waiting to see if it was renamed", orphan.slug);
      }
    } catch (err) {
      console.error(clfdate(), blogID.slice(0, 12), "buildFromFolder: failed to remove template", orphan.slug, err);
    }
  }
}
