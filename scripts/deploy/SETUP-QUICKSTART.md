# Quick Start: Deploy User Setup

## 1. Generate SSH Key

```bash
ssh-keygen -t ed25519 -f deploy-key -N "" -C "github-actions-deploy"
```

## 2. Run Setup on EC2

```bash
# Copy script to server
scp scripts/deploy/setup-deploy-user.sh ec2-user@YOUR_EC2_HOST:/tmp/

# SSH and run setup
ssh ec2-user@YOUR_EC2_HOST
sudo bash /tmp/setup-deploy-user.sh "$(cat deploy-key.pub)"
```

## 3. Add GitHub Secrets

1. **DEPLOY_SSH_KEY**: Content of `deploy-key` (private key)
2. **EC2_HOST**: Your EC2 hostname/IP

## 4. Test

```bash
ssh -i deploy-key deploy@YOUR_EC2_HOST "docker ps"
```

## 5. Deploy via GitHub Actions

Go to Actions → Deploy to EC2 → Run workflow

---

For detailed documentation, see [README-DEPLOY-USER.md](./README-DEPLOY-USER.md)

