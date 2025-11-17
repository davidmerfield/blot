var mustache = require('mustache');
var template_directory = __dirname + '/templates';
var determine_icon = require('./determine_icon');

// Pre text is the content of the pre
// tag containing the list of files and
// folders inside the folder window.
module.exports = function render_folder (pre_text, classes, title) {

  var file;
  var files = pre_text.split('\n');

  for (var i = 0; i < files.length; i++) {

    file = {};
    file.name = files[i].trim();
    file.depth = Math.floor(files[i].indexOf(files[i].trim()) / 2);
    file.nested = file.depth !== 0;
    file.open = false;

    // Indicate the parent folder for this file
    // we use this info to rotate the arrow next to the
    // folder icon in the finder.
    if (file.nested && files[i - 1].depth < file.depth)
      files[i - 1].open = 'open';

    file.file = file.name.indexOf('.') > -1;
    file.folder = !file.file;

    if (file.file)
      file.extension = determine_icon(file.name);

    if (file.open)
      file.open = 'open';
    else 
      file.open = '';

    if (file.nested)
      file.nested = 'nested';
    else 
      file.nested = '';

    if (file.folder)
      file.folder = 'folder';
    else 
      file.folder = '';

    if (file.file)
      file.file = 'file';
    else 
      file.file = '';


    files[i] = file;
  }

  var output = mustache.render(require('fs-extra').readFileSync(template_directory + '/folder.mustache', 'utf8'), {contents: files, classes: classes.map(function(c){return {class: c}}), title: title || 'Folder'});

  return output;
};