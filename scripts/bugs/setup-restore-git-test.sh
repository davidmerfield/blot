#!/bin/bash
# scripts/test/setup-restore-git-test.sh
# Sets up a test environment to test the restore deleted .git directories scripts
# Usage: ./setup-restore-git-test.sh <blog-handle>
# Example: ./setup-restore-git-test.sh dropbox

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Error: Blog handle is required"
  echo "Usage: ./setup-restore-git-test.sh <blog-handle>"
  echo "Example: ./setup-restore-git-test.sh dropbox"
  exit 1
fi

BLOG_HANDLE="$1"
CONTAINER_NAME="blot-node-app-1"
OLD_COMMIT="cd80f975fba8de7e832ddcd36615c9022c746878^"  # One commit before the fix
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Get current branch and commit early (needed for cleanup)
cd "$REPO_ROOT"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_COMMIT=$(git rev-parse HEAD)

# Track if we've modified app/ directory so we can restore it on exit
APP_DIRECTORY_MODIFIED=false

# Cleanup function to restore app/ directory
cleanup() {
  if [ "$APP_DIRECTORY_MODIFIED" = true ]; then
    echo ""
    echo "Cleaning up: Restoring app/ directory to current branch..."
    cd "$REPO_ROOT" 2>/dev/null || return
    if [ -n "${CURRENT_BRANCH:-}" ] && git checkout "$CURRENT_BRANCH" -- app/ 2>/dev/null; then
      echo "App directory restored to current branch: $CURRENT_BRANCH"
    elif git checkout main -- app/ 2>/dev/null || git checkout master -- app/ 2>/dev/null; then
      echo "App directory restored to main/master branch"
    else
      echo "Warning: Failed to restore app/ directory. You may need to restore it manually:"
      if [ -n "${CURRENT_BRANCH:-}" ]; then
        echo "  git checkout $CURRENT_BRANCH -- app/"
      else
        echo "  git checkout <your-branch> -- app/"
      fi
    fi
  fi
}

# Set up trap handlers for cleanup on exit, interrupt, or error
trap cleanup EXIT INT TERM ERR

echo "Setting up test environment for blog handle: $BLOG_HANDLE"
echo "=========================================="

# Step 1: Checkout old commit for app/ directory only (to get buggy code)
echo ""
echo "Step 1: Checking out old commit for app/ directory (before fix)..."
echo "Current branch: $CURRENT_BRANCH"
echo "Current commit: $CURRENT_COMMIT"
echo "Checking out app/ directory from old commit: $OLD_COMMIT"
if git checkout "$OLD_COMMIT" -- app/; then
  APP_DIRECTORY_MODIFIED=true
  echo "App directory now has buggy code from old commit (scripts remain from current branch)"
else
  echo "Error: Failed to checkout old commit for app/ directory. Make sure the commit exists."
  exit 1
fi

# Check if Docker container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Error: Docker container '$CONTAINER_NAME' is not running"
  echo "Please start the container first"
  exit 1
fi

# Step 2: Run JS script in Docker to setup template
echo ""
echo "Step 2: Running setup script in Docker container..."
echo "Command: docker exec $CONTAINER_NAME node /usr/src/app/scripts/bugs/setup-restore-git-test.js $BLOG_HANDLE"

# Run the command, showing output in real-time and capturing it
# Use timeout to prevent indefinite hanging (5 minutes should be plenty)
TEMP_OUTPUT=$(mktemp)
trap "rm -f $TEMP_OUTPUT" EXIT

# Run with timeout and capture output
if ! timeout 300 docker exec "$CONTAINER_NAME" node "/usr/src/app/scripts/bugs/setup-restore-git-test.js" "$BLOG_HANDLE" 2>&1 | tee "$TEMP_OUTPUT"; then
  EXIT_CODE=$?
  echo ""
  if [ $EXIT_CODE -eq 124 ]; then
    echo "Error: Docker command timed out after 5 minutes"
  else
    echo "Error: Docker command failed with exit code $EXIT_CODE"
  fi
  OUTPUT=$(cat "$TEMP_OUTPUT" 2>/dev/null || echo "")
  if [ -n "$OUTPUT" ]; then
    echo "Output:"
    echo "$OUTPUT"
  else
    echo "No output captured. The command may have failed before producing any output."
    echo "Check if the script exists in the container:"
    echo "  docker exec $CONTAINER_NAME ls -la /usr/src/app/scripts/bugs/setup-restore-git-test.js"
  fi
  exit 1
fi

OUTPUT=$(cat "$TEMP_OUTPUT" 2>/dev/null || echo "")

# Extract blog ID, blog client, template ID, template slug, and template base from output
BLOG_ID=$(echo "$OUTPUT" | grep "^BLOG_ID=" | cut -d'=' -f2)
BLOG_CLIENT=$(echo "$OUTPUT" | grep "^BLOG_CLIENT=" | cut -d'=' -f2)
TEMPLATE_ID=$(echo "$OUTPUT" | grep "^TEMPLATE_ID=" | cut -d'=' -f2)
TEMPLATE_SLUG=$(echo "$OUTPUT" | grep "^TEMPLATE_SLUG=" | cut -d'=' -f2)
TEMPLATE_BASE=$(echo "$OUTPUT" | grep "^TEMPLATE_BASE=" | cut -d'=' -f2)

if [ -z "$BLOG_ID" ] || [ -z "$BLOG_CLIENT" ] || [ -z "$TEMPLATE_ID" ] || [ -z "$TEMPLATE_SLUG" ] || [ -z "$TEMPLATE_BASE" ]; then
  echo "Error: Failed to extract required values from output"
  exit 1
fi

echo ""
echo "Extracted values:"
echo "  Blog ID: $BLOG_ID"
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

# Wait for template folder to sync from cloud storage
echo "Waiting for template folder to sync: $TEMPLATE_PATH"
TIMEOUT=30
ELAPSED=0
while [ ! -d "$TEMPLATE_PATH" ]; do
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "Error: Timeout after ${TIMEOUT} seconds. Template folder did not sync: $TEMPLATE_PATH"
    echo "Please ensure the folder exists and is synced to your local machine"
    exit 1
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [ $((ELAPSED % 5)) -eq 0 ]; then
    echo "  Still waiting... (${ELAPSED}s/${TIMEOUT}s)"
  fi
done

echo "Template folder found after ${ELAPSED} seconds: $TEMPLATE_PATH"

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

# Step 4: Wait for git changes to sync, then trigger writeToFolder to cause the bug
echo ""
echo "Step 4: Waiting for git changes to sync from cloud storage..."
LOCAL_GIT_DIR="$TEMPLATE_PATH/.git"
SERVER_GIT_DIR="$REPO_ROOT/data/blogs/$BLOG_ID/$TEMPLATE_BASE/$TEMPLATE_SLUG/.git"

echo "Comparing .git directories:"
echo "  Local:  $LOCAL_GIT_DIR"
echo "  Server: $SERVER_GIT_DIR"

TIMEOUT=60
ELAPSED=0

while true; do
  # Check if both directories exist
  if [ ! -d "$LOCAL_GIT_DIR" ] || [ ! -d "$SERVER_GIT_DIR" ]; then
    if [ $ELAPSED -ge $TIMEOUT ]; then
      echo "Error: Timeout after ${TIMEOUT} seconds. .git directories not found."
      echo "  Local exists:  $([ -d "$LOCAL_GIT_DIR" ] && echo "yes" || echo "no")"
      echo "  Server exists: $([ -d "$SERVER_GIT_DIR" ] && echo "yes" || echo "no")"
      exit 1
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
    continue
  fi
  
  # Get sorted file lists from both directories (relative paths)
  LOCAL_FILES=$(find "$LOCAL_GIT_DIR" -type f | sed "s|^$LOCAL_GIT_DIR/||" | sort)
  SERVER_FILES=$(find "$SERVER_GIT_DIR" -type f | sed "s|^$SERVER_GIT_DIR/||" | sort)
  
  # Compare the lists
  if [ "$LOCAL_FILES" = "$SERVER_FILES" ]; then
    FILE_COUNT=$(echo "$LOCAL_FILES" | grep -c . || echo "0")
    echo "✓ .git directories are in sync (${FILE_COUNT} files)"
    break
  fi
  
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo ""
    echo "Error: Timeout after ${TIMEOUT} seconds. .git directories did not sync."
    echo ""
    echo "Local files:"
    echo "$LOCAL_FILES" | head -10
    [ "$(echo "$LOCAL_FILES" | wc -l)" -gt 10 ] && echo "... ($(echo "$LOCAL_FILES" | wc -l) total)"
    echo ""
    echo "Server files:"
    echo "$SERVER_FILES" | head -10
    [ "$(echo "$SERVER_FILES" | wc -l)" -gt 10 ] && echo "... ($(echo "$SERVER_FILES" | wc -l) total)"
    exit 1
  fi
  
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [ $((ELAPSED % 5)) -eq 0 ]; then
    LOCAL_COUNT=$(echo "$LOCAL_FILES" | grep -c . || echo "0")
    SERVER_COUNT=$(echo "$SERVER_FILES" | grep -c . || echo "0")
    echo "  Still syncing... (${ELAPSED}s/${TIMEOUT}s) - Local: ${LOCAL_COUNT} files, Server: ${SERVER_COUNT} files"
  fi
done

echo "Sync verified after ${ELAPSED} seconds"
echo "Triggering writeToFolder to cause bug..."
docker exec "$CONTAINER_NAME" node "/usr/src/app/scripts/bugs/trigger-write-to-folder.js" "$BLOG_HANDLE" "$TEMPLATE_ID"

# Step 5: Restore app/ directory to latest code
echo ""
echo "Step 5: Restoring app/ directory to latest code..."
cd "$REPO_ROOT"
if git checkout "$CURRENT_BRANCH" -- app/ 2>/dev/null || \
   git checkout main -- app/ 2>/dev/null || \
   git checkout master -- app/ 2>/dev/null; then
  APP_DIRECTORY_MODIFIED=false  # Mark as restored so cleanup doesn't run
  echo "App directory restored to latest code"
else
  echo "Warning: Failed to restore app/ directory. Cleanup will attempt to restore it."
fi

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

