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

# "brief.sh doctor": what works on this machine, for Claude Code and Codex.
if [ "$1" = "doctor" ]; then
  now=$(date +%s)
  check() { if [ "$1" = ok ]; then printf '  ✓ %s\n' "$2"; else printf '  ✗ %s\n' "$2"; fi; }
  echo "Intercom doctor"
  me=$(curl -sf --max-time 5 "$INTERCOM_URL/api/whoami" -H "Authorization: Bearer $INTERCOM_TOKEN")
  [ -n "$me" ] && check ok "signed in to $INTERCOM_URL as $me" || check no "token rejected or hub unreachable ($INTERCOM_URL): run the setup again"
  command -v node >/dev/null 2>&1 && check ok "node $(node -v)" || check no "node missing (22+ needed)"
  for client in claude codex; do
    if [ -f "$D/.hook-$client" ]; then
      set -- $(cat "$D/.hook-$client")
      check ok "$client hooks run (last: $2, $(( (now - $1) / 60 )) min ago)"
    elif [ "$client" = codex ] && command -v codex >/dev/null 2>&1; then
      check no "codex hooks have never run: in Codex type /hooks and trust the intercom hooks (or run the setup again)"
    fi
  done
  if command -v codex >/dev/null 2>&1; then
    codex mcp list 2>/dev/null | grep -q intercom && check ok "codex has the intercom MCP server" || check no "codex has no intercom MCP server: run the setup again"
    grep -qs "intercom/hook.sh" "${CODEX_HOME:-$HOME/.codex}/hooks.json" && check ok "codex hooks configured" || check no "codex hooks not configured: run the setup again"
    ls "$D/codex-sessions" 2>/dev/null | grep -q . && check ok "codex sessions linked to the local server" || echo "  - no linked codex session yet (needs a Codex session started with trusted hooks)"
  fi
  n=$(ls "$D/watch" "$D/live" 2>/dev/null | grep -vc ':$' || true)
  [ "$n" -gt 0 ] 2>/dev/null && check ok "$n local server connection(s) to the hub" || echo "  - no local server connected right now (start Claude Code or Codex)"
  exit 0
fi

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
project=$(git -C "$dir" remote get-url origin 2>/dev/null | sed -e 's#\.git$##' -e 's#.*[/:]##')
[ -n "$project" ] || project=$(basename "$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || echo "$dir")")
curl -sf --max-time 5 -G "$INTERCOM_URL/api/brief" --data-urlencode "project=$project" -H "Authorization: Bearer $INTERCOM_TOKEN" 2>/dev/null \
  || echo "INTERCOM UNREACHABLE at $INTERCOM_URL (check the network, or that your token still works)."
