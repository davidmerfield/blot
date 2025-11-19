# Blot Deployment Guide

This guide explains how to set up and use automated deployments from GitHub Actions to your EC2 instance using a hardened SSH deploy user.

## Overview

The deployment system uses a restricted SSH user (`deploy`) that can only execute specific deployment-related commands. This provides a secure way to deploy from GitHub Actions without exposing full server access.

### Key Features

- **Command restrictions**: Only deployment-related commands are allowed
- **No shell access**: User cannot get an interactive shell
- **No port forwarding**: Prevents tunneling
- **Audit logging**: All commands are logged
- **Docker-only access**: User can only manage Blot containers
- **Automated health checks**: Automatic rollback on failure

## Quick Start

### 1. Generate SSH Key

```bash
ssh-keygen -t ed25519 -f deploy-key -N "" -C "github-actions-deploy"
```

This creates:
- `deploy-key` (private key - add to GitHub Secrets)
- `deploy-key.pub` (public key - add to EC2 instance)

### 2. Run Setup on EC2

```bash
# Copy script to server
scp scripts/deploy/setup-deploy-user.sh ec2-user@YOUR_EC2_HOST:/tmp/

# SSH and run setup
ssh ec2-user@YOUR_EC2_HOST
sudo bash /tmp/setup-deploy-user.sh "$(cat deploy-key.pub)"
```

### 3. Add GitHub Secrets

1. **DEPLOY_SSH_KEY**: Content of `deploy-key` (private key)
2. **EC2_HOST**: Your EC2 hostname/IP

### 4. Test

```bash
ssh -i deploy-key deploy@YOUR_EC2_HOST "docker ps"
```

### 5. Deploy via GitHub Actions

Go to Actions → Deploy to EC2 → Run workflow

---

## Deploy User Setup

### Security Features

- **Command restrictions**: Only deployment-related commands are allowed
- **No shell access**: User cannot get an interactive shell
- **No port forwarding**: Prevents tunneling
- **Audit logging**: All commands are logged
- **Docker-only access**: User can only manage Blot containers

### Detailed Setup Instructions

#### 1. Generate SSH Key Pair

On your local machine or in GitHub Actions secrets, generate a new SSH key pair:

```bash
ssh-keygen -t ed25519 -f deploy-key -N "" -C "github-actions-deploy"
```

#### 2. Run Setup Script on EC2 Instance

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

#### 3. Verify Setup

Test the connection from your local machine:

```bash
ssh -i deploy-key deploy@YOUR_EC2_HOST "docker ps"
```

You should see Docker containers listed. If you try to run a disallowed command:

```bash
ssh -i deploy-key deploy@YOUR_EC2_HOST "ls /root"
# Should fail with "Command not allowed"
```

#### 4. Configure GitHub Secrets

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

### Allowed Commands

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

### Monitoring and Logs

#### Command Log

All commands executed by the deploy user are logged to:
```
/var/log/deploy-commands.log
```

View recent commands:
```bash
sudo tail -f /var/log/deploy-commands.log
```

#### SSH Access Log

SSH access attempts are logged to:
```
/var/log/deploy-ssh.log
```

#### Log Rotation

Logs are automatically rotated daily and kept for 30 days.

### Updating the Wrapper Script

If you need to allow additional commands:

1. Edit `/usr/local/bin/deploy-wrapper.sh` on the EC2 instance
2. Add new command patterns to the case statement
3. Test thoroughly before deploying
4. Consider the security implications of each new command

### Removing the Deploy User

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

## GitHub Actions Deployment

### Prerequisites

Before using the GitHub Actions deployment workflow, ensure you have:

1. **GitHub Secrets configured:**
   - `DEPLOY_SSH_KEY`: The private SSH key for the `deploy` user on your EC2 instance
   - `EC2_HOST`: The hostname or IP address of your EC2 instance

2. **SSH Access:** The SSH key must allow the `deploy` user to:
   - Connect to the EC2 instance
   - Run Docker commands
   - Access `/var/www/blot/data` and `/etc/blot/secrets.env`

3. **Docker Images:** The commit you're deploying must have a corresponding Docker image built and pushed to the registry (via the `build.yml` workflow)

### How to Deploy

#### Via GitHub UI

1. Go to the **Actions** tab in your GitHub repository
2. Select **Deploy to EC2** from the workflow list
3. Click **Run workflow** to deploy the current commit

#### Via GitHub CLI

```bash
gh workflow run deploy.yml
```

**Note:** The workflow always deploys the commit that triggered it. To deploy a specific commit, navigate to that commit in GitHub first, then trigger the workflow from the Actions tab.

### How It Works

The workflow performs the following steps:

1. **Checkout:** Checks out the repository at the current commit
2. **Setup:** Installs Node.js 22 and project dependencies
3. **SSH Configuration:** 
   - Sets up SSH using the `DEPLOY_SSH_KEY` secret
   - Creates an SSH config alias `blot` pointing to your EC2 instance
   - This allows the `npm deploy-node` script to use `ssh blot` as it does locally
4. **Deployment:** Runs `npm run deploy-node ${{ github.sha }}` with `SKIP_BRANCH_CHECK=true`
5. **Verification:** The script handles health checks and rollback automatically

### SSH Alias Configuration

The workflow creates an SSH config file that defines a `blot` host alias:

```
Host blot
  HostName <EC2_HOST>
  User deploy
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
```

This matches the local setup where you would have a similar entry in your `~/.ssh/config` file.

### Branch Check Bypass

The `checkBranch.js` utility normally requires you to be on the `master` branch when deploying locally. In GitHub Actions, this check is bypassed by setting the `SKIP_BRANCH_CHECK` environment variable to `true`. This allows you to deploy any commit, regardless of which branch it's on.

### What Gets Deployed

The deployment script (`scripts/deploy/index.js`) will:

1. Verify the Docker image exists for the specified commit and platform
2. Deploy three containers:
   - `blot-container-blue` (port 8088) - Failover server
   - `blot-container-green` (port 8089) - Site server
   - `blot-container-yellow` (port 8090) - Blog server
3. Archive logs from previous containers
4. Pull the new Docker image
5. Remove old containers and start new ones
6. Perform health checks on each container
7. Rollback automatically if health checks fail (if a previous image exists)
8. Prune old Docker images

### Local vs CI Deployment

The same `npm deploy-node` script works both locally and in CI:

- **Local:** Requires being on `master` branch, uses your local SSH config
- **CI:** Bypasses branch check, creates SSH config dynamically

Both methods deploy the same way and use the same deployment logic.

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

### SSH Connection Fails (GitHub Actions)

- Verify `DEPLOY_SSH_KEY` secret is correctly set
- Check that `EC2_HOST` secret matches your server's hostname/IP
- Ensure the SSH key has the correct permissions on the server

### Image Not Found

- Make sure the build workflow has completed for the commit you're deploying
- Verify the image exists in the registry: `docker manifest inspect ghcr.io/davidmerfield/blot:<SHA>`

### Health Check Fails

- Check container logs (the script will output fetch commands)
- Verify the container can access required resources (Redis, data directory, env file)
- The script will attempt automatic rollback if a previous image exists
- Check container logs: `docker logs blot-container-blue`
- Verify health endpoint: `curl http://localhost:8088/health`
- Check container status: `docker ps -a`

### Branch Check Error

If you see "You must be on the master branch to deploy" in CI, ensure `SKIP_BRANCH_CHECK=true` is set in the workflow (it should be by default).

## Security Best Practices

1. **Rotate keys periodically**: Generate new keys every 90 days
2. **Monitor logs**: Regularly check `/var/log/deploy-commands.log` for suspicious activity
3. **Restrict IPs**: Consider adding IP allowlisting in security groups (GitHub Actions IPs)
4. **Use SSH certificates**: For even better security, consider using SSH certificates instead of static keys
5. **Keep wrapper script updated**: Review and update allowed commands as needed
6. **Dedicated deployment key**: The SSH key stored in GitHub Secrets should be a dedicated deployment key with minimal permissions
7. **Minimal server permissions**: The `deploy` user on the server should only have the necessary permissions to run Docker commands
8. **SSH key rotation**: Consider using SSH key rotation for production deployments
9. **Server SSH configuration**: The workflow uses `StrictHostKeyChecking no` for convenience in CI; ensure your server's SSH configuration is secure

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

## Reference Files

- **Setup Script**: `scripts/deploy/setup-deploy-user.sh` - Creates the deploy user and configures restrictions
- **Deployment Script**: `scripts/deploy/index.js` - Main deployment logic
- **GitHub Actions Workflow**: `.github/workflows/deploy.yml` - CI/CD workflow definition

