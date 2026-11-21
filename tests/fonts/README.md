# Test fonts

`tests/layout.mjs` draws every screen with these fonts in place of Segoe UI, so a layout check gives the same result on any machine.

- `selawik-*.woff2`: Selawik 1.01 by Microsoft, unchanged from https://github.com/microsoft/Selawik/releases. It has the metrics of Segoe UI, the font on his PC. SIL Open Font License 1.1, in `LICENSE-selawik.txt`.
- `dejavu-*.woff2`: DejaVu Sans 2.37 from https://github.com/dejavu-fonts/dejavu-fonts/releases, cut to the Latin letters, the punctuation and the card suits with `pyftsubset`. It is much wider than Segoe UI, so it shows where a longer text or a fallback font would break the layout. Bitstream Vera and DejaVu license, in `LICENSE-dejavu.txt`.
