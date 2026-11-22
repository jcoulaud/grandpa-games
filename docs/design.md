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
- **Finishing the sheet.** After the last stroke, each coloured band swells and settles for 520 ms, in the order he found the words, 90 ms apart. A coral "Bravo !" stamp lands in the middle of the grid in 560 ms. The win dialog opens 2.24 to 2.78 s after the last word, depending on the level. The bottom bar shows "Mots trouvés : 3 sur 12" and "Grilles finies : 4". With reduced motion, the marks appear in place and the win dialog opens immediately.
- **Levels.** Facile: 6 words of 4 to 6 letters in 8 by 8 or 9 by 9, to the right and down. Moyen: 9 words of 4 to 8 letters in 11 by 11, plus the two diagonals that read from left to right. Difficile: 12 words of 5 to 10 letters in 11 by 11, in all eight directions. Its grid is no larger than Moyen's, so its letters stay 30 px on his laptop at 130 %. A test proves each level asks more reading than the one below, in total and per word.
- **The words.** 21 themes he enjoys, such as le jardin, la ferme, les fromages, la boulangerie or les villes de France, with no sad or rude word. A grid never holds a word inside another one, and the filler letters never make a second copy of a word of the list or spell a rude word.
