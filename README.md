# Grandpa games

A library of simple card games for my grandfather on Windows. No ads and no account. The text is in French, and the cards and buttons are large.

The library is a website installed once as an app with Edge. It works offline. Each push to `main` publishes a new version. When he opens the app, his PC downloads it in the background and the library reloads with it a few seconds later. A game window keeps its version until it closes. His progress is saved on his PC.

## How it works

```
public/                  the site, served as static files
  index.html             the library: greeting, a note from me, one tile per game
  og.jpg                 the link preview image, drawn in scripts/og.html (node scripts/icons.mjs)
  <id>/index.html        one game per folder, at jeux-papi.fr/<id>/
  lib/store.js           saves for every game, in the browser of the PC, and the statistics
  lib/kit.css, kit.js    shared look and behaviour: top bar, "Jeux" button, message line, rules guide, dialogs
  lib/cards.css, cards.js  playing cards: French names, suits, pips, court cards, back
  sw.js                  offline copy and quiet updates
  message.json           the note on the library screen ("text": "" hides it)
  admin/                 the admin dashboard, behind the ADMIN_TOKEN password
src/worker.ts            the statistics and error API, a Cloudflare Worker with a D1 database
src/admin.ts             the admin API, behind the ADMIN_TOKEN secret
src/util.ts              helpers shared by the two
migrations/              the database tables
```

## Add a game

1. Make `public/<id>/index.html` like the solitaire: link `../lib/kit.css` (and `../lib/cards.css` for a card game), write the top bar, the message line, the table and the rules pages, then load `../lib/store.js`, `../lib/cards.js` and `../lib/kit.js` before the game's own script. The top of `lib/kit.js` shows the markup.
2. The kit adds the "Jeux" button, the button icons (`data-icon="undo"`, `bulb`, `help`, `close`), the rules guide frame and the dialog. Use `Kit.say`, `Kit.dialog`, `Kit.openHelp` and `Kit.escape`.
3. Save with `GG.save('<id>', data, { summary })` and read with `GG.load('<id>')`. `summary` is the line on the tile, for example "Partie en cours · 3 victoires".
4. Give the game its own browser tab icon: `public/<id>/icon.svg`, linked with `<link rel="icon" href="icon.svg">`.
5. Add the game to `GAMES` in `public/index.html` and in `src/worker.ts`, its folder and icon to `CORE` in `public/sw.js`, and its address to `public/sitemap.xml`. Copy the description, canonical and `og:` tags from the solitaire page.
6. Count its games with `GG.track('<id>', 'start')` when a game begins and `GG.track('<id>', 'won')` when it is won.
7. Give the game its own look. Each game has its own felt colour: set `--felt-top`, `--felt`, `--shade` and `--accent` on `:root` in the game page, and the same felt in `GAMES`. Give its tile a different picture of cards. The solitaire is green with a fan of three cards. FreeCell is blue with four aces in a row.

When a game changes its save format, it must still read the old format. His saves are never deleted.

## Games

- `public/solitaire/`: draw-one Klondike.
  - A solver deals only games that it has won.
  - Click a card. With one legal place, it goes there at once. With several, click one of the places framed in yellow. Dragging also works.
  - The game says where the card went, and the card keeps a yellow outline for 1 s.
  - A double-click counts as one click.
  - A wrong place keeps the card chosen and says why in one sentence.
  - "Règles" opens a three-page guide to the rules and the controls. It also opens by itself the first time the game is opened. A "Fermer" button closes it from every page.
  - Labels name the pioche, the défausse and the foundations ("Rangement").
  - "Quel coup jouer ?" shows the next move of a winning plan as a sentence. Click the framed place or the ringed card.
  - Safe cards go to the foundations by themselves, one every 0.45 s. Once every card is face up, the game finishes itself at one card every 0.14 s.
  - The stock shows how many cards are left.
  - The suits, pips and court cards are inline SVG drawn for this game. They do not depend on a font.
  - "Annuler" goes back to the start of the game, also after the game is closed and opened again. If the browser storage fills up, the oldest steps are dropped.
  - The game saves after each move.
  - The card size depends only on the window, so the board does not move during a game.

- `public/freecell/`: FreeCell, with four free cells and eight columns.
  - All the cards are face up from the start. The solver in `solver.js` deals only games that it has won.
  - The clicks, drag, hint, undo, automatic cards, saves and statistics work as in the solitaire.
  - The empty free cells count as one place, and so do the empty columns. So a card that fits nowhere else goes to a free cell with one click. The game frames only the first empty free cell and the first empty column, but a click or a drop on another one also works.
  - A run of cards moves in one go when there is room: one card more per empty free cell, doubled by each empty column. When the run is too long, the message line gives the number of cards that can move.

The design and the research behind it are in `docs/design.md`.

## Saves

- Everyone plays freely, with no account and no approval. Each game saves in the browser of the PC (localStorage) and never leaves it.
- The library asks Edge to keep this data when the disk is full. Clearing the browser data for jeux-papi.fr deletes the saves.
- A game open in two windows saves only from the window that saved last. The other window refuses to save and asks to reload, so it cannot write an older game over a newer one.

## Admin page

https://jeux-papi.fr/admin/ is the overview dashboard:

- the number of players since the start;
- the players today, over 7 days and new over 7 days, and the games over 7 days, each with the change from the day or week before;
- a chart of the players and the games started each day, over 7, 30 or 90 days, with the numbers of a day on hover;
- each game, with its games over 7 days and in total, and its win rate;
- the JavaScript errors, grouped by message, with how often, on how many PCs, the page, the stack and the browser.

A player is a PC, or a browser, that opened the site. Each PC makes a random id at its first start and sends it with a visit once a day, a game started, a game won and its errors (20 a day at most, 2,000 kept). For players, the server stores no name, no IP address and no save. Visits are kept 90 days, and the daily counts of games are kept for good. The Worker (`src/worker.ts`) accepts only these numbers, for the games listed in its `GAMES`.

The password is the `ADMIN_TOKEN` Worker secret. Use a long random password. To change it, run `bunx wrangler secret put ADMIN_TOKEN`. After 10 wrong passwords from one network in 15 minutes, the admin API refuses that network until the oldest try is 15 minutes old.

## Install on his PC

1. Open the site in Edge: https://jeux-papi.fr
2. Select "Installer sur cet ordinateur" at the bottom of the library, or in the Edge menu select "Applications", then "Installer ce site en tant qu'application".

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

`tests/library.mjs` starts a local Worker with a fresh database and covers the library, saves on the PC, offline use, updates, the statistics and the admin page. `tests/play.mjs` covers moves, drag and drop, hints, undo and the layout. `tests/dialogs.mjs` covers the rules guide, the labels, saving across a reload, the stuck dialog and the win. Each test prints PASS or FAIL per check and ends with `ALL PASSED`. Screenshots go to `tests/screenshots/`.

## Planned

- Dame de pique (Hearts) against 3 computer players.
