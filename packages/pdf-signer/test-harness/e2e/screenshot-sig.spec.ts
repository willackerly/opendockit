import { test } from '@playwright/test';

test('screenshot hybrid signature appearance', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Load demo PDF
  await page.click('button:has-text("Load Demo PDF")');
  await page.waitForSelector('#viewer-pane canvas', { timeout: 10_000 });
  await page.waitForTimeout(1500);

  // Open Sign Document section
  const signSection = page.locator('details[data-section="sign"]');
  await signSection.locator('summary').click();
  await page.waitForTimeout(300);

  // Ensure "Hybrid" mode is selected
  await page.selectOption('#sig-style', 'hybrid');

  // Click Sign as User 1
  await page.click('#sign-user1');

  // Wait for signing to complete (look for success toast or sig container content)
  await page.waitForSelector('.sig-info', { timeout: 15_000 });
  await page.waitForTimeout(2000);

  // Full page screenshot
  await page.screenshot({ path: '../tmp/pw-full.png' });

  // Viewer pane only
  const viewer = page.locator('#viewer-pane');
  await viewer.screenshot({ path: '../tmp/pw-viewer.png' });
});
