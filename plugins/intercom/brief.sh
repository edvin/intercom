#!/bin/sh
# Prints the intercom status (team, locks, votes, unread) as plain text, for the /intercom command.
# Read-only: nothing is marked as read.
D="$HOME/.claude/intercom"
[ -f "$D/config" ] && . "$D/config"
if [ -z "$INTERCOM_URL" ] || [ -z "$INTERCOM_TOKEN" ]; then
  echo "INTERCOM NOT SET UP: get a token (invite link or admin), then run in a terminal: curl -fsSL https://intercom.mhst.io/setup.sh | sh"
  exit 0
fi
dir="${CLAUDE_PROJECT_DIR:-$PWD}"
project=$(git -C "$dir" remote get-url origin 2>/dev/null | sed -e 's#\.git$##' -e 's#.*[/:]##')
[ -n "$project" ] || project=$(basename "$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || echo "$dir")")
curl -sf --max-time 5 -G "$INTERCOM_URL/api/brief" --data-urlencode "project=$project" -H "Authorization: Bearer $INTERCOM_TOKEN" 2>/dev/null \
  || echo "INTERCOM UNREACHABLE at $INTERCOM_URL (check the network, or that your token still works)."
