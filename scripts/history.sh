#!/usr/bin/env bash
# List the saved versions of one game for one player: bun run history <player code> <game>
set -euo pipefail
p=$(echo "${1:-}" | tr 'a-z' 'A-Z'); g="${2:-}"
[[ $p =~ ^[A-Z2-9]{6}$ && $g =~ ^[a-z0-9-]{1,40}$ ]] || { echo "usage: bun run history <player code> <game>" >&2; exit 2; }
bunx wrangler d1 execute grandpa-games --remote --command \
  "SELECT id, datetime(updated_at/1000, 'unixepoch', 'localtime') AS saved, length(data) AS bytes FROM history WHERE player = '$p' AND game = '$g' ORDER BY id DESC;"
