#!/bin/sh
# Prints e.g. "📻 2 unread · 🔒 deploy:billing:prod (anna)". Cached for 15s.
# Use on its own as a Claude Code statusLine command, or call it from your existing status line script.

CONF="$HOME/.claude/intercom/config"
[ -f "$CONF" ] && . "$CONF"
[ -n "$INTERCOM_URL" ] && [ -n "$INTERCOM_TOKEN" ] || exit 0
cat >/dev/null 2>&1

cache="$HOME/.claude/intercom/.statusline"
now=$(date +%s)
mtime=$(stat -f %m "$cache" 2>/dev/null || stat -c %Y "$cache" 2>/dev/null || echo 0)
if [ $((now - mtime)) -ge 15 ]; then
  curl -sf --max-time 2 "$INTERCOM_URL/api/statusline" -H "Authorization: Bearer $INTERCOM_TOKEN" > "$cache.tmp" 2>/dev/null \
    && mv "$cache.tmp" "$cache" || touch "$cache"
fi
cat "$cache" 2>/dev/null
