#!/bin/sh
set -eu

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.rgp.theater-player"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PYTHON_BIN="$(command -v python3)"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$APP_DIR/logs"

if [ ! -f "$APP_DIR/config.json" ]; then
  cp "$APP_DIR/config.example.json" "$APP_DIR/config.json"
  echo "Created $APP_DIR/config.json"
  echo "Edit config.json before starting the service."
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PYTHON_BIN</string>
    <string>$APP_DIR/theater_player.py</string>
    <string>--config</string>
    <string>$APP_DIR/config.json</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$APP_DIR/logs/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$APP_DIR/logs/launchd.err.log</string>
</dict>
</plist>
EOF

echo "Installed $PLIST"
echo "Next: edit $APP_DIR/config.json, then run ./start.sh"
