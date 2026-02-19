const debug = require("debug")("blot:build:dateStamp");

const fromPath = require("./fromPath");
const fromMetadata = require("./fromMetadata");
const type = require("helper/type");

const moment = require("moment");
require("moment-timezone");

const metadataCaseInsensitive = require("helper/metadataCaseInsensitive");

module.exports = function (blog, path, metadata) {
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
      return adjustByBlogTimezone(timeZone, dateStamp);
    }
  }

  // The user didn't specify a valid
  // date in the entry's metadata. Try
  // and extract one from the file's path
  dateStamp = validate(fromPath(path, timeZone).created);

  if (dateStamp !== undefined) {
    debug("Blog:", id, "Date from path", dateStamp);
    dateStamp = adjustByBlogTimezone(timeZone, dateStamp);
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
