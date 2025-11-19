# GitHub Actions Deployment Guide

This guide explains how to deploy Blot using the `npm deploy-node` script via GitHub Actions.

## Overview

The deployment workflow allows you to manually trigger deployments of the current commit. It uses the same `npm deploy-node` script that you would run locally, but configured to work in a CI environment.

## Prerequisites

Before using the GitHub Actions deployment workflow, ensure you have:

1. **GitHub Secrets configured:**
   - `DEPLOY_SSH_KEY`: The private SSH key for the `deploy` user on your EC2 instance
   - `EC2_HOST`: The hostname or IP address of your EC2 instance

2. **SSH Access:** The SSH key must allow the `deploy` user to:
   - Connect to the EC2 instance
   - Run Docker commands
   - Access `/var/www/blot/data` and `/etc/blot/secrets.env`

3. **Docker Images:** The commit you're deploying must have a corresponding Docker image built and pushed to the registry (via the `build.yml` workflow)

## How to Deploy

### Via GitHub UI

1. Go to the **Actions** tab in your GitHub repository
2. Select **Deploy to EC2** from the workflow list
3. Click **Run workflow** to deploy the current commit

### Via GitHub CLI

```bash
gh workflow run deploy.yml
```

**Note:** The workflow always deploys the commit that triggered it. To deploy a specific commit, navigate to that commit in GitHub first, then trigger the workflow from the Actions tab.

## How It Works

The workflow performs the following steps:

1. **Checkout:** Checks out the repository at the current commit
2. **Setup:** Installs Node.js 22 and project dependencies
3. **SSH Configuration:** 
   - Sets up SSH using the `DEPLOY_SSH_KEY` secret
   - Creates an SSH config alias `blot` pointing to your EC2 instance
   - This allows the `npm deploy-node` script to use `ssh blot` as it does locally
4. **Deployment:** Runs `npm run deploy-node ${{ github.sha }}` with `SKIP_BRANCH_CHECK=true`
5. **Verification:** The script handles health checks and rollback automatically

## SSH Alias Configuration

The workflow creates an SSH config file that defines a `blot` host alias:

```
Host blot
  HostName <EC2_HOST>
  User deploy
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
```

This matches the local setup where you would have a similar entry in your `~/.ssh/config` file.

## Branch Check Bypass

The `checkBranch.js` utility normally requires you to be on the `master` branch when deploying locally. In GitHub Actions, this check is bypassed by setting the `SKIP_BRANCH_CHECK` environment variable to `true`. This allows you to deploy any commit, regardless of which branch it's on.

## What Gets Deployed

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

## Troubleshooting

### SSH Connection Fails

- Verify `DEPLOY_SSH_KEY` secret is correctly set
- Check that `EC2_HOST` secret matches your server's hostname/IP
- Ensure the SSH key has the correct permissions on the server

### Image Not Found

- Make sure the build workflow has completed for the commit you're deploying
- Verify the image exists in the registry: `docker manifest inspect ghcr.io/davidmerfield/blot:<SHA>`

### Health Check Fails

- Check the container logs (the script will output fetch commands)
- Verify the container can access required resources (Redis, data directory, env file)
- The script will attempt automatic rollback if a previous image exists

### Branch Check Error

If you see "You must be on the master branch to deploy" in CI, ensure `SKIP_BRANCH_CHECK=true` is set in the workflow (it should be by default).

## Security Considerations

- The SSH key stored in GitHub Secrets should be a dedicated deployment key with minimal permissions
- The `deploy` user on the server should only have the necessary permissions to run Docker commands
- Consider using SSH key rotation for production deployments
- The workflow uses `StrictHostKeyChecking no` for convenience in CI; ensure your server's SSH configuration is secure

## Local vs CI Deployment

The same `npm deploy-node` script works both locally and in CI:

- **Local:** Requires being on `master` branch, uses your local SSH config
- **CI:** Bypasses branch check, creates SSH config dynamically

Both methods deploy the same way and use the same deployment logic.

