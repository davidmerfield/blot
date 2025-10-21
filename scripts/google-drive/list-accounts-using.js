const each = require("../each/blog");
const access = require('../blog/access');
const database = require('clients/google-drive/database');
const config = require('config');

console.log('Checking all blogs using Google Drive...');

each(
  (user, blog, next) => {
    if (!blog || blog.isDisabled) return next();
    if (blog.client !== 'google-drive') return next();
    access(blog.handle, async function(err, url){

        if (err) return next(err);
        if (!url) return next();

        const account = await database.getAccount(blog.id);
        const serviceAccounts = await database.serviceAccount.all();
        const serviceAccount = serviceAccounts.find(sa => sa.client_id === account.client_id);

        console.log();
        console.log(user.email, blog.id, 'https://'+blog.handle + '.' + config.host);
        console.log('folder:', '"' + account.folderName + '"', account.folderId);
        console.log('service account:', serviceAccount.user.emailAddress, serviceAccount.client_id, serviceAccount.storageQuota.usage / 1024 / 1024, 'of', serviceAccount.storageQuota.limit / 1024 / 1024, 'MB used');
        console.log(url);
        console.log();
        next();
    });
  },
  err => {
    if (err) throw err;
    console.log("All blogs checked!");
    process.exit();
  }
);
