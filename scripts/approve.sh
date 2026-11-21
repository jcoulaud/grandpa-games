#!/usr/bin/env bash
# Approve a PC for the cloud backup.
#   bun run approve K7FQ2M              this PC starts its own saves
#   bun run approve K7FQ2M ABC123       this PC takes the saves of the PC with code ABC123 (a new PC)
set -euo pipefail
code=$(echo "${1:-}" | tr 'a-z' 'A-Z' | tr -d ' ')
player=$(echo "${2:-$code}" | tr 'a-z' 'A-Z' | tr -d ' ')
[[ $code =~ ^[A-Z2-9]{6}$ && $player =~ ^[A-Z2-9]{6}$ ]] || { echo "usage: bun run approve <code> [<code of the old PC>]" >&2; exit 2; }
if [[ $player != "$code" ]]; then
  found=$(bunx wrangler d1 execute grandpa-games --remote --json --command \
    "SELECT COUNT(*) AS n FROM devices WHERE code = '$player' AND approved = 1 AND player IS NOT NULL" | grep -o '"n": *[0-9]*' | grep -o '[0-9]*$')
  [[ $found == 1 ]] || { echo "No approved PC has the code $player. Run: bun run devices" >&2; exit 1; }
  # A new PC joins an existing player: use that PC's player name.
  player="(SELECT player FROM devices WHERE code = '$player' AND approved = 1)"
else
  # Approved again: keep the player it had, so its saves stay together.
  player="COALESCE(player, '$code')"
fi
bunx wrangler d1 execute grandpa-games --remote --command \
  "UPDATE devices SET approved = 1, player = $player WHERE code = '$code'; SELECT code, player, approved FROM devices WHERE code = '$code';"
