module.exports = function () {
  const fs = require("fs-extra");
  const build = require("build");
  const get = require("../get");
  const set = require("../set");
  const search = require("../search");
  const drop = require("../drop");

  global.test.blog();

  beforeEach(function () {
    this.get = async path => {
      return new Promise(resolve => {
        get(this.blog.id, path, entry => {
          resolve(entry);
        });
      });
    };

    this.search = async query => {
      return new Promise((resolve, reject) => {
        search(this.blog.id, query, (err, ids) => {
          if (err) reject(err);
          else resolve(ids);
        });
      });
    };

    this.drop = async path => {
      return new Promise(resolve => {
        drop(this.blog.id, path, () => {
          resolve();
        });
      });
    };

    this.remove = async path => {
      return new Promise((resolve, reject) => {
        fs.remove(this.blogDirectory + path, err => {
          if (err) reject(err);
          drop(this.blog.id, path, () => {
            resolve();
          });
        });
      });
    };

    this.set = async (path, contents) => {
      return new Promise((resolve, reject) => {
        fs.outputFileSync(this.blogDirectory + path, contents);
        build(this.blog, path, (err, entry) => {
          if (err) return reject(err);
          set(this.blog.id, path, entry, err => {
            if (err) return reject(err);
            get(this.blog.id, path, entry => {
              resolve(entry);
            });
          });
        });
      });
    };
  });
};
