const getConfirmation = require("./getConfirmation");

console.log("This is a test of the getConfirmation function");
getConfirmation("Are you sure you want to do this?").then(async (response) => {
  if (response) {
    console.log("You said yes!");
  } else {
    console.log("You said no!");
  }

  const confirmation = await getConfirmation("Are you sure you want to do this in async?");
  
  if (confirmation) {
    console.log("You said yes in async!");
  } else {
    console.log("You said no in async!");
  }
});
