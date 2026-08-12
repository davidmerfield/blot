#!/usr/bin/env bash
# Agent adapter: OpenAI's `codex` CLI. See ./README for the contract.

AGENT_NAME="codex"
AGENT_DEFAULT_MODEL="gpt-5.3-codex"

agent_available() {
  command -v codex >/dev/null 2>&1
}

agent_install_hint() {
  cat <<'EOF'
The codex CLI was not found on PATH.

  npm install -g @openai/codex

Then sign in with `codex login`.
EOF
}

# codex has no way to enumerate models, so this is a curated list. The operator
# can always type a name that is not on it.
agent_models() {
  cat <<'EOF'
gpt-5.3-codex	Codex 5.3
gpt-5.3-codex-high	Codex 5.3 High
gpt-5.2	GPT-5.2
o3	o3
EOF
}

agent_run() {
  local instruction="$1"
  local mode="$2"
  local session_id="$3"
  local model="$4"
  local transcript="$5"

  # --full-auto: sandboxed automatic execution, approvals only on failure. The
  # sandbox is workspace-write, which is what we want — the agent edits this
  # folder and nothing else.
  local -a args=(exec --model "$model" --full-auto --json)

  # codex sessions are its own ids, not ours, so a resumed turn continues the
  # most recent session in this directory rather than one we name.
  if [ "$mode" = "resume" ]; then
    codex exec resume --last --model "$model" --full-auto --json "$instruction" \
      | node "$AGENT_DIR/agent-log.js" "$transcript"
  else
    codex "${args[@]}" "$instruction" \
      | node "$AGENT_DIR/agent-log.js" "$transcript"
  fi

  local statuses=("${PIPESTATUS[@]}")

  [ "${statuses[0]}" -eq 0 ] && [ "${statuses[1]}" -eq 0 ]
}
