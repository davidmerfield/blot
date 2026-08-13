// Maps 'Unexpected token } in JSON at position 505' to
// 'Unexpected token } in JSON at position 12 on line 31'
module.exports = function improveJSONErrorMessage (err, contents) {
  try {
    const regex = /at position (\d+)$/gm;
    const found = [...err.message.matchAll(regex)][0];
    const position = parseInt(found[1]);
    const messageWithoutLocation = err.message.slice(0, found.index).trim();
    const lines = contents.slice(0, position).split("\n");
    const lineNumber = lines.length;
    const linePosition = lines[lineNumber - 1].length;
    return `${messageWithoutLocation} at position ${linePosition} on line ${lineNumber}`;
  } catch (e) {
    // We could not rewrite the message, so report the original rather than
    // the failure to rewrite it
    return err.message;
  }
};
