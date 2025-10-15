const sharp = require('sharp');
const fs = require('fs-extra');

fs.ensureDirSync(__dirname + '/data');
console.log('sharp version:', sharp.versions.sharp);
console.log('libvips version (runtime):', sharp.versions.vips);

// HEIF support implies libvips was built with libheif, usually system libvips
console.log('HEIF input/output:', sharp.format.heif.input, sharp.format.heif.output);


sharp(__dirname + '/image.heic').resize(200).toFile(__dirname + '/data/image.jpg')