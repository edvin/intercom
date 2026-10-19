#!/bin/sh
# Revoke a member's access (their message history is kept).  Usage: scripts/remove-member.sh <name>
set -e
cd "$(dirname "$0")/.."
echo "$1" | grep -Eq '^[a-z][a-z0-9_-]{0,31}$' || { echo "usage: $0 <name>" >&2; exit 1; }
URL="${INTERCOM_URL:-https://intercom.mhst.io}"
ADMIN="${INTERCOM_ADMIN_TOKEN:-$(cat .admin-token 2>/dev/null)}"
curl -sf "$URL/admin/members/remove" -H "Authorization: Bearer $ADMIN" -H 'content-type: application/json' -d "{\"name\":\"$1\"}" >/dev/null
echo "Removed $1."
