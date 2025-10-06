module.exports = function ($) {
  // Sort out line breaks
  // Google Docs uses empty <p> tags to represent line breaks
  // We want to convert these into <br> tags instead
  // But we also want to preserve multiple line breaks in a row
  // So we need to group consecutive <p> tags together and then
  // join them with <br> tags
  // Step 1: Collect all <p> nodes in order
  // Step 1: Collect all <p> nodes in order
  // Instead of just pNodes, grab all <p> and <hr> in order:
  const nodes = $("p, hr").toArray();

  let currGroup = [];
  let prevNode = null;
  let emptyCount = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const tag = node.tagName ? node.tagName.toLowerCase() : node.name;

    if (tag === "p") {
      const inner = $(node).html().trim();

      // Is this an empty line?
      if (
        inner === "" ||
        inner === "<span></span>" ||
        inner === "<span/>" ||
        inner.match(/^<span>\s*<\/span>$/)
      ) {
        emptyCount++;
        // Always remove the empty <p>
        $(node).remove();

        // If we have a current group, close it
        if (currGroup.length > 0) {
          const firstP = currGroup[0];
          const lines = currGroup.map((n) => $(n).html().trim());
          $(firstP).html(lines.join("<br>"));
          for (let j = 1; j < currGroup.length; j++) {
            $(currGroup[j]).remove();
          }
          prevNode = firstP;
          currGroup = [];
        }
      } else {
        // Before starting a new group, insert <br> for extra empty lines (if any)
        if (
          emptyCount > 1 &&
          prevNode &&
          prevNode.tagName !== "HR" &&
          prevNode.name !== "hr"
        ) {
          for (let k = 1; k < emptyCount; k++) {
            $(prevNode).after("<br>");
            prevNode = $(prevNode).next()[0];
          }
        }
        emptyCount = 0; // Reset empty count

        currGroup.push(node);
        prevNode = node;
      }
    } else if (tag === "hr") {
      // If we have a current group, close it (no <br> before <hr>)
      if (currGroup.length > 0) {
        const firstP = currGroup[0];
        const lines = currGroup.map((n) => $(n).html().trim());
        $(firstP).html(lines.join("<br>"));
        for (let j = 1; j < currGroup.length; j++) {
          $(currGroup[j]).remove();
        }
        prevNode = firstP;
        currGroup = [];
      }
      emptyCount = 0; // Reset empty count after <hr>
      prevNode = node; // Update prevNode to <hr>
    }
  }

  // Handle any trailing group
  if (currGroup.length > 0) {
    const firstP = currGroup[0];
    const lines = currGroup.map((n) => $(n).html().trim());
    $(firstP).html(lines.join("<br>"));
    for (let j = 1; j < currGroup.length; j++) {
      $(currGroup[j]).remove();
    }
    currGroup = [];
  }
};
