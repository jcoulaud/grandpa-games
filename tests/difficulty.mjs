// Exercise the same controls in each game, including resuming an existing game.
import assert from 'node:assert/strict';
import { gameUrl, launch } from './harness.mjs';

const browser = await launch();
try {
  for (const game of ['solitaire', 'freecell', 'dames', 'dame-de-pique', 'demineur', 'yams', 'bataille-navale', 'paires', 'huit-americain', 'rami', 'belote', 'morpion', 'petits-chevaux', 'mots-meles', 'sudoku']) {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto(gameUrl(game));
    assert.equal(await page.evaluate(id => GG.load(id), game), null);
    await page.click('#helpClose');
    await page.keyboard.press('Escape');
    const choices = page.locator('#overBtns button');
    for (const label of ['Facile', 'Moyen', 'Difficile']) {
      const first = label === 'Facile';
      if (!first) await page.click('#newBtn');
      // During a game "Continuer la partie" comes first; otherwise the levels come first.
      const texts = await choices.allTextContents();
      const back = first ? 'Fermer le jeu' : 'Continuer la partie';
      assert.ok([['Facile', 'Moyen', 'Difficile', back], [back, 'Facile', 'Moyen', 'Difficile']].some(o => o.join() === texts.join()), texts.join());
      // The yellow button: Facile the first time, "Continuer la partie" during a game.
      if (first) assert.equal(await page.locator('#overBtns button.primary').textContent(), 'Facile');
      if (texts[0] === back) assert.equal(await page.locator('#overBtns button.primary').textContent(), back);
      const choice = choices.getByText(label, { exact: true });
      if (game === 'dames' || game === 'dame-de-pique' || game === 'demineur' || game === 'yams' || game === 'bataille-navale' || game === 'paires' || game === 'huit-americain' || game === 'rami' || game === 'belote' || game === 'morpion' || game === 'petits-chevaux' || game === 'mots-meles' || game === 'sudoku') {
        await choice.click();
        // The sudoku makes its grid in a worker: the save comes after it.
        if (game === 'sudoku') await page.waitForFunction(() => G && !making);
      } else {
        // Inspect the chosen deal in the click handler's turn, before automatic moves.
        const valid = await choice.evaluate(button => {
          button.click();
          const result = solve(toSolver(), 2500);
          return result.win && dealLevel(result.nodes) === level;
        });
        assert.ok(valid, game + ' ' + label);
      }
      const levelText = 'Niveau ' + label.toLowerCase();
      assert.equal(await page.locator('#level').innerText(), levelText);
      await page.evaluate(() => GG.flush());
      await page.reload();
      assert.equal(await page.locator('#level').innerText(), levelText);
      await page.click('#newBtn');
      await choices.getByText('Continuer la partie').click();
      assert.equal(await page.locator('#level').innerText(), levelText);
      assert.equal(await page.locator('#over').isVisible(), false);
    }
    if (game === 'solitaire' || game === 'freecell') {
      assert.ok(await page.evaluate(() => Object.entries(fallbackSeeds).every(([key, seeds]) =>
        seeds.every(seed => {
          S = freshDeal(Cards.seededRandom(seed));
          const result = solve(toSolver(), 2500);
          return result.win && dealLevel(result.nodes) === key;
        }))));
    }
    await page.close();
    console.log('PASS difficulty selection and reload in ' + game);
  }
} finally {
  await browser.close();
}
