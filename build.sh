#!/bin/bash

# Builds the Chrome and Firefox packages into build/
set -e

mkdir -p build

target=$1
VERSION=$(node -p "require('./manifest.json').version")

FILES="manifest.json popup.html popup.js filepicker.html filepicker.js background.js ntfy.js zip.js markdown.js emojis.js styles.css icons fonts"

build_chrome() {
  echo "Building for Chrome..."
  TEMP_DIR=$(mktemp -d)
  cp -r $FILES "$TEMP_DIR/"
  node build-manifest.js chrome > "$TEMP_DIR/manifest.json"
  (cd "$TEMP_DIR" && zip -r "$OLDPWD/build/send-to-ntfy-zh-chrome-v${VERSION}.zip" .)
  rm -rf "$TEMP_DIR"
  echo "Chrome build created at build/send-to-ntfy-zh-chrome-v${VERSION}.zip"
}

build_firefox() {
  echo "Building for Firefox..."
  TEMP_DIR=$(mktemp -d)
  cp -r $FILES "$TEMP_DIR/"
  node build-manifest.js firefox > "$TEMP_DIR/manifest.json"
  (cd "$TEMP_DIR" && zip -r "$OLDPWD/build/send-to-ntfy-zh-firefox-v${VERSION}.xpi" .)
  rm -rf "$TEMP_DIR"
  echo "Firefox build created at build/send-to-ntfy-zh-firefox-v${VERSION}.xpi"
}

if [ -z "$target" ]; then
  build_chrome
  build_firefox
elif [ "$target" == "chrome" ]; then
  build_chrome
elif [ "$target" == "firefox" ]; then
  build_firefox
else
  echo "Usage: ./build.sh [chrome|firefox]"
  exit 1
fi

cp 使用说明.md build/使用说明.md
echo "Build complete!"
