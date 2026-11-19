import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const LEGALL = `[White "Legall"]
[Black "learner"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`;

/** WCAG 2.1 A/AA violations of serious or critical impact on the page. */
async function audit(page: Page, name: string): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
    return axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
  });
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${name}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
}

for (const scheme of ['dark', 'light'] as const) {
  test(`main screens have no serious accessibility violations (${scheme})`, async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'covered on desktop');
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await page.locator('.nav').getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Lichess username').fill('learner');
    const found: string[] = [];
    found.push(...(await audit(page, 'settings')));
    await page.locator('.nav').getByRole('button', { name: 'Games' }).click();
    found.push(...(await audit(page, 'home')));
    await page.getByLabel('Game link or PGN').fill(LEGALL);
    await page.getByRole('button', { name: 'Analyse' }).click();
    await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });
    found.push(...(await audit(page, 'review summary')));
    await page.locator('.movelist-cell', { hasText: 'Bxd1' }).click();
    found.push(...(await audit(page, 'review move')));
    await page.locator('.nav').getByRole('button', { name: 'Training' }).click();
    await expect(page.getByRole('heading', { name: 'Training' })).toBeVisible();
    found.push(...(await audit(page, 'training')));
    await page.getByRole('button', { name: 'Guess the move' }).click();
    await expect(page.locator('.guess-list')).toBeVisible();
    found.push(...(await audit(page, 'guess')));
    await page.locator('.nav').getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible();
    found.push(...(await audit(page, 'progress')));
    expect(found).toEqual([]);
  });
}
