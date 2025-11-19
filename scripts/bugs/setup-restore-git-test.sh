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
OUTPUT=$(docker exec "$CONTAINER_NAME" node "/usr/src/app/scripts/bugs/setup-restore-git-test.js" "$BLOG_HANDLE" 2>&1)
echo "$OUTPUT"

# Extract blog client, template ID, template slug, and template base from output
BLOG_CLIENT=$(echo "$OUTPUT" | grep "^BLOG_CLIENT=" | cut -d'=' -f2)
TEMPLATE_ID=$(echo "$OUTPUT" | grep "^TEMPLATE_ID=" | cut -d'=' -f2)
TEMPLATE_SLUG=$(echo "$OUTPUT" | grep "^TEMPLATE_SLUG=" | cut -d'=' -f2)
TEMPLATE_BASE=$(echo "$OUTPUT" | grep "^TEMPLATE_BASE=" | cut -d'=' -f2)

if [ -z "$BLOG_CLIENT" ] || [ -z "$TEMPLATE_ID" ] || [ -z "$TEMPLATE_SLUG" ] || [ -z "$TEMPLATE_BASE" ]; then
  echo "Error: Failed to extract required values from output"
  exit 1
fi

echo ""
echo "Extracted values:"
echo "  Blog Client: $BLOG_CLIENT"
echo "  Template ID: $TEMPLATE_ID"
echo "  Template Slug: $TEMPLATE_SLUG"
echo "  Template Base: $TEMPLATE_BASE"

# Step 3: Determine base path based on blog client and initialize git
echo ""
echo "Step 3: Determining template folder path on operator machine..."
BASE_PATH=""

if [ "$BLOG_CLIENT" = "dropbox" ]; then
  BASE_PATH="$HOME/Library/CloudStorage/Dropbox/Apps/Blot test"
elif [ "$BLOG_CLIENT" = "google-drive" ]; then
  BASE_PATH="$HOME/Library/CloudStorage/GoogleDrive-dmerfield@gmail.com/My Drive/Sites/Google Drive"
else
  echo "Error: Unsupported blog client: $BLOG_CLIENT"
  echo "Only 'dropbox' and 'google-drive' are supported for this script"
  exit 1
fi

TEMPLATE_PATH="$BASE_PATH/$TEMPLATE_BASE/$TEMPLATE_SLUG"

if [ ! -d "$TEMPLATE_PATH" ]; then
  echo "Error: Template folder not found at: $TEMPLATE_PATH"
  echo "Please ensure the folder exists and is synced to your local machine"
  exit 1
fi

echo "Template folder found at: $TEMPLATE_PATH"

# Initialize git repository on operator machine
echo ""
echo "Initializing git repository in template folder..."
cd "$TEMPLATE_PATH"

# Initialize git repo
git init || {
  echo "Error: Failed to initialize git repository"
  exit 1
}

# Create initial test file and commit
echo "Creating initial files and commits..."
echo "Initial commit" > test.txt
git add test.txt
git commit -m "Initial commit" || {
  echo "Error: Failed to create initial commit"
  exit 1
}

# Create second test file and commit
echo "Second commit" > test2.txt
git add test2.txt
git commit -m "Second commit" || {
  echo "Error: Failed to create second commit"
  exit 1
}

# Create a file in .git to ensure there are files to delete
echo "This should be deleted" > .git/test-file.txt

echo "Git repository initialized with 2 commits"
echo "Created test file in .git directory"

# Step 4: Trigger writeToFolder to cause the bug
echo ""
echo "Step 4: Triggering writeToFolder to cause bug..."
docker exec "$CONTAINER_NAME" node "/usr/src/app/scripts/bugs/trigger-write-to-folder.js" "$BLOG_HANDLE" "$TEMPLATE_ID"

# Step 5: Checkout latest code
echo ""
echo "Step 5: Checking out latest code..."
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

