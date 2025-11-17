const titlecase = require("helper/titlecase");

describe("titlecase", () => {
  it("should titlecase a string", () => {
    const title = "the quick brown fox jumps over the lazy dog";
    const result = titlecase(title);
    expect(result).toBe("The Quick Brown Fox Jumps Over the Lazy Dog");
  });

  it("ignores emojis", () => {
    const title = "🚀 the quick brown fox jumps over the lazy dog";
    const result = titlecase(title);
    expect(result).toBe("🚀 The Quick Brown Fox Jumps Over the Lazy Dog");
  });

  it("ignores emails", () => {
    const title = "for step-by-step directions email someone@gmail.com";
    const result = titlecase(title);
    expect(result).toBe("For Step-by-Step Directions Email someone@gmail.com");
  });

  it("ignores urls", () => {
    const title = "for step-by-step directions visit http://www.google.com";
    const result = titlecase(title);
    expect(result).toBe(
      "For Step-by-Step Directions Visit http://www.google.com"
    );
  });

  it("handles a thing", () => {
    const title = "a thing";
    const result = titlecase(title);
    expect(result).toBe("A Thing");
  });

  it("handles digits and colons", () => {
    const title = "2lmc spool: 'gruber on OmniFocus and vapo(u)rware'";
    const result = titlecase(title);
    expect(result).toBe("2lmc Spool: 'Gruber on OmniFocus and Vapo(u)rware'");
  });
});
