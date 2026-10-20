#!/bin/sh
# Team intercom installer for Claude Code.
#   curl -fsSL https://__INTERCOM_URL_HOST__/install.sh | sh
# Prompts for your personal token (or pass it: ... | sh -s -- <token>). Safe to re-run.
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

command -v curl >/dev/null || { echo "curl is required." >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required (used to merge ~/.claude/settings.json)." >&2; exit 1; }
command -v claude >/dev/null || { echo "The claude CLI must be on your PATH." >&2; exit 1; }
command -v node >/dev/null || { echo "node (>= 22) is required for the local intercom server." >&2; exit 1; }
node -e 'process.exit(typeof WebSocket === "function" ? 0 : 1)' || { echo "node >= 22 is required (needs built-in WebSocket)." >&2; exit 1; }

NAME=$(curl -sf --max-time 10 "$URL/api/whoami" -H "Authorization: Bearer $TOKEN" || true)
echo "$NAME" | grep -Eq '^[a-z][a-z0-9_-]{0,31}$' || { echo "Token rejected by $URL" >&2; exit 1; }
echo "Token OK — you are \"$NAME\"."

mkdir -p "$DIR" "$HOME/.claude/commands"
umask 077
printf 'INTERCOM_URL=%s\nINTERCOM_TOKEN=%s\n' "$URL" "$TOKEN" > "$DIR/config"
umask 022
curl -fsSL "$URL/client/hook.sh" -o "$DIR/hook.sh"
curl -fsSL "$URL/client/statusline.sh" -o "$DIR/statusline.sh"
curl -fsSL "$URL/client/intercom.md" -o "$HOME/.claude/commands/intercom.md"
curl -fsSL "$URL/client/intercom-channel.mjs" -o "$DIR/intercom-channel.mjs"
curl -fsSL "$URL/client/brief.sh" -o "$DIR/brief.sh"
chmod +x "$DIR/hook.sh" "$DIR/statusline.sh" "$DIR/brief.sh"

# Launcher for live push (Claude Code channels, research preview).
# If your organisation allowlists intercom as a channel, add INTERCOM_CHANNELS=allowlisted to the config:
# the launcher then uses --channels instead of the development-channel flag.
cat > "$DIR/claude-ic" <<'SH'
#!/bin/sh
# Claude Code with the intercom channel: messages are pushed into the session live.
[ -f "$HOME/.claude/intercom/config" ] && . "$HOME/.claude/intercom/config"
if [ "$INTERCOM_CHANNELS" = "allowlisted" ]; then
  INTERCOM_CHANNEL=1 exec claude --channels server:intercom "$@"
fi
INTERCOM_CHANNEL=1 exec claude --dangerously-load-development-channels server:intercom "$@"
SH
chmod +x "$DIR/claude-ic"

# Local MCP server (user scope = every project). It proxies the tools to the hub and, under claude-ic, is the channel.
claude mcp remove --scope user intercom >/dev/null 2>&1 || true
claude mcp add --scope user intercom -- node "$DIR/intercom-channel.mjs"

# Hooks: merge into ~/.claude/settings.json, replacing any previous intercom entries.
python3 -I - "$HOME/.claude/settings.json" "$DIR/hook.sh" <<'PY'
import json, os, sys
path, hook = sys.argv[1], sys.argv[2]
settings = json.load(open(path)) if os.path.exists(path) else {}
hooks = settings.setdefault("hooks", {})
for event in ("SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "SessionEnd"):
    groups = [g for g in hooks.get(event, []) if not any("intercom/hook.sh" in h.get("command", "") for h in g.get("hooks", []))]
    entry = {"hooks": [{"type": "command", "command": f"{hook} {event}", "timeout": 5}]}
    if event == "PreToolUse":
        entry["matcher"] = "Bash"
    groups.append(entry)
    hooks[event] = groups
tmp = path + ".intercom.tmp"
with open(tmp, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY

echo
echo "Installed. Restart Claude Code sessions to pick it up."
echo "  • claude-ic          start Claude with live intercom push (alias it: alias claude-ic=$DIR/claude-ic)"
echo "  • /intercom          briefing inside Claude Code"
echo "  • $URL               your dashboard (sign in with the same token)"
echo "  • Optional status line: $DIR/statusline.sh"
