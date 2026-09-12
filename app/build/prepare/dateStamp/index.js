const debug = require("debug")("blot:build:dateStamp");

const fromPath = require("./fromPath");
const fromMetadata = require("./fromMetadata");
const type = require("helper/type");

const moment = require("moment");
require("moment-timezone");

const metadataCaseInsensitive = require("helper/metadataCaseInsensitive");

module.exports = function (blog, path, metadata, previousCreated) {
  const { id, dateFormat, timeZone } = blog;
  let dateStamp;

  debug("Blog:", id, "dateFormat:", dateFormat, "timeZone", timeZone, path);

  const metadataByLowercaseKey = metadataCaseInsensitive(metadata);
  const metadataDate = metadataByLowercaseKey.date;

  // If the user specified a date
  // field in the entry's metadata,
  // try and parse a timestamp from it.
  if (metadataDate) {
    // Since there is the possibilty of using YAML, the date might not be a string
    let dateMetadataString = String(metadataDate);
    let parsedFromMetadata = fromMetadata(dateMetadataString, dateFormat, timeZone);
    dateStamp = validate(parsedFromMetadata.created);
    if (dateStamp && parsedFromMetadata.adjusted) {
      debug("Blog:", id, "Date from metadata adjusted by timezone in metadata", dateStamp);
      return dateStamp;
    } else if (dateStamp) {
      debug("Blog:", id, "Date from metadata", dateStamp);
      dateStamp = adjustByBlogTimezone(timeZone, dateStamp);
      dateStamp = useCreatedTimeIfSameDay(
        dateStamp,
        /\d{1,2}:\d{2}/.test(dateMetadataString),
        previousCreated,
        timeZone
      );
      return dateStamp;
    }
  }

  // The user didn't specify a valid
  // date in the entry's metadata. Try
  // and extract one from the file's path
  const parsedFromPath = fromPath(path, timeZone);
  dateStamp = validate(parsedFromPath.created);

  if (dateStamp !== undefined) {
    debug("Blog:", id, "Date from path", dateStamp);
    dateStamp = adjustByBlogTimezone(timeZone, dateStamp);
    dateStamp = useCreatedTimeIfSameDay(
      dateStamp,
      !!parsedFromPath.hasTime,
      previousCreated,
      timeZone
    );
    return dateStamp;
  }

  // It is important we return undefined since we fall back
  // to the file's created date if that's the case
  debug("Blog:", id, "No date found in metadata or path");
  return undefined;
};

function validate(stamp) {
  debug("Validating date", stamp);
  if (type(stamp, "number") && !isNaN(stamp) && moment.utc(stamp).isValid())
    return stamp;
  
  return undefined;
}

// A date sourced from metadata (e.g. "Date: 12/12/2025") or a path (e.g.
// "/2025/12/12/post.txt") often carries no time-of-day, so it parses to
// midnight. If the entry already exists and was first created by Blot on
// that same calendar day (in the blog's timezone), reuse its time of day
// instead - it's a better guess than midnight for "when was this
// written". An explicit time (in the metadata string, or as extra
// hour/minute tokens in the path), or a date that doesn't match the
// entry's creation day (e.g. because the post was backdated, or the date
// was later edited), leaves the parsed timestamp untouched. Removing the
// date metadata entirely skips this function altogether for that branch,
// since dateStamp then falls back to the path or to previousCreated
// directly.
function useCreatedTimeIfSameDay(dateStamp, hasExplicitTime, previousCreated, timeZone) {
  if (hasExplicitTime) return dateStamp;

  if (typeof previousCreated !== "number" || isNaN(previousCreated))
    return dateStamp;

  var zone = timeZone && moment.tz.zone(timeZone) ? timeZone : "Etc/UTC";
  var metadataDay = moment.tz(dateStamp, zone);
  var created = moment.tz(previousCreated, zone);

  if (metadataDay.format("YYYY-MM-DD") !== created.format("YYYY-MM-DD"))
    return dateStamp;

  return metadataDay
    .clone()
    .set({
      hour: created.hour(),
      minute: created.minute(),
      second: created.second(),
      millisecond: created.millisecond(),
    })
    .valueOf();
}

function adjustByBlogTimezone(timeZone, stamp) {
  var zone = moment.tz.zone(timeZone);

  if (!zone) {
    debug("Timezone not found", timeZone);
    return stamp;
  }
  
  var offset = zone.utcOffset(stamp);
  debug("Adjusting date by timezone", offset, timeZone);
  return moment.utc(stamp).add(offset, "minutes").valueOf();
}
