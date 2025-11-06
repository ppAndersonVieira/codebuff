#!/bin/bash

# Script to setup local codebuff alias for development
# This creates a global command that runs Codebuff from source with Bun

set -e

# Get the absolute path to the codebuff project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
WRAPPER_SCRIPT="$HOME/bin/codebuff"

echo "🔧 Setting up local Codebuff command..."

# Create ~/bin directory if it doesn't exist
mkdir -p "$HOME/bin"

# Skip copying agents to ~/.agents/ - they should stay in project
# The wrapper will use agents from the project's .agents/ directory
echo "ℹ️  Note: Agents will be loaded from project directory, not copied to ~/.agents/"
echo ""

# Create wrapper script
cat > "$WRAPPER_SCRIPT" << 'EOF'
#!/usr/bin/env bash
# Codebuff global wrapper - executes from source with Bun
CURRENT_DIR="$(pwd)"
set -a
source PROJECT_ROOT_PLACEHOLDER/.env 2>/dev/null || true
set +a
cd PROJECT_ROOT_PLACEHOLDER/npm-app || exit 1

# Only add --cwd if not already specified
if [[ ! "$*" =~ --cwd ]]; then
  exec bun run src/index.ts --cwd "$CURRENT_DIR" "$@"
else
  exec bun run src/index.ts "$@"
fi
EOF

# Replace placeholder with actual project root
sed -i.bak "s|PROJECT_ROOT_PLACEHOLDER|$PROJECT_ROOT|g" "$WRAPPER_SCRIPT"
rm -f "$WRAPPER_SCRIPT.bak"

# Make it executable
chmod +x "$WRAPPER_SCRIPT"

echo "✅ Wrapper script created at: $WRAPPER_SCRIPT"
echo ""

# Detect shell
SHELL_NAME=$(basename "$SHELL")

case "$SHELL_NAME" in
    zsh)
        RC_FILE="$HOME/.zshrc"
        ;;
    bash)
        RC_FILE="$HOME/.bashrc"
        ;;
    fish)
        RC_FILE="$HOME/.config/fish/config.fish"
        ;;
    *)
        echo "⚠️  Unknown shell: $SHELL_NAME"
        echo "Please manually add ~/bin to your PATH:"
        echo "export PATH=\"\$HOME/bin:\$PATH\""
        exit 0
        ;;
esac

# Check if ~/bin is already in PATH in RC file
if ! grep -q 'export PATH="$HOME/bin:$PATH"' "$RC_FILE" 2>/dev/null && \
   ! grep -q 'export PATH="\$HOME/bin:\$PATH"' "$RC_FILE" 2>/dev/null; then
    echo "" >> "$RC_FILE"
    echo "# Add ~/bin to PATH for local scripts" >> "$RC_FILE"
    echo 'export PATH="$HOME/bin:$PATH"' >> "$RC_FILE"
    echo "✅ Added ~/bin to PATH in $RC_FILE"
else
    echo "✅ ~/bin already in PATH in $RC_FILE"
fi

echo ""
echo "To use codebuff in your current terminal, run:"
echo "  source $RC_FILE"
echo ""
echo "Or simply restart your terminal."
echo ""
echo "⚠️  IMPORTANT: Make sure backend is running before using codebuff CLI:"
echo "  cd $PROJECT_ROOT"
echo "  ./start-local.sh"
echo ""
echo "💡 TIP: The wrapper uses source code directly, so changes reflect immediately!"
echo "        No need to rebuild for development."
echo ""
echo "Test with: codebuff --version (should show 0.0.0 when using source)"
