#!/bin/bash
set -euo pipefail

REPO_DIR="/Users/macos-utm/.openclaw/workspace/openclaw-dashboard"
cd "$REPO_DIR"

node build-data.mjs

git add data/daily.json data/tasks.json index.html
if git diff --cached --quiet; then
  exit 0
fi

git commit -m "Update daily data"
git push
