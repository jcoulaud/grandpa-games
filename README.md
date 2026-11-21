# Grandpa games

Simple card games for my grandfather on Windows. No ads, no account, no internet, no installation.

Each game is one self-contained HTML file. The text is in French, and the cards and buttons are large.

## Games

- `solitaire.html`: draw-one Klondike.
  - A solver deals only games that it has won.
  - Click a card. With one legal place, it goes there at once. With several, click one of the places framed in yellow. Dragging also works.
  - The game says where the card went, and the card keeps a yellow outline for 1 s.
  - A double-click counts as one click.
  - A wrong place keeps the card chosen and says why in one sentence.
  - "Règles" opens a three-page guide to the rules and the controls. It also opens by itself the first time the game is opened. A "Fermer" button closes it from every page.
  - Labels name the pioche, the défausse and the foundations ("Rangement").
  - "Voir un coup" shows the next move of a winning plan as a sentence. Click the framed place or the ringed card.
  - Safe cards go to the foundations by themselves, one every 0.45 s. Once every card is face up, the game finishes itself at one card every 0.14 s.
  - The stock shows how many cards are left.
  - The suits, pips and court cards are inline SVG drawn for this game. They do not depend on a font.
  - "Annuler" goes back to the start of the game, also after the game is closed and opened again. If the browser storage fills up, the oldest steps are dropped.
  - The game saves after each move.
  - The card size depends only on the window, so the board does not move during a game.

The design and the research behind it are in `docs/design.md`.

## Install on Windows

1. Copy the HTML file to the PC.
2. Open it in Edge.
3. In the Edge menu, select "Applications", then "Installer ce site en tant qu'application". The game gets its own window and a Start menu icon.

## Tests

The tests play the game in a real browser with the mouse. They are only for development: the game itself still needs nothing.

1. Run `bun install`.
2. If Playwright has no browser yet, run `bunx playwright install chromium`.
3. Run `bun run test`.

`tests/play.mjs` covers moves, drag and drop, hints, undo and the layout. `tests/dialogs.mjs` covers the rules guide, the labels, saving across a reload, the stuck dialog and the win. Each test prints PASS or FAIL per check and ends with `ALL PASSED`. Screenshots go to `tests/screenshots/`.

## Planned

- Dame de pique (Hearts) against 3 computer players.
