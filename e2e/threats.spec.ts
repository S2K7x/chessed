import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const LEGALL = `[White "Legall"]
[Black "Saint Brie"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`;

test('shows the opponent threat and exports an annotated PGN', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Game link or PGN').fill(LEGALL);
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });

  // After 5. Nxe5, White threatens Bxf7+ and Nd5# (or to take the bishop on g4).
  await page.locator('.movelist-cell', { hasText: 'Nxe5' }).click();
  await page.keyboard.press('x');
  await expect(page.locator('.threat-line')).toContainText('Your opponent threatens', { timeout: 30_000 });
  await page.screenshot({ path: `test-results/threat-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Threat' }).click();
  await expect(page.locator('.threat-line')).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export annotated PGN' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Legall-Saint_Brie.*\.pgn$/);
  const pgn = await readFile((await file.path())!, 'utf8');
  expect(pgn).toContain('[Annotator ');
  expect(pgn).toContain('Bxd1 $4');
  expect(pgn).toContain('Nxe5 $3');
  expect(pgn).toContain('[%eval ');
  expect(pageErrors).toEqual([]);
});
