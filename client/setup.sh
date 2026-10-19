#!/bin/sh
# Intercom setup for the Claude Code plugin: stores your token. Safe to re-run.
#   1. In Claude Code:  /plugin install intercom --marketplace edvin/intercom
#   2. In a terminal:   curl -fsSL https://__INTERCOM_URL_HOST__/setup.sh | sh
set -e

URL="__INTERCOM_URL__"
TOKEN="$1"
DIR="$HOME/.claude/intercom"

if [ -z "$TOKEN" ]; then
  printf "Your intercom token: " >/dev/tty
  stty -echo </dev/tty 2>/dev/null || true
  read -r TOKEN </dev/tty
  stty echo </dev/tty 2>/dev/null || true
  echo >/dev/tty
fi
[ -n "$TOKEN" ] || { echo "No token given." >&2; exit 1; }

NAME=$(curl -sf --max-time 10 "$URL/api/whoami" -H "Authorization: Bearer $TOKEN" || true)
echo "$NAME" | grep -Eq '^[a-z][a-z0-9_-]{0,31}$' || { echo "Token rejected by $URL" >&2; exit 1; }

mkdir -p "$DIR"
umask 077
printf 'INTERCOM_URL=%s\nINTERCOM_TOKEN=%s\n' "$URL" "$TOKEN" > "$DIR/config"
umask 022

# Launcher for live push (Claude Code channels, research preview; some organisations block it).
cat > "$DIR/claude-ic" <<'SH'
#!/bin/sh
# Claude Code with the intercom channel: messages are pushed into the session live.
INTERCOM_CHANNEL=1 exec claude --dangerously-load-development-channels plugin:intercom@intercom "$@"
SH
chmod +x "$DIR/claude-ic"

echo "Done — you are \"$NAME\". Restart Claude Code sessions to connect."
echo "  • Dashboard: $URL"
echo "  • Live push (optional): $DIR/claude-ic"
