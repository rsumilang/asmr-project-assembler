#!/usr/bin/env sh
set -e

REPO="rsumilang/asmr-project-assembler"
RELEASES_API="https://api.github.com/repos/$REPO/releases/latest"

# Detect OS and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)   BINARY="apa-macos-arm64" ;;
      x86_64)  BINARY="apa-macos-x64" ;;
      *)       echo "Unsupported architecture: $ARCH" && exit 1 ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64)          BINARY="apa-linux-x64" ;;
      aarch64 | arm64) BINARY="apa-linux-arm64" ;;
      *)               echo "Unsupported architecture: $ARCH" && exit 1 ;;
    esac
    ;;
  *)
    echo "Unsupported OS: $OS"
    echo "Download manually from https://github.com/$REPO/releases"
    exit 1
    ;;
esac

# Resolve download URL from latest release
echo "Fetching latest release info..."
DOWNLOAD_URL=$(curl -fsSL "$RELEASES_API" \
  | grep '"browser_download_url"' \
  | grep "$BINARY" \
  | head -1 \
  | cut -d '"' -f 4)

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Could not find a release asset matching: $BINARY"
  echo "Check https://github.com/$REPO/releases for available downloads."
  exit 1
fi

# Choose install directory
if [ -w "/usr/local/bin" ]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
fi

DEST="$INSTALL_DIR/apa"

echo "Downloading $BINARY..."
curl -fsSL "$DOWNLOAD_URL" -o "$DEST"
chmod +x "$DEST"

echo ""
echo "Installed: $DEST"
echo ""

# Warn if install dir is not on PATH
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "Note: $INSTALL_DIR is not on your PATH."
    echo "Add this to your shell profile:"
    echo ""
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    echo ""
    ;;
esac

echo "Run: apa --help"
