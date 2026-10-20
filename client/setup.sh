#!/bin/sh
# Intercom setup: one command does everything. Safe to re-run (also to switch tokens).
#   curl -fsSL https://__INTERCOM_URL_HOST__/setup.sh | sh                 # asks for your token
#   curl -fsSL https://__INTERCOM_URL_HOST__/setup.sh | sh -s -- <token>
# It checks node, installs the Claude Code plugin (if the claude CLI is on PATH), and stores your token.
set -e

URL="__INTERCOM_URL__"
TOKEN="$1"
DIR="$HOME/.claude/intercom"
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

echo "Intercom setup"

# 1. node >= 22 (the plugin's local server needs it, with built-in WebSocket).
if ! command -v node >/dev/null 2>&1; then
  fail "node is not installed. Install Node.js 22 or newer (https://nodejs.org, or: brew install node), then run this again."
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$NODE_MAJOR" -ge 22 ] || fail "node $(node -v) is too old; Intercom needs 22 or newer. Upgrade (e.g. brew upgrade node), then run this again."
ok "node $(node -v)"

# 2. Token: verify it before writing anything.
if [ -z "$TOKEN" ]; then
  printf "  Your intercom token: " >/dev/tty
  stty -echo </dev/tty 2>/dev/null || true
  read -r TOKEN </dev/tty
  stty echo </dev/tty 2>/dev/null || true
  echo >/dev/tty
fi
[ -n "$TOKEN" ] || fail "No token given."
NAME=$(curl -sf --max-time 10 "$URL/api/whoami" -H "Authorization: Bearer $TOKEN" || true)
echo "$NAME" | grep -Eq '^[a-z][a-z0-9_-]{0,31}$' || fail "That token was rejected by $URL. Check it, or get a new one from the dashboard (Account) or an admin."
mkdir -p "$DIR"
# Keep other settings in the config (INTERCOM_NOTIFY etc.), replace URL and token.
OLD=$(grep -vE '^(INTERCOM_URL|INTERCOM_TOKEN)=' "$DIR/config" 2>/dev/null || true)
umask 077
{ printf 'INTERCOM_URL=%s\nINTERCOM_TOKEN=%s\n' "$URL" "$TOKEN"; if [ -n "$OLD" ]; then printf '%s\n' "$OLD"; fi; } > "$DIR/config"
umask 022
ok "signed in as $NAME"

# 3. The Claude Code plugin.
if command -v claude >/dev/null 2>&1; then
  # An older script install (user-scope MCP server + hooks in settings.json) would duplicate the plugin.
  if claude mcp get intercom 2>/dev/null | grep -q "intercom-channel.mjs"; then
    claude mcp remove --scope user intercom >/dev/null 2>&1 || true
    if [ -f "$HOME/.claude/settings.json" ] && command -v python3 >/dev/null 2>&1; then
      python3 -I - "$HOME/.claude/settings.json" <<'PY' || true
import json, os, sys
path = sys.argv[1]
s = json.load(open(path))
hooks = s.get("hooks", {})
for ev in list(hooks):
    groups = []
    for g in hooks[ev]:
        g["hooks"] = [h for h in g.get("hooks", []) if "/.claude/intercom/hook.sh" not in h.get("command", "")]
        if g["hooks"]:
            groups.append(g)
    if groups:
        hooks[ev] = groups
    else:
        del hooks[ev]
tmp = path + ".intercom.tmp"
with open(tmp, "w") as f:
    json.dump(s, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
    fi
    ok "removed the older script install (the plugin replaces it)"
  fi
  claude plugin marketplace add edvin/intercom >/dev/null 2>&1 || claude plugin marketplace update intercom >/dev/null 2>&1 || true
  if claude plugin list 2>/dev/null | grep -q "intercom@intercom"; then
    claude plugin update intercom@intercom >/dev/null 2>&1 || true
    ok "plugin up to date"
  elif claude plugin install intercom@intercom >/dev/null 2>&1; then
    ok "plugin installed"
  else
    warn "couldn't install the plugin automatically. In Claude Code, run: /plugin install intercom --marketplace edvin/intercom"
  fi
else
  warn "the claude CLI isn't on your PATH. In Claude Code, run: /plugin install intercom --marketplace edvin/intercom"
fi

# 4. Launcher for live push (Claude Code channels, research preview).
# If your organisation allowlists intercom as a channel plugin, add INTERCOM_CHANNELS=allowlisted to the config:
# the launcher then uses --channels instead of the development-channel flag.
cat > "$DIR/claude-ic" <<'SH'
#!/bin/sh
# Claude Code with the intercom channel: messages are pushed into the session live.
[ -f "$HOME/.claude/intercom/config" ] && . "$HOME/.claude/intercom/config"
if [ "$INTERCOM_CHANNELS" = "allowlisted" ]; then
  INTERCOM_CHANNEL=1 exec claude --channels plugin:intercom@intercom "$@"
fi
INTERCOM_CHANNEL=1 exec claude --dangerously-load-development-channels plugin:intercom@intercom "$@"
SH
chmod +x "$DIR/claude-ic"

echo
echo "Done. Restart Claude Code, then type /intercom to see your team."
echo "  Dashboard:  /intercom dashboard   (or $URL)"
echo "  Live push:  $DIR/claude-ic   (optional; see $URL/docs)"
