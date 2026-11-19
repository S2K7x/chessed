import { expect, test } from '@playwright/test';

test('the app installs and reviews a game offline', async ({ page, context }, info) => {
  test.skip(info.project.name === 'mobile', 'covered on desktop');
  test.setTimeout(180_000);
  await page.goto('/');
  // Manifest for installation.
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href)).json());
  expect(manifest).toMatchObject({ name: 'Chess Coach', display: 'standalone' });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  // A first review online warms the caches (engine, opening book).
  await page.getByLabel('Game link or PGN').fill('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.refining')).toHaveCount(0, { timeout: 90_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Review a game' })).toBeVisible();
  await page.getByLabel('Game link or PGN').fill('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 *');
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Game summary')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.movelist-cell').first()).toBeVisible();
  // Mark the cross-origin isolation: still on after an offline reload.
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await context.setOffline(false);
});
