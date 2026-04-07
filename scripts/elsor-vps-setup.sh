#!/bin/bash
# Elsor VPS Setup Script
# Run this on a fresh Ubuntu 22.04+ VPS
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/KuruptSentience/everything-claude-code/claude/review-repo-IZW5S/scripts/elsor-vps-setup.sh | bash
#
# Or manually:
#   bash scripts/elsor-vps-setup.sh

set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║         Elsor VPS Setup              ║"
echo "╚══════════════════════════════════════╝"
echo ""

# --- Collect credentials ---

if [ -z "$ANTHROPIC_API_KEY" ]; then
  read -rp "Anthropic API Key: " ANTHROPIC_API_KEY
fi

if [ -z "$DISCORD_BOT_TOKEN" ]; then
  read -rp "Discord Bot Token: " DISCORD_BOT_TOKEN
fi

if [ -z "$DISCORD_CHANNEL_ID" ]; then
  read -rp "Discord Channel ID (#elsor): " DISCORD_CHANNEL_ID
fi

echo ""
echo "[1/6] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git tmux > /dev/null 2>&1

echo "[2/6] Installing Node.js 20..."
if ! command -v node &> /dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
fi
echo "       Node $(node -v), npm $(npm -v)"

echo "[3/6] Installing Claude Code..."
npm install -g @anthropic-ai/claude-code > /dev/null 2>&1

echo "[4/6] Cloning repository..."
REPO_DIR="/opt/elsor"
if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR"
  git pull origin claude/review-repo-IZW5S
else
  git clone https://github.com/KuruptSentience/everything-claude-code.git "$REPO_DIR"
  cd "$REPO_DIR"
  git checkout claude/review-repo-IZW5S
fi
npm install --production > /dev/null 2>&1
npm install ws > /dev/null 2>&1

echo "[5/6] Writing environment config..."
cat > /opt/elsor/.env <<EOF
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
DISCORD_CHANNEL_ID=$DISCORD_CHANNEL_ID
ELSOR_PROJECT_DIR=$REPO_DIR
EOF

# Write systemd service
cat > /etc/systemd/system/elsor.service <<EOF
[Unit]
Description=Elsor Discord Bridge
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/elsor
EnvironmentFile=/opt/elsor/.env
ExecStart=/usr/bin/node /opt/elsor/scripts/elsor-discord.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "[6/6] Starting Elsor service..."
systemctl daemon-reload
systemctl enable elsor
systemctl start elsor

echo ""
echo "╔══════════════════════════════════════╗"
echo "║         Elsor is online!             ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Status:   systemctl status elsor"
echo "  Logs:     journalctl -u elsor -f"
echo "  Restart:  systemctl restart elsor"
echo "  Stop:     systemctl stop elsor"
echo ""
echo "  Go to Discord → #elsor → type a message."
echo ""
