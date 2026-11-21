#!/usr/bin/env bash
# Put back an older version of a save. It counts as a save from another PC, so every PC takes it.
#   bun run history K7FQ2M solitaire     lists the saved versions with their ids
#   bun run restore 42                   makes version 42 the newest save; the PC takes it at its next start
set -euo pipefail
id="${1:-}"
[[ $id =~ ^[0-9]+$ ]] || { echo "usage: bun run restore <history id>" >&2; exit 2; }
bunx wrangler d1 execute grandpa-games --remote --command \
  "INSERT INTO saves (player, game, updated_at, data, summary)
     SELECT player, game, CAST(strftime('%s','now') AS INTEGER) * 1000, data, '' FROM history WHERE id = $id
   ON CONFLICT (player, game) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data, summary = '',
     device = NULL, rev = saves.rev + 1;"
