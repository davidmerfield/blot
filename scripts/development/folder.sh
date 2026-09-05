#!/usr/bin/env bash
set -euo pipefail

# Resolve repo paths
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../../ && pwd)"
FOLDERS_DIR="$DIR/app/templates/folders"

# Get list of available folders (directories that don't start with . or -)
get_available_folders() {
  find "$FOLDERS_DIR" -maxdepth 1 -type d -not -path "$FOLDERS_DIR" | while read -r folder; do
    basename "$folder"
  done | grep -v '^\.' | grep -v '^-' | sort
}

# If no argument provided, list available folders
if [ $# -eq 0 ]; then
  echo "Available folders:"
  echo ""
  folders=$(get_available_folders)
  while IFS= read -r folder; do
    echo "  npm run folder $folder"
  done <<< "$folders"
  echo ""
  exit 0
fi

FOLDER_NAME="$1"

# Validate folder exists
if [ ! -d "$FOLDERS_DIR/$FOLDER_NAME" ]; then
  echo "Error: Folder '$FOLDER_NAME' not found in $FOLDERS_DIR"
  echo ""
  echo "Available folders:"
  folders=$(get_available_folders)
  while IFS= read -r folder; do
    echo "  npm run folder $folder"
  done <<< "$folders"
  exit 1
fi

# Run nodemon with the folder name as argument
docker exec blot-node-app-1 npx nodemon app/templates/folders --ext '*' --watch "/usr/src/app/app/templates/folders/$FOLDER_NAME" "$FOLDER_NAME"

