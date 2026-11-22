# Agent notes

- The player is one elderly French speaker with weak eyes and an unsteady mouse hand. Before a change to a page, read `docs/design.md`, and follow its "Rules for every screen".
- To add a game, follow "Add a game" in `README.md`.
- After a change, run only the tests of the game or shared file that changed, and `bun run test:rules` if an engine changed. CI runs only `bun run typecheck` and `bun run test:rules`.
- Do not open the screenshots in `tests/screenshots/` unless the user asks for a visual check. The tests print PASS or FAIL.
