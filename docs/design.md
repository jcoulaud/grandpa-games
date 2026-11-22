# Design

For one elderly French speaker with weak eyes and an unsteady mouse hand, in Edge on a 1366x768 laptop or a 1920x1080 monitor.

## Rules for every screen

These rules hold for the library, every game, its rules pages and its dialogs. Check them by hand after a change to the page, the CSS or a text he reads.

- **Text.** 20 px or more, 13 px or more on a phone. The cards and the pictures of the library are the only exceptions. No text is cut: a long message takes two lines in the same height.
- **Buttons.** 44 px high or more, and no two buttons overlap. The top bar uses 54 px and the dialogs 58 px.
- **The window.** Nothing goes past its sides. A dialog fits in it. Each rules page fits without scrolling in a window 620 px high or more.
- **The fonts.** The pages use Lexend, kept on the site so it works offline. The cards use Segoe UI, the font of his PC. If Lexend does not load, the pages fall back to Segoe UI. A wider font may make a rules page scroll, but must not cut text or push a button off the window.
- **The windows to check:**
  - his laptop in Edge, 1366 by 680 px;
  - the same laptop with the text at 125 %, 1093 by 530 px;
  - a 1920 by 1000 monitor, and the same monitor at 150 %, 1280 by 620 px;
  - a phone, 390 by 760 px;
  - the laptop and the monitor at the largest size of the size buttons, 130 % and 175 %.
- **Game information.** Never in the bottom bar. The wins go on the level line under the name of the game. A count of the current game, such as the pairs found, the flags or the cells left, goes on the table near the board, styled as part of the game.
- **The longest message.** Try the longest kind of sentence the game says, for example "Vous pouvez déplacer 3 cartes à la fois pour le moment. Videz une case libre ou une colonne pour en déplacer plus."

## Write a rules guide

Teach the player enough to start on page one. Use the later pages to explain decisions that come up during play.

1. **Start with the first action.** Give the page a heading such as « Avancer un pion ». Say what to click and what the game does next. State how to win early in the guide.
2. **Give each page one job.** Use short French sentences and the exact labels from the game. Use a numbered list when the player must follow steps in order. Put special rules on the page where they affect a move. Use a table for scores the player may need to look up.
3. **Show one example when a rule is hard to picture.** Reuse the game's cards, pieces, dice, and symbols. Name the important part in the caption, such as « Posez le 7 de cœur sur le 8 de pique ». The caption must explain the rule even if the player cannot see the picture.
4. **Check the guide against the game.** Try each example with the implemented rules. Verify that the button labels, scoring, and exceptions match what the player sees.

Use the shared `#help` dialog with one `<section class="page">` and an `<h3>` for each page. Wire the **Règles** button to `Kit.openHelp()` and use `Kit.firstVisit(newGame)` when there is no saved game. Use `.guide-panel` and `.guide-example` for an illustration with a caption. Use guide-specific classes for the illustration so the game treats only the real cards, pieces, and squares as playable.

Use [Solitaire](../public/solitaire/index.html) as the example for a move with a caption, [Démineur](../public/demineur/index.html) for a key to symbols, and [Yams](../public/yams/index.html) for a scoring table. Check every page at the window and zoom sizes above. Confirm that **Fermer** works on every page and that **Précédent** and **Suivant** stay in place.

## What the research said

- Every senior-focused solitaire sells the same things: oversized cards, tap-to-move next to drag, unlimited undo, hints and solvable deals. See Boomer Solitaire: https://apps.apple.com/us/app/solitaire/id1230169843
- One-tap moves are liked, but players complain when the game picks the place for them or when a slip moves the wrong card: https://apps.apple.com/app/id837817797
- Seniors are slower, less precise, give up twice as often and blame themselves for errors. They want large static targets and plain error messages, and they dislike changes: https://www.nngroup.com/articles/usability-seniors-improvements/
- Older users slip while clicking and struggle with double-clicks and drags: https://centaur.reading.ac.uk/1118/1/sse_nic_hollinworth.doc
- Low-vision decks use a jumbo index and high contrast: https://catalog.nfb.org/product/348

## Kept

- The fixed card size per window, with the stock, waste and foundations on the left and seven columns on the right.
- Drag after 16 px, the yellow ring, the dashed yellow frames and the one-sentence refusal.
- The French instruction line, the solver hint, unlimited undo, Ctrl+Z, Escape, autosave, the stuck and win dialogs, and reduced motion.
- No settings, no sound, no score, no timer. The defaults are the accessible mode.

## Changed

**One click when there is one place.** A click on a card that has exactly one legal place moves it there. With several places, the click chooses the card and he picks a framed place, as before. The game never guesses, which avoids the main complaint about one-tap moves. A card on a foundation always needs two clicks.

**The game says where the card went.** The line reads "Vous avez posé le valet de cœur sur la dame de trèfle." The moved cards keep a 5 px yellow outline for 1000 ms. Cards travel in 300 ms (was 200 ms) so his eye can follow them.

**A double-click is one click.** A second click within 500 ms and 24 px is ignored (300 ms on the stock).

**A hint accepts two targets.** He can click the framed place or the ringed card.

**The stock shows how many cards are left**, in a 28%-of-card-width number on the card back.

**The finish is faster.** Once every card is face up, cards go home every 140 ms instead of 450 ms. The four finished piles then hop twice (500 ms each, 120 ms apart), and the win dialog opens after 1500 ms. The level line under the name of the game shows "3 victoires".

**Hover is white, chosen is yellow.** Hover draws a 3 px white outline, so yellow only ever means "chosen" or "you can go here".

## Card faces

All suits are inline SVG drawn for this game, so they do not depend on a Windows font.

- **Index.** As on a real card: the rank at 19% of the card width with the suit under it at 13%, in the top-left corner, and the same upside down in the bottom-right corner. The top strip of a covered card in a column shows the whole index.
- **Colours.** Red #C4122F and ink #14171A on ivory #FFFDF6. Red has a 5.9:1 contrast on the face. The inverted box around black suits is gone.
- **Grayscale.** Two colours only, because red on black is the rule of the game. The four shapes differ strongly: pointed spade with a foot, deep-notched heart, sharp diamond, three round club lobes.
- **Number cards.** A real pip layout, 2 to 10, in one to three columns between the two indexes, over the full height of the card. The pips in the lower half are upside down.
- **Aces.** One large suit inside a solid ring and a dotted ring.
- **Valet, dame, roi.** Original flat busts in a framed panel: the valet has a feathered cap, the dame long hair and a pearl diadem, the roi a tall crown and a beard. Red suits wear red on a pink panel (#FCEDE9). Black suits wear navy #1C2B45 on a grey-blue panel (#E9EDF3). Gold is #E0A526. A brooch at the collar carries the suit. The rank letter appears once, in the index.
- **Back.** Navy #1F4470 with a fine white lattice, a wider gold lattice, an ivory frame and a thin gold frame.

## Around the cards

Flat and current, in the spirit of Windows 11 and recent macOS apps. No texture, no ornament, no serif. All UI type is "Segoe UI Variable Display", "Segoe UI Variable Text", "Segoe UI", system-ui, at 20 px or more.

- **Top bar.** Light surface #F6F8F7 with dark text #1B2422, a hairline and a soft shadow. Buttons are 54 px high with a 15 px radius, 21 px semibold text and 2 px line icons. The hint button ("Que jouer maintenant ?", or "Quelle carte jouer ?" in the Dame de pique) is the only yellow button (#FFC83D). "Annuler le dernier coup" and "Règles" are light grey (#E4E9E7). "Nouvelle partie" is on the far right, white on the felt green (#0B6B5D). A disabled undo button is #5F6764 on #EEF1F0.
- **Message line.** Right under the top bar, where his eyes already are: a cream band (#FFF4D6) with a gold edge, 52 px high, 23 px bold dark text and a small chat icon. It stands alone in the middle of the row, with room above and under it. A new text flashes the band yellow once. One height, so the board never moves. A text too long for one line takes two lines at 20 px in the same height, instead of being cut. Only a phone lets the band grow.
- **Bottom bar.** A dark band at the foot of the window, always in view. It holds only the credit on the left and the size keys on the right, never a count of the game. A phone has no bottom bar.
- **Labels on one line.** The bar measures itself: the long labels if they fit, else the short ones ("Annuler le coup", "Que jouer ?"), else one word each ("Annuler", "Idée"), and last without the name of the game. At each step the win count goes first, so the wins never make a label shorter. No label ever wraps.
- **The level.** Under the name of the game, on the left of the bar, in 20 px grey, with the wins on the same line: "Niveau facile · 3 victoires" ("1 victoire", nothing for 0). The "Nouvelle partie" button only says what it does.
- **Choosing the level.** One wide button per level, with what it means under its name ("Pour commencer en douceur"). The first time, Facile is yellow; after that, the level last played. During a game, "Continuer la partie" comes first and is yellow, and the dialog says in bold red that choosing a level erases the game.
- **The size of the page.** "Réduire" and "Agrandir", two keys with a magnifying glass and no number, sit at the right of the bar at the foot of the library and of each game, because few people know the zoom of the browser. It enlarges everything, from 80 % to 200 %, never more than the window holds (1050 by 520 px of page, so 130 % on his laptop). The size is kept and shared by every window.
- **A phone.** The bar takes two rows, and the cards shrink so every column fits across the screen. The dame de pique seats its three players in one row on top.
- **Table.** One deep green-teal, #1A6A5F at the top to #0F4F47.
- **Bank and slots.** No frame. Empty places are translucent white rounded shapes (9%). Labels are 20 px sans-serif. An empty foundation shows a soft suit and "As". An empty column says "Roi". The empty stock shows a white arrow and "Retourner la pioche". The stock count is a white pill.
- **Piles.** Buried cards cast no shadow, so a thick pile has no dark halo.
- **Width.** Cards grow to 170 px and the gaps to 18% of a card. A 1920x1000 window has 73 px margins.
- **Yellow.** The ring and the frames are #FFC83D with a dark hairline, so they show on a white card. The ring has a soft glow.
- **Dialogs and rules.** White sheets with a 24 px radius, a large soft shadow, bold 32 px titles and 58 px buttons. The buttons stand in one column of equal width, the yellow one first. After two choices or more, the way out ("Retour aux jeux") stands 10 px apart. The rules guide has a "Fermer" button with a cross, 54 px high, at the top right of every page. The win sheet shows a yellow badge with a check mark that grows in once (450 ms, off with reduced motion).

## FreeCell

FreeCell uses the solitaire's cards, top bar, message line, clicks, drag, hints and dialogs.

- **Its own look.** Each game has its own felt, so he sees at once which game is open. FreeCell is deep blue (#2B5F94 to #173F6B) with a blue "Nouvelle partie" button (#1D5590). Its library tile shows the four aces in a row on the same blue. The solitaire keeps the green and the fan of three cards.
- **Layout.** The four free cells are on the left of the top row and the four foundations are on the right. The eight columns are under them. The free cells have a light border, so they do not look like the foundations.
- **Card size.** The card size is set for columns of six cards. The four columns of seven cards squeeze a little on a laptop. At 1366x680 the cards are 86 px wide.
- **One click.** The empty free cells count as one place, and so do the empty columns. A card that fits nowhere else goes to the first free cell with one click.
- **Runs.** A click on a card in an ordered run takes the card and the cards on it. When the run is too long for the room, the message line gives the number of cards that can move now.
- **Solver.** It searches best-first and wins about 98% of random deals in less than 30,000 positions, in about 20 ms. A deal is kept only if the solver wins it.

## Dames

The jeu de dames is international draughts on the 10x10 board, as the FMJD and the FFJD play it. Two second opinions (GPT-6.2 Astra and GPT-6.2 Sol) checked the rules, the draw limits and the input design against the FMJD 2024 annexes.

- **Its own look.** A wine-red felt (#7E2F38 to #4C161E) around a real-looking board: grained maple light squares, walnut dark squares, a walnut frame with a thin gold line. It sits in the middle of the screen.
- **Pieces.** Thick discs with two grooves and a visible edge, ivory for him and black for the computer, as real pieces. A king is two pieces stacked, as on a real board, with a large gold crown.
- **Board size.** The board fills the height under the message line: 41 px squares at 1366x680, 67 px at 1920x1000.
- **The two players.** The computer's panel sits top left, by its pieces. His sits bottom right, by his. Each panel has a tray of 20 places that fills with the pieces that side has taken, so the score reads at a glance; a new piece drops in. The panel whose turn it is has a yellow border and says "À vous de jouer" or "Il réfléchit". A narrower window puts both panels on the right.
- **Two clicks, always.** He clicks a piece, then a framed square, even when there is one move. A slip on a piece only chooses it. During a capture he clicks each landing, so the route is always his choice. The game never guesses between two routes.
- **Captures.** The pieces that must take have a dashed yellow ring. A taken piece gets a red cross and stays until the end of the move, as on a real board.
- **The computer's move.** It waits at least 0.7 s, so his own move is seen landing first. Its piece then travels one landing at a time, 0.52 s apart, crossing out what it takes. Its start and end squares stay lit until he chooses a piece, and the message line says what it took.
- **Levels.** Facile searches 2 plies and, 40% of the time, picks a move that loses at most 0.9 of a man against the best one. It still never misses a compulsory capture. Moyen and Difficile search deeper with alpha-beta and follow every compulsory capture past the depth limit, so they do not give pieces away.
- **No settings.** The level is the only choice, at "Nouvelle partie", and it is kept.

## Dame de pique

The dame de pique is Hearts for four, in the Windows rules that French players know. Two second opinions (GPT-6.2 Sol and GPT-6.2 Astra) checked the rules, the computer players and the edge cases of the input and the saves.

- **Its own look.** A deep plum felt (#5E3B78 to #2C1840). Its library tile shows the queen of spades upright in front of two hearts. Four tiles now share one row of the library.
- **The table.** His hand runs along the bottom. Each card shows its top 80%, so the corner with the rank and the suit is always in view, and the cards stay large: 103 px wide at 1366x680. The trick lies in a cross in the middle, each card in front of its player. Paul sits on top, Jeanne on the left and Louise on the right, each with an initial in a coloured circle, a small fan of backs for the cards left, and the points taken in this hand.
- **Whose turn.** The seat of the player who plays has a lilac border and "Paul joue". His own seat is a strip above the left end of his hand. On his turn it says "À vous de jouer", and his place in the trick is a dashed lilac card with "À vous". Yellow keeps its meaning: chosen, or the hint. A disabled yellow button turns grey and dashed in every game, so yellow always means "press me".
- **One click plays.** A card he cannot play now is darker but still readable. A click on it says why, in a bubble just above the card for 3 s and in the message line, which flashes once: "Vous avez du trèfle : vous devez en poser un." A slip can be taken back with undo.
- **What a player follows.** A "D♠" card by a name shows who took the queen of spades. The score column says "La dame de pique : chez Paul" or "pas encore jouée", and whether hearts are open. The first card of a trick, which sets the suit, has a "1er" tag, in the trick and in the last trick.
- **The pass.** A sheet in the middle names the receiver with an arrow: "Donnez 3 cartes à Jeanne, à votre gauche". Chosen cards rise with a yellow outline. The button names the receiver again. The cards received carry a white "Reçue" tag, so they cannot be mistaken for chosen cards.
- **Pace.** The others play one card every 0.75 s. A full trick stays 1.5 s, the winner's card framed in lilac, then slides to the winner. The message line names each card and who took the trick, with how many points. The last trick stays in the right column.
- **The end of a hand.** A score sheet on the table, not a dialog, so Escape cannot lose the "Manche suivante" button. The player in the lead is marked "en tête".
- **The end of the game.** A tie for the lowest score is a shared win, as in the French rules and in Windows, so no game drags on. The dialog says who reached 100 points, his score, and the four totals, one fact per line. The score sheet hides behind it.
- **Compared with other Hearts games.** The rules match regles-du-jeu.net and Windows Hearts. Speed settings and "claim the rest" buttons from other apps are left out: they add choices. His only legal card is not played for him.
- **Levels.** Facile, Moyen and Difficile, chosen at "Nouvelle partie". In the tests, Moyen takes 2.7 points a hand fewer than Facile players, and Difficile 5.7 fewer than Moyen players. Difficile takes less than 60 ms a card.

## Yams

The yams is the French dice game, against one computer player. GPT-6.2 Sol and GPT-6.2 Astra checked the rules, the computer players, the undo and the saves.

- **Its own look.** A terracotta table (#B8582E to #5E2410). The dice roll on a red baize piste (#9E2A22 to #4E0F0B) with a maple rim, the tray of French cafés. The points go on a cream score pad with a terracotta binding.
- **The dice.** Ivory, with a soft light from the top left, a bright inner edge and pips sunk into the face. The ace is red. Before a throw, the piste shows the leather cup and "À vous de lancer"; a click on the cup also throws.
- **A throw.** Each die flies in from the left, spins, bounces twice and settles, 70 ms after the one before. Its pips flicker on the way. With reduced motion, the dice appear at once.
- **Keeping dice.** A kept die rises, gets a 5 px yellow frame and a yellow "Gardé" tag under it. The button names what it does: "Relancer 3 dés".
- **The players.** The computer's card sits across the piste, his card in front of it. Each card has the face, the name, what the player does now ("Encore 2 lancers") and the total in 34 px figures, which count up after each box. The player whose turn it is has a yellow border.
- **The pad.** Two halves side by side, so each row stays at least 34 px high: As to Six with a small die each and the bonus, then the bottom boxes. His column is pale yellow, the computer's pale blue in blue ink. The empty boxes he can write show their points in a dashed yellow frame and fill yellow under the mouse. A box crossed out for 0 shows a stroke. The bonus shows "41 / 63" over a green bar.
- **Feedback.** A box just written is stamped in and keeps a frame, yellow for him and blue for the computer. Five dice alike show a gold "Yams !" ribbon and the dice hop in a wave, as they do after a win.
- **Size.** Everything grows with the window, up to 1.4 times on a 1920 by 1080 monitor. A low window (his laptop at 125 %) seats the two players side by side above the piste, so the dice stay 60 px or more.
- **Pace.** The computer waits 0.9 s, then shows each throw 1.3 s and each keep 1 s, and its box 1.1 s before his turn.

## Sudoku

The sudoku is the classic 9 by 9 grid, alone, with one solution.

- **Its own look.** A charcoal slate felt (#4A5560 to #232A31). The grid is a school slate (#2B3339) in a wooden frame with a fine grain. The lines are chalk: thin and pale between the cells, 4 px and nearly white around the blocks. The digits of the start are ivory chalk (#F4F1E8, semibold), his digits warm yellow chalk (#FFC53D), so the two read apart at a glance. The "Nouvelle partie" button is slate blue (#3D5466). Its library tile shows the slate with a corner of the grid, a 7 being written in yellow chalk, the stick of chalk and the sponge.
- **Layout.** The grid is as large as the window allows: cells of 44 px and digits of 30 px at 1366x680, 72 px and 48 px at 1920x1000. The pad stands on its right, about one cell apart, its top level with the top of the grid. Its keys grow until the pad is as tall as the grid: a small slate with the cells left ("Encore 42 cases", the number in yellow chalk), three rows of three digit keys, then "Effacer" and "Notes" side by side. The keys are 86 px at 1366x680 and 155 px at 1920x1000. A window where the grid would be larger with the pad under it, and a phone, put the pad under the grid in rows of five, with the cells left beside "Notes". At 1093x530 and at 130 %, the cells are 32 px and the digits still 30 px.
- **The keys.** Each digit key has a slate blue badge (#3D5466, white 20 px figures, 7.9:1) on its corner with how many of that digit are still to place. When all nine are placed without a clash, a green check takes the place of the badge.
- **The lights.** The chosen cell has a gold ring on a faint gold. Its row, column and block are a soft white (10 %). The cells with the same digit are blue chalk (#78AAE6 at 26 %) with a blue rim, so yellow stays his. On every light, the ivory digits keep 6.4:1 or more and his yellow 4.6:1 or more. A red digit (#FF8F85) keeps 4.5:1 or more on its red tint, also when chosen.
- **Input.** One click chooses a cell, one click on a key writes the digit. The keyboard digits, Backspace, Delete, the arrows and Ctrl+Z also work. A second click on the same key within 0.5 s counts once, so a double-click never writes, notes, toggles "Notes" or undoes twice. A key held down counts once too. A refused key says why in one sentence and the cell shakes once.
- **Help without spoilers.** A digit that breaks a rule turns red at once, with the reason. A legal digit that is wrong against the solution stays yellow: the game says so only when he asks with "Une aide ?". The hint picks the simplest reason: a red digit, a wrong digit, then a cell with one possible digit, a digit with one place in a block, a row or a column, and last a longer reasoning, whose cells light in yellow with the digits they rule out. It fills the cell and rings it in yellow.
- **Notes.** "Notes" is a toggle, yellow while it is on. The notes are 27 % of a cell, 12 px on his laptop, so they are a visual aid only and break the 20 px rule on purpose: nine digits in one cell cannot reach 20 px without cells of 70 px, which his laptop cannot show. The game never needs them.
- **Writing and erasing.** A digit travels from its number key and settles into its cell in 520 ms. A note follows the same path and shrinks into its small square. A hint uses the same movement and rings the cell it explains. Erased digits and notes drift away over 360 ms, including matching notes cleared from nearby cells. Undo brings restored marks back from just above their places in 520 ms.
- **Feedback.** A refused move nudges the outline of the chosen cell for 360 ms. A clash also rings the matching digit for 2.1 s. When all nine copies of a digit are in place, the check on its key grows over 450 ms.
- **Starting and winning.** On a new slate the white digits settle in over 400 ms per block, starting 50 ms apart. When the last digit lands, a gold wave crosses the nine blocks in reading order. Each block lights for 760 ms and its digits lift together. The blocks start 160 ms apart. The win dialog opens 2.56 s after the last move. With reduced motion, marks change in place and the dialog opens immediately.
- **Levels.** The level is the hardest technique a logical solver needs, never a guess: singles for Facile (38 to 42 givens), locked candidates, pairs and naked triples for Moyen, wings, fish, hidden triples and quads for Difficile. In the tests, the steps beyond singles average 0, 4 and 8, a step of Difficile counting twice. The grid is made in a Web Worker, so the page never freezes.
## Mots mêlés

The mots mêlés are the French word search, alone, with one theme per grid.

- **Its own look.** A coral rose felt (#C8576B to #6E2234) with a coral "Nouvelle partie" button (#A63A50). The grid and its list are printed on one cream newspaper sheet (#FBF6EA) with a soft fold down the middle. The grid has the double rule of a newspaper puzzle. Its library tile shows a folded newspaper page with a grid of letters, the word VAGUE circled in blue felt pen, and a yellow pencil lying across the page.
- **Layout.** The grid on the left, the list on the right: "Mots mêlés" in small coral capitals, the theme as a headline, a double rule, then the words in capitals with their accents, each with a small round mark. The list takes one or two columns and words of 20 to 26 px, whichever leaves the largest squares. A phone puts the list under the grid, in two columns.
- **Letters.** Lexend semibold, dark ink #211A17, 90 % of their square on his laptop and 62 % on a large monitor, never under 30 px while the squares allow it: 30 px at every level at 1366 by 680, at 100 % and at 130 %. They have no accents, as in a printed grid; the second rules page says so with CHÂTEAU and CHATEAU.
- **Two clicks.** He clicks the first letter, then the last. The first letter gets a yellow disc in a dark hairline, and soft yellow dots mark the lines a word can take from it at this level. A click on it cancels it. A drag of more than 16 px also works, and a double-click counts as one click. A word is found from either end, so a word read backwards needs no special order.
- **Feedback.** A word found gets a rounded band of its own soft felt-pen colour, from the middle of its first letter to the middle of its last, and the letters show through it. Twelve colours turn in order. The list strikes the word in the same colour and fills its mark. The message line says "Vous avez trouvé CHÂTEAU."
- **Refusals.** Each says why in one sentence, and the first letter stays chosen for another try: "Ces deux lettres ne sont pas sur une même ligne : un mot se lit tout droit.", "Au niveau facile, les mots se lisent seulement vers la droite ou vers le bas.", "Presque : FOURCHETTE commence bien ici, mais sa dernière lettre est ailleurs." or "« TRAPE » n'est pas un mot de la liste : essayez une autre dernière lettre." The red rings around the two letters move gently from side to side for 420 ms. A dashed red band shows the line he chose and fades over 1.4 s.
- **Hint and undo.** "Où chercher ?" rings the first letter of the next word to find with a yellow ring that opens and settles in 480 ms and underlines the word in the list; a second press moves to the next word. "Annuler le dernier coup" (or Ctrl+Z) takes back the last word found, and its band draws back towards the letter he clicked first and fades in 320 ms.
- **Pace.** No timer and no score. The letters settle onto a new sheet in 380 ms per row, with 30 ms between rows. The squares stay still. When he chooses a letter, its yellow disc settles in 360 ms. The dots along its lines appear outwards, 18 ms apart, and each takes 320 ms to reach full size.
- **Finding a word.** The pen draws from the end he chose first to the end he chose last in 540 ms. Then the matching dot in the list settles in 380 ms and the line crosses the word in 420 ms.
- **Finishing the sheet.** After the last stroke, each coloured band swells and settles for 520 ms, in the order he found the words, 90 ms apart. A coral "Bravo !" stamp lands in the middle of the grid in 560 ms. The win dialog opens 2.24 to 2.78 s after the last word, depending on the level. The sheet says "3 mots trouvés sur 12" under the theme, and the level line says "4 victoires". With reduced motion, the marks appear in place and the win dialog opens immediately.
- **Levels.** Facile: 6 words of 4 to 6 letters in 8 by 8 or 9 by 9, to the right and down. Moyen: 9 words of 4 to 8 letters in 11 by 11, plus the two diagonals that read from left to right. Difficile: 12 words of 5 to 10 letters in 11 by 11, in all eight directions. Its grid is no larger than Moyen's, so its letters stay 30 px on his laptop at 130 %. A test proves each level asks more reading than the one below, in total and per word.
- **The words.** 21 themes he enjoys, such as le jardin, la ferme, les fromages, la boulangerie or les villes de France, with no sad or rude word. A grid never holds a word inside another one, and the filler letters never make a second copy of a word of the list or spell a rude word.

## Golf miniature

Nine holes of miniature golf, new at each game, on small floating islands in a soft sky.

- **Its own look.** A green felt around two pieces: the card of the hole on the left and the hole on the right. The card looks like the tag at a real tee: the number in a gold disc, the name, the par and the strokes in 36 px figures, a strip of the nine holes with the strokes in blue ink, and the two buttons. A phone puts the card on top and the buttons under the hole.
- **The scene.** A perspective camera, still during play, framed on each hole. One sun casts soft shadows. The lane is a rich green with mowing bands that follow the bends, inside rounded wooden rails. Higher turf is lighter and lower turf darker, so hills and dips read at a glance. Around it: trees, bushes, flower beds, rocks and a pond, in one of four colour sets. A tree or a bush that would stand in front of the lane is left out.
- **Contrast.** The white ball, the cup with its white rim and dark inside, and the red flag with the hole number all stand out from the green. A yellow ring around the ball says it can be pulled.
- **Two ways to shoot.** Press on the ball or up to 60 px from it, pull back and let go, as with a slingshot. A yellow band joins the ball and the hand. The « Force » bar in the card beside the hole fills with the strength, so nothing covers the lane. A press that moves less than 16 px is a click. A click on the lane sets a target, the dotted path shows the shot, and the yellow « Taper la balle » plays it. « − » and « + » beside the « Force » bar change the strength by one tenth in the same direction. A slip only moves the preview. Back on the ball, a pull is cancelled. Unlimited undo takes back a slip on release.
- **The preview.** White dots show the real path. They turn gold when the shot goes in. Facile shows the whole path and a white ring where the ball stops. Moyen shows the path until 0.7 m after the first bounce. Difficile shows the first 3 m and never the stop. Where the path is cut, the dots shrink and fade over the last metre, so the end does not look like a bug. After each shot, its path stays on the turf as a faint trail, so he can correct the next one. It goes as soon as he aims again, so two dotted lines never mix.
- **The shot.** The ball rolls with spin and slows down to its stop. In the cup it drops in 0.4 s, a gold ribbon says « Dans le trou ! » and confetti fly for 1.6 s. The mill's sails start from the same angle at each stroke and turn back after the shot. The flag waves for 5 s after each action, then the view rests. When the hole is over, « Trou suivant » swells by 6 % and sends out a gold ring every 1.4 s until he clicks it. With reduced motion, the ball is at its stop at once, with no ribbon and no confetti, and « Trou suivant » keeps a still gold outline.
- **The holes.** A seed saved with the game builds the course. Each hole joins a lane shape and its obstacles, with random sizes, angles, mirror, tee, cup and scenery. The solver plays each hole before it is kept. The par is the worse of two playthroughs with slips of the hand: 4° and 24 % in Facile, 3° and 17 % in Moyen, 2° and 12 % in Difficile. So a harder level also asks for a steadier hand. Most holes have par 2, some 3, a few 4.
- **The score card.** A paper card with a green header and fine rules. The strokes are in blue ink, circled under par and boxed over par, as golfers mark them. A « Bilan » column says « 1 de moins », « Le par » or « 2 de plus », and the hole in play is yellow. It fits without scrolling at 1366 by 680, 1093 by 530 and on a phone.
- **Saves.** The save keeps the seed and every target. A save from the first version, or one that no longer replays, starts a fresh course at its level. Eight strokes finish a hole. A completed course at par or better counts as one win, even if the last stroke is played again.
## Petits chevaux

The petits chevaux are the French race game on the cross-shaped board, for four players. He plays blue against three computer players. Each player has two horses, as in the French short game, and the first to bring both to the centre wins. With four horses a game took 41 to 64 minutes; with two it takes 22 minutes in the middle, with 2 s for each of his clicks, and 30 minutes for one game in ten. A save from before, with four horses, plays on with four. Blue and not yellow, so his horses never take the yellow of the frames that mean "you can move this one".

- **Its own look.** A turquoise felt (#2BA3A8 to #0F5A60) around a painted wooden board in a beech frame. The board is cream with white squares and four bright colours: rouge #D7263D, bleu #1F6FD1, vert #1F9D50 and jaune #F2B705. Each stable is its colour around a pale yard with a dashed place for each horse and the player's name. Each start square is its colour with a white arrow. The ladders are pale squares numbered 1 to 5 and a full square 6 at the centre, where four triangles meet.
- **The horses.** Pawns with a stylised horse's head on a round base, drawn in SVG, in the colour with a dark edge and a light stroke. The ones in a stable stand 1.55 times larger, so the first click of a game is an easy target. Horses that share a square stand a little apart, so each one shows. The ones at the centre stand smaller, side by side on step 6.
- **Layout.** The board fills the height under the message line: 28 px squares at 1366x680, 20 px at 1093x530, 45 px at 1920x1000. The four players stand on the left in the order they play, the die and its button on the right. A phone puts the die and then the players under the board.
- **The players.** Each card has the horse in its colour, the name, what it does now ("À vous de jouer", "Joue", "1 au centre") and a mark for each horse, filled at the centre. The player whose turn it is has a border of its colour and stands out a little. A low window drops the marks.
- **The die.** Ivory, 116 px, with sunk pips, in a panel with a border of the colour of the player who throws. A 6 shows a yellow "6 : on rejoue" tag under it.
- **Input.** One click throws, on the button or the die. The horses he can move get a dashed yellow ring that glows. A click on a pawn picks that pawn, framed or not. A click on the empty board within one square of a framed horse picks the nearest one. When two framed horses stand closer than 44 px, the roll button gives way to one 54 px button for each, "Le cheval de devant" and "Le cheval de derrière". Three or four buttons, in an older save with four horses, take two columns with short names, and the die shrinks to 72 px so they fit at every window size. Under the mouse a button grows its horse and shows where it lands. Under the mouse, a horse grows and a yellow ring shows where it would land. One click moves it, even when it is the only move: the game never moves a horse for him. A refused click shakes the horse and says why in one sentence. A double-click counts as one click.
- **The race.** Every horse takes 360 ms per square. It lifts its head, settles on its base and leaves a coloured dot that fades over 1.6 s. A captured horse nods for 420 ms, then glides back to its own place in the stable over 560 ms. A horse that reaches the centre jumps for 700 ms inside a gold ring. A refused click gives the horse a small head shake for 360 ms.
- **The turns.** His move stays on the message line for 1.4 s. His throw that no horse can use stays 2.2 s, then the computer players start after 0.5 s. Each computer player rolls the same die for 900 ms. The pips change every 300 ms, and the result stays for 450 ms before the horse moves. After landing, the next throw waits 650 ms, or 1.7 s if his horse was taken. A computer throw that no horse can use says so at once and waits 900 ms: there is nothing to watch. The pauses are `PACE` in `engine.js`, so the rules test times a game with the same numbers.
- **The win.** A gold horseshoe rises above the centre. His horses hop in a wave, 110 ms apart, as confetti in all four colours falls across the board. The win dialog opens after 2.5 s. If he opened the rules or the level picker, it waits until he closes it. With reduced motion the die and horses show their final positions immediately, and the win dialog skips the celebration.
- **Levels.** Facile plays at random, Moyen by simple rules (take a horse, else move the front horse), Difficile counts the turns each player still needs. With two horses the dice decide most of a game, so the gaps are narrow: Moyen wins 60 % of the games against Facile, Difficile 55 % against Moyen. A better player than Difficile won only 66 % against Facile in our tests.
- **Exceptions.** The numbers on the ladder squares are part of the board, like the indices of a card: they are 0.62 of a square, 12 px at 1093x530. The names in the stables are 1 square high, 20 px or more on a computer.

## Morpion

The morpion against the computer, in its two French forms: the little morpion of 3 by 3 at Facile, and the morpion of squared paper at Moyen and Difficile, five in a row on a sheet of 11 by 11.

- **Its own look.** A pastel lilac felt (#B98AC9 to #6B4580) under a sheet of French school paper: Seyès lines, a thick lilac line every square and three fine lines across it, and a red margin on the left. His crosses are in blue ballpoint ink (#1F3FBF), the computer's rings in red ink (#C8102E). On the little grid, the # is drawn by hand in dark ink over the paper.
- **Board size.** On the big sheet, one paper square is one square of the game. A sheet of 13 by 13 gave 24 px squares on his laptop with the text at 125 %, too small for his hand, so the sheet is 11 by 11: 40 px at 1366x680, 60 px at 1920x1000, 28 px at 1093x530. A save from the 13 by 13 sheet finishes its game on that sheet. The little grid has squares of 100 px or more.
- **Layout.** The sheet fills the height under the message line. On the right, his card ("Vous", "3 parties gagnées"), the computer's card with its wins in the series, and a card "Pour gagner" that says how many marks to line up, who started and the draws ("1 match nul"). A low window drops who started, then everything on the goal card except the draws. When even that does not fit, as at 1093x530, the score goes on a paper card on the left of the sheet, and the players' cards show "Les croix bleues" and the computer's level again. A phone puts the cards under the sheet, or leaves them out when there is no room, and the score goes on a paper strip above the sheet.
- **Input.** One click on a free square. Under the mouse, a free square shows a pale cross, so he sees where his cross will go. The square under the press counts, even if the hand slips up to 16 px before the release. A second click on the same square within 0.5 s is ignored. A click on a mark says whose it is.
- **Moves.** His blue cross lands in 560 ms. The pen draws one stroke, lifts, then draws the other. The computer thinks for at least 700 ms. A red circle shows where its ring will land as the pen draws it. The ring settles in 560 ms and its square stays pale red until he plays. A click on an occupied square nudges it for 360 ms. Undo lifts the marks off the paper in reverse order, 340 ms each, starting 90 ms apart.
- **A win.** After the last mark settles, a pen draws a line through the winning marks in 700 ms. If he wins, the crosses lift one after another and a gold schoolwork star stamps the middle cross for 1.28 s. The win dialog opens 2.6 s after his click. If he has opened the rules or the level choices, it waits until he closes them. With reduced motion, the marks, winning line and result appear at once.
- **Warnings.** When the computer can finish a line at its next move, or has three rings open at both ends, the message line says "Attention" and what the computer can do, and whether it can win on two squares. The warning comes back after a reload or an undo. When he can win at once, the game gives no warning.
- **Levels.** Facile plays the little morpion and makes mistakes on purpose, so he wins often. Moyen plays the big sheet with patterns only. Difficile searches forced wins by fours and by threats and looks 6 moves ahead; it answers in about 50 ms in the tests, in a Web Worker.
- **The series.** The score of the series is on the cards or the paper strip, never in the bottom bar: "Vous 3 · Ordinateur 2 · Nuls 1". His wins at every level go on the level line, "Niveau facile · 3 victoires". He starts the first game of a series, then the players take turns. "Partie suivante" on the end sheet starts the next game of the series; a new level starts a new series.
## Belote

The belote is the French classic for four, in two teams, as regles-du-jeu.net and the FFB describe it, without tierce or carré. He plays with André across the table against Simone and Henri, to 501 points: 1000 would take too long.

- **Its own look.** An ochre gold felt (#C08A2E to #6B4A12), a café table. The cards have a burgundy back (#7B2D1E). A round mat in the middle holds the trick, with the trump suit drawn large and pale on it. Its library tile shows a café table from above: the roi and the dame de cœur side by side, a score carnet with its pencil, and a cup of coffee.
- **The table.** As in the dame de pique: his hand along the bottom, the trick in a cross, André on top, Simone on the left and Henri on the right. André's seat is cream like his own, so the team reads at a glance. The right column shows the trump in a 76 px circle with who took, the points of the hand and the totals of the two teams, and the last trick. A low window drops the goal line, the captions, then the trump box and the faces under the last trick, so the last trick stays in view. A phone puts the three seats in one row and the trump and the totals in a strip under them.
- **Whose turn.** A petrol blue border (#1F6F8B) and "Henri joue". His place in the trick is a dashed cream card with "À vous". Yellow keeps its meaning: chosen, or the hint.
- **The bids.** The retourne lies face up on the mat with "La retourne" under it. Each seat shows what it said: "Passe" or "Prend ♥". On his turn, a bar above his hand asks "Prenez-vous à cœur ?" with two 58 px buttons, "Je prends ♥" and "Je passe", or one button per suit in the second round. The hint turns the button it advises yellow.
- **One click plays.** A card he cannot play is darker. A click on it says why, in a bubble above the card and in the message line: "Vous devez monter à l'atout : jouez un atout plus fort." When he has none of the suit led and André wins the trick, the line says he may play any card.
- **Belote.** "Belote !" and "Rebelote !" show in a gold bubble at the seat for 2 s, and in the message line.
- **Pace.** The others bid once per second and play one card every 0.8 s. Cards travel from the dealer, the mat, or the player's seat in 500 ms. Each lands with a small settle. The cards dealt to his hand start 90 ms apart. His other cards slide into place when he plays. A refused card shifts gently from side to side for 420 ms while the reason stays above it.
- **Taking a trick.** The full trick stays on the mat for 1.5 s with a blue frame around the winning card. The four cards then travel to the winner in 480 ms each, starting 55 ms apart. The winner's seat grows a little and settles in 600 ms.
- **The end of a hand.** A score sheet on the table: the points of the tricks, the belote, what each team marks and the totals, and one line: "contrat réussi", "dedans" in red when his team took, or "capot". A low window puts the sheet in two columns.
- **The win.** Small cream cards with all four suits drift down in three waves over 2.6 s. The win sheet opens afterward. If he is reading the rules or choosing a level, the sheet waits until he returns. With reduced motion, cards go straight to their places and the win sheet skips the celebration.
- **Levels.** Facile, Moyen and Difficile set Simone and Henri. André plays at Difficile at every level, so a weak partner never costs him a hand. In the tests, Moyen beats Facile by about 29 points a hand and Difficile beats Moyen by about 20. Difficile takes less than 20 ms a card.
