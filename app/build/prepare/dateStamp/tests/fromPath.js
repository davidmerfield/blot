describe("date from file path", function () {
  var fromPath = require("../fromPath");

  function check(str, date, fileName) {
    it(
      "parses " + str + " as " + date + " with filename " + fileName,
      function () {
        var res = fromPath(str);

        if (date === false) {
          expect(res).toEqual(false);
          return;
        }

        expect(res.created).toEqual(date); // "Incorrect datestamp
        expect(res.fileName).toEqual(fileName); // "Incorrect fileName
      }
    );
  }

  var stamp = 1453075200000;

  // Has 'no' filename
  check("2016_1_18.txt", stamp, ".txt");

  // Invalid dates
  check("2016-100-180-foo.txt", false);
  check("20162-100-180-foo.txt", false);
  check("2016-ABC-12-foo.txt", false);
  check("ABC-2016-ABC-12-foo.txt", false);

  // Valid dates
  check("/2016/1/18/foo-bar-baz.txt", stamp, "foo-bar-baz.txt");
  check("/2016-1-18 Avatar.txt", stamp, "Avatar.txt");
  check("/2016-1-18-foo.txt", stamp, "foo.txt");
  check("2016-01-18-foo.txt", stamp, "foo.txt");
  check("2016_1_18-foo.txt", stamp, "foo.txt");
  check("/2016/1/18/foo.txt", stamp, "foo.txt");
  check("/2016/1/18-foo.txt", stamp, "foo.txt");
  check("/2016/1_18-foo.txt", stamp, "foo.txt");
  check("2016/1/18-foo.txt", stamp, "foo.txt");

  check("/1999-08-1-123456.txt", 933465600000, "123456.txt");
  check("1999/8-01/123456.txt", 933465600000, "123456.txt");

  check("/nest/dir/2016/1_18-foo.txt", stamp, "foo.txt");
  check("/nest/dir/2016/1/18_foo.txt", stamp, "foo.txt");

  // Invalid leading dir
  check("2016/07/32/2016-1-18-test.txt", stamp, "test.txt");

  // Valid Hour as well
  check("2013-09-18-19.20.36.jpg", 1379532036000, ".jpg");
  check("2013-01-31-00.00.1.jpg", 1359590401000, ".jpg");

  // Invalid hour
  check("2013-01-31-100-322-1-4.jpg", 1359590400000, "100-322-1-4.jpg");
});
