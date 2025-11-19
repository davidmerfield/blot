# Hardened SSH Deploy User Setup

This guide explains how to set up a hardened SSH deploy user for automated deployments from GitHub Actions to your EC2 instance.

## Overview

The deploy user is a restricted SSH user that can only execute specific deployment-related commands. This provides a secure way to deploy from GitHub Actions without exposing full server access.

## Security Features

- **Command restrictions**: Only deployment-related commands are allowed
- **No shell access**: User cannot get an interactive shell
- **No port forwarding**: Prevents tunneling
- **Audit logging**: All commands are logged
- **Docker-only access**: User can only manage Blot containers

## Setup Instructions

### 1. Generate SSH Key Pair

On your local machine or in GitHub Actions secrets, generate a new SSH key pair:

```bash
ssh-keygen -t ed25519 -f deploy-key -N "" -C "github-actions-deploy"
```

This creates:
- `deploy-key` (private key - add to GitHub Secrets)
- `deploy-key.pub` (public key - add to EC2 instance)

### 2. Run Setup Script on EC2 Instance

Copy the setup script to your EC2 instance and run it:

```bash
# On your local machine
scp scripts/deploy/setup-deploy-user.sh ec2-user@YOUR_EC2_HOST:/tmp/

# SSH into EC2 instance
ssh ec2-user@YOUR_EC2_HOST

# Run the setup script with your public key
sudo bash /tmp/setup-deploy-user.sh "$(cat deploy-key.pub)"
```

Or if you prefer to add the key manually later:

```bash
sudo bash /tmp/setup-deploy-user.sh
# Then manually edit /home/deploy/.ssh/authorized_keys
```

### 3. Verify Setup

Test the connection from your local machine:

```bash
ssh -i deploy-key deploy@YOUR_EC2_HOST "docker ps"
```

You should see Docker containers listed. If you try to run a disallowed command:

```bash
ssh -i deploy-key deploy@YOUR_EC2_HOST "ls /root"
# Should fail with "Command not allowed"
```

### 4. Configure GitHub Secrets

Add the following secrets to your GitHub repository:

1. **DEPLOY_SSH_KEY**: The private key content (`deploy-key` file)
   ```bash
   # Get the content
   cat deploy-key
   # Copy and paste into GitHub Secrets
   ```

2. **EC2_HOST**: Your EC2 instance hostname or IP address
   ```
   Example: ec2-12-34-56-78.compute-1.amazonaws.com
   Or: 12.34.56.78
   ```

### 5. Test GitHub Actions Workflow

1. Go to your GitHub repository
2. Navigate to Actions → Deploy to EC2
3. Click "Run workflow" to deploy the current commit

## Allowed Commands

The deploy user can only execute these types of commands:

- `docker pull` (any image)
- `docker run` (only for Blot containers with specific flags)
- `docker rm` (only Blot containers)
- `docker inspect` (only Blot containers/images)
- `docker ps` (any variation)
- `docker image prune` (cleanup)
- `docker info` (system info)
- `docker manifest inspect` (only Blot images)
- `docker logs` (only Blot containers)
- `curl` (only localhost health checks)
- File operations in `/tmp` and `/var/www/blot/data`
- Various utility commands (grep, sed, awk, etc.)

## Monitoring and Logs

### Command Log

All commands executed by the deploy user are logged to:
```
/var/log/deploy-commands.log
```

View recent commands:
```bash
sudo tail -f /var/log/deploy-commands.log
```

### SSH Access Log

SSH access attempts are logged to:
```
/var/log/deploy-ssh.log
```

### Log Rotation

Logs are automatically rotated daily and kept for 30 days.

## Troubleshooting

### Connection Refused

- Verify SSH service is running: `sudo systemctl status sshd`
- Check security group allows SSH (port 22)
- Verify the deploy user exists: `id deploy`

### Permission Denied

- Check authorized_keys permissions: `ls -la /home/deploy/.ssh/authorized_keys`
- Verify key format in authorized_keys (should include `command=` prefix)
- Check wrapper script is executable: `ls -la /usr/local/bin/deploy-wrapper.sh`

### Docker Permission Denied

- Verify deploy user is in docker group: `groups deploy`
- If not, add: `sudo usermod -aG docker deploy`

### Command Not Allowed

- Check the command matches allowed patterns in the wrapper script
- Review `/var/log/deploy-commands.log` for blocked commands
- The wrapper script logs all blocked attempts

### Health Check Fails

- Check container logs: `docker logs blot-container-blue`
- Verify health endpoint: `curl http://localhost:8088/health`
- Check container status: `docker ps -a`

## Security Best Practices

1. **Rotate keys periodically**: Generate new keys every 90 days
2. **Monitor logs**: Regularly check `/var/log/deploy-commands.log` for suspicious activity
3. **Restrict IPs**: Consider adding IP allowlisting in security groups (GitHub Actions IPs)
4. **Use SSH certificates**: For even better security, consider using SSH certificates instead of static keys
5. **Keep wrapper script updated**: Review and update allowed commands as needed

## Updating the Wrapper Script

If you need to allow additional commands:

1. Edit `/usr/local/bin/deploy-wrapper.sh` on the EC2 instance
2. Add new command patterns to the case statement
3. Test thoroughly before deploying
4. Consider the security implications of each new command

## Removing the Deploy User

If you need to remove the deploy user:

```bash
sudo userdel -r deploy
sudo rm /usr/local/bin/deploy-wrapper.sh
sudo rm /etc/rsyslog.d/30-deploy-user.conf
sudo rm /etc/logrotate.d/deploy-user
sudo systemctl restart rsyslog
# Also remove the Match block from /etc/ssh/sshd_config
sudo systemctl restart sshd
```

## Comparison with OIDC + SSM

**SSH Deploy User (this approach):**
- ✅ Simpler setup
- ✅ Works with any server
- ✅ Familiar workflow
- ✅ Direct control
- ⚠️ Requires key management
- ⚠️ Inbound SSH port needed

**OIDC + SSM:**
- ✅ No long-lived credentials
- ✅ CloudTrail audit trail
- ✅ No inbound ports
- ⚠️ More complex setup
- ⚠️ AWS-specific
- ⚠️ Requires SSM agent

For most use cases, the SSH deploy user approach is recommended due to simplicity and flexibility.

