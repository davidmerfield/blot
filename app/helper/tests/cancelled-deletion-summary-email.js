var fs = require("fs");
var path = require("path");
var Mustache = require("mustache");
var { marked } = require("marked");
var async = require("async");
var User = require("models/user");
var email = require("helper/email");
var processSubscriptionLifecycle = require("scheduler/subscription-lifecycle");
var ONE_MONTH_MS = require("models/user/subscriptionLifecycle").ONE_MONTH_MS;

var TEMPLATE_PATH = path.join(
  __dirname,
  "../email/admin/DELETED_CANCELLED_SUBSCRIPTION_EXPIRED.txt"
);

function renderTemplate(locals) {
  var text = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  var lines = text.split("\n");
  var subject = Mustache.render(lines[0] || "", locals);
  var html = marked.parse(Mustache.render(lines.slice(2).join("\n") || "", locals));
  return { subject: subject, html: html };
}

function expiredSecondsAgo(msAgo) {
  return Math.floor((Date.now() - msAgo) / 1000);
}

describe("cancelled deletion summary email", function () {
  var usersToRemove;

  beforeEach(function () {
    usersToRemove = [];
  });

  afterEach(function (done) {
    async.eachSeries(
      usersToRemove,
      function (user, next) {
        if (!user || !user.uid) return next();
        User.remove(user.uid, next);
      },
      done
    );
  });

  function createCancelledUser(address, periodEndedSeconds, callback) {
    User.hashPassword("test-password", function (err, passwordHash) {
      if (err) return callback(err);

      User.create(
        address,
        passwordHash,
        {
          status: "canceled",
          current_period_end: periodEndedSeconds,
        },
        {},
        function (err, user) {
          if (err) return callback(err);
          usersToRemove.push(user);
          callback(null, user);
        }
      );
    });
  }

  it("renders one summary listing every user due for deletion", function () {
    var template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    var rendered = renderTemplate({
      count: 2,
      singular: false,
      users: [
        {
          email: "ada@example.com",
          subscriptionExpiredOn: "2026-01-01T00:00:00.000Z",
        },
        {
          email: "grace@example.com",
          subscriptionExpiredOn: "2026-02-01T00:00:00.000Z",
        },
      ],
    });

    expect(template.toLowerCase()).not.toContain("safe mode");
    expect(rendered.subject).toBe("2 cancelled accounts due for deletion");
    expect(rendered.html).toContain("ada@example.com");
    expect(rendered.html).toContain("grace@example.com");
    expect(rendered.html).toContain("ssh blot");
    expect(rendered.html).toContain("login");
    expect(rendered.html).toContain(
      "node scripts/user/delete-cancelled-after-grace.js -fast"
    );
    expect(rendered.html.toLowerCase()).not.toContain("safe mode");
  });

  it("uses the singular subject when only one user is due", function () {
    var rendered = renderTemplate({
      count: 1,
      singular: true,
      users: [
        {
          email: "ada@example.com",
          subscriptionExpiredOn: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(rendered.subject).toBe("1 cancelled account due for deletion");
  });

  it("sends one daily email summarizing all users due for deletion", function (done) {
    spyOn(email, "DELETED_CANCELLED_SUBSCRIPTION_EXPIRED").and.callFake(
      function (uid, locals, callback) {
        if (typeof callback === "function") callback();
      }
    );

    var dueEnded = expiredSecondsAgo(ONE_MONTH_MS + 24 * 60 * 60 * 1000);
    var alsoDueEnded = expiredSecondsAgo(2 * ONE_MONTH_MS);
    var stillInGraceEnded = expiredSecondsAgo(1000);

    createCancelledUser("due-one@example.com", dueEnded, function (err) {
      if (err) return done.fail(err);

      createCancelledUser("due-two@example.com", alsoDueEnded, function (err) {
        if (err) return done.fail(err);

        createCancelledUser(
          "still-in-grace@example.com",
          stillInGraceEnded,
          function (err) {
            if (err) return done.fail(err);

            processSubscriptionLifecycle(function (err) {
              if (err) return done.fail(err);

              expect(
                email.DELETED_CANCELLED_SUBSCRIPTION_EXPIRED.calls.count()
              ).toBe(1);

              var args =
                email.DELETED_CANCELLED_SUBSCRIPTION_EXPIRED.calls.argsFor(0);
              var locals = args[1];

              expect(args[0]).toBe("");
              expect(locals.count).toBe(2);
              expect(locals.singular).toBe(false);
              expect(
                locals.users
                  .map(function (user) {
                    return user.email;
                  })
                  .sort()
              ).toEqual(["due-one@example.com", "due-two@example.com"]);
              done();
            });
          }
        );
      });
    });
  });

  it("does not send a summary when no cancelled users are due", function (done) {
    spyOn(email, "DELETED_CANCELLED_SUBSCRIPTION_EXPIRED");

    createCancelledUser(
      "still-in-grace@example.com",
      expiredSecondsAgo(1000),
      function (err) {
        if (err) return done.fail(err);

        processSubscriptionLifecycle(function (err) {
          if (err) return done.fail(err);
          expect(email.DELETED_CANCELLED_SUBSCRIPTION_EXPIRED).not.toHaveBeenCalled();
          done();
        });
      }
    );
  });
});
