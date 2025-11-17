const Tail = require("helper/tail");
const access = new Tail("logs/nginx.log", { nLines: 1000 });
const moment = require("moment");

// [17/Apr/2021:15:20:09 -0400] 4c071011176edb096b3461d2bd9a40f1 502 0.001 888:1220 https://blot.development/settings/photo  cache=-
var currentSecond;
var currentSecondReqs = 0;
var transactionsData = {
  title: "NGINX",
  style: { line: "red" },
  x: [],
  y: []
};

access.on("line", function (data) {
  const date = data.slice(1, data.indexOf("]"));

  let second = moment(date, "DD/MMM/YYYY:HH:mm:ss Z")
    .startOf("second")
    .format("mm:ss");

  if (currentSecond === undefined) {
    currentSecond = second;
  }

  if (second === currentSecond) {
    currentSecondReqs++;
  } else {
    transactionsData.x.push(currentSecond);
    transactionsData.y.push(currentSecondReqs);
    currentSecond = second;
    currentSecondReqs = 1;
    if (transactionsData.x.length > 30)
      transactionsData.x = transactionsData.x.slice(-1 * 30);
    if (transactionsData.y.length > 30)
      transactionsData.y = transactionsData.y.slice(-1 * 30);
    console.log(transactionsData);
  }
});

const error = new Tail("logs/nginx.error.log", { nLines: 1000 });

// 2021/04/17 22:54:26 [info] 43792#0: *834 SSL_do_handshake() failed (SSL: error:14094416:SSL routines:ssl3_read_bytes:sslv3 alert certificate unknown:SSL alert number 46) while SSL handshaking, client: 127.0.0.1, server: 0.0.0.0:443
error.on("line", function (data) {});

const app = new Tail("logs/app.log", { nLines: 1000 });

//[18/Apr/2021:14:06:00 -0400] [STATS] cpuuse=61.926% memuse=99.066%
// [18/Apr/2021:13:57:03 -0400] a6071b01405082aaa0b063ab4d4f08f0 304 0.006 PID=68756 https://blot.development/css/tex.css?cache=1618768606555&extension=.css
app.on("line", function (data) {});
