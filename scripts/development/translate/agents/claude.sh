#!/usr/bin/env bash
# Agent adapter: Anthropic's `claude` CLI.
#
# Adapters implement three functions. See ./README for the contract.

AGENT_NAME="claude"
AGENT_DEFAULT_MODEL="sonnet"

# Does this agent exist on the host?
agent_available() {
  command -v claude >/dev/null 2>&1
}

agent_install_hint() {
  cat <<'EOF'
The claude CLI was not found on PATH. It runs on the host, not in the container.

  https://claude.com/claude-code

Or choose a different agent:

  TRANSLATE_AGENT=codex npm run translate <url>
EOF
}

# claude has no command to enumerate models, so this is a curated list of the
# aliases it accepts. The operator can always type a full model name instead.
agent_models() {
  cat <<'EOF'
sonnet	Sonnet (default)
opus	Opus
haiku	Haiku
EOF
}

# agent_run <instruction> <mode: new|resume> <session-id> <model> <transcript>
#
# Must stream a readable commentary to stdout, append the raw transcript to
# <transcript>, and exit non-zero if the agent failed.
agent_run() {
  local instruction="$1"
  local mode="$2"
  local session_id="$3"
  local model="$4"
  local transcript="$5"
  local -a args

  args=(-p "$instruction"
        --model "$model"
        --output-format stream-json
        --verbose
        --permission-mode acceptEdits
        --allowedTools Read Write Edit Glob Grep WebFetch)

  # Resuming keeps the agent's memory of what it already built, so operator
  # feedback lands in context rather than starting from a blank slate.
  if [ "$mode" = "resume" ]; then
    args+=(--resume "$session_id")
  else
    args+=(--session-id "$session_id")
  fi

  # PIPESTATUS so a failing agent is not masked by a succeeding formatter.
  claude "${args[@]}" | node "$AGENT_DIR/agent-log.js" "$transcript"

  local statuses=("${PIPESTATUS[@]}")

  [ "${statuses[0]}" -eq 0 ] && [ "${statuses[1]}" -eq 0 ]
}
