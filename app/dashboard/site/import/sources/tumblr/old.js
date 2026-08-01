  var program = require('commander'),
      colors = require('colors'),
      path = require('path'),
      toMarkdown = require('dashboard/importer/helper').to_markdown,
      request = require('request'),
      S = require('string'),
      fs = require('fs-extra'),
      cl = require('cl'),
      batch = require('batchflow'),
      MarkdownPage = require('markdown-page').MarkdownPage,
      util = require('util');


if (require.main === module) {

  main (process.argv[2], __dirname + '/test', process.exit);

}

  var DEFAULT_API_KEY = "",
      INIT_URL = "http://api.tumblr.com/v2/blog/{{url}}/{{resource}}?api_key={{api_key}}";

function main (username, output_directory, callback) {

  var url = 

  if (!options.url) return callback('Please specify a tumblr url');
  if (!options.dir) return callback('Please specify an output dir');

  if (options.url.indexOf('.tumblr.com') === -1)
    options.url += '.tumblr.com';

  //strip leading http:// or https://
  if (S(options.url).startsWith('http://'))
    options.url = options.url.replace('http://', '');

  if (S(options.url).startsWith('https://'))
    options.url = options.url.replace('https://', '');

  var URL = S(username + '.tumblr.com').template({
    url: options.url,
    resource: 'posts',
   api_key: options.apiKey
 }).s;

  var all_photos = [];

  fs.emptyDir(output_directory, function(err){

  });
  
  cleanOutputDir(options.dir, function (){

    fetchBlogInfo();
  });

  function get_blog_info (username, callback) {

    console.log('\n  Fetching articles for ' + options.url + ' \n');

    var url = S(URL).template({resource: 'info'}).s;

    request({url: url, json: true}, function(err, resp, body) {

      if (options.debug) console.log("DEUBG: %s".red.bold, url);

      if (err || resp.statusCode !== 200) cl.exit(100, err);

      outputConfig(body.response);
    });
  }

  function outputConfig (blogInfo) {

    if (!blogInfo || !blogInfo.blog)
      cl.exit(101, "Could not get blog info.");

    blogInfo = blogInfo.blog;

    var config = {
      blog: {
        name: blogInfo.name || 'BLOG NAME',
        url: blogInfo.url || options.url,
        tagline: blogInfo.description || 'DESCRIPTION'
      },
      articles: {urlformat: '{{slug}}',
      index: 'index.html'},
      build: {outputDir: 'public/'},
      partials: {}
    };

    var configFile = path.join(options.dir, 'config.json');

    fs.outputFile(configFile, JSON.stringify(config, null, 2), function(err, stat){

      fetchArticles(blogInfo.posts);
    });
  }

  function fetchArticles (postCount) {

    var offset = 0,
        limit = 20, //max as defined by API
        steps = postCount / limit,
        urls = [];

    //is there a rem?
    steps = postCount % limit === 0 ? steps : Math.floor(steps) + 1

    URL = URL + '&offset={{offset}}&limit={{limit}}'
    for (var i = 0; i < steps; ++i) {
      urls.push(S(URL).template({resource: 'posts', limit: limit, offset: offset.toString()}).s) //limit doesn't change
      offset += limit
    }

    batch(urls).seq()
    .each(function(i, url, next) {
      if (options.debug)
        console.log("DEUBG: %s".red.bold, url)
      request({url: url, json: true}, function(err, resp, body) {
        if (err || resp.statusCode !== 200) console.error(err)
        iteratePosts(url, body.response, next)
      })
    })
    .error(function(err) {
      console.error(err)
      console.error(err.stack)
    })
    .end(done)
  }

  function done () {
    batch(all_photos).parallel()
    .each(function(i, photo, next) {
      var photo_file = fs.createOutputStream(path.join(options.dir, 'static', 'images', photo['filename']))
      photo_file.on('close', function() {
        var text = colors.cyan(S('Downloaded').padLeft(10)) + ' : ' + photo['url']
        console.log(text)
        next()
      })
      request(photo['url']).pipe(photo_file)
    })
    .error(function(err) {
      console.error(err)
      console.error(err.stack)
    })
    .end(callback)
  }

  function iteratePosts (url, data, callback) {
    if (!data || !data.posts) cl.exit(102, "  Got a bad response from %s", url)
    var posts = data.posts

    batch(posts).seq()
    .each(function(i, post, next) {
      outputPost(post, next)
    })
    .error(function(err) {
      console.error(err)
      console.error(err.stack)
    })
    .end(callback)
  }

  function logPost (title, date) {
    var text = colors.cyan(S('Got')) + ' : ' + colors.green('[' + S(date.toDateString()).padRight(12) + '] ') + title
    console.log(text)
  }

  // 12/1/2015 9:41pm (PST)

  MarkdownPage.prototype.genOutputForHugo = function() {

    var data = '';

    if (this.metadata) {

      if (this.metadata.date) {
        data += 'Date: ' + this.metadata.date + '\n';
      }

      if (this.metadata.tags && this.metadata.tags.length) {
        data += 'Tags: ' + this.metadata.tags.join(', ') + '\n';
      }

      if (this.metadata.slug) {
        data += 'Slug: ' + this.metadata.slug + '\n';
      }

      if (data) data += '\n';
    }

    if (this.title || this.metadata.title) {
      data += '# ' + (this.title || this.metadata.title) + '\n\n';
      // data += S('=').repeat(this.title.length) + '\n\n'
    }

    data += this.markdown + '\n';

    return data;
  }

  function outputPost (post, next) {

    var mdp = MarkdownPage.create();
    var date = new Date(post.date);

    function gotoNext () {

      slug = post.slug || post.id;

      var file, data;

      var monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];

      var month = monthNames[date.getMonth()]
      var ds = date.getFullYear() + '/' + month;
      var file = path.join(options.dir, 'posts', ds, slug + '.md');

      data = mdp.genOutputForHugo();

      fs.outputFile(file, data, function(err) {

        if (err) console.error(err);

        logPost(post.title, date);

        next();
      });
    }

    mdp.metadata.slug = post.slug
    mdp.metadata.date = date
    mdp.metadata.tags = post.tags

    //if the type is something other than "text"
    switch (post.type) {
      case "link":
        post.body = '<a href="' + post.url + '">' + post.url + "</a>\n\n"
        post.body += post.description
        post.format = 'html'
        break;
      case "photo":
        caption = S(post.caption)
        caption_lines = caption.split('\n')
        title = caption_lines.splice(0, 1)
        title = S(title).stripTags().s.trim()
        post.title = title
        post.body = ''
        for (var i = post.photos.length - 1; i >= 0; i--) {
          photo = post.photos[i]
          photo_url = photo.original_size.url
          if (options.downloadImages) {
            photo_url_parts = photo_url.split('/')
            photo_filename = photo_url_parts[photo_url_parts.length - 1]
            all_photos.push({url: photo_url, filename: photo_filename})
            photo_url = '/images/' + photo_filename
          }
          post.body += '<img src="' + photo_url + '">\n'
        }
        if (caption_lines.length > 0) {
          post.body += caption_lines.join('\n')
        }
        post.format = 'html'
        break;
      case "video":
        post.title = S(post.caption).stripTags().s
        post.body =  post.player[post.player.length - 1].embed_code
        post.format = 'html'
        break;
      case "quote":
        if (post.caption && post.caption.length) {
          post.title = S(post.caption).stripTags().s
        } else {
          post.title = S(post.text).stripTags().s
          if (post.title.length > options.maxTitle) {
            post.title = post.title.substr(0, options.maxTitle) + '...'
          }
        }
        post.body =  '<blockquote>' + post.text + '</blockquote>\n' + post.source
        post.format = 'html'
        break;
    }

    if (options.titles)
      mdp.title = post.title

    mdp.metadata.title = post.title

    if (post.format === 'markdown') {
      mdp.markdown = post.body
      gotoNext()
    } else {
      mdp.markdown = toMarkdown(post.body || '');
      gotoNext();
    }
  }

  function zip (dir, callback) {

    var archiver = require('archiver');

    var output = fs.createWriteStream(dir + '.zip');

    var archive = archiver('zip');

    output.on('close', function () {
      console.log(archive.pointer() + ' total bytes zipped');
      rimraf(dir,callback);
    });

    archive.on('error', function(err){
        throw err;
    });

    archive.pipe(output);

    archive.bulk([{expand: true, cwd: dir, src: ['**']}]);

    archive.finalize();
  }

  function cleanOutputDir (dir, callback) {

    rimraf(dir, function () {

      fs.mkdirSync(dir);
      callback();
    });
  }

}

module.exports = main;


