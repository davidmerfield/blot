#!/usr/bin/env bash

set -euo pipefail

DEFAULT_REGION="us-west-2"
TAG_PROVISIONED_BY="redis-restore-script"

AWS_PROFILE=${AWS_PROFILE:-default}
AWS_REGION=${AWS_REGION:-$DEFAULT_REGION}
ACTION=""
DRY_RUN=false

usage() {
  cat <<USAGE
Usage: $(basename "$0") [options]

Options:
  --profile PROFILE   AWS CLI profile to use (default: ${AWS_PROFILE})
  --region REGION     AWS region to use (default: ${AWS_REGION})
  --action ACTION     Desired action: stop or terminate (default: prompt)
  --dry-run           Show actions without modifying resources
  -h, --help          Show this help message

Environment variables:
  AWS_PROFILE, AWS_REGION
USAGE
}

info() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
error() { printf '[ERROR] %s\n' "$*" >&2; }

confirm() {
  local prompt=${1:-Confirm?}
  read -r -p "$prompt [y/N] " reply
  case "$reply" in
    [yY][eE][sS]|[yY]) return 0 ;;
    *) return 1 ;;
  esac
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command '$1' not found in PATH"
    exit 1
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile)
      AWS_PROFILE="$2"
      shift 2
      ;;
    --region)
      AWS_REGION="$2"
      shift 2
      ;;
    --action)
      ACTION="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
  if [ "${1:-}" = "" ]; then
    break
  fi
done

if [ -n "$ACTION" ]; then
  case "$ACTION" in
    stop|terminate)
      ;;
    *)
      error "Invalid action: $ACTION (expected stop or terminate)"
      exit 1
      ;;
  esac
fi

require_command aws
require_command python3

AWS_BASE=(aws --profile "$AWS_PROFILE" --region "$AWS_REGION")

info "Searching for EC2 instances tagged RedisProvisionedBy=${TAG_PROVISIONED_BY}"
INSTANCES_JSON=$("${AWS_BASE[@]}" ec2 describe-instances \
  --filters "Name=tag:RedisProvisionedBy,Values=${TAG_PROVISIONED_BY}" \
            "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --output json)

mapfile -t INSTANCE_LINES < <(printf '%s' "$INSTANCES_JSON" | python3 - <<'PYJSON'
import json
import sys

def fmt(instance):
    instance_id = instance.get('InstanceId', '')
    state = instance.get('State', {}).get('Name', '')
    launch_time = instance.get('LaunchTime', '')
    private_ip = instance.get('PrivateIpAddress', '')
    name = ''
    for tag in instance.get('Tags', []) or []:
        if tag.get('Key') == 'Name':
            name = tag.get('Value')
            break
    return f"{instance_id}\t{state}\t{launch_time}\t{private_ip}\t{name}"

data = json.load(sys.stdin)
lines = []
for reservation in data.get('Reservations', []):
    for instance in reservation.get('Instances', []):
        lines.append(fmt(instance))

for line in sorted(lines):
    if line.strip():
        print(line)
PYJSON
)

if [ "${#INSTANCE_LINES[@]}" -eq 0 ]; then
  info "No provisioned instances found."
  exit 0
fi

info "Selectable instances:"
index=1
for line in "${INSTANCE_LINES[@]}"; do
  IFS=$'\t' read -r instance_id state launch_time private_ip name <<<"$line"
  printf '  %2d) %s (%s) launched %s private-ip=%s name=%s\n' \
    "$index" "$instance_id" "$state" "$launch_time" "${private_ip:-N/A}" "${name:-N/A}"
  index=$((index + 1))
done

selection=""
while [ -z "$selection" ]; do
  read -r -p "Select an instance to clean up (or 'q' to quit): " selection
  if [ "$selection" = "q" ]; then
    info "Aborted by user"
    exit 0
  fi
  if ! [[ "$selection" =~ ^[0-9]+$ ]]; then
    warn "Please enter a valid number"
    selection=""
    continue
  fi
  if [ "$selection" -lt 1 ] || [ "$selection" -gt "${#INSTANCE_LINES[@]}" ]; then
    warn "Selection out of range"
    selection=""
  fi
done

IFS=$'\t' read -r TARGET_INSTANCE TARGET_STATE TARGET_LAUNCH TARGET_IP TARGET_NAME <<<"${INSTANCE_LINES[$((selection-1))]}"
info "Chosen instance: $TARGET_INSTANCE (state=$TARGET_STATE, name=${TARGET_NAME:-N/A})"

resolved_action="$ACTION"
if [ -z "$resolved_action" ]; then
  if [ "$TARGET_STATE" = "stopped" ]; then
    resolved_action="terminate"
  else
    read -r -p "Action to perform (stop/terminate) [terminate]: " resolved_action
    resolved_action=${resolved_action:-terminate}
  fi
fi

case "$resolved_action" in
  stop|terminate)
    ;;
  *)
    error "Invalid action specified: $resolved_action"
    exit 1
    ;;
esac

if [ "$resolved_action" = "stop" ] && [ "$TARGET_STATE" = "stopped" ]; then
  info "Instance already stopped. No action taken."
  exit 0
fi

if ! confirm "Proceed to $resolved_action instance $TARGET_INSTANCE?"; then
  info "Operation cancelled."
  exit 0
fi

case "$resolved_action" in
  stop)
    if [ "$DRY_RUN" = true ]; then
      info "[dry-run] aws --profile $AWS_PROFILE --region $AWS_REGION ec2 stop-instances --instance-ids $TARGET_INSTANCE"
    else
      "${AWS_BASE[@]}" ec2 stop-instances --instance-ids "$TARGET_INSTANCE"
      info "Stop command issued for $TARGET_INSTANCE"
    fi
    ;;
  terminate)
    if [ "$DRY_RUN" = true ]; then
      info "[dry-run] aws --profile $AWS_PROFILE --region $AWS_REGION ec2 terminate-instances --instance-ids $TARGET_INSTANCE"
    else
      "${AWS_BASE[@]}" ec2 terminate-instances --instance-ids "$TARGET_INSTANCE"
      info "Terminate command issued for $TARGET_INSTANCE"
    fi
    ;;
esac

info "Cleanup workflow complete"
