#!/usr/bin/env bash
# Zips the extension for a release and the Chrome Web Store: dist/tabhand-extension.zip.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/tabhand-extension.zip
(cd extension && zip -qr ../dist/tabhand-extension.zip . -x '.*')
echo "dist/tabhand-extension.zip ($(du -h dist/tabhand-extension.zip | cut -f1))"
