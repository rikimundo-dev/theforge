#!/usr/bin/env sh
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
git config core.hooksPath .githooks
chmod +x .githooks/prepare-commit-msg
echo "Githooks activados: core.hooksPath=.githooks"
