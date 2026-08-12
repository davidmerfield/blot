#!/usr/bin/env bash
# Agent adapter: Cursor's `cursor-agent` CLI. See ./README for the contract.

AGENT_NAME="cursor-agent"
AGENT_DEFAULT_MODEL="auto"

agent_available() {
  command -v cursor-agent >/dev/null 2>&1
}

agent_install_hint() {
  cat <<'EOF'
The cursor-agent CLI was not found on PATH.

  curl https://cursor.com/install -fsS | bash

Then sign in with `cursor-agent login`.
EOF
}

# The only one of the three that can actually enumerate its models. Output is
# "id - Label"; convert to the tab-separated form the selector expects.
agent_models() {
  cursor-agent --list-models 2>/dev/null \
    | sed -n 's/^\([a-zA-Z0-9._-]*\) - \(.*\)$/\1\t\2/p'
}

agent_run() {
  local instruction="$1"
  local mode="$2"
  local session_id="$3"
  local model="$4"
  local transcript="$5"

  local -a args=(-p "$instruction"
                 --model "$model"
                 --output-format stream-json
                 --force)

  # cursor-agent picks its own chat ids; resume continues the latest in this
  # directory rather than one we name.
  if [ "$mode" = "resume" ]; then
    args+=(--resume)
  fi

  cursor-agent "${args[@]}" | node "$AGENT_DIR/agent-log.js" "$transcript"

  local statuses=("${PIPESTATUS[@]}")

  [ "${statuses[0]}" -eq 0 ] && [ "${statuses[1]}" -eq 0 ]
}
