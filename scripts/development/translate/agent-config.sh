#!/usr/bin/env bash
# Discover which agent CLIs are installed, let the operator pick one and a model,
# and remember the choice.
#
# Sourced by translate.sh. Sets AGENT, MODEL and AGENT_DIR, and sources the
# chosen adapter from agents/.
#
# Only local CLIs are used — nothing here talks to an API directly. Everything
# runs through a command already installed and signed in on this machine.

AGENT_DIR="$DIR"
AGENTS_DIR="$DIR/agents"

# data/ is gitignored, so a preference stored here stays out of the repo. It is
# a machine preference, not a per-site one, so it lives outside the run state.
AGENT_CONFIG="$ROOT/data/tmp/translate/agent.conf"

# List adapters that exist AND whose CLI is installed.
discover_agents() {
  local file name

  for file in "$AGENTS_DIR"/*.sh; do
    [ -f "$file" ] || continue
    name="$(basename "$file" .sh)"

    # Each adapter is sourced in a subshell so its definitions cannot leak into
    # ours before the operator has actually chosen one.
    if ( . "$file" >/dev/null 2>&1 && agent_available ); then
      echo "$name"
    fi
  done
}

load_agent_config() {
  [ -f "$AGENT_CONFIG" ] || return 1
  # shellcheck source=/dev/null
  . "$AGENT_CONFIG"
  [ -n "${SAVED_AGENT:-}" ]
}

save_agent_config() {
  mkdir -p "$(dirname "$AGENT_CONFIG")"
  cat > "$AGENT_CONFIG" <<EOF
# Written by npm run translate. Delete this file, or run with --reconfigure,
# to be asked again.
SAVED_AGENT="$1"
SAVED_MODEL="$2"
EOF
}

# Present a numbered list and read a choice. Prints the chosen value.
choose_from() {
  local prompt="$1"
  local default="$2"
  shift 2
  local -a ids=() labels=()
  local line

  for line in "$@"; do
    ids+=("${line%%$'\t'*}")
    labels+=("${line#*$'\t'}")
  done

  local i default_index=1

  for i in "${!ids[@]}"; do
    if [ "${ids[$i]}" = "$default" ]; then default_index=$((i + 1)); fi
  done

  echo "" >&2
  echo "$prompt" >&2
  for i in "${!ids[@]}"; do
    printf "  %d) %-24s %s\n" "$((i + 1))" "${ids[$i]}" "${labels[$i]}" >&2
  done
  echo "" >&2
  printf "Choose [%d], or type a name: " "$default_index" >&2

  local reply
  reply="$(ask)" || return 1
  reply="$(echo "$reply" | tr -d '[:space:]')"

  if [ -z "$reply" ]; then
    echo "${ids[$((default_index - 1))]}"
    return 0
  fi

  # A number selects from the list; anything else is taken literally, so an
  # operator can name a model the adapter does not know about.
  if [ "$reply" -ge 1 ] 2>/dev/null && [ "$reply" -le "${#ids[@]}" ] 2>/dev/null; then
    echo "${ids[$((reply - 1))]}"
  else
    echo "$reply"
  fi
}

configure_agent() {
  local reconfigure="${1:-false}"
  local -a available
  local line

  # No mapfile: macOS ships bash 3.2.
  available=()
  while IFS= read -r line; do
    [ -n "$line" ] && available+=("$line")
  done < <(discover_agents)

  if [ "${#available[@]}" -eq 0 ]; then
    die "No coding agent CLI found." \
"translate drives a local agent CLI. Install one of these and sign in:

  claude        https://claude.com/claude-code
  codex         npm install -g @openai/codex
  cursor-agent  curl https://cursor.com/install -fsS | bash"
  fi

  # An explicit environment variable always wins and is never saved.
  if [ -n "${TRANSLATE_AGENT:-}" ]; then
    AGENT="$TRANSLATE_AGENT"
    if [ ! -f "$AGENTS_DIR/$AGENT.sh" ]; then
      die "No agent adapter called '$AGENT'." "Available here: ${available[*]}"
    fi
  elif [ "$reconfigure" != true ] && load_agent_config \
       && printf '%s\n' "${available[@]}" | grep -qx "$SAVED_AGENT"; then
    AGENT="$SAVED_AGENT"
    MODEL="${TRANSLATE_MODEL:-${SAVED_MODEL:-}}"
  fi

  # Nothing chosen yet: ask, unless there is only one and no reason to.
  if [ -z "${AGENT:-}" ]; then
    if [ "${#available[@]}" -eq 1 ] && [ "$reconfigure" != true ]; then
      AGENT="${available[0]}"
    else
      require_tty
      local -a options=()
      local name label
      for name in "${available[@]}"; do
        label="$( . "$AGENTS_DIR/$name.sh" >/dev/null 2>&1; echo "${AGENT_NAME:-$name}" )"
        options+=("$name"$'\t'"$label")
      done
      AGENT="$(choose_from "Which agent should build the template?" "${available[0]}" "${options[@]}")" \
        || die "No input available to choose an agent."
    fi
  fi

  if [ ! -f "$AGENTS_DIR/$AGENT.sh" ]; then
    die "No agent adapter called '$AGENT'." "Available here: ${available[*]}"
  fi

  # shellcheck source=/dev/null
  . "$AGENTS_DIR/$AGENT.sh"

  if ! agent_available; then
    die "The '$AGENT' agent is not available." "$(agent_install_hint)"
  fi

  MODEL="${TRANSLATE_MODEL:-${MODEL:-}}"

  if [ -z "$MODEL" ] || [ "$reconfigure" = true ]; then
    local -a models=()
    local line

    if declare -f agent_models >/dev/null; then
      while IFS= read -r line; do
        [ -n "$line" ] && models+=("$line")
      done < <(agent_models)
    fi

    if [ "${#models[@]}" -eq 0 ]; then
      MODEL="$AGENT_DEFAULT_MODEL"
    else
      require_tty
      MODEL="$(choose_from "Which model?" "$AGENT_DEFAULT_MODEL" "${models[@]}")" \
        || die "No input available to choose a model."
    fi
  fi

  [ -n "$MODEL" ] || MODEL="$AGENT_DEFAULT_MODEL"

  # Only persist a choice the operator actually made, not an env override.
  if [ -z "${TRANSLATE_AGENT:-}" ]; then
    save_agent_config "$AGENT" "$MODEL"
  fi
}
