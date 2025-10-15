const Mailgun = require("mailgun.js");
const formData = require("form-data");
const config = require("config");
const from = config.mailgun.from;
const mailgun = new Mailgun(formData);

if (!config.mailgun || !config.mailgun.key || !config.mailgun.domain) {
  console.error("Mailgun credentials are not configured");
  process.exit(1);
}

const client = mailgun.client({
  username: (config.mailgun && config.mailgun.username) || "api",
  key: config.mailgun.key,
});

const to = process.argv[2];

if (!to) {
  console.log("Please provide an email address");
  process.exit(1);
}

const subject = process.argv[3] || "Test email";
const html = process.argv[4] || "<p>This is a test email</p>";

var email = {
  html,
  subject,
  from,
  to,
};

client.messages
  .create(config.mailgun.domain, email)
  .then(() => {
    console.log("Email sent");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
