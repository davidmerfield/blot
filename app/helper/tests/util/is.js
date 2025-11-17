// Example usage:
// var is = Is(function(x,y){return x + y});
// is(1,2,3); // succeed
// is(1,2,4); // will raise exception

module.exports = function Is(doThis) {
  return function () {
    var args = Array.prototype.slice.call(arguments);
    var expected = args.slice(-1)[0];
    var inputs = args.slice(0, -1);
    var result = doThis.apply(this, inputs);

    expect(expected).toEqual(
      result,
      `
----------------------------------------------------------
Input: '${inputs}'
Expected: '${expected}'
Result: '${result}'
----------------------------------------------------------`
    );
  };
};
