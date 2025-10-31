{{{appJS}}}

var container = document.querySelector('#grid');
var entries = container.querySelectorAll('.entry');

for (var i = 0; i < entries.length; i++) {

  var entry = entries[i];

  if (entry) {

    var image = entry.querySelector("p:nth-child(2) img");
    var width = entry.offsetWidth;

    if (image) {

      var imageWidth = image && image.getAttribute ? image.getAttribute('width') : false;
      var imageHeight = image && image.getAttribute ? image.getAttribute('height') : false;

      entry.style.height = ((width / imageWidth) * imageHeight) + 'px';

    }
  }
}

var pckry = new Packery( container, {
  itemSelector: '.entry',
  percentPosition: true,
  gutter: ".gutter-sizer",
  columnWidth: ".grid-sizer",
  transitionDuration: 0,
  initLayout: false,
});

pckry.on('layoutComplete', function() {
  document.getElementById("grid").className = document.getElementById("grid").className.split('hidden').join('');
});

pckry.layout();

var imgLoad = imagesLoaded(document.getElementById("grid"));

imgLoad.on('progress', function(){
  pckry.layout()
});