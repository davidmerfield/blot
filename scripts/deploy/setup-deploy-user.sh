#!/bin/bash
#
# Setup script to create a hardened SSH deploy user on the EC2 instance
# Run this script on the EC2 instance as root or with sudo
#
# Usage:
#   sudo ./setup-deploy-user.sh [PUBLIC_KEY]
#
# If PUBLIC_KEY is not provided, you'll need to add it manually to
# /home/deploy/.ssh/authorized_keys after running this script

set -euo pipefail

DEPLOY_USER="deploy"
DEPLOY_HOME="/home/${DEPLOY_USER}"
SSH_DIR="${DEPLOY_HOME}/.ssh"
WRAPPER_SCRIPT="/usr/local/bin/deploy-wrapper.sh"
AUDIT_LOG="/var/log/deploy-ssh.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run as root or with sudo"
fi

log "Setting up hardened deploy user: ${DEPLOY_USER}"

# Create deploy user if it doesn't exist
if id "${DEPLOY_USER}" &>/dev/null; then
    warn "User ${DEPLOY_USER} already exists"
else
    log "Creating user ${DEPLOY_USER}..."
    useradd -m -s /bin/bash "${DEPLOY_USER}" || error "Failed to create user"
fi

# Create SSH directory
log "Setting up SSH directory..."
mkdir -p "${SSH_DIR}"
chmod 700 "${SSH_DIR}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${SSH_DIR}"

# Create authorized_keys with command restrictions
log "Setting up SSH authorized_keys with command restrictions..."
if [ -n "${1:-}" ]; then
    PUBLIC_KEY="$1"
    log "Adding provided public key..."
    cat > "${SSH_DIR}/authorized_keys" <<EOF
# GitHub Actions deploy key - restricted to deployment script
# Added: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
command="${WRAPPER_SCRIPT}",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ${PUBLIC_KEY}
EOF
    chmod 600 "${SSH_DIR}/authorized_keys"
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "${SSH_DIR}/authorized_keys"
    log "Public key added to authorized_keys"
else
    warn "No public key provided. You'll need to manually add it to:"
    warn "  ${SSH_DIR}/authorized_keys"
    warn "Format:"
    warn "  command=\"${WRAPPER_SCRIPT}\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-rsa YOUR_KEY_HERE"
    touch "${SSH_DIR}/authorized_keys"
    chmod 600 "${SSH_DIR}/authorized_keys"
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "${SSH_DIR}/authorized_keys"
fi

# Create deploy wrapper script
log "Creating deploy wrapper script..."
cat > "${WRAPPER_SCRIPT}" <<'WRAPPER_EOF'
#!/bin/bash
#
# Deploy wrapper script - restricts SSH commands to deployment operations only
# This script is executed automatically when the deploy user connects via SSH
#

set -euo pipefail

# Log all commands
LOG_FILE="/var/log/deploy-commands.log"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
echo "[${TIMESTAMP}] User: ${USER}, Command: ${SSH_ORIGINAL_COMMAND:-none}" >> "${LOG_FILE}"

# Get the original command
ORIGINAL_CMD="${SSH_ORIGINAL_COMMAND:-}"

if [ -z "${ORIGINAL_CMD}" ]; then
    echo "No command provided"
    exit 1
fi

# Allowed command patterns
# We use pattern matching to allow specific commands while preventing shell access
# Commands with pipes, &&, || will still match if they start with an allowed pattern
# The full ORIGINAL_CMD (including pipes and operators) is executed

case "${ORIGINAL_CMD}" in
    # Docker commands - deployment related
    "docker pull "*)
        exec ${ORIGINAL_CMD}
        ;;
    "docker run "*)
        # Only allow docker run commands that match our deployment pattern
        if echo "${ORIGINAL_CMD}" | grep -qE "(blot-container-(blue|green|yellow)|--restart unless-stopped|--platform linux/(amd64|arm64))"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: docker run command not allowed (must be for blot containers)"
            exit 1
        fi
        ;;
    "docker rm "*)
        # Only allow removing blot containers
        if echo "${ORIGINAL_CMD}" | grep -qE "blot-container-(blue|green|yellow)"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: docker rm command not allowed (must be for blot containers)"
            exit 1
        fi
        ;;
    "docker inspect "*)
        # Only allow inspecting blot containers or images
        if echo "${ORIGINAL_CMD}" | grep -qE "(blot-container-(blue|green|yellow)|ghcr.io/davidmerfield/blot)"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: docker inspect command not allowed"
            exit 1
        fi
        ;;
    "docker ps "*)
        exec ${ORIGINAL_CMD}
        ;;
    "docker ps -a "*)
        exec ${ORIGINAL_CMD}
        ;;
    "docker ps --format "*)
        exec ${ORIGINAL_CMD}
        ;;
    "docker ps -a --format "*)
        exec ${ORIGINAL_CMD}
        ;;
    "docker image prune "*)
        exec ${ORIGINAL_CMD}
        ;;
    "docker image prune -af")
        exec ${ORIGINAL_CMD}
        ;;
    "docker info "*)
        exec ${ORIGINAL_CMD}
        ;;
    "docker manifest inspect "*)
        # Only allow inspecting our registry images
        if echo "${ORIGINAL_CMD}" | grep -qE "ghcr.io/davidmerfield/blot"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: docker manifest inspect only allowed for blot images"
            exit 1
        fi
        ;;
    "docker logs "*)
        # Only allow viewing logs of blot containers
        if echo "${ORIGINAL_CMD}" | grep -qE "blot-container-(blue|green|yellow)"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: docker logs only allowed for blot containers"
            exit 1
        fi
        ;;
    # Health check commands
    "curl "*)
        # Only allow curl to localhost for health checks
        if echo "${ORIGINAL_CMD}" | grep -qE "curl.*localhost:(8088|8089|8090)/health"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: curl only allowed for health checks on localhost"
            exit 1
        fi
        ;;
    # File system commands - limited to deployment operations
    "test "*)
        exec ${ORIGINAL_CMD}
        ;;
    "mkdir "*)
        # Only allow creating directories in /tmp or /var/www/blot/data
        if echo "${ORIGINAL_CMD}" | grep -qE "(mkdir -p.*(/tmp|/var/www/blot/data))"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: mkdir only allowed in /tmp or /var/www/blot/data"
            exit 1
        fi
        ;;
    "ls "*)
        # Allow ls commands (used in various contexts with pipes)
        exec ${ORIGINAL_CMD}
        ;;
    "rm "*)
        # Only allow removing files in /tmp or log directories
        if echo "${ORIGINAL_CMD}" | grep -qE "(rm.*(/tmp|/var/log/deploy))"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: rm only allowed in /tmp or /var/log/deploy"
            exit 1
        fi
        ;;
    "mv "*)
        # Only allow moving files in /tmp (for log archiving)
        if echo "${ORIGINAL_CMD}" | grep -qE "(mv.*/tmp)"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: mv only allowed in /tmp"
            exit 1
        fi
        ;;
    "cd "*)
        # Allow cd commands (used with command chaining like cd ... && ls)
        # The directory is validated by the subsequent commands
        exec ${ORIGINAL_CMD}
        ;;
    "env "*)
        # Allow checking environment variables
        exec ${ORIGINAL_CMD}
        ;;
    "grep "*)
        # Allow grep in safe contexts
        exec ${ORIGINAL_CMD}
        ;;
    "head "*)
        exec ${ORIGINAL_CMD}
        ;;
    "tail "*)
        exec ${ORIGINAL_CMD}
        ;;
    "cut "*)
        exec ${ORIGINAL_CMD}
        ;;
    "sed "*)
        exec ${ORIGINAL_CMD}
        ;;
    "awk "*)
        exec ${ORIGINAL_CMD}
        ;;
    "xargs "*)
        exec ${ORIGINAL_CMD}
        ;;
    "date "*)
        exec ${ORIGINAL_CMD}
        ;;
    "("*)
        # Allow commands wrapped in parentheses (e.g., (docker logs ... || true))
        # This is used for log archiving operations
        if echo "${ORIGINAL_CMD}" | grep -qE "\(docker logs.*blot-container-(blue|green|yellow)"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: Parenthesized commands only allowed for container log operations"
            exit 1
        fi
        ;;
    *)
        echo "Error: Command not allowed: ${ORIGINAL_CMD}"
        echo "[${TIMESTAMP}] BLOCKED: ${ORIGINAL_CMD}" >> "${LOG_FILE}"
        exit 1
        ;;
esac
WRAPPER_EOF

chmod +x "${WRAPPER_SCRIPT}"
chown root:root "${WRAPPER_SCRIPT}"

# Add deploy user to docker group (so it can run docker without sudo)
log "Adding ${DEPLOY_USER} to docker group..."
if getent group docker > /dev/null 2>&1; then
    usermod -aG docker "${DEPLOY_USER}" || warn "Failed to add to docker group (docker may not be installed)"
else
    warn "Docker group not found - docker may not be installed"
fi

# Set up audit logging
log "Setting up audit logging..."
touch "${AUDIT_LOG}"
chmod 640 "${AUDIT_LOG}"
chown root:adm "${AUDIT_LOG}" 2>/dev/null || chown root:root "${AUDIT_LOG}"

# Create command log file
COMMAND_LOG="/var/log/deploy-commands.log"
touch "${COMMAND_LOG}"
chmod 640 "${COMMAND_LOG}"
chown root:adm "${COMMAND_LOG}" 2>/dev/null || chown root:root "${COMMAND_LOG}"

# Configure rsyslog to log SSH access (if rsyslog is available)
if command -v rsyslogd &> /dev/null; then
    log "Configuring rsyslog for deploy user monitoring..."
    cat > /etc/rsyslog.d/30-deploy-user.conf <<EOF
# Log SSH access by deploy user
:msg, contains, "deploy" ${AUDIT_LOG}
& stop
EOF
    systemctl restart rsyslog 2>/dev/null || warn "Could not restart rsyslog"
fi

# Set up log rotation
log "Setting up log rotation..."
cat > /etc/logrotate.d/deploy-user <<EOF
${AUDIT_LOG}
${COMMAND_LOG} {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 640 root adm
}
EOF

# Configure SSH to restrict deploy user (optional but recommended)
log "Configuring SSH restrictions..."
if [ -f /etc/ssh/sshd_config ]; then
    # Check if Match block already exists
    if ! grep -q "Match User ${DEPLOY_USER}" /etc/ssh/sshd_config; then
        cat >> /etc/ssh/sshd_config <<EOF

# Restrictions for deploy user
Match User ${DEPLOY_USER}
    PermitTTY no
    ForceCommand ${WRAPPER_SCRIPT}
    X11Forwarding no
    AllowAgentForwarding no
    AllowTcpForwarding no
    PermitTunnel no
EOF
        log "SSH configuration updated. Restart SSH service to apply changes:"
        warn "  sudo systemctl restart sshd"
        warn "  (or test with: sudo sshd -t)"
    else
        warn "SSH Match block for ${DEPLOY_USER} already exists"
    fi
else
    warn "SSH config file not found at /etc/ssh/sshd_config"
fi

log ""
log "=========================================="
log "Deploy user setup complete!"
log "=========================================="
log ""
log "User: ${DEPLOY_USER}"
log "Home: ${DEPLOY_HOME}"
log "SSH Key: ${SSH_DIR}/authorized_keys"
log "Wrapper: ${WRAPPER_SCRIPT}"
log "Audit Log: ${AUDIT_LOG}"
log "Command Log: ${COMMAND_LOG}"
log ""
if [ -z "${1:-}" ]; then
    warn "Don't forget to add the public key to:"
    warn "  ${SSH_DIR}/authorized_keys"
fi
log ""
warn "Next steps:"
warn "1. Add the GitHub Actions SSH private key as a secret: DEPLOY_SSH_KEY"
warn "2. Add the EC2 hostname/IP as a secret: EC2_HOST"
warn "3. Test the connection: ssh -i /path/to/key deploy@HOST 'docker ps'"
warn "4. Restart SSH service if you modified sshd_config"
log ""

