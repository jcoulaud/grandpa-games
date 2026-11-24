// Exercise the same controls in each game, including resuming an existing game.
import assert from 'node:assert/strict';
import { gameUrl, launch } from './harness.mjs';

const browser = await launch();
try {
  for (const game of ['solitaire', 'freecell', 'dames', 'dame-de-pique', 'demineur', 'yams', 'bataille-navale', 'paires', 'huit-americain', 'rami', 'belote', 'morpion', 'petits-chevaux', 'mots-meles', 'sudoku']) {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto(gameUrl(game));
    // The first visit starts a game at Facile at once, with no guide and no dialog.
    if (game === 'sudoku') await page.waitForFunction(() => G && !making);
    assert.equal(await page.evaluate(() => Kit.isOpen()), false, game + ' opens on the table');
    assert.equal(await page.locator('#level').innerText(), 'Niveau facile');
    const choices = page.locator('#overBtns button');
    for (const label of ['Facile', 'Moyen', 'Difficile']) {
      await page.click('#newBtn');
      // During a game "Continuer la partie" comes after the levels, and it is the yellow one.
      const texts = await choices.allTextContents();
      const back = 'Continuer la partie';
      assert.ok([['Facile', 'Moyen', 'Difficile', back], [back, 'Facile', 'Moyen', 'Difficile']].some(o => o.join() === texts.join()), texts.join());
      if (await page.locator('#overText.warn').count()) assert.equal(await page.locator('#overBtns button.primary').textContent(), back);
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
