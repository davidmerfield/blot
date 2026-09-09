module.exports = function callOnce(f) {
  var called = false;
  return function foo() {
    var args = arguments;
    if (called) return;
    // Set the flag before invoking so that a throw from f
    // cannot leave the latch open and allow a second call.
    called = true;
    return f.apply(this, args);
  };
};
