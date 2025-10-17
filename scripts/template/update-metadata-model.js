const eachTemplate = require("../each/template");
const Template = require("models/template");
const ensure = require("helper/ensure");
const type = require("helper/type");

eachTemplate(function (user, blog, template, next) {
  Object.keys(Template.metadataModel).forEach((property) => {
    const currentType = type(template[property]);
    const desiredType = Template.metadataModel[property];

    if (currentType === desiredType) {
      return;
    }

    if (desiredType === "string") {
      console.log(template.id, "setting", property, 'to empty string ""');
      template[property] = "";
    } else if (desiredType === "object") {
      console.log(template.id, "setting", property, "to empty object {}");
      template[property] = {};
    } else if (desiredType === "boolean") {
      console.log(template.id, "setting", property, "to false");
      template[property] = false;
    }
  });

  Template.setMetadata(template.id, template, function (err) {
    if (err) throw err;

    Template.getMetadata(template.id, function (err, updatedTemplate) {
      if (err) throw err;
      ensure(updatedTemplate, Template.metadataModel, true);
      next();
    });
  });
}, process.exit);
