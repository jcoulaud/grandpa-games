# Grandpa games

A library of simple card games for my grandfather on Windows. No ads and no account. The text is in French, and the cards and buttons are large.

The library is a website installed once as an app with Edge. It works offline. Each push to `main` publishes a new version. When he opens the app, his PC downloads it in the background and the library reloads with it a few seconds later. A game window keeps its version until it closes. His progress is saved on his PC.

## How it works

```
public/                  the site, served as static files
  index.html             the library: clock and one tile per game
  og.jpg                 the link preview image of the library, drawn by scripts/og.mjs with og/jeux/<id>.jpg
  <id>/index.html        one game per folder, at jeux-papi.fr/<id>/
  lib/store.js           saves for every game, in the browser of the PC, and the statistics
  lib/ph.js              the anonymous id of the PC, and PostHog on jeux-papi.fr (see "Statistics")
  lib/kit.css, kit.js    shared look and behaviour: top bar, "Jeux" button, message line, rules guide, dialogs
  lib/zoom.js            the size buttons, "Réduire" and "Agrandir", on the library and in every game
  lib/sound.js           the sounds of the games, made with Web Audio, and the « Couper le son » key next to the size buttons
  lib/cards.css, cards.js  playing cards: French names, suits, pips, court cards, back
  sw.js                  offline copy and quiet updates
  admin/                 the admin dashboard, behind the ADMIN_TOKEN password
src/worker.ts            the statistics and error API, a Cloudflare Worker with a D1 database
src/admin.ts             the admin API, behind the ADMIN_TOKEN secret
src/util.ts              helpers shared by the two
migrations/              the database tables
```

## Add a game

1. Make `public/<id>/index.html` like the solitaire: link `../lib/kit.css` (and `../lib/cards.css` for a card game), write the top bar, the message line, the table and the rules pages, then load `../lib/store.js`, `../lib/cards.js` and `../lib/kit.js` before the game's own script. Load `../lib/zoom.js` in the `<head>`, then `../lib/ph.js`, and divide any mouse position inside the table by `Zoom.z()`. The top of `lib/kit.js` shows the markup.
2. The kit adds the "Jeux" button, the close cross at the right of the bar (it asks « Fermer le jeu ? » first, with « Continuer la partie » in yellow), the nudge (after a wait on his turn, the hint button pulses, or first any visible button with `data-nudge`; put `data-auto="no"` on a hint that plays the move for him), the button icons (`data-icon="undo"`, `bulb`, `help`, `close`), the rules guide frame and the dialog. Use `Kit.say`, `Kit.dialog`, `Kit.openHelp` and `Kit.escape`. For a first visit, `Kit.firstVisit(newGame)` starts a game at Facile with the coach: call `Kit.point(el)` on the real thing to click at each of his first steps. Call `Kit.gameOver(true)` when a game ends, give each greyed button a `data-why` sentence, and answer clicks that do nothing with `Kit.tell`. For the pictures of the guide, `lib/kit.css` has the sentence classes `guide-lead` and `guide-more`, the yellow ring (`guide-ring`, or `var(--guide-ring)` in a shadow of your own) and the copy of a bar button (`guide-btn`, yellow with `primary`, in a column with `guide-btns`). `Kit.icon('hand')` gives the pointing hand, with the class `guide-hand`; place it with `left` and `top`. A copy marked `here` gets the ring and the hand by itself, and `data-icon` gives it its icon. In an SVG picture, draw the hand with `<use href="#kit-hand" width="40" height="48"/>`. Set `--guide-more` (the colour of the second line) and `--guide-edge` (the dark edge of the rings) on `#help` to match the felt.
3. Save with `GG.save('<id>', data, { summary })` and read with `GG.load('<id>')`. `summary` tells the library about the saved game, for example "Partie en cours · 3 victoires": a part with "en cours" turns the tile's button into "Reprendre la partie". The tiles show no other line under the description.
4. Give the game its own browser tab icon: `public/<id>/icon.svg`, linked with `<link rel="icon" href="icon.svg">`.
5. Add the game to `GAMES` in `public/index.html`, with its `family` (cards, board and dice, letters and figures, or skill games such as the golf; add one to `FAMILIES` if none fits), and in `src/worker.ts`, its folder and icon to `CORE` in `public/sw.js`, and its address to `public/sitemap.xml`. Copy the description, canonical and `og:` tags from the solitaire page, then run `node scripts/og.mjs` to draw the game's own link preview, `public/og/jeux/<id>.jpg`, and point its `og:image` to it. Its rules page uses `public/og/<id>.jpg`.
6. Load `../lib/sound.js` after `../lib/zoom.js`, and call `Sound.play(name)` in the page code when a move lands, the computer plays, a game is won or lost: the names are listed in the file, and [Sound](docs/design.md#sound) says which event takes which. Never call it from an engine that the tests load.
7. Count its games with `GG.track('<id>', 'start')` when a game begins and `GG.track('<id>', 'won')` when it is won.
8. Give the game its own look. Each game has its own felt colour: set `--felt-top`, `--felt`, `--shade` and `--accent` on `:root` in the game page, and the same felt in `GAMES`. Give its tile a different picture of cards. The solitaire is green with a fan of three cards. FreeCell is blue with four aces in a row. The dame de pique is plum, with the queen of spades in front of two hearts. The démineur is brown earth, with an island of turf blocks seen from above. The yams is terracotta, with five dice rolling in. The bataille navale is deep sea blue, with a corner of its board seen from above: two grey ships, red pegs where they were hit, white pegs in the water and a splash where the last shot fell. The jeu des paires is olive green, with cards of red vichy and the two coqs of a pair found. The sudoku is charcoal slate, with a school slate in its wooden frame, a 7 being written in yellow chalk, the stick of chalk and the sponge. The mots mêlés are coral rose, with a folded newspaper page, the word VAGUE in a felt-pen loop and a flat yellow pencil lying beside it. The petits chevaux are turquoise, with a corner of the board at a slant, two horses racing and a die in the air. The morpion is pastel lilac, with its board of white tiles on a dark tray, three blue crosses struck through on a diagonal and three red rings. The belote is ochre gold, a café table seen from above with the roi and the dame de cœur, a score carnet with its pencil and a cup of coffee. The huit américain is fuchsia, with a tilted 8 de cœur in a wheel of four colours and two arrows of the way of play. The rami is midnight indigo under a lamp light, with the 7, 8 and 9 de carreau in a fan on a tray and a joker tilted behind them. The billard is mahogany, with a corner of a blue café table seen from above: the white and the cue, a dotted line to the 8 in front of the corner pocket, the 11 and the 1.
9. Give the game three levels: Facile, Moyen and Difficile. Open the choice with `Kit.chooseLevel(level, playing, newGame)` at "Nouvelle partie", and show the level under the name with `Kit.showLevel(level)`. Show the wins on the same line with `Kit.showWins(stats.won)` each time the count changes: it reads "Niveau facile · 3 victoires". The bottom bar holds only the credit and the size keys. A count of the current game, such as the pairs found or the cells left, goes on the table near the board, in the game's own look. Save the level with the game. A save without a known level still loads, with a default level. Each level must be harder than the one below, and a test must prove it: for example, a computer that beats the level below, or deals that take the solver more steps.

10. Follow the [rules guide pattern](docs/design.md#write-a-rules-guide) and the [rules for every screen](docs/design.md#rules-for-every-screen). Check every screen, including each guide page, at the listed window and zoom sizes.

When a game changes its save format, it must still read the old format. His saves are never deleted.

## Games

- `public/bowling/`: ten frames of ten-pin bowling in a 1960s alley, alone against a score.
  - Look straight down the lane. On a tall desktop window the score sheet sits above the throw panel. At 660 px high or less it sits above the lane. A small live view shows the pins on wide stages.
  - Set the start, direction, curve and force in the « Votre lancer » panel, then click « Lancer la boule ». The lane takes no mouse input. Every throw starts again from the middle, straight, at force 6.
  - No level has barriers: a ball off the boards drops into the gutter. Facile shows the whole path. Moyen shows half the path. Difficile shows the path to the arrows. Every level offers three curve steps to either side. He chooses the starting board on the foul line with « Départ ». A new game starts in the middle, and the curve never moves the ball. The hint starts 5 boards towards the side of its hook per curve step. At force 6 the three steps bend about 10, 20 and 30 boards from the launch line. The path band shows the intended shot. In Difficile it turns later and harder.
  - At impact, the ball and pins spin, bounce and fall under gravity. A fixed camera shows the deck. The pinsetter lifts the standing pins, sweeps the deck and puts each pin back. At the end of a frame it sets ten new pins.
  - The ten-frame goals are 145, 160 and 175 points. The same imperfect player won 52, 25 and 11 of 64 seeded games. The pinsetter stands each surviving pin upright on its spot. Each throw saves its seed and the remaining pins, so undo and reload reproduce it.

- `public/billard/`: 8-ball pool on a 7-foot café table seen from above, against René.
  - `engine.js` holds the table geometry, the physics, the rules, René and the hint, with no DOM. Each ball has full spin, the cushions and jaws follow the WPA angles, and every shot is deterministic from the seed, so undo and reload replay it.
  - `table.js` draws the balls, the cue, the preview and the animations on one canvas; `frame.js` draws the table from the engine's own lines; `guide.js` draws the trays and the pictures of the rules guide.
  - René plays alone, slowly. His aim error shrinks with the level, and Difficile plans his next shot and plays safeties.

- `public/golf/`: nine holes of miniature golf in 3D, new at each game.
  - `engine.js` builds the course from a seed saved with the game, so a reload or an undo replays the same holes. It has no DOM, so the page and the tests run the same code. `scene.js` draws a hole with Three.js, kept in `lib/three/`.
  - Each hole joins a lane shape and its obstacles. The shapes are a straight lane, a long lane, a wide green, a dogleg, an L and an S. The obstacles are toadstool bumpers, a hill, a dip, a raised green on a ramp, a bridge over a pond, a tunnel, narrow gates, bank boards and a windmill.
  - The first hole is gentle and the last one is the showpiece. Two holes in a row never have the same type. Each hole gets a French name from word lists, such as « Le petit moulin ».
  - The solver plays every hole before it is kept. The par is the worse of two playthroughs with slips of the hand: larger slips in Facile, smaller in Difficile. A hole the solver cannot finish in four strokes is built again from the same seed. A course takes about 50 ms.
  - Facile has wide lanes, wide gates and a big cup. Moyen adds bank shots, hills, dips and the tunnel. Difficile adds narrow gates, S bends, the windmill and a smaller cup. The preview shows the whole path in Facile, until just after the first bounce in Moyen, and the first 3 m in Difficile, where the dots fade out instead of stopping. Difficile never shows where the ball stops. A test proves that a fixed aiming error costs more strokes over par at each level.
  - To shoot, press on the ball, pull back like a slingshot and let go. The « Force » bar in the card shows the strength. Back on the ball, the pull is cancelled. A click on the lane sets a target instead. « − » and « + » change its strength, and « Taper la balle » plays it.
  - The preview, the hint and the shot use the same fixed-step physics. The rim of the cup tips a passing ball in, a ball through the middle of the hole may drop at a good pace, and a slow ball rolls back down a slope. Each hole takes at most eight strokes. A course at par or better counts as one win.

- `public/solitaire/`: draw-one Klondike.
  - A solver deals only games that it has won. The level is how many steps the solver needed: at most 40 for Facile, 55 to 85 for Moyen, 180 to 2500 for Difficile.
  - Click a card. With one legal place, it goes there at once. With several, click one of the places framed in yellow. Dragging also works.
  - The game says where the card went, and the card keeps a yellow outline for 1 s.
  - A double-click counts as one click.
  - A wrong place keeps the card chosen and says why in one sentence.
  - "Règles" opens a three-page guide to the rules and the controls. It also opens by itself the first time the game is opened. A "Fermer" button closes it from every page.
  - Labels name the pioche, the défausse and the foundations ("Rangement").
  - "Que jouer maintenant ?" shows the next move of a winning plan as a sentence. Click the framed place or the ringed card.
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
  - `board.js` draws the board, plays the explosion and reads the mouse and touch. `style.css` holds the page's styles. `index.html` holds the game, its saves and its buttons.
  - When a mine goes off, it explodes over its square and the board shakes, then the dialog opens. With reduced motion, the dialog opens at once.
  - The mines are placed at the first click. The first square and its neighbours hold no mine. A board is kept only if the hint's own reasoning clears it from the first square, so no game needs a guess. The reasoning uses one number at a time, the total of mines, and on Moyen and Difficile two numbers whose closed squares overlap. A board takes under 5 ms.
  - The board is a function of a seed saved with the game and of the first square: after an undo of the first click, the same square gives the same board.
  - A left click opens a square. The right click, or the "Drapeau" button followed by one click, puts a flag. A left click on a flag takes it off. A click on a number that touches as many flags as its value opens the squares around it.
  - "Que jouer maintenant ?" frames a wrong flag first. Otherwise it frames the squares that follow from the numbers, rings the numbers it used, and says why in one sentence.
  - Facile guides him. `Demineur.sure(G)` repeats the hint's reasoning to find every closed square the numbers prove: the board marks each safe one with a green check and each mine with a red "!". After each move, the hint shows its frame, its ring and its sentence by itself. A left click on a red "!" puts a flag, and a click on a square without a mark is refused, so Facile cannot be lost.
  - On Moyen and Difficile, a mine shows only the mine that went off, and the dialog offers "Annuler le dernier coup" first. No timer.
  - A wooden sign beside the board counts the flags put: "Drapeaux 3 sur 22". A window with no room on the side puts it under the board.
  - A phone turns a wide board a quarter and scrolls down to the rest of it.

- `public/bataille-navale/`: the bataille navale (Battleship), against the computer, on two seas of 10 by 10 squares.
  - `engine.js` holds the rules, the computer and the hint, and `ships.js` the pictures of the ships, the fire and the splash. Neither has a DOM, so the page and the tests run the same code.
  - Each side has a porte-avions of 5 squares, a croiseur of 4, a contre-torpilleur and a sous-marin of 3, and a torpilleur of 2. The ships are placed at random and never touch, not even by a corner. Before his first shot, "Changer mes bateaux" places his ships again.
  - His sea is on the left with his ships, the computer's sea on the right. A list of the ships, each drawn on as many squares as it takes and crossed out once sunk, stands beside each sea, and a key under the computer's sea shows the marks: a splash for "à l'eau", fire for "touché", a pale square for "aucun bateau": a square beside a sunk ship, where no ship can be.
  - One click on the computer's sea fires. The players take turns, one shot each, also after a hit. A yellow sign says whose turn it is, and the sea he fires on is framed in yellow. The last shot on each sea has a yellow ring.
  - A sunk ship comes up dark on the sea, and the squares around it turn pale: no ship can be there. A click on such a square, on a square already fired or on his own sea is refused, with the reason.
  - The computer knows only its own shots and the ships it sank. Facile fires at random, half the time beside a hit. Moyen finishes each ship hit along its line and searches one colour of a chessboard. Difficile fires where the ships still afloat fit in the most ways. On 300 games each, they need about 68, 45 and 39 shots.
  - Each shot takes its time. A yellow sight closes in on the square. In the water, a column of water rises and falls, drops arc out and fall back, and foam rings spread. On a ship, a flash, a ball of fire, sparks and debris, dark smoke that drifts, and the square shakes. A sunk ship gets two or three blasts along it before it comes up dark. A word shows above the square, or below it near the top: "Plouf !", "Touché !" or "Coulé !". The computer waits until his shot has landed, its sight glides over his sea to its target, and its shot falls the same way: about 4 s from his click to his next turn. With "reduced motion" on, none of this plays and the computer answers at once.
  - The computer's shot depends only on the game, so a reload during its turn gives the same shot.
  - "Que jouer maintenant ?" frames the square where the computer's ships afloat fit in the most ways, rings the hits it follows, and says why in one sentence.
  - A save read back is checked whole: straight ships that do not touch, shots that match the ships, the turn and the result. A broken save starts a new game.
  - A phone puts the computer's sea on top and scrolls down to his own.

- `public/paires/`: the jeu des paires (a memory game), alone against the clock of his own turns.
  - `engine.js` holds the rules, the deal and the hint. It has no DOM, so the page and the tests run the same code.
  - Facile has 6 pairs, Moyen 10 and Difficile 15. The 15 pictures of the farm and the garden are in `img/`, made with gpt-image-2 and saved as 384 px WebP. Facile and Moyen take theirs at random among the 15.
  - The cards have a red vichy back. One click turns a card. Two cards alike stay up with a green tick. Two cards that differ stay up in a red frame for 2.6 s, or until his next click, then turn back.
  - A card turns up in 0.52 s with a small lift, and the message line names it once its picture is readable. Two cards that differ tilt once, then turn back in 0.7 s. A pair lifts together and its ticks come in. A new game settles the cards into place, and the last pair sends a wave across the columns before the win sheet. With reduced motion, only the frames, ticks and messages change.
  - The grid takes the number of columns that gives the largest cards: 10 by 3 for Difficile on his laptop, 5 by 6 on a phone.
  - A cream card with a vichy edge counts the pairs found and the turns. It stands on the left of the cards, or above them, wherever the cards stay larger.
  - "Aide" uses only the cards he has seen: the twin of the card up, two cards seen that make a pair, or else a card never turned. Following it always wins.
  - The win says the number of turns and his best score at that level. A save read back is checked whole, and a broken save starts a new game.
  - On 300 games each, a player who forgets a card with a chance of 1 in 4 per turn needs about 12, 24 and 43 turns.

- `public/sudoku/`: the sudoku, a 9 by 9 grid with one solution.
  - `engine.js` holds the rules, the solver, the grid maker and the hint. It has no DOM, so the page, a Web Worker and the tests run the same code. The worker is made from the engine's own source in a Blob, so it also starts offline and from a file.
  - A seed makes a full grid, then takes digits out two at a time, opposite each other through the centre, while the grid keeps one solution. A logical solver then grades the grid by the techniques it needs, never a guess. Facile needs only singles and has 38 to 42 givens. Moyen needs pointing, claiming, pairs or naked triples at least twice. Difficile needs an X-wing, a swordfish, an XY-wing, an XYZ-wing, a hidden triple or a quad at least twice. A grid takes about 10 ms, and up to 0.2 s for Difficile.
  - Click a cell, then a digit key, or type the digit. "Effacer", Backspace or Delete erase it. The arrow keys move the chosen cell. The row, the column and the block of the chosen cell are lit softly, and the cells with the same digit are lit in blue chalk.
  - A digit that breaks a rule turns red, the digit it meets gets a red ring, and the message line says why: "Il y a déjà un 5 dans cette ligne." A legal digit that is not the solution stays yellow: only the hint says so.
  - "Une aide ?" erases a red digit first, then a digit that is not the solution, then fills one cell and says why: "Dans cette case, seul le 7 est possible." Following it always wins.
  - The pad stands on the right of the grid, its top level with the grid and as tall as it. A small slate on top of the pad says how many cells are left: "Encore 42 cases". Each digit key has a blue badge with how many of that digit are still to place.
  - A digit placed nine times without a clash gets a green check on its key, in place of the badge. The win lights the nine blocks one after another, then the win sheet opens.
  - "Annuler le dernier coup" has no limit and survives a reload. A save read back is checked whole, and a broken save starts a new game.
- `public/mots-meles/`: the mots mêlés (a French word search), alone.
  - `words.js` holds 21 themes of 31 to 56 common words of 4 to 10 letters, such as le jardin, la cuisine, la mer, les fromages or les villes de France. Each grid takes one theme as its title, and not one of the last six played.
  - `engine.js` holds the grids, the rules of a pair of letters, the hint and the check of a save. It has no DOM, so the page and the tests run the same code.
  - Facile has 6 words of 4 to 6 letters in a grid of 8 or 9, read to the right and down. Moyen has 9 words of up to 8 letters in 11 by 11, and adds the two diagonals that read from left to right. Difficile has 12 words of 5 to 10 letters in 11 by 11, in all eight directions, so half of them read backwards.
  - The grid drops the accents, as printed word searches do: CHÂTEAU is written CHATEAU. The list and the messages keep them.
  - The generator places each word from a seed, then fills the free squares with French letters. It draws a free square again while a word of the list can be read a second time, or while the filler spells a rude word.
  - He clicks the first letter of a word, which is ringed in yellow with soft dots along its lines, then the last letter. A drag also works. A word is found from either end. The message line says to click the last letter, or the first one again to take it back. A button "Enlever le A" under the list, a click on the yellow letter or Escape cancels it. The button keeps its place when it is hidden, so nothing moves. A refusal keeps the first letter and says why: not on one line, a diagonal at Facile, a word found before, the right first letter with the wrong last one, or the letters read, quoted.
  - A word found gets a band of its own felt-pen colour, drawn from its first letter to its last in 0.48 s, and is struck through in the list in the same colour. "Montrer un mot" rings the first letter of the next word to find. "Annuler le dernier coup" takes back the last word found, as many times as he likes. At the win the bands pop in a wave and a "Bravo !" stamp comes down, then the win sheet opens. The sheet counts the words found under the theme, and the level line counts the grids finished.
  - The squares are as large as fit beside the list: 33 px with 30 px letters for Difficile on his laptop, up to 64 px on a monitor. The list takes one to three columns.
  - A reader who goes over the grid letter by letter, along each direction of the level, reads about 210, 570 and 1,480 letters to find every word.
- `public/petits-chevaux/`: the petits chevaux in the French short game, his two blue horses against Rouge, Vert and Jaune, three computer players with two horses each.
  - `engine.js` holds the rules, the computer players, the hint and the places of the squares. It has no DOM, so the page and the tests run the same code.
  - The board has a track of 56 squares, a stable in each corner and a ladder of 6 steps for each colour. A 6 takes a horse out to its start square and gives another throw. A horse moves the number of the die, clockwise, and jumps over others. Landing on another colour sends those horses back to their stable. Two horses of one colour share a square. A horse must land exactly on the foot of its ladder, then climbs each step with the exact number, 1 to 6; step 6 is the centre. A player who can move must move. The first with both horses at the centre wins.
  - A save from before, with four horses each, loads and plays on with four horses until its end. The next game has two.
  - One click on "Lancer le dé", or on the die, throws. The horses that can move are framed in yellow, and one click moves one. A click on a horse always picks that horse; a click on the empty board beside a framed horse moves the nearest one. When two framed horses stand closer than 44 px, a button for each, "Le cheval de devant" and "Le cheval de derrière", comes under the die. An older save with four horses can show three or four buttons: they go in two columns with short names, "Devant", "2e cheval", "Milieu" or "Derrière", and the die gets smaller so they fit. With one move only, the game still waits for his click and says so. With none, it says why for each horse and passes the turn after 2.2 s, or lets him throw again after a 6. A click on a horse that cannot move says why in one sentence.
  - Each player throws from their own seeded stream of numbers. His throw is saved before it shows, so a reload cannot throw again. "Annuler le dernier coup" takes back his last horse moved and the computer turns after it, with the same die, and draws his later throws again.
  - The computer turns are shown one step at a time: the die rolls 0.9 s, each horse hops 360 ms a square, a horse taken shakes and flies home. A computer throw that no horse can use is said at once and waits 0.9 s. The pauses are `PACE` in `engine.js`. They depend only on the saved game, so a reload during them plays the same turns again. The message line names each event, and a horse of his that was taken is said again when his turn comes.
  - Facile moves a random horse. Moyen takes a horse first, else moves its front horse. Difficile counts the turns each player still needs, from a table of the average turns two horses need alone on the board, and the turns a horse would lose if it were taken. The hint uses Difficile and says why. At tables of two against two, Moyen wins 60 % of the games against Facile and Difficile 55 % against Moyen: with two horses the dice decide most of a game. A save with four horses keeps the computer players it had.
  - A game lasts 22 minutes in the middle, 30 minutes for one game in ten, with 2 s for each of his clicks (`tests/petits-chevaux-rules.mjs` measures it).
- `public/morpion/`: the morpion, against the computer. Facile is the little morpion, 3 by 3, three in a row. Moyen and Difficile are the morpion of squared paper: 11 by 11, five in a row or more (freestyle gomoku).
  - `engine.js` holds the rules, the computer players and the hint. It has no DOM, so the page, a Web Worker made from its own source and the tests run the same code.
  - The sheet is 11 by 11, so the squares are 40 px on his laptop and 28 px with the text at 125 %. A save from the older 13 by 13 sheet finishes its game on that sheet. The next game is 11 by 11, in the same series.
  - One click on a free square draws his blue cross with a pen stroke. A click on a mark is refused, with the reason. He always plays the crosses. He starts the first game of a series, then the players take turns to start.
  - The computer's ring is drawn in red ink after 0.7 s at least, and keeps a soft red ground until he plays. When the computer has three rings open at both ends, or a line it can finish, the message line warns him, also after a reload or an undo. No warning when he can win at once.
  - Facile finishes its line 4 times in 5 and blocks his 1 time in 2, and plays at random otherwise. Moyen takes the best square by its patterns, with some noise. Difficile searches wins by fours and by threats, and looks 6 moves ahead. In the tests, the perfect player never loses to Facile, Moyen beats a random player and a greedy one, and Difficile beats Moyen most of the time.
  - "Où jouer ?" frames the square of the Difficile search, or of the perfect player on the little grid, and says why in one sentence.
  - "Annuler le dernier coup" takes back his cross and the computer's answer, as far back as he wants. Undo after the end takes the result out of the score.
  - The winning line is crossed out with a pen line. His win makes the crosses hop and stars fly. The score of the series is in the game: on his card and the computer's card, with the draws on the goal card, or on a paper strip "Vous 3 · Ordinateur 2 · Nuls 1" next to the sheet when those cards are not in view. The wins go on the level line. A new level starts a new series.
  - A save holds the level, the first player and the moves, and is replayed on load. A broken game starts again; its score and wins are kept.
- `public/huit-americain/`: the huit américain (the French crazy eights), against three computer players.
  - `engine.js` holds the rules, the computer players and the hint. It has no DOM, so the page and the tests run the same code.
  - 7 cards each, and one card turned up starts the défausse. A special card turned up goes back under the pioche. He starts the first round, and each round the next player starts.
  - A card fits when it has the colour asked or the rank of the top card. The 8 fits on any card, and its player names the colour. The as changes the way of play, the 2 makes the next player draw two cards and miss the turn, the valet makes the next player miss the turn.
  - A player with no card that fits draws one, and may play it if it fits. A player who can play may not draw. An empty pioche takes back the défausse, shuffled, except its top card.
  - The first player with no card wins the round, at once. The others score the cards left in hand: 8 = 50, roi, dame and valet 10, as 1, the others their value. The game ends after a round where a total reaches 100. The lowest total wins, and a tie shares the win.
  - One click plays a card that fits. A card that does not fit is darker, and a click on it says why, in a bubble above it and in the message line: "Il faut un trèfle ou un 9." An 8 opens four large colour buttons, with "Garder mon 8" to go back. With no card that fits, a yellow "Piocher" key shows beside the pioche, and the pioche takes a click too. After a draw that fits, "Passer mon tour" keeps the card.
  - The middle shows the colour to play in a large disc, and a ring of arrows around it shows the way of play. The ring turns over after an as.
  - The computer players act one at a time, 0.9 s apart, and 1.6 s after a special card. The message line names each one: "Josette pose un 8 et choisit le cœur."
  - Facile plays any card that fits, at random. Moyen keeps its 8s and plays the colour it holds most of. Difficile also gets rid of its big cards first, names a colour the next player lacks, and keeps its 2s, valets and as for the player about to go out. In the tests, a player who plays like Moyen wins about 32 %, 23 % and 16 % of the games against each level.
  - "Annuler le dernier coup" takes back his last move and the moves after it, within the round. The shuffles come from a random stream saved with the game, so an undo or a reload replays the same cards. A save read back is checked whole, and a broken save starts a new game.
- `public/rami/`: the rami à 51, against one computer player, Odette.
  - `engine.js` holds the rules, the computer player and the hint. It has no DOM, so the page and the tests run the same code.
  - One deck and two jokers. 13 cards each, the next card starts the défausse, and he starts. A turn: take the top card of the pioche or of the défausse, lay combinations and add cards to the table if he likes, then throw one card. The card taken from the défausse cannot go back the same turn. An empty pioche takes the défausse, shuffled, except its top card.
  - A suite is 3 or more cards of one suit that follow, the as before the 2 or after the roi, never both. A brelan or a carré is 3 or 4 cards of one rank in different suits. A joker stands for one card, one at most in a combination, and keeps its place.
  - The first combinations laid must make 51 points at once: figures 10, the as 11 (1 before the 2), a joker the card it stands for. Before that, he cannot add to the table. After, he adds to any combination, his or Odette's. A move must leave a card to throw, unless it empties the hand.
  - The first with no card left wins the partie, by throwing or by laying the last cards. The end sheet gives the points left in the loser's hand: joker 20, as 11, figures 10.
  - He clicks his cards to choose them: they rise with a yellow ring. "Poser" lays them, split into combinations by the engine, and a refusal says why: "Il manque 12 points pour ouvrir : il en faut 51." A click on a combination adds the cards chosen, and the combinations they fit are framed. One card chosen and a click on the défausse, or "Jeter", throws it. "Trier" sorts the hand by colour or by value, with the combinations he could lay grouped first. Before he opens, a gauge by his zone adds up the points of the cards he chose.
  - Odette acts one step at a time, 700 ms after the last card lands and 1.2 s apart at least, and the message line names each step.
  - Facile always takes the pioche, opens after 12 turns and throws a loose card at random. Moyen takes the défausse when its card completes a combination, opens after 8 turns and throws its biggest loose card. Difficile opens as soon as it can, keeps the cards that nearly make a combination by counting the unseen cards that complete them, and does not throw a card he showed he wants. On 800 seeded games each, Moyen wins 84 % against Facile and Difficile 56 % against Moyen.
  - "Annuler le dernier coup" takes back his last action and Odette's turn after it. The shuffles come from a random stream saved with the game, so an undo or a reload replays the same cards. A save read back is checked whole, and a broken save starts a new game.

The design and the research behind it are in `docs/design.md`.

## Saves

- Everyone plays freely, with no account and no approval. Each game saves in the browser of the PC (localStorage) and never leaves it.
- The library asks Edge to keep this data when the disk is full. Clearing the browser data for jeux-papi.fr deletes the saves.
- The browser locks each game while it checks and writes the save. The saved state and the library summary share one record. A window with an older version asks to reload.

## Statistics

PostHog (EU) gets the visits of jeux-papi.fr, with the same anonymous id as the admin page. Pages opened from disk, the tests and local runs send nothing. `public/lib/ph.js` loads it on every page except the admin page. `tests/analytics-rules.mjs` fails when a page does not load it, or when a first folder that is not a game is missing from `SITE` in `lib/ph.js`.

PostHog records the pages, the clicks, the time on each page, how far it was scrolled, the errors and a recording of the session. Each event carries `page_type` (`library`, `game`, `rules` or `blog`), the `game` of a game or rules page, and `installed`, true in the window of the installed app. The site adds these events:

| Event | Sent by | Properties |
| --- | --- | --- |
| `play clicked` | a link from a rules page or the blog to a game | `to_game`, `place` (`play button` or `link`) |
| `game started`, `game won` | `GG.track` | `game`, and `level` from `Kit.showLevel` |
| `rules guide opened` | the guide in a game | `first_visit`, true when it opened by itself |
| `rules guide closed` | the guide in a game | `page`, `pages`, `read_all` |
| `hint used` | the hint button | `automatic`, true when Facile showed it by itself |
| `nudge shown` | the gold ring after a wait | `button` |
| `app installed` | Edge, when the site is installed as an app | |

`node scripts/posthog.mjs` turns on the recordings, errors, heatmaps and page speed in the project, and makes or updates two dashboards. "Les parties" has the games played and won by game and by level, the players per day, the hints and the return of players week after week. "Les visiteurs" has the funnels from a rules page, the blog and the library to a game started and won, the pages of rules and of the blog, and where the visitors come from. It needs `POSTHOG_PERSONAL_API_KEY`, a personal key of the EU project with the scopes `project:write`, `dashboard:write` and `insight:write`.

## Admin page

https://jeux-papi.fr/admin/ is the overview dashboard:

- the number of players since the start;
- the players today, over 7 days and new over 7 days, and the games over 7 days, each with the change from the day or week before;
- a chart of the players and the games started each day, over 7, 30 or 90 days, with the numbers of a day on hover;
- each game, with its games over 7 days and in total, and its win rate;
- the JavaScript errors, grouped by message, with how often, on how many PCs, the page, the stack and the browser.

A player is a PC, or a browser, that opened the site. Each PC makes a random id at its first start and sends it with a visit once a day, a game started, a game won and its errors. The Worker keeps 2,000 reports and accepts at most 20 per device bucket and 1,000 total per rolling day. With an admin secret and a Cloudflare network address, it also limits each network to 40 reports per day. Diagnostic rows store a keyed digest of the network for this limit. For players, the server stores no name, no IP address and no save. Visits are kept 90 days, and the daily counts of games are kept for good. The Worker (`src/worker.ts`) accepts only these numbers, for the games listed in its `GAMES`.

The password is the `ADMIN_TOKEN` Worker secret. Use a long random password. To change it, run `bunx wrangler secret put ADMIN_TOKEN`. After 10 wrong passwords from one network in 15 minutes, the admin API refuses that network until the oldest try is 15 minutes old.

## Install on his PC

1. Open the site in Edge: https://jeux-papi.fr
2. Select "Installer sur cet ordinateur" at the bottom of the library, or in the Edge menu select "Applications", then "Installer ce site en tant qu'application".

Windows Quick Assist is the easiest way to do this with him on the phone.

## Publish

- The site lives at https://jeux-papi.fr only. `www.jeux-papi.fr` redirects there (a redirect rule on the zone), and the workers.dev address is off, because saves on a PC belong to one exact address.
- `.github/workflows/deploy.yml` runs the typecheck and `bun run test:rules` on each pull request and each push to `main`. On `main`, when they pass, it applies the database migrations and deploys. "Run workflow" in the Actions tab checks and deploys `main` again. Run the full browser suite locally with `bun run test`.
- The workflow uses the `CLOUDFLARE_API_TOKEN` repository secret: the Cloudflare account token "grandpa-games GitHub deploy". It can edit Workers and D1 on the account, and routes, DNS and certificates on `jeux-papi.fr` only. To replace it, create a new account token with the same permissions under Manage Account, then Account API Tokens, and run `gh secret set CLOUDFLARE_API_TOKEN`.
- `bun run deploy` does the same from a terminal logged in with `wrangler login`.

### Database rollback

- Add tables and columns before any Worker version needs them. Deploy Worker versions that can use both schemas during the transition. Remove old tables or columns in a later release after the rollback window.
- A Worker rollback changes code and assets. D1 keeps every applied migration. Migration 0006 adds nullable data and indexes, so the immediately preceding Worker can still read and write the schema.
- Migration 0005 removed the old save and device tables and replaced the error table. Prefer a forward fix if a rollback must cross 0005. If the older Worker is essential, restore a pre-0005 export to a separate D1 database first. Verify its schema and data before switching the Worker binding. Plan how to preserve writes made since the restore point before directing production traffic to the restored database.

## Tests

`tests/billard-rules.mjs` checks the physics against known values (a stun shot stops, a rolling white keeps 2/7 of its speed, the cushion rebound, the jaws), every rule and foul, undo, saves, the hint and the three levels in seeded matches. `tests/billard.mjs` plays the page with the mouse, with and without animations, and measures the layout and the rules guide at each window size.

`tests/bowling-rules.mjs` checks scoring, pin physics, undo, saves, hints and the three goals. `tests/bowling.mjs` plays the throws with the mouse, checks both endings and measures the page and guide at each window size.

The tests play the game in a real browser with the mouse. They are only for development: the game itself still needs nothing.

1. Run `bun install`.
2. If Playwright has no browser yet, run `bunx playwright install chromium`.
3. Run `bun run test`.

`tests/library.mjs` starts a local Worker with a fresh database and covers the library, saves on the PC, offline use, updates, the statistics and the admin page. `tests/play.mjs` covers moves, drag and drop, hints, undo and the layout. `tests/dialogs.mjs` covers the rules guide, the labels, saving across a reload, the stuck dialog and the win. `tests/dames-rules.mjs` checks the rules engine in Node: the published opening move counts, every tricky capture from the FMJD rules, the draw rules and the computer. `tests/dames.mjs` plays the dames with the mouse: captures step by step, refusals, undo, hint, drag, reloads, the win, the loss and the levels. `tests/dame-de-pique-rules.mjs` checks the rules of the dame de pique in Node, the moon, the end of the game, the deals the computer imagines, and that each level beats the one below. `tests/dame-de-pique.mjs` plays the dame de pique with the mouse: the pass, refusals, undo, hint, reloads, the score sheet, the moon, the win and the layout. `tests/demineur-rules.mjs` checks the démineur in Node: the boards, opening, flags, the reasoning, that following the hint wins every game, and that the marks of Facile are always right. `tests/demineur.mjs` plays the démineur with the mouse: flags, refusals, a mine and its undo, the hint to a win, reloads, the sizes, and the marks of Facile to a win. `tests/bataille-navale-rules.mjs` checks the bataille navale in Node: the fleets, the shots, the computer at each level, that it does not see his ships, the hint, and the check of a save. `tests/bataille-navale.mjs` plays it with the mouse: refusals, the computer's answer, a sunk ship, the hint, a reload during the computer's turn, a failed save, the win, the loss and a phone. `tests/paires-rules.mjs` checks the jeu des paires in Node: the deals, the turns, the hint, that each level takes more turns, and the check of a save. `tests/paires.mjs` plays it with the mouse: a miss, a pair, refusals, the hint, a reload, the win and its record, a broken save, the levels and a phone. `tests/sudoku-rules.mjs` checks the sudoku in Node: the solver, that the reasoning never places a wrong digit, the grids and their levels, the moves, that following the hint wins every level, and the check of a save, including an old save with notes. `tests/sudoku.mjs` plays it with the mouse and the keyboard: a clash, refusals, undo, the hint, a reload, the win, a broken save, the levels and the layout at every window size. `tests/stale.mjs` checks, in every game, that a window that is behind counts no game started and no win. `tests/zoom.mjs` checks the size buttons, and that a click or a drag at a larger size still lands on the right card, piece or square. The fonts are in `tests/fonts/`: Selawik has the metrics of Segoe UI, the font of his PC. Browser tests supply Selawik under the names of Segoe UI for the cards. Tests can also opt in to use it for the page text (`tests/harness.mjs`). Each test prints PASS or FAIL per check and ends with `ALL PASSED`. Screenshots go to `tests/screenshots/`. `tests/mots-meles-rules.mjs` checks the mots mêlés in Node: the word list, that every word is placed once and only once, the directions of each level, the pairs of letters, undo, the hint, that each level asks more reading, and the check of a save. `tests/mots-meles.mjs` plays it with the mouse: a first letter and its cancel by a click, the button "Enlever" and Escape, words found from either end and by a drag, refusals, the hint, undo, reloads, the win, broken and old saves, the levels, and the layout at every window. `tests/stale.mjs` checks, in every game, that a window that is behind counts no game started and no win. `tests/zoom.mjs` checks the size buttons, and that a click or a drag at a larger size still lands on the right card, piece or square. The fonts are in `tests/fonts/`: Selawik has the metrics of Segoe UI, the font of his PC. Browser tests supply Selawik under the names of Segoe UI for the cards. Tests can also opt in to use it for the page text (`tests/harness.mjs`). Each test prints PASS or FAIL per check and ends with `ALL PASSED`. Screenshots go to `tests/screenshots/`. `tests/petits-chevaux-rules.mjs` checks the petits chevaux in Node: the board, leaving the stable, captures, the ladder, the turns, the end, that the computer players move legally, the levels, the check of a save, an older save with four horses and the length of a game. `tests/petits-chevaux.mjs` plays them with the mouse: refusals, a 6, a capture, clicks on a horse beside a framed one, the buttons for horses side by side, undo with the same die, the hint, reloads during the computer turns, the win, the loss, broken and old saves, a failed save, a stale window, the pace of the animations and every window size. `tests/morpion-rules.mjs` checks the morpion in Node: the lines, undo, saves, the patterns, the hint, and that each level is harder than the one below. `tests/morpion.mjs` plays it with the mouse: refusals, a double-click, undo, the hint, a reload, the win, the loss, a draw, the series, the big sheet, old and broken saves, and the layout at every window. `tests/belote-rules.mjs` checks the belote in Node: the deal and the bids, every case of following, trumping and going higher, the points, belote, dedans, capot, the end of the game, the deals the computer imagines, the check of a save, and that each level beats the one below. `tests/belote.mjs` plays it with the mouse: the bids, refusals, undo, hint, reloads, belote and rebelote, the score sheet, dedans, the win, the loss, a broken save, and the layout at every window size. `tests/huit-americain-rules.mjs` checks the huit américain in Node: the deal, what fits, the special cards, the draws and the shuffle, the end of a round and of the game, the computer at each level, and the check of a save. `tests/huit-americain.mjs` plays it with the mouse: refusals, an 8 and its colour, the pioche, the computers' special cards, undo, the hint, reloads, the score sheet, the win, a broken save, and every window size. `tests/rami-rules.mjs` checks the rami in Node: the suites, brelans and jokers, the split of a selection, the 51 points, adding to a combination, the pioche taken from the défausse, the end of the partie, the computer and the hint at each level, that each level beats the one below, and the check of a save. `tests/rami.mjs` plays it with the mouse: taking a card, refusals, opening, adding, throwing, Odette's turn, the sort, undo, the hint, reloads, the win, the loss, broken and old saves, the rules pages, every window size with each corner index in view, the reduced-motion path and the flights with motion.

- `public/yams/`: the yams, five dice against one computer player.
  - `engine.js` holds the rules, the computer players and the hint. It has no DOM, so the page and the tests run the same code.
  - Each turn has up to three throws. A click on a die keeps it for the next throw, and a second click puts it back. A click on a box of his column writes the dice there: each empty box shows the points it would get. A box can be crossed out for 0.
  - The boxes are the French ones: As to Six, a bonus of 35 at 63 points in the top half, Brelan and Carré (the total of the three or four dice alike), Full 25, Petite suite 30, Grande suite 40, Yams 50 and Chance. A yams is not a full.
  - He always starts. When both sheets are full, the larger total wins; a tie is a shared win, counted as a win.
  - Each player throws from their own seeded stream of numbers. An undo of a box gives the computer the same turn again, and draws his next throws again, so an undo cannot show him what a throw would give.
  - The computer's turn is shown one step at a time, then saved. It depends only on the saved game, so a reload during it plays the same turn again. "Annuler le dernier coup" takes back his last box and the computer's turn after it, also while that turn is shown; a win is counted only once its last box has been shown.
  - Facile keeps the face it has most of, or four in a row, and writes the best points now, but one time in four another box that scores. Moyen looks one throw ahead. Difficile plans its two throws exactly over the 252 hands of five dice, values each box by what it gives up and by the bonus, and on its last box plays to win the game rather than for points. The hint uses Difficile. In the tests, the levels average 167, 213 and 228 points.

- `public/belote/`: the belote, four players in two teams. He plays with André, across the table, against Simone on his left and Henri on his right.
  - `engine.js` holds the rules, the computer players and the check of a save. It has no DOM, so the page and the tests run the same code.
  - The 32 cards, dealt 3 then 2, and the retourne face up. First round: take the suit of the retourne or pass. Second round: name another suit or pass. The taker gets the retourne and 2 cards, the others 3. After two rounds of passes, the next player deals again.
  - Play goes to the right. A player follows suit; at trumps, goes higher when possible; without the suit, trumps, and goes higher than a trump already played, unless the partner wins the trick. A player who must trump and cannot go higher plays a lower trump, and plays another suit only without a trump, as in the FFB rules (5.2).
  - Trumps V 9 A 10 R D 8 7 count 20, 14, 11, 10, 4, 3, 0, 0; the other suits A 10 R D V 9 8 7 count 11, 10, 4, 3, 2, 0, 0, 0. The last trick gives 10 more, the dix de der: 162 a hand. In a capot the dix de der is 100, as in the FFB rules (9.2). The king and the queen of trumps in one hand give 20 (belote, rebelote), said as they are played.
  - The taking team must score more than the other, belote counted, or it is dedans: the other team marks 162, and each keeps its belote. A tie is dedans. All 8 tricks: capot, 252, the 162 with a dix de der of 100. No other announces. The first team to reach 501 points wins; a tie at 501 or more plays one more hand.
  - One click on a card plays it. The cards he cannot play are darker, and a click on one says why in one sentence, in a bubble above the card and in the message line. He bids with big buttons in a bar above his hand: "Je prends", "Je passe", or one button per suit.
  - The computer players know only their own cards, the retourne, the bids, the cards played and what they show: a suit a player has no more, a trump it cannot hold, and after "Belote !" who holds the other card. An unannounced belote is unknown to them. Facile often plays any legal card and takes on a rough count. Moyen counts its trumps, the valet and the 9, and the aces to take, and plays by rules: draw trumps, give points to a partner who wins, cut with the lowest trump. Difficile tries each suit on 36 deals before it takes, and each card on 30 deals that fit what it knows, each played to the end. André plays at Difficile at every level. In the tests, Moyen beats Facile by about 29 points a hand, and Difficile beats Moyen by about 20.
  - The same position always gets the same answer, so undo followed by the same choice replays the same game. "Annuler le dernier coup" takes back his last bid or card and what the others did after it, within the hand. "Quelle carte jouer ?" frames a card; during the bids it is "Prendre ou passer ?" and marks a button.
  - A save read back is checked whole. A broken save starts a new game and keeps the wins and the level.
