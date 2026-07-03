#!/bin/bash
# Start a TenderNet Claude Code session.
# Coral-server will run each agent's startup.sh, which writes .mcp.json.
# After this script completes, open each agent directory in VS Code and run: claude

CORAL_URL="${CORAL_SERVER_URL:-http://localhost:5555}"
TOKEN="${CORAL_TOKEN:-dev}"

echo "Creating TenderNet session on $CORAL_URL ..."

RESPONSE=$(curl -s -X POST "$CORAL_URL/api/v1/local/session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentGraphRequest": {
      "agents": [
        {
          "id": {"name": "buyer", "version": "0.1.0", "registrySourceId": {"type": "local"}},
          "name": "buyer",
          "provider": {"type": "local", "runtime": "executable"},
          "blocking": false,
          "options": {}
        },
        {
          "id": {"name": "whitehall-analytics", "version": "0.1.0", "registrySourceId": {"type": "local"}},
          "name": "whitehall-analytics",
          "provider": {"type": "local", "runtime": "executable"},
          "blocking": false,
          "options": {}
        },
        {
          "id": {"name": "insight-research", "version": "0.1.0", "registrySourceId": {"type": "local"}},
          "name": "insight-research",
          "provider": {"type": "local", "runtime": "executable"},
          "blocking": false,
          "options": {}
        },
        {
          "id": {"name": "stratford-advisory", "version": "0.1.0", "registrySourceId": {"type": "local"}},
          "name": "stratford-advisory",
          "provider": {"type": "local", "runtime": "executable"},
          "blocking": false,
          "options": {}
        }
      ],
      "groups": [["buyer", "whitehall-analytics", "insight-research", "stratford-advisory"]]
    },
    "namespaceProvider": {"type": "create_if_not_exists", "namespaceRequest": {"name": "tendernet"}},
    "execution": {"mode": "immediate", "runtimeSettings": {"ttl": 86400000}}
  }')

echo "$RESPONSE"
SESSION_ID=$(echo "$RESPONSE" | grep -o '"sessionId"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '[a-f0-9-]\{36\}')

if [ -n "$SESSION_ID" ]; then
  echo ""
  echo "Session created: $SESSION_ID"
  echo ""
  echo "Each agent's startup.sh has written .mcp.json. Now start Claude Code in each directory:"
  echo ""
  echo "  Terminal 1:  cd coral-agents/buyer             && claude"
  echo "  Terminal 2:  cd coral-agents/whitehall-analytics && claude"
  echo "  Terminal 3:  cd coral-agents/insight-research   && claude"
  echo "  Terminal 4:  cd coral-agents/stratford-advisory  && claude"
else
  echo "ERROR: session creation failed"
  exit 1
fi
