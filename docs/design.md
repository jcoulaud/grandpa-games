# Solitaire design

For one elderly French speaker with weak eyes and an unsteady mouse hand, in Edge on a 1366x768 laptop or a 1920x1080 monitor.

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

**The finish is faster.** Once every card is face up, cards go home every 140 ms instead of 450 ms. The four finished piles then hop twice (500 ms each, 120 ms apart), and the win dialog opens after 1500 ms. The toolbar shows "Victoires : N".

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

- **Top bar.** Light surface #F6F8F7 with dark text #1B2422, a hairline and a soft shadow. Buttons are 54 px high with a 15 px radius, 21 px semibold text and 2 px line icons. The hint button ("Montrer un bon coup", or "Montrer une bonne carte" in the Dame de pique) is the only yellow button (#FFC83D). "Annuler le dernier coup" and "Règles" are light grey (#E4E9E7). "Nouvelle partie" is on the far right, white on the felt green (#0B6B5D). A disabled undo button is #5F6764 on #EEF1F0.
- **Message line.** Right under the top bar, where his eyes already are: a cream band (#FFF4D6) with a gold edge, 52 px high, 23 px bold dark text and a small chat icon. The win count (and the flags in the Démineur) sit on its left, the size keys on its right, so the board keeps the height it had with the line at the bottom. A new text flashes the band yellow once. One height, so the board never moves. A text too long for one line takes two lines at 20 px in the same height, instead of being cut. Under 900 px wide the band takes the whole width and the counts and size keys go under the board. Only a phone lets the band grow.
- **Labels on one line.** The bar measures itself: the long labels if they fit, else the short ones ("Annuler le coup", "Un bon coup"), else one word each ("Annuler", "Idée"), and last without the name of the game. No label ever wraps.
- **The level.** Under the name of the game, on the left of the bar, in 20 px grey: "Niveau facile". The "Nouvelle partie" button only says what it does.
- **Choosing the level.** One wide button per level, with what it means under its name ("Pour commencer en douceur"). The first time, Facile is yellow; after that, the level last played. During a game, "Continuer la partie" comes first and is yellow, and the dialog says in bold red that choosing a level erases the game.
- **The size of the page.** "Réduire" and "Agrandir", two keys with a magnifying glass and no number, sit by the clock on the library and at the right of the message line in each game, because few people know the zoom of the browser. It enlarges everything, from 80 % to 200 %, never more than the window holds (1050 by 520 px of page, so 130 % on his laptop). The size is kept and shared by every window.
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
- **Card size.** The card size is set for columns of six cards. The four columns of seven cards squeeze a little on a laptop. At 1366x680 the cards are 101 px wide.
- **One click.** The empty free cells count as one place, and so do the empty columns. A card that fits nowhere else goes to the first free cell with one click.
- **Runs.** A click on a card in an ordered run takes the card and the cards on it. When the run is too long for the room, the message line gives the number of cards that can move now.
- **Solver.** It searches best-first and wins about 98% of random deals in less than 30,000 positions, in about 20 ms. A deal is kept only if the solver wins it.

## Dames

The jeu de dames is international draughts on the 10x10 board, as the FMJD and the FFJD play it. Two second opinions (GPT-6.2 Astra and GPT-6.2 Sol) checked the rules, the draw limits and the input design against the FMJD 2024 annexes.

- **Its own look.** A wine-red felt (#7E2F38 to #4C161E) around a real-looking board: grained maple light squares, walnut dark squares, a walnut frame with a thin gold line. It sits in the middle of the screen.
- **Pieces.** Thick discs with two grooves and a visible edge, ivory for him and black for the computer, as real pieces. A king is two pieces stacked, as on a real board, with a large gold crown.
- **Board size.** The board fills the height under the message line: 48 px squares at 1366x680, 79 px at 1920x1000.
- **The two players.** The computer's panel sits top left, by its pieces. His sits bottom right, by his. Each panel has a tray of 20 places that fills with the pieces that side has taken, so the score reads at a glance; a new piece drops in. The panel whose turn it is has a yellow border and says "À vous de jouer" or "Il réfléchit". A narrower window puts both panels on the right.
- **Two clicks, always.** He clicks a piece, then a framed square, even when there is one move. A slip on a piece only chooses it. During a capture he clicks each landing, so the route is always his choice. The game never guesses between two routes.
- **Captures.** The pieces that must take have a dashed yellow ring. A taken piece gets a red cross and stays until the end of the move, as on a real board.
- **The computer's move.** It waits at least 0.7 s, so his own move is seen landing first. Its piece then travels one landing at a time, 0.52 s apart, crossing out what it takes. Its start and end squares stay lit until he chooses a piece, and the message line says what it took.
- **Levels.** Facile searches 2 plies and, 40% of the time, picks a move that loses at most 0.9 of a man against the best one. It still never misses a compulsory capture. Moyen and Difficile search deeper with alpha-beta and follow every compulsory capture past the depth limit, so they do not give pieces away.
- **No settings.** The level is the only choice, at "Nouvelle partie", and it is kept.

## Dame de pique

The dame de pique is Hearts for four, in the Windows rules that French players know. Two second opinions (GPT-6.2 Sol and GPT-6.2 Astra) checked the rules, the computer players and the edge cases of the input and the saves.

- **Its own look.** A deep plum felt (#5E3B78 to #2C1840). Its library tile shows the queen of spades upright in front of two hearts. Four tiles now share one row of the library.
- **The table.** His hand runs along the bottom. Each card shows its top 80%, so the corner with the rank and the suit is always in view, and the cards stay large: 125 px wide at 1366x680. The trick lies in a cross in the middle, each card in front of its player. Paul sits on top, Jeanne on the left and Louise on the right, each with an initial in a coloured circle, a small fan of backs for the cards left, and the points taken in this hand.
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
