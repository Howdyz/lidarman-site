#!/usr/bin/env bash
# Ping IndexNow so Bing (and DuckDuckGo, and the AI search products that use
# Bing's index) re-crawls changed pages in minutes instead of waiting weeks.
#
# Ownership is proved by c6a0153f25c2838da2ed5c9c4af370e1.txt sitting at the site root.
# That file IS the credential — if it is ever deleted or the key changes,
# submissions start returning 403 and nothing else will say why.
#
# Usage:
#   ./submit-indexnow.sh                 # submit every page in sitemap.xml
#   ./submit-indexnow.sh path.html ...   # submit specific pages
#
# Response codes worth knowing: 200 accepted, 202 accepted with key validation
# still pending, 403 key not found or wrong, 422 URL not on this host,
# 429 submitting too often.
set -euo pipefail

KEY="c6a0153f25c2838da2ed5c9c4af370e1"
HOST="lidarman.com"
ENDPOINT="https://api.indexnow.org/indexnow"

if [ $# -gt 0 ]; then
  URLS=()
  for p in "$@"; do URLS+=("https://$HOST/${p#/}"); done
else
  # Straight from the sitemap, so this never drifts from what is published.
  mapfile -t URLS < <(grep -oE '<loc>[^<]+</loc>' sitemap.xml | sed 's|</\?loc>||g')
fi

echo "Submitting ${#URLS[@]} URL(s) to IndexNow…"
printf '  %s\n' "${URLS[@]}"

BODY=$(python3 -c "
import json, sys
print(json.dumps({
  'host': '$HOST',
  'key': '$KEY',
  'keyLocation': 'https://$HOST/$KEY.txt',
  'urlList': sys.argv[1:],
}))" "${URLS[@]}")

CODE=$(curl -s -o /tmp/indexnow_response.txt -w '%{http_code}' \
  -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data "$BODY")

echo "HTTP $CODE"
case "$CODE" in
  200) echo "  accepted" ;;
  202) echo "  accepted — key validation still pending (normal on a first submit)" ;;
  403) echo "  KEY REJECTED — check https://$HOST/$KEY.txt is live and contains exactly the key" ;;
  422) echo "  URL/host mismatch — every URL must be on $HOST" ;;
  429) echo "  rate limited — submitting too often" ;;
  *)   echo "  unexpected; body follows"; cat /tmp/indexnow_response.txt ;;
esac
