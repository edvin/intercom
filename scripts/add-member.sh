#!/bin/sh
# Add (or re-issue a token for) a team member.  Usage: scripts/add-member.sh <name>
# Needs INTERCOM_ADMIN_TOKEN (or a .admin-token file). INTERCOM_URL defaults to production.
set -e
cd "$(dirname "$0")/.."
NAME="$1"
echo "$NAME" | grep -Eq '^[a-z][a-z0-9_-]{0,31}$' || { echo "usage: $0 <name>   (lowercase letters/digits/-/_)" >&2; exit 1; }
URL="${INTERCOM_URL:-https://intercom.mhst.io}"
ADMIN="${INTERCOM_ADMIN_TOKEN:-$(cat .admin-token 2>/dev/null)}"
[ -n "$ADMIN" ] || { echo "Set INTERCOM_ADMIN_TOKEN or create .admin-token" >&2; exit 1; }
TOKEN=$(openssl rand -hex 24)
HASH=$(printf %s "$TOKEN" | shasum -a 256 | cut -d' ' -f1)
curl -sf "$URL/admin/members" -H "Authorization: Bearer $ADMIN" -H 'content-type: application/json' \
  -d "{\"name\":\"$NAME\",\"token_hash\":\"$HASH\"}" >/dev/null || { echo "Admin API call failed" >&2; exit 1; }
cat <<MSG

Member "$NAME" ready. Send them this privately (the token is shown only once):

  Token:     $TOKEN
  Install:   curl -fsSL $URL/install.sh | sh        (paste the token when asked)
  Dashboard: $URL/login#t=$TOKEN
MSG
