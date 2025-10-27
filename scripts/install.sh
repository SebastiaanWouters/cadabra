#!/bin/sh
# Cadabra installer script
# Based on Deno's install script (https://github.com/denoland/deno_install)

set -e

# Configuration
GITHUB_REPO="SebastiaanWouters/cadabra"
BINARY_NAME="cadabra"

# Colors for output
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  NC=''
fi

error() {
  printf "${RED}Error: %s${NC}\n" "$1" >&2
  exit 1
}

info() {
  printf "${BLUE}%s${NC}\n" "$1"
}

success() {
  printf "${GREEN}✓ %s${NC}\n" "$1"
}

warning() {
  printf "${YELLOW}⚠ %s${NC}\n" "$1"
}

# Detect OS and architecture
detect_platform() {
  local os
  local arch

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux*)
      case "$arch" in
        x86_64)
          PLATFORM="linux-x64"
          ;;
        aarch64|arm64)
          PLATFORM="linux-arm64"
          ;;
        *)
          error "Unsupported architecture: $arch"
          ;;
      esac
      ;;
    Darwin*)
      case "$arch" in
        x86_64)
          PLATFORM="darwin-x64"
          ;;
        arm64)
          PLATFORM="darwin-arm64"
          ;;
        *)
          error "Unsupported architecture: $arch"
          ;;
      esac
      ;;
    *)
      error "Unsupported OS: $os. Use Windows PowerShell installer for Windows."
      ;;
  esac

  success "Detected platform: $PLATFORM"
}

# Get latest release version from GitHub
get_latest_version() {
  info "Fetching latest release version..."

  if command -v curl >/dev/null 2>&1; then
    VERSION=$(curl -sSfL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" |
              grep '"tag_name":' |
              sed -E 's/.*"([^"]+)".*/\1/')
  elif command -v wget >/dev/null 2>&1; then
    VERSION=$(wget -qO- "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" |
              grep '"tag_name":' |
              sed -E 's/.*"([^"]+)".*/\1/')
  else
    error "Neither curl nor wget is available. Please install one of them."
  fi

  if [ -z "$VERSION" ]; then
    error "Failed to fetch latest version"
  fi

  success "Latest version: $VERSION"
}

# Download binary
download_binary() {
  local download_url="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${BINARY_NAME}-${PLATFORM}"
  local checksum_url="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/checksums.txt"
  local temp_dir

  temp_dir="$(mktemp -d)"
  TEMP_BINARY="${temp_dir}/${BINARY_NAME}"
  TEMP_CHECKSUM="${temp_dir}/checksums.txt"

  info "Downloading ${BINARY_NAME} ${VERSION} for ${PLATFORM}..."

  if command -v curl >/dev/null 2>&1; then
    curl -sSfL "$download_url" -o "$TEMP_BINARY" || error "Failed to download binary"
    curl -sSfL "$checksum_url" -o "$TEMP_CHECKSUM" || error "Failed to download checksums"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$TEMP_BINARY" "$download_url" || error "Failed to download binary"
    wget -qO "$TEMP_CHECKSUM" "$checksum_url" || error "Failed to download checksums"
  fi

  success "Downloaded binary"
}

# Verify checksum
verify_checksum() {
  info "Verifying checksum..."

  if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
    warning "sha256sum/shasum not found. Skipping checksum verification."
    return 0
  fi

  local expected_checksum
  expected_checksum=$(grep "${BINARY_NAME}-${PLATFORM}" "$TEMP_CHECKSUM" | awk '{print $1}')

  if [ -z "$expected_checksum" ]; then
    warning "Checksum not found for ${PLATFORM}. Skipping verification."
    return 0
  fi

  local actual_checksum
  if command -v sha256sum >/dev/null 2>&1; then
    actual_checksum=$(sha256sum "$TEMP_BINARY" | awk '{print $1}')
  else
    actual_checksum=$(shasum -a 256 "$TEMP_BINARY" | awk '{print $1}')
  fi

  if [ "$expected_checksum" != "$actual_checksum" ]; then
    error "Checksum verification failed!\nExpected: $expected_checksum\nActual: $actual_checksum"
  fi

  success "Checksum verified"
}

# Try to install to system-wide location
try_install_system() {
  local target="/usr/local/bin/${BINARY_NAME}"

  # Check if /usr/local/bin exists
  if [ ! -d "/usr/local/bin" ]; then
    return 1
  fi

  # Check if we can write to /usr/local/bin
  if [ -w "/usr/local/bin" ]; then
    cp "$TEMP_BINARY" "$target"
    chmod +x "$target"
    INSTALL_DIR="/usr/local/bin"
    return 0
  fi

  # Try with sudo
  if command -v sudo >/dev/null 2>&1; then
    info "Installing to /usr/local/bin requires sudo privileges..."
    if sudo -n true 2>/dev/null || sudo cp "$TEMP_BINARY" "$target" 2>/dev/null; then
      sudo chmod +x "$target"
      INSTALL_DIR="/usr/local/bin"
      return 0
    fi
  fi

  return 1
}

# Install to user-local location
install_user() {
  local target="${HOME}/.local/bin/${BINARY_NAME}"

  # Create directory if it doesn't exist
  mkdir -p "${HOME}/.local/bin"

  cp "$TEMP_BINARY" "$target"
  chmod +x "$target"

  INSTALL_DIR="${HOME}/.local/bin"
}

# Add to PATH if needed
setup_path() {
  local shell_profile

  # Only needed if installed to user-local directory
  if [ "$INSTALL_DIR" = "/usr/local/bin" ]; then
    return 0
  fi

  # Check if already in PATH
  case ":${PATH}:" in
    *:"${INSTALL_DIR}":*)
      return 0
      ;;
  esac

  # Determine shell profile file
  if [ -n "$BASH_VERSION" ]; then
    shell_profile="${HOME}/.bashrc"
  elif [ -n "$ZSH_VERSION" ]; then
    shell_profile="${HOME}/.zshrc"
  elif [ -f "${HOME}/.profile" ]; then
    shell_profile="${HOME}/.profile"
  else
    shell_profile="${HOME}/.bashrc"
  fi

  info "Adding ${INSTALL_DIR} to PATH in ${shell_profile}..."

  # Add to shell profile
  {
    echo ""
    echo "# Cadabra"
    echo "export PATH=\"\$PATH:${INSTALL_DIR}\""
  } >> "$shell_profile"

  success "Added to PATH in ${shell_profile}"
  warning "Restart your shell or run: source ${shell_profile}"
}

# Cleanup temporary files
cleanup() {
  if [ -n "$TEMP_BINARY" ] && [ -f "$TEMP_BINARY" ]; then
    rm -rf "$(dirname "$TEMP_BINARY")"
  fi
}

# Main installation flow
main() {
  echo ""
  echo "${BLUE}╔════════════════════════════════════════╗${NC}"
  echo "${BLUE}║${NC}     Cadabra Installer"
  echo "${BLUE}╚════════════════════════════════════════╝${NC}"
  echo ""

  # Set trap to cleanup on exit
  trap cleanup EXIT

  detect_platform
  get_latest_version
  download_binary
  verify_checksum

  info "Installing ${BINARY_NAME}..."

  if try_install_system; then
    success "Installed to ${INSTALL_DIR}/${BINARY_NAME}"
  else
    warning "Could not install to /usr/local/bin (no write permission)"
    info "Installing to user-local directory instead..."
    install_user
    success "Installed to ${INSTALL_DIR}/${BINARY_NAME}"
    setup_path
  fi

  echo ""
  success "Cadabra ${VERSION} installed successfully!"
  echo ""
  echo "${GREEN}Run 'cadabra' to start the server${NC}"
  echo ""
  echo "For help, visit: https://github.com/${GITHUB_REPO}"
  echo ""
}

main
