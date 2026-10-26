#!/bin/sh
# Claude Code / Codex hook for the team intercom.
# Usage: hook.sh <SessionStart|UserPromptSubmit|PostToolUse|PreToolUse|SessionEnd> [claude|codex]
# Prints hook JSON that adds unread team messages (and, at session start, rules/locks/votes) to the agent's context.
# PreToolUse (Bash) is the deploy guard: if a command looks like a deploy/migration and a teammate holds a
# matching lock, Claude Code asks the user to confirm; Codex (whose hooks can't ask) refuses with the reason and
# lets the user decide to go ahead. It never blocks on its own in Claude Code.
# Never fails: any error just means no intercom context this time.

D="$HOME/.claude/intercom"
event="${1:-UserPromptSubmit}"
client="${2:-claude}"
json_field() { sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n 1; }

# Who's running us. Claude Code passes the session in the environment; Codex only on stdin.
if [ "$client" = "codex" ]; then
  input=$(cat)
  session=$(printf '%s' "$input" | json_field session_id)
  workdir=$(printf '%s' "$input" | json_field cwd)
  key="s-$session"
else
  session="$CLAUDE_CODE_SESSION_ID"
  key="$CLAUDE_PID"
  # Session start: read the input for the transcript path (activity mirroring).
  [ "$event" = "SessionStart" ] && input=$(cat)
fi
workdir="${workdir:-${CLAUDE_PROJECT_DIR:-$PWD}}"
# Heartbeat for `brief.sh doctor`: proves the agent runs this hook at all.
mkdir -p "$D" 2>/dev/null && printf '%s %s %s\n' "$(date +%s)" "$event" "${session:-?}" > "$D/.hook-$client" 2>/dev/null

# State events: Claude Code's Notification (waiting for approval or input), Codex's PermissionRequest,
# and Stop (the turn ends; the hub may hand back a message from the user to continue with).
case "$event" in
  PermissionRequest)
    # Away mode: ask in the dashboard and wait for the answer (else: nothing, and the terminal asks as usual).
    [ -z "$input" ] && input=$(cat)
    [ -n "$session" ] || session=$(printf '%s' "$input" | json_field session_id)
    [ -f "$D/config" ] && . "$D/config"
    [ -n "$INTERCOM_URL" ] && [ -n "$INTERCOM_TOKEN" ] && [ -n "$session" ] || exit 0
    id=$(printf '%s' "$input" | curl -sf --max-time 5 -X POST "$INTERCOM_URL/api/approval?session=$session&client=$client" \
      -H "Authorization: Bearer $INTERCOM_TOKEN" -H "Content-Type: application/json" --data-binary @- 2>/dev/null | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
    [ -n "$id" ] || exit 0
    end=$(( $(date +%s) + 3600 ))
    while [ "$(date +%s)" -lt "$end" ]; do
      r=$(curl -sf --max-time 10 "$INTERCOM_URL/api/approval/$id?show=${INTERCOM_SHOW:-1}" -H "Authorization: Bearer $INTERCOM_TOKEN" 2>/dev/null)
      case "$r" in
        *'"output"'*) printf '%s' "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).output))'; exit 0 ;;
      esac
      sleep 3
    done
    exit 0
    ;;
  Notification|Stop)
    [ -z "$input" ] && input=$(cat)
    [ -n "$session" ] || session=$(printf '%s' "$input" | json_field session_id)
    [ -f "$D/config" ] && . "$D/config"
    [ -n "$INTERCOM_URL" ] && [ -n "$INTERCOM_TOKEN" ] && [ -n "$session" ] || exit 0
    kind=$(printf '%s' "$input" | json_field notification_type)
    detail=$(printf '%s' "$input" | json_field message)
    [ -n "$detail" ] || detail=$(printf '%s' "$input" | json_field tool_name)
    curl -sf --max-time 3 -G "$INTERCOM_URL/api/hook" --data-urlencode "event=$event" --data-urlencode "session=$session" \
      --data-urlencode "client=$client" --data-urlencode "detail=$detail" --data-urlencode "kind=$kind" --data-urlencode "show=${INTERCOM_SHOW:-1}" \
      --data-urlencode "project=$(cat "$D/.project-$session" 2>/dev/null)" -H "Authorization: Bearer $INTERCOM_TOKEN" 2>/dev/null
    exit 0
    ;;
esac

# Fast paths (a few milliseconds, no network), using marker files kept by the local intercom server:
#  live/<key>    channel mode: messages are pushed into the session already, never poll.
#  watch/<key>   peek mode: the server is connected and creates pending/<key> when something arrives,
#                so only fetch when that flag exists.
if { [ "$event" = "UserPromptSubmit" ] || [ "$event" = "PostToolUse" ]; } && [ -n "$key" ] && [ "$key" != "s-" ]; then
  [ -f "$D/live/$key" ] && { [ -z "$input" ] && cat >/dev/null 2>&1; exit 0; }
  if [ -f "$D/watch/$key" ]; then
    [ -f "$D/pending/$key" ] || { [ -z "$input" ] && cat >/dev/null 2>&1; exit 0; }
    rm -f "$D/pending/$key" # cleared before fetching, so anything arriving meanwhile re-flags
    peek=1
  fi
fi

[ -f "$D/config" ] && . "$D/config"
if [ -z "$INTERCOM_URL" ] || [ -z "$INTERCOM_TOKEN" ]; then
  # Installed but no token yet: say so once per session, then stay quiet.
  if [ "$event" = "SessionStart" ]; then
    [ -z "$input" ] && cat >/dev/null 2>&1
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"The intercom plugin is installed but not set up yet. If the user asks about intercom, tell them to run in a terminal: curl -fsSL https://intercom.mhst.io/setup.sh | sh"}}'
  fi
  exit 0
fi

repo_name() {
  p=$(git -C "$workdir" remote get-url origin 2>/dev/null | sed -e 's#\.git$##' -e 's#.*[/:]##')
  [ -n "$p" ] || p=$(basename "$(git -C "$workdir" rev-parse --show-toplevel 2>/dev/null || echo "$workdir")")
  printf '%s' "$p"
}

# Deploy guard. Cheap local pre-filter first, so ordinary commands never touch the network.
if [ "$event" = "PreToolUse" ]; then
  [ -z "$input" ] && input=$(cat)
  [ "$INTERCOM_GUARD" = "0" ] && exit 0
  printf '%s' "$input" | grep -Eiq 'deploy|releas|rollout|rollback|migrat|publish|promote|helm|kubectl|flux|terraform|tofu|terragrunt|pulumi|wrangler|fly|vercel|netlify|kamal|heroku|ansible|argocd|gcloud|alembic|flyway|liquibase|prisma' || exit 0
  [ -n "$session" ] || session=$(printf '%s' "$input" | json_field session_id)
  project=$(cat "$D/.project-${session:-default}" 2>/dev/null)
  [ -n "$project" ] || project=$(repo_name)
  printf '%s' "$input" | curl -sf --max-time 3 -X POST "$INTERCOM_URL/api/guard?client=$client&show=${INTERCOM_SHOW:-1}&project=$(printf '%s' "$project" | sed 's/[^A-Za-z0-9._-]/-/g')" \
    -H "Authorization: Bearer $INTERCOM_TOKEN" -H "Content-Type: application/json" --data-binary @- 2>/dev/null
  exit 0
fi

if [ -z "$input" ]; then
  if [ -n "$session" ]; then cat >/dev/null 2>&1; else session=$(json_field session_id); fi
fi

# Where this session's transcript is, for the local server's activity mirroring (shown only to you).
if [ "$event" = "SessionStart" ] && [ -n "$session" ]; then
  [ -n "$session" ] || session=$(printf '%s' "$input" | json_field session_id)
  transcript=$(printf '%s' "$input" | json_field transcript_path)
  [ -n "$transcript" ] && mkdir -p "$D/transcripts" && printf '%s\n' "$transcript" > "$D/transcripts/$session"
elif [ "$event" = "SessionEnd" ] && [ -n "$session" ]; then
  rm -f "$D/transcripts/$session"
fi

# Codex starts the local MCP server without telling it the session; leave a note so it can find its session.
if [ "$client" = "codex" ] && [ -n "$session" ]; then
  if [ "$event" = "SessionEnd" ]; then
    rm -f "$D/codex-sessions/$session"
  elif [ "$event" = "SessionStart" ]; then
    mkdir -p "$D/codex-sessions" && printf '%s\n%s\n%s\n' "$PPID" "$workdir" "$(date +%s)" > "$D/codex-sessions/$session"
  fi
fi

# Blind mid-turn polling (no local server connected) is throttled so long runs don't hit the network per tool call.
if [ "$event" = "PostToolUse" ] && [ -z "$peek" ]; then
  stamp="$D/.last-poll-${session:-default}"
  now=$(date +%s)
  last=$(cat "$stamp" 2>/dev/null || echo 0)
  [ $((now - last)) -lt "${INTERCOM_POLL_SECONDS:-20}" ] && exit 0
  echo "$now" > "$stamp"
fi

# Keep a copy of brief.sh where the /intercom command (and Codex's $intercom skill) can find it.
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
  # owner/repo of a GitHub origin, so unlinked sessions can be pointed at projects open to its collaborators.
  remote=$(git -C "$workdir" remote get-url origin 2>/dev/null | sed -n -e 's#\.git$##' -e 's#.*github\.com[:/]\([^/]*/[^/]*\)$#\1#p')
  project=$(repo_name)
  [ -n "$session" ] && printf '%s' "$project" > "$pcache"
fi

branch=""
[ "$INTERCOM_SHARE_BRANCH" = "0" ] || branch=$(git -C "$workdir" branch --show-current 2>/dev/null)
# The machine, as teammates see it (INTERCOM_HOST_NAME nickname, or the short hostname; INTERCOM_SHARE_HOST=0: none).
host=""
[ "$INTERCOM_SHARE_HOST" = "0" ] || host="${INTERCOM_HOST_NAME:-$(hostname -s 2>/dev/null || hostname)}"
# A standing name for this agent's sessions (INTERCOM_CODEX_NAME / INTERCOM_CLAUDE_NAME / INTERCOM_NAME).
if [ "$client" = "codex" ]; then name="${INTERCOM_CODEX_NAME:-$INTERCOM_NAME}"; else name="${INTERCOM_CLAUDE_NAME:-$INTERCOM_NAME}"; fi

curl -sf --max-time 3 -G "$INTERCOM_URL/api/hook" \
  --data-urlencode "event=$event" --data-urlencode "project=$project" --data-urlencode "session=$session" \
  --data-urlencode "branch=$branch" --data-urlencode "remote=$remote" --data-urlencode "client=$client" --data-urlencode "name=$name" \
  --data-urlencode "show=${INTERCOM_SHOW:-1}" --data-urlencode "host=$host" \
  -H "Authorization: Bearer $INTERCOM_TOKEN" 2>/dev/null
exit 0
