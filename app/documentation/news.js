var Express = require("express");
var news = new Express.Router();
var fs = require("fs-extra");
var Email = require("helper/email");
const { marked } = require("marked");
var parse = require("body-parser").urlencoded({ extended: false });
var uuid = require("uuid/v4");
var config = require("config");
var client = require("models/client");
var gitCommits = require("./tools/git-commits").middleware;
var listKey = "newsletter:list";
var moment = require("moment");
var TTL = 60 * 60 * 24; // 1 day in seconds
const { join } = require("path");
const root = require("helper/rootDir");
const astro = require("helper/astro");

// calculate the date of the next newsletter
// we send a newsletter on the solstices and equinoxes
// use moment to calculate the next one and return
// the season e.g. "spring" and the time from now until
// the next newsletter e.g. "in 3 days" or "in 1 month"
const nextNewsletter = () => {
  const now = moment();
  const year = now.year();
  const equinoxesAndSolstices = [...astro(year), ...astro(year + 1)];
  const { season, date } = equinoxesAndSolstices.find(({ date }) => {
    // add padding of a day
    return now.isBefore(date);
  });

  // instead of moment fromNow, we want to say either
  // "in X months" where X is the number of months from now
  // "in a few weeks"
  // "in a few days"
  // "tomorrow"
  let modifiedFromNow;

  if (now.isSame(date, "day")) {
    modifiedFromNow = "tomorrow";
  } else if (now.isSame(date, "week")) {
    modifiedFromNow = "in a few days";
  } else if (now.isSame(date, "month")) {
    modifiedFromNow = "in a few weeks";
  } else {
    modifiedFromNow = moment(date).fromNow();
  }

  return { season, fromNow: modifiedFromNow };
};

news.get("/", gitCommits, loadToDo, function (req, res) {
  res.locals.fullWidth = true;
  try {
    res.locals.nextNewsletter = nextNewsletter();
  } catch (e) {
    console.log(e);
  }
  res.render("news");
});

// The rest of these pages should not be cached
news.use(function (req, res, next) {
  res.header("Cache-Control", "no-cache");
  res.locals.fullWidth = true;
  res.locals.title = "Newsletter";
  next();
});

news.get("/sign-up", function (req, res) {
  if (!req.query || !req.query.email) return res.redirect(req.baseUrl);
  res.locals.email = req.query.email;
  res.locals.title = "Sign up";
  res.render("news/sign-up");
});

news.get("/cancel", function (req, res) {
  res.locals.email = req.query.email;
  res.locals.title = "Cancel";
  res.render("news/cancel");
});

function confirmationKey(guid) {
  return "newsletter:confirm:" + guid;
}

function cancellationKey(guid) {
  return "newsletter:cancel:" + guid;
}

function confirmationLink(guid) {
  return "https://" + config.host + "/news/confirm/" + guid;
}

function cancellationLink(guid) {
  return "https://" + config.host + "/news/cancel/" + guid;
}

// Removes guid from visible breadcrumbs
news.param("guid", function (req, res, next) {
  res.locals.breadcrumbs = res.locals.breadcrumbs.slice(0, -1);
  next();
});

news.post("/cancel", parse, function (req, res, next) {
  var cancel, email, locals;
  var guid = uuid();

  if (!req.body || !req.body.email) {
    return next(new Error("No email"));
  }

  email = req.body.email.trim().toLowerCase();
  guid = guid.split("-").join("");
  guid = encodeURIComponent(guid);
  cancel = cancellationLink(guid);
  locals = { email: email, cancel: cancel };

  client.sismember(listKey, email, function (err, stat) {
    if (err || !stat) return next(err || new Error("No subscription found"));

    client.setex(cancellationKey(guid), TTL, email, function (err) {
      if (err) return next(err);

      Email.NEWSLETTER_CANCELLATION_CONFIRMATION(null, locals, function (err) {
        if (err) return next(err);

        res.redirect("/news/cancel?email=" + email);
      });
    });
  });
});

news.get("/cancel/:guid", function (req, res, next) {
  var guid = decodeURIComponent(req.params.guid);

  client.get(cancellationKey(guid), function (err, email) {
    if (err || !email) return next(err || new Error("No email"));

    client.srem(listKey, email, function (err, removed) {
      if (err) return next(err);

      var locals = { email: email };

      res.locals.title = "Cancelled";
      res.locals.email = email;

      if (removed) {
        Email.NEWSLETTER_CANCELLATION_CONFIRMED(null, locals, function () {
          // Email confirmation sent
        });
      }

      res.locals.title = "Cancelled";
      res.render("news/cancelled");
    });
  });
});

news.get("/confirm/:guid", function (req, res, next) {
  var guid = decodeURIComponent(req.params.guid);

  client.get(confirmationKey(guid), function (err, email) {
    if (err || !email) return next(err || new Error("No email"));

    client.sadd(listKey, email, function (err, added) {
      if (err) return next(err);

      var locals = {
        email: email,
        cancel: "https://" + config.host + "/news/cancel",
      };

      res.locals.title = "Confirmed";
      res.locals.email = email;

      // The first time the user clicks the confirmation
      // link we send out a confirmation email, subsequent
      // clicks they just see the confirmation page.
      if (added) {
        Email.NEWSLETTER_SUBSCRIPTION_CONFIRMED(null, locals, function () {
          // Email confirmation sent
        });
      }

      res.redirect(req.baseUrl + "/confirmed");
    });
  });
});

news.post("/sign-up", parse, function (req, res, next) {
  var confirm, email, locals;
  var guid = uuid();

  if (!req.body && !req.body.contact_gfhkj) {
    return next(new Error("No email"));
  }

  // honeypot fields
  if (req.body.email || req.body.name) {
    return next(new Error("Honeypot triggered"));
  }

  email = req.body.contact_gfhkj.trim().toLowerCase();
  guid = guid.split("-").join("");
  guid = encodeURIComponent(guid);
  confirm = confirmationLink(guid);
  locals = { email: email, confirm: confirm };

  client.setex(confirmationKey(guid), TTL, email, function (err) {
    if (err) return next(err);

    Email.NEWSLETTER_SUBSCRIPTION_CONFIRMATION(null, locals, function (err) {
      if (err) return next(err);

      res.redirect("/news/sign-up?email=" + email);
    });
  });
});

function loadToDo(req, res, next) {
  fs.readFile(join(root, "TODO"), "utf-8", function (err, todo) {
    if (err) {
      console.log(err);
      res.locals.todo = "";
      return next();
    }
    res.locals.todo = marked.parse(todo);

    var html = res.locals.todo;
    var $ = require("cheerio").load(html);

    $("ul").each(function () {
      var ul = $(this).html();
      var p = $(this).prev().html();

      $(this).prev().remove();
      $(this).replaceWith(
        "<details><summary>" + p + "</summary><ul>" + ul + "</ul></details>",
      );
    });

    res.locals.todo = $("body").html();
    return next();
  });
}

module.exports = news;
