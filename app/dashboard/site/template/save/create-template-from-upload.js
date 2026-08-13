const async = require("async");
const Template = require("models/template");
const makeSlug = require("helper/makeSlug");
const createTemplateWithUniqueName = require("./create-template-with-unique-name");

// Creates a template from the output of parse-uploaded-template.
//
// There is no atomic 'import these views' API: creating a template is one
// write and each view is another. We validate everything we can before
// starting, then write the views one at a time, and drop the whole template
// if any of them fails. Sequential rather than setMultipleViews, which fires
// every setView at once and reports only the last error it happened to see.
//
// Some failures cannot be caught in advance: setView checks partial
// dependency cycles against views already in the database, so two views in
// the same upload which reference each other only fail on the second write.
// That is what the rollback is for.

const setView = (templateID, view) =>
  new Promise((resolve, reject) => {
    Template.setView(templateID, view, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

const dropTemplate = (owner, templateID) =>
  new Promise((resolve) => {
    // Template.drop takes the id with the owner prefix removed
    const slug = templateID.split(":").slice(1).join(":");

    Template.drop(owner, slug, (err) => {
      if (err) {
        console.error(
          "Failed to roll back uploaded template",
          templateID,
          err
        );
      }
      resolve();
    });
  });

module.exports = async function createTemplateFromUpload ({
  owner,
  name,
  locals = {},
  views = [],
}) {
  if (!owner) throw new Error("An owner is required to create a template");

  const template = await createTemplateWithUniqueName({
    owner,
    name,
    // Template.create derives the id from the name, and routing resolves a
    // template by that id, so keep the stored slug in step with it
    slug: makeSlug(name).slice(0, 30),
    locals,
    isPublic: false,
    exhaustedMessage:
      "You already have too many templates with this name — rename it and try again",
  });

  try {
    await new Promise((resolve, reject) => {
      async.eachSeries(
        views,
        function (view, next) {
          setView(template.id, view).then(() => next(), next);
        },
        function (err) {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  } catch (err) {
    await dropTemplate(owner, template.id);
    throw err;
  }

  return template;
};
