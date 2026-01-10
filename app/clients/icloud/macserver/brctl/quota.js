const exec = require("../exec");

module.exports = async () => {
  // use brctl quota to get the iCloud Drive quota and usage
  // e.g. '1899909948243 bytes of quota remaining in personal account'
  const { stdout, stderr } = await exec("brctl", ["quota"]);

  const trimmedStdout = typeof stdout === "string" ? stdout.trim() : "";
  const trimmedStderr = typeof stderr === "string" ? stderr.trim() : "";

  if (trimmedStderr) {
    console.error("Error getting iCloud Drive quota", {
      stdout: trimmedStdout,
      stderr: trimmedStderr,
    });
    throw new Error("Failed to get iCloud Drive quota");
  }

  if (!trimmedStdout) {
    console.error("iCloud Drive quota parse failure", {
      stdout: trimmedStdout,
      stderr: trimmedStderr,
    });
    const error = new Error(
      `Unexpected iCloud Drive quota output: ${trimmedStdout || "<empty>"} | stderr: ${trimmedStderr || "<empty>"}`
    );
    error.name = "QuotaParseError";
    throw error;
  }

  const match = trimmedStdout.match(/(\d+) bytes of quota remaining/);
  if (!match?.[1]) {
    console.error("iCloud Drive quota parse failure", {
      stdout: trimmedStdout,
      stderr: trimmedStderr,
    });
    const error = new Error(
      `Unexpected iCloud Drive quota output: ${trimmedStdout || "<empty>"} | stderr: ${trimmedStderr || "<empty>"}`
    );
    error.name = "QuotaParseError";
    throw error;
  }

  return parseInt(match[1], 10);
};
