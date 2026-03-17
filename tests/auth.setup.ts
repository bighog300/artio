import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');

  await page.getByRole('button', { name: /continue with email/i }).click();

  await page.getByLabel(/email/i).fill(process.env.TEST_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.TEST_PASSWORD!);

  await page.getByRole('button', { name: /login/i }).click();

  await page.waitForURL('**/for-you');

  await expect(page.locator('nav')).toBeVisible();

  await page.context().storageState({ path: authFile });
});
