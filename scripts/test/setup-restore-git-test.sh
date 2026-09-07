#!/bin/bash
# scripts/test/setup-restore-git-test.sh
# Sets up a test environment to test the restore deleted .git directories scripts
# Usage: ./setup-restore-git-test.sh <blog-handle>
# Example: ./setup-restore-git-test.sh dropbox

set -euo pipefail

BLOG_HANDLE="$1"
CONTAINER_NAME="blot-node-app-1"
OLD_COMMIT="3243b31b214ee637a68d2ce5799e9900d2ee9292^"  # One commit before the fix
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Setting up test environment for blog handle: $BLOG_HANDLE"
echo "=========================================="

# Step 1: Checkout old commit
echo ""
echo "Step 1: Checking out old commit (before fix)..."
cd "$REPO_ROOT"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "Current branch: $CURRENT_BRANCH"
echo "Current commit: $CURRENT_COMMIT"
git checkout "$OLD_COMMIT" || {
  echo "Error: Failed to checkout old commit. Make sure the commit exists."
  exit 1
}

# Step 2: Run JS script in Docker to setup template
echo ""
echo "Step 2: Running setup script in Docker container..."
docker exec "$CONTAINER_NAME" node "/usr/src/app/scripts/test/setup-restore-git-test.js" "$BLOG_HANDLE"

# Step 3: Checkout latest code
echo ""
echo "Step 3: Checking out latest code..."
cd "$REPO_ROOT"
git checkout "$CURRENT_BRANCH" || git checkout main || git checkout master

echo ""
echo "=========================================="
echo "Setup complete!"
echo ""
echo "The test environment is ready. You can now run:"
if [ "$BLOG_HANDLE" = "dropbox" ] || [ -n "$(docker exec "$CONTAINER_NAME" node -e "const Blog = require('models/blog'); Blog.get({ handle: '$BLOG_HANDLE' }, (err, blog) => { if (blog && blog.client === 'dropbox') process.exit(0); else process.exit(1); });" 2>/dev/null && echo "dropbox")" ]; then
  echo "  docker exec $CONTAINER_NAME node scripts/dropbox/restore-deleted-git-folders.js $BLOG_HANDLE"
fi
if [ "$BLOG_HANDLE" = "googledrive" ] || [ -n "$(docker exec "$CONTAINER_NAME" node -e "const Blog = require('models/blog'); Blog.get({ handle: '$BLOG_HANDLE' }, (err, blog) => { if (blog && blog.client === 'google-drive') process.exit(0); else process.exit(1); });" 2>/dev/null && echo "googledrive")" ]; then
  echo "  docker exec $CONTAINER_NAME node scripts/google-drive/restore-deleted-git-folders.js $BLOG_HANDLE"
fi
echo ""

