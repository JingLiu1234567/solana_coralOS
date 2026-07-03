#!/bin/bash
# Executed by coral-server when a session starts.
# Saves the live CORAL_CONNECTION_URL so the host (dev.ps1) can write the proper .mcp.json.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Short pause so coral finishes connecting stdout before we print
sleep 0.3

echo "=== TenderNet Agent: $CORAL_AGENT_ID ==="
echo "Session:        $CORAL_SESSION_ID"
echo "Connection URL: $CORAL_CONNECTION_URL"

echo "$CORAL_CONNECTION_URL" > "$SCRIPT_DIR/.coral-url"
echo ">>> wrote .coral-url — host dev.ps1 will write .mcp.json"

while true; do sleep 3600; done
