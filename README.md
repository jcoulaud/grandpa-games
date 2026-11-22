# Grandpa games

A library of simple card games for my grandfather on Windows. No ads and no account. The text is in French, and the cards and buttons are large.

The library is a website installed once as an app with Edge. It works offline. Each push to `main` publishes a new version. When he opens the app, his PC downloads it in the background and the library reloads with it a few seconds later. A game window keeps its version until it closes. His progress is saved on his PC.

## How it works

```
public/                  the site, served as static files
  index.html             the library: clock and one tile per game
  og.jpg                 the link preview image, drawn in scripts/og.html (node scripts/icons.mjs)
  <id>/index.html        one game per folder, at jeux-papi.fr/<id>/
  lib/store.js           saves for every game, in the browser of the PC, and the statistics
  lib/kit.css, kit.js    shared look and behaviour: top bar, "Jeux" button, message line, rules guide, dialogs
  lib/zoom.js            the size buttons, "Réduire" and "Agrandir", on the library and in every game
  lib/cards.css, cards.js  playing cards: French names, suits, pips, court cards, back
  sw.js                  offline copy and quiet updates
  admin/                 the admin dashboard, behind the ADMIN_TOKEN password
src/worker.ts            the statistics and error API, a Cloudflare Worker with a D1 database
src/admin.ts             the admin API, behind the ADMIN_TOKEN secret
src/util.ts              helpers shared by the two
migrations/              the database tables
```

## Add a game

1. Make `public/<id>/index.html` like the solitaire: link `../lib/kit.css` (and `../lib/cards.css` for a card game), write the top bar, the message line, the table and the rules pages, then load `../lib/store.js`, `../lib/cards.js` and `../lib/kit.js` before the game's own script. Load `../lib/zoom.js` in the `<head>`, and divide any mouse position inside the table by `Zoom.z()`. The top of `lib/kit.js` shows the markup.
2. The kit adds the "Jeux" button, the button icons (`data-icon="undo"`, `bulb`, `help`, `close`), the rules guide frame and the dialog. Use `Kit.say`, `Kit.dialog`, `Kit.openHelp` and `Kit.escape`.
3. Save with `GG.save('<id>', data, { summary })` and read with `GG.load('<id>')`. `summary` is the line on the tile, for example "Partie en cours · 3 victoires".
4. Give the game its own browser tab icon: `public/<id>/icon.svg`, linked with `<link rel="icon" href="icon.svg">`.
5. Add the game to `GAMES` in `public/index.html` and in `src/worker.ts`, its folder and icon to `CORE` in `public/sw.js`, and its address to `public/sitemap.xml`. Copy the description, canonical and `og:` tags from the solitaire page.
6. Count its games with `GG.track('<id>', 'start')` when a game begins and `GG.track('<id>', 'won')` when it is won.
7. Give the game its own look. Each game has its own felt colour: set `--felt-top`, `--felt`, `--shade` and `--accent` on `:root` in the game page, and the same felt in `GAMES`. Give its tile a different picture of cards. The solitaire is green with a fan of three cards. FreeCell is blue with four aces in a row. The dame de pique is plum, with the queen of spades in front of two hearts. The démineur is brown earth, with an island of turf blocks seen from above. The yams is terracotta, with five dice rolling in. The bataille navale is the only scene seen from the side: a warship in profile on the waves, a column of water where a shot fell, and a ship on fire on the horizon.
8. Give the game three levels: Facile, Moyen and Difficile. Open the choice with `Kit.chooseLevel(level, playing, newGame)` at "Nouvelle partie", and show the level under the name with `Kit.showLevel(level)`. Save the level with the game. A save without a known level still loads, with a default level. Each level must be harder than the one below, and a test must prove it: for example, a computer that beats the level below, or deals that take the solver more steps.

When a game changes its save format, it must still read the old format. His saves are never deleted.

## Games

- `public/solitaire/`: draw-one Klondike.
  - A solver deals only games that it has won. The level is how many steps the solver needed: at most 40 for Facile, 55 to 85 for Moyen, 180 to 2500 for Difficile.
  - Click a card. With one legal place, it goes there at once. With several, click one of the places framed in yellow. Dragging also works.
  - The game says where the card went, and the card keeps a yellow outline for 1 s.
  - A double-click counts as one click.
  - A wrong place keeps the card chosen and says why in one sentence.
  - "Règles" opens a three-page guide to the rules and the controls. It also opens by itself the first time the game is opened. A "Fermer" button closes it from every page.
  - Labels name the pioche, the défausse and the foundations ("Rangement").
  - "Aide" shows the next move of a winning plan as a sentence. Click the framed place or the ringed card.
  - Safe cards go to the foundations by themselves, one every 0.45 s. Once every card is face up, the game finishes itself at one card every 0.14 s.
  - The stock shows how many cards are left.
  - The suits, pips and court cards are inline SVG drawn for this game. They do not depend on a font.
  - "Annuler" goes back to the start of the game, also after the game is closed and opened again. If the browser storage fills up, the oldest steps are dropped.
  - The game saves after each move.
  - The card size depends only on the window, so the board does not move during a game.

- `public/freecell/`: FreeCell, with four free cells and eight columns.
  - All the cards are face up from the start. The solver in `solver.js` deals only games that it has won. The level is how many steps it needed: at most 65 for Facile, 120 to 300 for Moyen, 650 to 2500 for Difficile.
  - The clicks, drag, hint, undo, automatic cards, saves and statistics work as in the solitaire.
  - The empty free cells count as one place, and so do the empty columns. So a card that fits nowhere else goes to a free cell with one click. The game frames only the first empty free cell and the first empty column, but a click or a drop on another one also works.
  - A run of cards moves in one go when there is room: one card more per empty free cell, doubled by each empty column. When the run is too long, the message line gives the number of cards that can move.

- `public/dames/`: the jeu de dames on the 10x10 board, against the computer, with the FMJD rules.
  - `engine.js` holds the rules and the computer. It has no DOM, so the page, a Web Worker and the tests all run the same code. The worker is made from the engine's own source in a Blob, so it also starts offline and from a file.
  - Taking is compulsory, and the player must take the most pieces. Kings fly. A man that passes over the last row during a capture and goes on stays a man.
  - Click a piece, then a square framed in yellow. During a capture, click each landing square. The pieces taken are crossed out and leave the board at the end of the move. When several routes take the same pieces, every route is allowed.
  - A refused click keeps the piece chosen and says why in one sentence.
  - The computer has three levels, chosen at "Nouvelle partie": Facile (2 plies, sometimes a slightly weaker move), Moyen (6 plies, 0.6 s) and Difficile (1.5 s). Its move is saved before it is shown, then shown one landing at a time.
  - "Annuler le dernier coup" takes back his move and the computer's answer, also while the computer thinks. During a capture, it takes back the landings clicked so far.
  - The game is drawn after the same position three times, after 25 king moves each without a capture or a man move, and at the end of the FMJD limits for endings with few pieces. The side column says how many moves are left.
  - A capture half done is saved too, so it comes back after the window is closed.

- `public/dame-de-pique/`: the dame de pique (Hearts), against three computer players: Jeanne on the left, Paul across and Louise on the right.
  - `engine.js` holds the rules and the computer players. It has no DOM, so the page and the tests run the same code.
  - Each hand starts with a pass of 3 cards: to the left, to the right, across, then none. The holder of the 2 of clubs leads. Players follow suit. The first trick takes no point card unless a hand holds nothing else. Hearts cannot lead until a heart has been played, unless the hand holds only hearts. The queen of spades does not break hearts.
  - Each heart is 1 point and the queen of spades 13. A player who takes all 26 scores 0, and each other player 26. The game ends after a hand in which a score reaches 100. The lowest score wins, and players tied for it share the win, as in the French rules and in Windows.
  - One click on a card plays it. The cards he cannot play now are darker, and a click on one says why in one sentence, in a bubble just above the card and in the message line.
  - On his turn, his place in the trick is a dashed "À vous" card, and his seat above his hand says "À vous de jouer". The first card of each trick has a "1er" tag.
  - A small "D♠" card sits by the name of the player who took the queen of spades. The score column says where she is and whether hearts are open. To pass, he clicks 3 cards, then the button. The cards received carry a "Reçue" tag until he plays.
  - The computer players know only their own cards, the cards played, the voids shown and the cards they passed. Facile plays simple rules with some chance. Moyen plays careful rules: it ducks, chases the queen of spades with low spades and stops a moon. Difficile tries each card on 40 deals of the unseen cards that fit what it knows, plays each deal to the end with the Moyen rules, and keeps the card that costs it the fewest points. Each fitting deal is equally likely.
  - The same position always gets the same answer, so undo followed by the same card replays the same game.
  - "Annuler le dernier coup" takes back his last card and the cards played after it, within the hand, until "Manche suivante". During the pass, it takes back the last card chosen.
  - The score sheet at the end of a hand stays on the table until "Manche suivante", also after a reload. The scores and the last trick are in the right column. A narrow window shows each total next to each player instead, his own in his seat above his hand.

- `public/demineur/`: the démineur (Minesweeper). Facile is 9 by 9 with 10 mines, Moyen 14 by 10 with 22, Difficile 20 by 10 with 36, so the squares stay about 47 px on his laptop.
  - `engine.js` holds the rules, the board maker and the hint. It has no DOM, so the page and the tests run the same code.
  - The mines are placed at the first click. The first square and its neighbours hold no mine. A board is kept only if the hint's own reasoning clears it from the first square, so no game needs a guess. The reasoning uses one number at a time, the total of mines, and on Moyen and Difficile two numbers whose closed squares overlap. A board takes under 5 ms.
  - The board is a function of a seed saved with the game and of the first square: after an undo of the first click, the same square gives the same board.
  - A left click opens a square. The right click, or the "Drapeau" button followed by one click, puts a flag. A left click on a flag takes it off. A click on a number that touches as many flags as its value opens the squares around it.
  - "Aide" frames a wrong flag first. Otherwise it frames the squares that follow from the numbers, rings the numbers it used, and says why in one sentence.
  - A mine shows only the mine that went off, and the dialog offers "Annuler le dernier coup" first. No timer.
  - A phone turns a wide board a quarter and scrolls down to the rest of it.

- `public/bataille-navale/`: the bataille navale (Battleship), against the computer, on two seas of 10 by 10 squares.
  - `engine.js` holds the rules, the computer and the hint, and `ships.js` the pictures of the ships, the fire and the splash. Neither has a DOM, so the page and the tests run the same code.
  - Each side has a porte-avions of 5 squares, a croiseur of 4, a contre-torpilleur and a sous-marin of 3, and a torpilleur of 2. The ships are placed at random and never touch, not even by a corner. Before his first shot, "Changer mes bateaux" places his ships again.
  - His sea is on the left with his ships, the computer's sea on the right. A list of the ships, crossed out once sunk, stands beside each sea, and a key under the computer's sea shows the marks: a splash for "à l'eau", fire for "touché", a pale square for "vide".
  - One click on the computer's sea fires. The players take turns, one shot each, also after a hit. A yellow sign says whose turn it is, and the sea he fires on is framed in yellow. The last shot on each sea has a yellow ring.
  - A sunk ship comes up dark on the sea, and the squares around it turn pale: no ship can be there. A click on such a square, on a square already fired or on his own sea is refused, with the reason.
  - The computer knows only its own shots and the ships it sank. Facile fires at random, half the time beside a hit. Moyen finishes each ship hit along its line and searches one colour of a chessboard. Difficile fires where the ships still afloat fit in the most ways. On 300 games each, they need about 68, 45 and 39 shots.
  - The computer's shot depends only on the game, so a reload during its turn gives the same shot.
  - "Aide" frames the square where the computer's ships afloat fit in the most ways, rings the hits it follows, and says why in one sentence.
  - A save read back is checked whole: straight ships that do not touch, shots that match the ships, the turn and the result. A broken save starts a new game.
  - A phone puts the computer's sea on top and scrolls down to his own.

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

`tests/library.mjs` starts a local Worker with a fresh database and covers the library, saves on the PC, offline use, updates, the statistics and the admin page. `tests/play.mjs` covers moves, drag and drop, hints, undo and the layout. `tests/dialogs.mjs` covers the rules guide, the labels, saving across a reload, the stuck dialog and the win. `tests/dames-rules.mjs` checks the rules engine in Node: the published opening move counts, every tricky capture from the FMJD rules, the draw rules and the computer. `tests/dames.mjs` plays the dames with the mouse: captures step by step, refusals, undo, hint, drag, reloads, the win, the loss and the levels. `tests/dame-de-pique-rules.mjs` checks the rules of the dame de pique in Node, the moon, the end of the game, the deals the computer imagines, and that each level beats the one below. `tests/dame-de-pique.mjs` plays the dame de pique with the mouse: the pass, refusals, undo, hint, reloads, the score sheet, the moon, the win and the layout. `tests/demineur-rules.mjs` checks the démineur in Node: the boards, opening, flags, the reasoning, and that following the hint wins every game. `tests/demineur.mjs` plays the démineur with the mouse: flags, refusals, a mine and its undo, the hint to a win, reloads and the sizes. `tests/bataille-navale-rules.mjs` checks the bataille navale in Node: the fleets, the shots, the computer at each level, that it does not see his ships, the hint, and the check of a save. `tests/bataille-navale.mjs` plays it with the mouse: refusals, the computer's answer, a sunk ship, the hint, a reload during the computer's turn, a failed save, the win, the loss and a phone. `tests/stale.mjs` checks, in every game, that a window that is behind counts no game started and no win. `tests/zoom.mjs` checks the size buttons, and that a click or a drag at a larger size still lands on the right card, piece or square. `tests/layout.mjs` draws every screen of the library and the games in two fonts and seven window sizes, two of them enlarged with the size buttons,, and checks that nothing is cut, too small, past the side of the window or on top of a button (see the top of the file for the rules). The fonts are in `tests/fonts/`: Selawik has the metrics of Segoe UI, the font of his PC, and DejaVu Sans is much wider, so the result is the same on any machine. Each test prints PASS or FAIL per check and ends with `ALL PASSED`. Screenshots go to `tests/screenshots/`.

- `public/yams/`: the yams, five dice against one computer player.
  - `engine.js` holds the rules, the computer players and the hint. It has no DOM, so the page and the tests run the same code.
  - Each turn has up to three throws. A click on a die keeps it for the next throw, and a second click puts it back. A click on a box of his column writes the dice there: each empty box shows the points it would get. A box can be crossed out for 0.
  - The boxes are the French ones: As to Six, a bonus of 35 at 63 points in the top half, Brelan and Carré (the total of the three or four dice alike), Full 25, Petite suite 30, Grande suite 40, Yams 50 and Chance. A yams is not a full.
  - He always starts. When both sheets are full, the larger total wins; a tie is a shared win, counted as a win.
  - Each player throws from their own seeded stream of numbers. An undo of a box gives the computer the same turn again, and draws his next throws again, so an undo cannot show him what a throw would give.
  - The computer's turn is shown one step at a time, then saved. It depends only on the saved game, so a reload during it plays the same turn again. "Annuler le dernier coup" takes back his last box and the computer's turn after it, also while that turn is shown; a win is counted only once its last box has been shown.
  - Facile keeps the face it has most of, or four in a row, and writes the best points now, but one time in four another box that scores. Moyen looks one throw ahead. Difficile plans its two throws exactly over the 252 hands of five dice, values each box by what it gives up and by the bonus, and on its last box plays to win the game rather than for points. The hint uses Difficile. In the tests, the levels average 167, 213 and 228 points.
