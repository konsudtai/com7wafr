#!/usr/bin/env bash
# AWS Well-Architected Review Tool — One-Command Installer
# Usage: curl -sSL https://<bucket>.s3.amazonaws.com/install.sh | bash
set -e

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()    { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

INSTALL_DIR="$HOME/com7wafr"
REPO_URL="https://github.com/konsudtai/com7wafr.git"

# ─── Step 1: Check environment (Linux / CloudShell) ──────────────────────────
info "Checking environment..."

OS="$(uname -s)"
if [ "$OS" != "Linux" ]; then
    fail "This installer requires a Linux environment (detected: ${OS}).
       Please run this script in AWS CloudShell or a Linux-based system."
fi

if [ -n "$AWS_EXECUTION_ENV" ]; then
    success "Running in AWS CloudShell"
else
    success "Running on Linux ($(uname -sr))"
fi

# ─── Step 2: Check Python 3.9+ ───────────────────────────────────────────────
info "Checking Python version..."

if ! command -v python3 &>/dev/null; then
    fail "python3 not found.
       Fix: Install Python 3.9 or later.
         Amazon Linux:  sudo yum install python3 -y
         Ubuntu/Debian: sudo apt-get install python3 -y"
fi

PYTHON_VERSION="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
PYTHON_MAJOR="$(echo "$PYTHON_VERSION" | cut -d. -f1)"
PYTHON_MINOR="$(echo "$PYTHON_VERSION" | cut -d. -f2)"

if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]; }; then
    fail "Python 3.9+ is required (detected: ${PYTHON_VERSION}).
       Fix: Upgrade Python to 3.9 or later.
         Amazon Linux:  sudo yum install python3.11 -y
         Ubuntu/Debian: sudo apt-get install python3.11 -y"
fi

success "Python ${PYTHON_VERSION} detected"

# ─── Step 3: Check pip ────────────────────────────────────────────────────────
info "Checking pip..."

if ! python3 -m pip --version &>/dev/null; then
    fail "pip is not installed for python3.
       Fix: Install pip:
         python3 -m ensurepip --user
         or: curl -sSL https://bootstrap.pypa.io/get-pip.py | python3 - --user"
fi

success "pip $(python3 -m pip --version | awk '{print $2}') detected"

# ─── Step 4: Download the tool ───────────────────────────────────────────────
info "Downloading AWS Well-Architected Review Tool..."

if [ -d "$INSTALL_DIR" ]; then
    warn "Directory ${INSTALL_DIR} already exists — pulling latest changes"
    if command -v git &>/dev/null && [ -d "$INSTALL_DIR/.git" ]; then
        git -C "$INSTALL_DIR" pull --quiet || warn "git pull failed, using existing files"
    fi
else
    if command -v git &>/dev/null; then
        git clone --quiet "$REPO_URL" "$INSTALL_DIR" 2>/dev/null \
            || fail "Failed to clone repository.
       Fix: Check your network connection and try again.
         If git is unavailable, download the release archive manually:
         curl -sSL ${REPO_URL}/archive/main.tar.gz | tar xz -C \$HOME"
    else
        fail "git is not installed.
       Fix: Install git first:
         Amazon Linux:  sudo yum install git -y
         Ubuntu/Debian: sudo apt-get install git -y
       Or download the release archive manually:
         mkdir -p ${INSTALL_DIR}
         curl -sSL ${REPO_URL}/archive/main.tar.gz | tar xz --strip-components=1 -C ${INSTALL_DIR}"
    fi
fi

success "Tool downloaded to ${INSTALL_DIR}"

# ─── Step 5: Install Python dependencies ─────────────────────────────────────
info "Installing Python dependencies (this may take a minute)..."

if [ ! -f "$INSTALL_DIR/requirements.txt" ]; then
    fail "requirements.txt not found in ${INSTALL_DIR}.
       Fix: Ensure the repository was downloaded correctly and try again."
fi

python3 -m pip install --user -r "$INSTALL_DIR/requirements.txt" --quiet \
    || fail "Failed to install Python dependencies.
       Fix: Try installing manually:
         python3 -m pip install --user -r ${INSTALL_DIR}/requirements.txt
       If disk space is low in CloudShell, clear the pip cache:
         python3 -m pip cache purge"

success "Dependencies installed"

# ─── Step 6: Set up PATH ─────────────────────────────────────────────────────
info "Configuring PATH..."

LOCAL_BIN="$HOME/.local/bin"
PATH_ENTRY='export PATH="$HOME/.local/bin:$PATH"'

# Ensure ~/.local/bin exists
mkdir -p "$LOCAL_BIN"

# Add to PATH for the current session
if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
    export PATH="$LOCAL_BIN:$PATH"
fi

# Persist in shell profile for future sessions
SHELL_RC=""
if [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
    SHELL_RC="$HOME/.bash_profile"
elif [ -f "$HOME/.profile" ]; then
    SHELL_RC="$HOME/.profile"
fi

if [ -n "$SHELL_RC" ]; then
    if ! grep -qF '.local/bin' "$SHELL_RC" 2>/dev/null; then
        echo "" >> "$SHELL_RC"
        echo "# AWS Well-Architected Review Tool" >> "$SHELL_RC"
        echo "$PATH_ENTRY" >> "$SHELL_RC"
        success "Added ~/.local/bin to PATH in ${SHELL_RC}"
    else
        success "PATH already configured in ${SHELL_RC}"
    fi
else
    warn "Could not find shell profile. Add this line manually:
       ${PATH_ENTRY}"
fi

# ─── Step 7: Success message ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}✔ AWS Well-Architected Review Tool installed successfully!${NC}"
echo ""
echo -e "${BOLD}Quick Start:${NC}"
echo -e "  ${CYAN}# Scan EC2 and S3 in current region${NC}"
echo -e "  python3 -m cli.main --services ec2,s3"
echo ""
echo -e "  ${CYAN}# Scan multiple regions${NC}"
echo -e "  python3 -m cli.main --regions us-east-1,eu-west-1 --services ec2,s3,rds"
echo ""
echo -e "  ${CYAN}# Add a cross-account for scanning${NC}"
echo -e "  python3 -m cli.main add-account --account-id 123456789012 --role-arn arn:aws:iam::123456789012:role/WA-Review-Role --alias production"
echo ""
echo -e "  ${CYAN}# Full scan with all services${NC}"
echo -e "  python3 -m cli.main --regions us-east-1"
echo ""
echo -e "  ${CYAN}# Show help${NC}"
echo -e "  python3 -m cli.main --help"
echo ""
echo -e "${YELLOW}Note:${NC} Run commands from ${BOLD}${INSTALL_DIR}${NC}"
echo -e "  cd ${INSTALL_DIR}"
echo ""
