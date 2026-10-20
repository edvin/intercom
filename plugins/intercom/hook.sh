#!/bin/sh
# Claude Code hook for the team intercom.
# Usage (from settings.json): hook.sh SessionStart | UserPromptSubmit | PostToolUse | PreToolUse | SessionEnd
# Prints hook JSON that adds unread team messages (and, at session start, rules/locks/votes) to Claude's context.
# PreToolUse (Bash) is the deploy guard: if a command looks like a deploy/migration and a teammate holds a
# matching lock, Claude Code asks the user to confirm. It never blocks on its own.
# Never fails: any error just means no intercom context this time.

D="$HOME/.claude/intercom"
event="${1:-UserPromptSubmit}"

# Fast paths (a few milliseconds, no network), using marker files kept by the local intercom server:
#  live/<pid>    channel mode: messages are pushed into the session already, never poll.
#  watch/<pid>   peek mode: the server is connected and creates pending/<pid> when something arrives,
#                so only fetch when that flag exists.
if [ "$event" = "UserPromptSubmit" ] || [ "$event" = "PostToolUse" ]; then
  if [ -n "$CLAUDE_PID" ]; then
    [ -f "$D/live/$CLAUDE_PID" ] && { cat >/dev/null 2>&1; exit 0; }
    if [ -f "$D/watch/$CLAUDE_PID" ]; then
      [ -f "$D/pending/$CLAUDE_PID" ] || { cat >/dev/null 2>&1; exit 0; }
      rm -f "$D/pending/$CLAUDE_PID"   # cleared before fetching, so anything arriving meanwhile re-flags
      peek=1
    fi
  fi
fi

[ -f "$D/config" ] && . "$D/config"
if [ -z "$INTERCOM_URL" ] || [ -z "$INTERCOM_TOKEN" ]; then
  # Installed (e.g. as a plugin) but no token yet: say so once per session, then stay quiet.
  if [ "$event" = "SessionStart" ]; then
    cat >/dev/null 2>&1
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"The intercom plugin is installed but not set up yet. If the user asks about intercom, tell them to get a token (invite link or admin) and run in a terminal: curl -fsSL https://intercom.mhst.io/setup.sh | sh"}}'
  fi
  exit 0
fi

# Deploy guard. Cheap local pre-filter first, so ordinary commands never touch the network.
if [ "$event" = "PreToolUse" ]; then
  [ "$INTERCOM_GUARD" = "0" ] && { cat >/dev/null 2>&1; exit 0; }
  input=$(cat)
  printf '%s' "$input" | grep -Eiq 'deploy|releas|rollout|rollback|migrat|publish|promote|helm|kubectl|flux|terraform|tofu|terragrunt|pulumi|wrangler|fly|vercel|netlify|kamal|heroku|ansible|argocd|gcloud|alembic|flyway|liquibase|prisma' || exit 0
  session="${CLAUDE_CODE_SESSION_ID:-$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)}"
  project=$(cat "$D/.project-${session:-default}" 2>/dev/null)
  if [ -z "$project" ]; then
    dir="${CLAUDE_PROJECT_DIR:-$PWD}"
    project=$(git -C "$dir" remote get-url origin 2>/dev/null | sed -e 's#\.git$##' -e 's#.*[/:]##')
    [ -n "$project" ] || project=$(basename "$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || echo "$dir")")
  fi
  printf '%s' "$input" | curl -sf --max-time 3 -X POST "$INTERCOM_URL/api/guard?project=$(printf '%s' "$project" | sed 's/[^A-Za-z0-9._-]/-/g')" \
    -H "Authorization: Bearer $INTERCOM_TOKEN" -H "Content-Type: application/json" --data-binary @- 2>/dev/null
  exit 0
fi

session="$CLAUDE_CODE_SESSION_ID"
if [ -n "$session" ]; then
  cat >/dev/null 2>&1
else
  session=$(sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
fi

# Blind mid-turn polling (no local server connected) is throttled so long runs don't hit the network per tool call.
if [ "$event" = "PostToolUse" ] && [ -z "$peek" ]; then
  stamp="$D/.last-poll-${session:-default}"
  now=$(date +%s)
  last=$(cat "$stamp" 2>/dev/null || echo 0)
  [ $((now - last)) -lt "${INTERCOM_POLL_SECONDS:-20}" ] && exit 0
  echo "$now" > "$stamp"
fi

# Keep a copy of brief.sh where the /intercom command can find it, for plugin and script installs alike.
if [ "$event" = "SessionStart" ] && [ -f "$(dirname "$0")/brief.sh" ]; then
  cmp -s "$(dirname "$0")/brief.sh" "$D/brief.sh" 2>/dev/null || cp "$(dirname "$0")/brief.sh" "$D/brief.sh" 2>/dev/null
fi

# Project = git remote repo name (e.g. acme/billing -> billing), else the directory name. Cached per session.
pcache="$D/.project-${session:-default}"
if [ "$event" = "SessionEnd" ]; then
  rm -f "$D/.last-poll-${session:-default}" "$pcache"
elif [ "$event" != "SessionStart" ] && [ -f "$pcache" ]; then
  project=$(cat "$pcache")
else
  dir="${CLAUDE_PROJECT_DIR:-$PWD}"
  project=$(git -C "$dir" remote get-url origin 2>/dev/null | sed -e 's#\.git$##' -e 's#.*[/:]##')
  [ -n "$project" ] || project=$(basename "$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || echo "$dir")")
  [ -n "$session" ] && printf '%s' "$project" > "$pcache"
fi

curl -sf --max-time 3 -G "$INTERCOM_URL/api/hook" \
  --data-urlencode "event=$event" --data-urlencode "project=$project" --data-urlencode "session=$session" \
  -H "Authorization: Bearer $INTERCOM_TOKEN" 2>/dev/null
exit 0
