# Grandpa games

A library of simple card games for my grandfather on Windows. No ads and no account. The text is in French, and the cards and buttons are large.

The library is a website installed once as an app with Edge. It works offline. Each push to `main` publishes a new version. His PC downloads it in the background and starts it after the app window is closed, never during a game. His progress is saved on his PC and backed up to the server.

## How it works

```
public/                  the site, served as static files
  index.html             the library: greeting, a note from me, one tile per game
  games/<id>/index.html  one game per folder
  lib/store.js           saves for every game (on the PC, then backed up), and error reports
  lib/kit.css, kit.js    shared look and behaviour: top bar, "Jeux" button, message line, rules guide, dialogs
  lib/cards.css, cards.js  playing cards: French names, suits, pips, court cards, back
  admin/                 the admin page, behind the ADMIN_TOKEN password
  sw.js                  offline copy and quiet updates
  message.json           the note on the library screen ("text": "" hides it)
src/worker.ts            the backup and error API, a Cloudflare Worker with a D1 database
src/admin.ts             the admin API, behind the ADMIN_TOKEN secret
migrations/              the database tables
```

## Add a game

1. Make `public/games/<id>/index.html` like the solitaire: link `../../lib/kit.css` (and `../../lib/cards.css` for a card game), write the top bar, the message line, the table and the rules pages, then load `../../lib/store.js`, `../../lib/cards.js` and `../../lib/kit.js` before the game's own script. The top of `lib/kit.js` shows the markup.
2. The kit adds the "Jeux" button, the button icons (`data-icon="undo"`, `bulb`, `help`, `close`), the rules guide frame and the dialog. Use `Kit.say`, `Kit.dialog`, `Kit.openHelp` and `Kit.escape`.
3. Save with `GG.save('<id>', data, { cloud, summary })` and read with `GG.load('<id>')`. Keep `cloud` under 100 KB. `summary` is the line on the tile, for example "Partie en cours · 3 victoires".
4. Add the game to `GAMES` in `public/index.html`, and its folder to `CORE` in `public/sw.js`.

When a game changes its save format, it must still read the old format. His saves are never deleted.

## Games

- `public/games/solitaire/`: draw-one Klondike.
  - A solver deals only games that it has won.
  - Click a card. With one legal place, it goes there at once. With several, click one of the places framed in yellow. Dragging also works.
  - The game says where the card went, and the card keeps a yellow outline for 1 s.
  - A double-click counts as one click.
  - A wrong place keeps the card chosen and says why in one sentence.
  - "Règles" opens a three-page guide to the rules and the controls. It also opens by itself the first time the game is opened. A "Fermer" button closes it from every page.
  - Labels name the pioche, the défausse and the foundations ("Rangement").
  - "Montrez-moi un coup" shows the next move of a winning plan as a sentence. Click the framed place or the ringed card.
  - Safe cards go to the foundations by themselves, one every 0.45 s. Once every card is face up, the game finishes itself at one card every 0.14 s.
  - The stock shows how many cards are left.
  - The suits, pips and court cards are inline SVG drawn for this game. They do not depend on a font.
  - "Annuler" goes back to the start of the game, also after the game is closed and opened again. If the browser storage fills up, the oldest steps are dropped.
  - The game saves after each move.
  - The card size depends only on the window, so the board does not move during a game.

The design and the research behind it are in `docs/design.md`.

## Saves and the backup

- Each PC creates a random id at the first start. The library shows its first 6 letters as "Code de cet ordinateur".
- A PC backs up its saves only after you approve it. Until then, it plays normally and keeps its saves on the PC. Strangers who find the address cannot write to the database.
- The server keeps the newest save of each game and up to 30 older versions, at most one per hour.
- The first time a PC is approved, it takes the server copy. So a new PC gets the old PC's progress, even if someone played on it before the approval.

### Admin page

https://jeux-papi.fr/admin/ shows:

- the PCs, with their name, code, approval and last visit. Approve a PC there, alone or with the saves of another PC, and rename or remove it.
- the saved games of each player and when they were last saved.
- the JavaScript errors of approved PCs, with the page, the stack and the app version. Every page reports its errors through `lib/store.js`: 5 per page at most, 50 per PC per day, 2,000 kept.

The password is the `ADMIN_TOKEN` Worker secret. Use a long random password. To change it, run `bunx wrangler secret put ADMIN_TOKEN`.

The same actions also exist as commands:

| Command | What it does |
| --- | --- |
| `bun run devices` | Lists the PCs, their code, approval and last visit |
| `bun run approve K7FQ2M` | Approves this PC with its own saves |
| `bun run approve K7FQ2M ABC123` | Approves a new PC and gives it the saves of the PC with code ABC123 |
| `bun run history <player code> <game>` | Lists the saved versions |
| `bun run restore <id>` | Makes an old version the newest. The PC takes it at its next start |

D1 also keeps 30 days of database history ("Time Travel"): `bunx wrangler d1 time-travel restore grandpa-games --timestamp <time>` puts the whole database back to that time.

## Install on his PC

1. Open the site in Edge: https://jeux-papi.fr
2. Select "Installer sur cet ordinateur" at the bottom of the library, or in the Edge menu select "Applications", then "Installer ce site en tant qu'application".
3. Read the code at the bottom of the library, then approve the PC on the admin page.

Windows Quick Assist is the easiest way to do this with him on the phone.

## Publish

- The site lives at https://jeux-papi.fr only. `www.jeux-papi.fr` redirects there (a redirect rule on the zone), and the workers.dev address is off, because saves on a PC belong to one exact address.
- Each push to `main` runs `.github/workflows/deploy.yml`: typecheck, database migrations, deploy. "Run workflow" in the Actions tab deploys `main` again.
- The workflow uses the `CLOUDFLARE_API_TOKEN` repository secret: the Cloudflare account token "grandpa-games GitHub deploy". It can edit Workers and D1 on the account, and routes, DNS and certificates on `jeux-papi.fr` only. To replace it, create a new account token with the same permissions under Manage Account, then Account API Tokens, and run `gh secret set CLOUDFLARE_API_TOKEN`.
- `bun run deploy` does the same from a terminal logged in with `wrangler login`.

## Tests

The tests play the game in a real browser with the mouse. They are only for development: the game itself still needs nothing.

1. Run `bun install`.
2. If Playwright has no browser yet, run `bunx playwright install chromium`.
3. Run `bun run test`.

`tests/library.mjs` starts a local Worker with a fresh database and covers the library, approval, the backup, restoring on a new PC, offline use, refused writes, error reports and the admin page. `tests/play.mjs` covers moves, drag and drop, hints, undo and the layout. `tests/dialogs.mjs` covers the rules guide, the labels, saving across a reload, the stuck dialog and the win. Each test prints PASS or FAIL per check and ends with `ALL PASSED`. Screenshots go to `tests/screenshots/`.

## Planned

- Dame de pique (Hearts) against 3 computer players.
