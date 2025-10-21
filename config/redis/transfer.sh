#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: transfer.sh [--remote-user USER]

Environment variables:
  SSH_KEY      Path to the private key used for SSH (required)
  PUBLIC_IP    Public IP or hostname of the Redis instance (required)
  AWS_KEY      AWS access key ID used on the remote host (optional)
  AWS_SECRET   AWS secret access key used on the remote host (optional)
  AWS_REGION   AWS region for the remote host credentials (default: us-west-2)
  REMOTE_USER  SSH username (default: ec2-user)

Options:
  --remote-user USER  Override the SSH username used for the transfer.
USAGE
}

REMOTE_USER=${REMOTE_USER:-ec2-user}
AWS_REGION=${AWS_REGION:-us-west-2}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --remote-user)
      shift
      if [ "${1:-}" = "" ]; then
        echo "Missing argument for --remote-user" >&2
        usage
        exit 1
      fi
      REMOTE_USER="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift || true
done

if [ -z "${SSH_KEY:-}" ]; then
  echo "SSH_KEY variable missing, set it before running this script" >&2
  exit 1
fi

if [ -z "${PUBLIC_IP:-}" ]; then
  echo "PUBLIC_IP variable missing, set it before running this script" >&2
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key $SSH_KEY does not exist" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh command not available" >&2
  exit 1
fi

if ! command -v scp >/dev/null 2>&1; then
  echo "scp command not available" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIRECTORY="$SCRIPT_DIR/scripts"

ssh_opts=(-i "$SSH_KEY" "${REMOTE_USER}@${PUBLIC_IP}")
ssh_base=(ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${ssh_opts[@]}")
scp_base=(scp -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i "$SSH_KEY")

"${ssh_base[@]}" "rm -rf ~/scripts"
"${scp_base[@]}" -r "$SCRIPTS_DIRECTORY" "${REMOTE_USER}@${PUBLIC_IP}:~/scripts"
"${ssh_base[@]}" "chmod +x ~/scripts/*"
"${ssh_base[@]}" "sudo ~/scripts/setup.sh"

if [ -n "${AWS_KEY:-}" ] && [ -n "${AWS_SECRET:-}" ]; then
  "${ssh_base[@]}" "sudo aws configure set aws_access_key_id $AWS_KEY"
  "${ssh_base[@]}" "sudo aws configure set aws_secret_access_key $AWS_SECRET"
  "${ssh_base[@]}" "sudo aws configure set default.region $AWS_REGION"
else
  echo "AWS_KEY/AWS_SECRET not set - skipping remote AWS credential configuration"
fi

echo "Transfer complete. To connect to the redis server, run:"
echo "ssh -i $SSH_KEY ${REMOTE_USER}@${PUBLIC_IP}"
