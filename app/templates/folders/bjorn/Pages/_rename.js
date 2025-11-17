const dir = process.argv[2];
const fs = require("fs-extra");

const items = fs.readdirSync(dir);
const images = items.filter((i) => i.endsWith(".jpg"));

const places_map = {
  "vstergtland": "Västergötland",
  "hggum": "at Häggum,",
  "brunneby": "at Brunneby,",
  "stergtland": "Östergötland",
  "lake-hkvattnet": "Lake Hökvattnet,",
  "hkvattnet": "at Hökvattnet,",
  "lappland": "Lappland",
  "tisjlandet": "Tisjölandet",
  "kamajokk-river": "Kamajokk River,",
  "kamajokk": "at Kamajokk,",
  "prinskullen-prince-hill-kvikkjokk": "Prinskullen, Kvikkjokk,",
  "jokkmokk": "Jokkmokk,",
  "sami": "Sámi",
  "sara-persson": "Sara Persson",
  "saggat-sakkat": "Saggat,",
  "junsterforsen-junster-rapids": "Junsterforsen rapids,",
  "hlla-hielle-sele": "Hälla, Åsele",
  "lake-dabbsjn-dorotea": "Lake Dabbsjön, Dorotea,",
  "lemnset-lesjn-ngermanland": "at Lemnäset, Ångermanland",
  "jmtland": "Jämtland",
  "dalarna": "Dalarna",
  "djupsj": "Djupsjö,",
  "lake-tisjn": "Lake Tisjön,",
  "lake-smalsjn": "Lake Smalsjön,",
  "lakavattnet": "at Lakavattnet,",
  "kerslund-prsttomta": "at Åkerslund, ",
  "lakavattnet": "at Lakavattnet,",
  "smedsbo": "Smedsbo,",
  "satisjaure-satihaure-gllivare": "at Satisjaure, Gällivare",
  "lake": "Lake",
  "ngermanlven-river": "River Angermanalven",
};

images.forEach((_i) => {
  let i = _i;

  for (const place in places_map) i = i.split(place).join(places_map[place]);

  if (i.indexOf("-") > -1) i = i.split("-").join(" ");

  if (i.indexOf("_") > -1) i = i.split("_").join(" ");

  if (i[0].toLowerCase() === i[0]) {
    i = i[0].toUpperCase() + i.slice(1);
  }

  i = i
    .split(" ")
    .map((s) => (/^\d+$/.test(s) ? "" : s))
    .map((s) => (s === "o.jpg" ? ".jpg" : s))
    .filter((i) => !!i)
    .join(" ");

  i = i.split(" sweden").join("");
  i = i.split(" .jpg").join(".jpg");

  console.log("before", _i);

  let cnt = 0;

  while (fs.existsSync(dir + "/" + i)) {
    cnt++;
    i = cnt + " " + i;
  }

  console.log("after ", i);
  console.log();

  if (i !== _i) fs.moveSync(dir + "/" + _i, dir + "/" + i);
});

console.log("Done!");
