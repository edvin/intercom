#!/bin/sh
# Claude Code status line: this session's name on the intercom, its unread messages, locks on its project and
# votes waiting for you, e.g. "📻 alder · 2 unread · 🔒 deploy:billing:prod (anna)".
# Use it as your statusLine command (the setup does that when you have none), or print it from your own script:
#   sh ~/.claude/intercom/statusline.sh < /dev/stdin
# Answers from a cache at once and refreshes it in the background, so it never slows the prompt down.

D="$HOME/.claude/intercom"
[ -f "$D/config" ] && . "$D/config"
[ -n "$INTERCOM_URL" ] && [ -n "$INTERCOM_TOKEN" ] || exit 0

# Claude Code passes the session as JSON on stdin; the hooks note which repo it runs in.
session=$(cat 2>/dev/null | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
session=$(printf '%s' "$session" | tr -cd 'A-Za-z0-9_-')
project=$(cat "$D/.project-${session:-default}" 2>/dev/null)
cache="$D/.statusline-${session:-all}"

refresh() {
  curl -sf --max-time 3 -G "$INTERCOM_URL/api/statusline" --data-urlencode "session=$session" --data-urlencode "project=$project" \
    -H "Authorization: Bearer $INTERCOM_TOKEN" > "$cache.tmp" 2>/dev/null && mv "$cache.tmp" "$cache" || rm -f "$cache.tmp"
}

now=$(date +%s)
mtime=$(stat -f %m "$cache" 2>/dev/null || stat -c %Y "$cache" 2>/dev/null || echo 0)
if [ ! -s "$cache" ]; then
  refresh
elif [ $((now - mtime)) -ge 10 ]; then
  touch "$cache" # one refresh at a time
  (refresh &) >/dev/null 2>&1
fi
cat "$cache" 2>/dev/null
