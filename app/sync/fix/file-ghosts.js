const fs = require("fs-extra");
const { join } = require("path");

async function main(blog, callback) {
  const localRoot = localPath(blog.id, "/");
  
  const walk = async (dir) => {
    const items = readdir(dir);

  };

  await walk("/");

  callback();
}

const readdir = async (dir) =>{
  const items = await fs.readdirSync(join(localRoot, dir));
  const result = [];
  for (const name of items) {
    
  }
  return result;
}