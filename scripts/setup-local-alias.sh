#!/bin/bash

# Script to setup local codebuff alias for development

set -e

# Get the absolute path to the codebuff project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
BINARY_PATH="$PROJECT_ROOT/npm-app/bin/codebuff"

echo "🔧 Setting up local Codebuff alias..."

# Build the binary first
echo "📦 Building binary..."
cd "$PROJECT_ROOT/npm-app"
bun run build

if [ ! -f "$BINARY_PATH" ]; then
    echo "❌ Error: Binary not found at $BINARY_PATH"
    exit 1
fi

# Make sure it's executable
chmod +x "$BINARY_PATH"

echo "✅ Binary built successfully at: $BINARY_PATH"
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
        echo "Please manually add this alias to your shell config:"
        echo "alias codebuff=\"$BINARY_PATH\""
        exit 0
        ;;
esac

ALIAS_LINE="alias codebuff=\"$BINARY_PATH\""
COMMENT_LINE="# Codebuff local development alias"

# Check if alias already exists
if grep -q "alias codebuff=" "$RC_FILE" 2>/dev/null; then
    echo "⚠️  Alias already exists in $RC_FILE"
    echo "Would you like to update it? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        # Remove old alias lines
        sed -i.bak '/# Codebuff local development alias/d' "$RC_FILE"
        sed -i.bak '/alias codebuff=/d' "$RC_FILE"
        echo "✅ Removed old alias"
    else
        echo "ℹ️  Keeping existing alias"
        exit 0
    fi
fi

# Add alias to RC file
echo "" >> "$RC_FILE"
echo "$COMMENT_LINE" >> "$RC_FILE"
echo "$ALIAS_LINE" >> "$RC_FILE"

echo "✅ Alias added to $RC_FILE"
echo ""
echo "To use the alias in your current terminal, run:"
echo "  source $RC_FILE"
echo ""
echo "Or simply restart your terminal."
echo ""
echo "Test with: codebuff --version"
