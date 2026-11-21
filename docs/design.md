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

- **Top bar.** Light surface #F6F8F7 with dark text #1B2422, a hairline and a soft shadow. Buttons are 54 px high with a 15 px radius, 21 px semibold text and 2 px line icons. "Quel coup jouer ?" is the only yellow button (#FFC83D). "Annuler le dernier coup" and "Règles" are light grey (#E4E9E7). "Nouvelle partie" is on the far right, white on the felt green (#0B6B5D). A disabled undo button is #5F6764 on #EEF1F0.
- **Message line.** A white rounded strip under the bar, 46 px high, 22 px semibold dark text and a small chat icon. One line and one height, so the board never moves.
- **Table.** One deep green-teal, #1A6A5F at the top to #0F4F47.
- **Bank and slots.** No frame. Empty places are translucent white rounded shapes (9%). Labels are 20 px sans-serif. An empty foundation shows a soft suit and "As". An empty column says "Roi". The empty stock shows a white arrow and "Retourner la pioche". The stock count is a white pill.
- **Piles.** Buried cards cast no shadow, so a thick pile has no dark halo.
- **Width.** Cards grow to 170 px and the gaps to 18% of a card. A 1920x1000 window has 73 px margins.
- **Yellow.** The ring and the frames are #FFC83D with a dark hairline, so they show on a white card. The ring has a soft glow.
- **Dialogs and rules.** White sheets with a 24 px radius, a large soft shadow, bold 32 px titles and 58 px buttons. The rules guide has a "Fermer" button with a cross, 54 px high, at the top right of every page. The win sheet shows a yellow badge with a check mark that grows in once (450 ms, off with reduced motion).

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

- **Its own look.** A wine-red felt (#7E2F38 to #4C161E) around a wooden board: light squares #F0E2C4, dark squares #A06D48, a walnut frame. His pieces are ivory, the computer's are black with a grey rim, so both show on the dark squares. A king wears a large gold crown.
- **Board size.** The board fills the height under the message line: 49 px squares at 1366x680, 84 px at 1920x1000. A side column shows the computer and him, the pieces each has left, whose turn it is, and the moves left before a draw.
- **Two clicks, always.** He clicks a piece, then a framed square, even when there is one move. A slip on a piece only chooses it. During a capture he clicks each landing, so the route is always his choice. The game never guesses between two routes.
- **Captures.** The pieces that must take have a dashed yellow ring. A taken piece gets a red cross and stays until the end of the move, as on a real board.
- **The computer's move.** It waits at least 0.7 s, so his own move is seen landing first. Its piece then travels one landing at a time, 0.52 s apart, crossing out what it takes. Its start and end squares stay lit until he chooses a piece, and the message line says what it took.
- **Levels.** Facile searches 2 plies and, 40% of the time, picks a move that loses at most 0.9 of a man against the best one. It still never misses a compulsory capture. Moyen and Fort search deeper with alpha-beta and follow every compulsory capture past the depth limit, so they do not give pieces away.
- **No settings.** The level is the only choice, at "Nouvelle partie", and it is kept.
