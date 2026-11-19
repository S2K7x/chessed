import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const LEGALL = `[White "Legall"]
[Black "learner"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`;

async function seriousViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string }[] }> } }).axe;
    return axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
  });
  return result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

/** No element wider than the page (long French strings must wrap). */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test('switches the whole app between English and French, and remembers the choice', async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Show my games' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('.nav').getByRole('button', { name: 'Parties' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Afficher mes parties' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The choice survives a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Analyser une partie' })).toBeVisible();

  // An analysis in French: classification, explanation and summary.
  await page.getByLabel('Lien de la partie ou PGN').fill(LEGALL);
  await page.getByRole('button', { name: 'Analyser', exact: true }).click();
  await expect(page.getByText('Résumé de la partie')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });
  await page.locator('.movelist-cell', { hasText: 'Bxd1' }).click();
  await expect(page.locator('.coach-title')).toContainText('Gaffe');
  await expect(page.locator('.coach-summary')).toContainText('échec et mat forcé en 2');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  if (info.project.name === 'desktop') expect(await seriousViolations(page)).toEqual([]);

  // Back to English: the stored review is written again, without a new analysis.
  await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.coach-title')).toContainText('Blunder');
  await expect(page.locator('.coach-summary')).toContainText('forced checkmate in 2');
  await expect(page.locator('.progress')).toHaveCount(0);

  // Settings offer the same switch.
  await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Français' }).check();
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  if (info.project.name === 'desktop') expect(await seriousViolations(page)).toEqual([]);
});

test.describe('with a French browser', () => {
  test.use({ locale: 'fr-FR' });

  test('starts in French', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { name: 'Analyser une partie' })).toBeVisible();
    await page.locator('.nav').getByRole('button', { name: 'Entraînement' }).click();
    await expect(page.getByRole('heading', { name: 'Entraînement' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Devinez le coup' })).toBeVisible();
  });
});
