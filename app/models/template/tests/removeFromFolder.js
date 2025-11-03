
describe("template", function () {
  const writeToFolder = require("../index").writeToFolder;
  const removeFromFolder = require("../index").removeFromFolder;
  const setView = require("../index").setView;

  const fs = require('fs-extra');

  require("./setup")({ createTemplate: true });

  it("removes a template from a folder", function (done) {
    var test = this;
    var view = {
      name: test.fake.random.word() + ".html",
      content: test.fake.random.word(),
    };

    setView(this.template.id, view, function (err) {
      if (err) return done.fail(err);

      writeToFolder(test.blog.id, test.template.id, function (err) {
        if (err) return done.fail(err);
        
        const templateFolderContents = fs.readdirSync(test.blogDirectory + '/Templates');
        const templateSubFolderContents = fs.readdirSync(test.blogDirectory + '/Templates/' + test.template.slug);

        expect(templateFolderContents).toContain(test.template.slug);
        expect(templateSubFolderContents).toContain(view.name);
        expect(templateSubFolderContents).toContain('package.json');

        removeFromFolder(test.blog.id, test.template.id, function (err) {
            if (err) return done.fail(err);

            const templateFolderContents = fs.readdirSync(test.blogDirectory + '/Templates');
    
            expect(templateFolderContents).not.toContain(test.template.slug);    
            done();
        });
      });
    });
  });

});
