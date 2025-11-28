describe("template source editor error display", function () {
  const { showError, hideError } = require("../error-display");
  const { VIEW_TOO_LARGE_MESSAGE } = require("../../../../../models/template/setView");

  function createDoc() {
    const el = { style: {}, textContent: "" };
    return {
      el,
      querySelector: (selector) => (selector === ".error" ? el : null),
    };
  }

  it("shows the provided message in the error container", function () {
    const doc = createDoc();
    const handled = showError(doc, VIEW_TOO_LARGE_MESSAGE);

    expect(handled).toBe(true);
    expect(doc.el.textContent).toBe(VIEW_TOO_LARGE_MESSAGE);
    expect(doc.el.style.display).toBe("block");
    expect(doc.el.style.opacity).toBe("1");
  });

  it("hides the error container when requested", function () {
    const doc = createDoc();

    showError(doc, "Oops");
    const handled = hideError(doc);

    expect(handled).toBe(true);
    expect(doc.el.style.display).toBe("none");
  });
});
