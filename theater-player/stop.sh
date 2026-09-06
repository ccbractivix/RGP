#!/bin/sh
set -eu

LABEL="com.rgp.theater-player"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
osascript -e 'tell application "VLC" to quit' >/dev/null 2>&1 || true
echo "Stopped $LABEL"
