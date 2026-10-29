#!/usr/bin/env bash
# Zips the extension for a release and the Chrome Web Store: dist/assistant-navigation-extension.zip.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/assistant-navigation-extension.zip
(cd extension && zip -qr ../dist/assistant-navigation-extension.zip . -x '.*')
echo "dist/assistant-navigation-extension.zip ($(du -h dist/assistant-navigation-extension.zip | cut -f1))"
