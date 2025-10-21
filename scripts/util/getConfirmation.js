const readline = require("readline");

module.exports = function getConfirmation(message, callback) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question(`${message} (y/n): `, (answer) => {
      rl.close();
      const confirmation = answer.toLowerCase().trim() === "y";

      if (callback) {
        callback(null, confirmation);
      }
      resolve(confirmation);
    });
  });
};
