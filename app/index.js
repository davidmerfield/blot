const config = require("config");
const clfdate = require("helper/clfdate");
const email = require("helper/email");
const setup = require("./setup");
const server = require("./server");

console.log(clfdate(), `Starting server env=${config.environment}`);
setup(async (err) => {
  if (err) throw err;

  console.log(clfdate(), "Finished setting up server");

  // Open the server to handle requests
  server.listen(config.port, () => {
    console.log(clfdate(), `Server listening`);

    // Run non-blocking setup tasks after the port is bound so startup isn't delayed.
    if (typeof setup.runPostListenTasks === "function") {
      setup
        .runPostListenTasks()
        .catch((err) =>
          console.error(
            clfdate(),
            "Setup:",
            "Post-listen tasks encountered an error",
            err,
          ),
        );
    }

    // Send an email notification if the server starts or restarts
    email.SERVER_START(null, { container: config.container });
  });
});
