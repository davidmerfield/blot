// https://commons.wikimedia.org/wiki/Leonardo_da_Vinci

const fs = require("fs-extra");
const DATA_DIR = __dirname + "/data";

const main = async label => {
  if (!label) {
    console.log("No label provided");
    process.exit(1);
  }

  const folder = `${DATA_DIR}/${label}`;

  if (!fs.existsSync(folder)) {
    console.log(`No data directory found for ${label} at ${folder}`);
    process.exit(1);
  }
};

if (require.main === module) {
  main(process.argv[2]);
}
