const clfdate = require("helper/clfdate");
const {writeToFolder} = require("models/template");

module.exports = function(blog, template, view, callback) {

    console.log(clfdate(), "writeChangeToFolder", blog.id, template.id, view.name);

    if (!template.localEditing) {
        console.log(clfdate(), "writeChangeToFolder", "No local editing");
        return callback();
    }

    console.log(clfdate(), "writeChangeToFolder", "Writing to folder");
    writeToFolder(blog.id, template.id, callback);
}
