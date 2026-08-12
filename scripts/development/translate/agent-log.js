// Turn an agent's streaming JSON output into something a person can follow, and
// keep the raw stream for review afterwards. Runs ON THE HOST.
//
//   claude -p … --output-format stream-json | node agent-log.js <transcript.jsonl>
//
// Reads newline-delimited JSON events on stdin. Writes every event verbatim to
// the transcript file, and a readable running commentary to stdout — so the
// operator can watch it happen and still have the full record to go back to.
//
// Unrecognised event shapes are passed through rather than dropped: this format
// belongs to the agent CLI, not to us, and it will change.

const fs = require("fs");
const readline = require("readline");

const MAX_TEXT = 2000;

function truncate(text, limit = MAX_TEXT) {
  const clean = String(text || "").replace(/\s+$/, "");
  return clean.length > limit ? clean.slice(0, limit) + "…" : clean;
}

// Tool calls are the interesting part of watching an agent work: they say what
// it is actually doing rather than what it says it is doing.
function describeToolUse(block) {
  const input = block.input || {};
  const name = block.name || "tool";

  const path = input.file_path || input.path || input.notebook_path;
  if (path) return `${name}: ${path}`;

  if (input.pattern) return `${name}: ${input.pattern}`;
  if (input.command) return `${name}: ${truncate(input.command, 120)}`;
  if (input.url) return `${name}: ${input.url}`;
  if (input.prompt) return `${name}: ${truncate(input.prompt, 120)}`;

  return name;
}

function render(event) {
  const lines = [];

  if (!event || typeof event !== "object") return lines;

  // Assistant turns carry the text and the tool calls.
  if (event.type === "assistant" && event.message) {
    for (const block of event.message.content || []) {
      if (block.type === "text" && block.text && block.text.trim()) {
        lines.push(truncate(block.text));
      } else if (block.type === "tool_use") {
        lines.push("  → " + describeToolUse(block));
      }
    }
    return lines;
  }

  // Tool results are mostly noise; surface only failures, which matter.
  if (event.type === "user" && event.message) {
    for (const block of event.message.content || []) {
      if (block.type === "tool_result" && block.is_error) {
        const text = Array.isArray(block.content)
          ? block.content.map((c) => c.text || "").join(" ")
          : block.content;
        lines.push("  ✗ " + truncate(text, 300));
      }
    }
    return lines;
  }

  if (event.type === "result") {
    if (event.is_error) lines.push("✗ " + truncate(event.result || event.subtype, 500));
    return lines;
  }

  if (event.type === "system" && event.subtype === "init") {
    const bits = [];
    if (event.model) bits.push(event.model);
    if (event.session_id) bits.push("session " + String(event.session_id).slice(0, 8));
    if (bits.length) lines.push("· " + bits.join(", "));
    return lines;
  }

  return lines;
}

function main() {
  const transcriptPath = process.argv[2];

  if (!transcriptPath) {
    console.error("Usage: agent-log.js <transcript.jsonl>");
    process.exit(1);
  }

  // Append: a resumed turn should extend the record, not replace it.
  const transcript = fs.createWriteStream(transcriptPath, { flags: "a" });
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  let sawError = false;

  rl.on("line", (line) => {
    if (!line.trim()) return;

    transcript.write(line + "\n");

    let event;

    try {
      event = JSON.parse(line);
    } catch (e) {
      // Not JSON: the CLI printed something plain. Show it rather than hide it.
      process.stdout.write(line + "\n");
      return;
    }

    if (event && event.type === "result" && event.is_error) sawError = true;

    for (const rendered of render(event)) {
      process.stdout.write(rendered + "\n");
    }
  });

  rl.on("close", () => {
    transcript.end();
    // Mirror the agent's own failure so the shell sees it, since the pipeline's
    // exit status would otherwise be this process's.
    process.exitCode = sawError ? 1 : 0;
  });
}

if (require.main === module) main();

module.exports = { render, describeToolUse };
