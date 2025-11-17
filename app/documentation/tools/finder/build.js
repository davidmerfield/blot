var fs = require('fs-extra');
var DataURI = require('datauri');
var CleanCSS = require('clean-css');

module.exports = function () {

  var images = fs.readdirSync(__dirname + '/images');
  var styles = fs.readdirSync(__dirname + '/css');
  var fonts = fs.readdirSync(__dirname + '/fonts');
  var css = '';

  styles.forEach(function(name){
    
    if (name.indexOf('.css') == -1) return;

    css += fs.readFileSync(__dirname + '/css/' + name, 'utf-8');
  });

  images.forEach(function(name){
    
    if (css.indexOf(name) === -1) return;

    var datauri = new DataURI(__dirname + '/images/' + name);

    css = css.split(name).join(datauri.content);
  });

  css = new CleanCSS().minify(css).styles;

  return css;
};

if (require.main === module) {
  fs.outputFileSync(__dirname + '/build.css', module.exports());
}