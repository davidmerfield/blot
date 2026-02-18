#!/usr/bin/env bash
set -euo pipefail

open $(docker exec -e PREVIEW_NEWSLETTER=true $(docker ps | grep blot-node | cut -d ' ' -f 1) node scripts/email/newsletter $(ls -1 app/helper/email/newsletters | tail -n 3 | head -n 1) | grep 'preview' | grep '.html' | awk -F"'" '{gsub("/usr/src/app/", "./", $2); print $2}')

