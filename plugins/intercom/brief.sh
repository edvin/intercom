#!/bin/sh
# Prints the intercom status (team, locks, votes, unread) as plain text, for the /intercom command.
# Read-only: nothing is marked as read.
D="$HOME/.claude/intercom"
[ -f "$D/config" ] && . "$D/config"
if [ -z "$INTERCOM_URL" ] || [ -z "$INTERCOM_TOKEN" ]; then
  echo "INTERCOM NOT SET UP: get a token (invite link or admin), then run in a terminal: curl -fsSL https://intercom.mhst.io/setup.sh | sh"
  exit 0
fi
# "brief.sh open": open the dashboard in the browser, already signed in (the token travels in the URL
# fragment, which browsers never send to the server).
if [ "$1" = "open" ]; then
  link="$INTERCOM_URL/login#t=$INTERCOM_TOKEN"
  if command -v open >/dev/null 2>&1; then open "$link"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$link" >/dev/null 2>&1; else echo "Open $INTERCOM_URL and sign in with the token in $D/config"; exit 0; fi
  echo "Opened the dashboard in your browser."
  exit 0
fi

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
project=$(git -C "$dir" remote get-url origin 2>/dev/null | sed -e 's#\.git$##' -e 's#.*[/:]##')
[ -n "$project" ] || project=$(basename "$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || echo "$dir")")
curl -sf --max-time 5 -G "$INTERCOM_URL/api/brief" --data-urlencode "project=$project" -H "Authorization: Bearer $INTERCOM_TOKEN" 2>/dev/null \
  || echo "INTERCOM UNREACHABLE at $INTERCOM_URL (check the network, or that your token still works)."
