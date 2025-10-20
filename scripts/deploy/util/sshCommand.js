const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

module.exports = async function sshCommand(command) {
  const timeoutMs = 60 * 1000;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const { stdout } = await execFileAsync("ssh", ["blot", command], {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return stdout.trim();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        `SSH command timed out after ${timeoutMs / 1000} seconds: ${command}`
      );
    }
    throw new Error(`SSH command failed: ${command}\n${error.message}`);
  }
};
