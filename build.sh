#!/bin/bash

# Builds the Chrome and Firefox packages into build/
set -e

mkdir -p build

target=$1
ROOT=$(pwd)
VERSION=$(node -p "require('./manifest.json').version")

FILES="manifest.json popup.html popup.js filepicker.html filepicker.js background.js ntfy.js backup.js zip.js markdown.js emojis.js styles.css icons fonts"

# Packs a directory into a zip archive; falls back to PowerShell on Windows
# where the `zip` command is usually missing.
pack_dir() {
  if command -v zip >/dev/null 2>&1; then
    (cd "$1" && zip -r -q "$2" .)
  else
    WIN_DIR=$(cygpath -w "$1")
    WIN_OUT=$(cygpath -w "$2")
    powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; if (Test-Path '$WIN_OUT') { Remove-Item '$WIN_OUT' }; [System.IO.Compression.ZipFile]::CreateFromDirectory('$WIN_DIR', '$WIN_OUT', [System.IO.Compression.CompressionLevel]::Optimal, \$false)"
  fi
}

build_chrome() {
  echo "Building for Chrome..."
  DIR="build/chrome"
  rm -rf "$DIR"
  mkdir -p "$DIR"
  cp -r $FILES "$DIR/"
  node build-manifest.js chrome > "$DIR/manifest.json"
  # Chrome can't install from a zip and no longer accepts dragged crx files, so the
  # zip wraps everything in one folder: unzipping gives a folder to "load unpacked".
  PACKAGE="ntfy-extension-chrome-v${VERSION}"
  STAGE=$(mktemp -d)
  cp -r "$DIR" "$STAGE/$PACKAGE"
  pack_dir "$STAGE" "$ROOT/build/send-to-ntfy-zh-chrome-v${VERSION}.zip"
  rm -rf "$STAGE"
  echo "Chrome build created at build/chrome and build/send-to-ntfy-zh-chrome-v${VERSION}.zip"
}

build_firefox() {
  echo "Building for Firefox..."
  DIR="build/firefox"
  rm -rf "$DIR"
  mkdir -p "$DIR"
  cp -r $FILES "$DIR/"
  node build-manifest.js firefox > "$DIR/manifest.json"
  pack_dir "$ROOT/$DIR" "$ROOT/build/send-to-ntfy-zh-firefox-v${VERSION}.xpi"
  echo "Firefox build created at build/firefox and build/send-to-ntfy-zh-firefox-v${VERSION}.xpi"
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
cp 更新说明.md build/更新说明.md
echo "Build complete!"
