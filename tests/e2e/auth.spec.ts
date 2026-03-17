import { expect, type Page } from '@playwright/test';

import { test } from './fixtures';

async function gotoAndWait(page: Page, path: string) {
  const response = await page.goto(path);
  await page.waitForLoadState('networkidle');
  return response;
}

test.describe('Auth & onboarding', () => {
  test('Login page (unauthenticated)', async ({ page }) => {
    const response = await gotoAndWait(page, '/login');
    expect(response?.status()).toBe(200);

    const signIn = page
      .locator('button:has-text("Continue with Google"), button:has-text("Sign in with Google"), button:has-text("Continue with email"), a:has-text("Continue with Google"), a:has-text("Sign in with Google")')
      .first();
    await expect(signIn).toBeVisible();

    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page).not.toHaveURL(/\/$/);
  });

  test('Authenticated redirect from /login', async ({ userPage }) => {
    await gotoAndWait(userPage, '/login');

    await expect(userPage).not.toHaveURL(/\/login(?:\?|$)/);
  });

  test('Get started (/get-started)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/get-started');
    expect(response?.status()).toBe(200);

    const heading = userPage.locator('h1, h2').filter({ hasText: /get started|welcome|let\'s/i }).first();
    await expect(heading).toBeVisible();

    const interactive = userPage.locator('button, a[href]').first();
    await expect(interactive).toBeVisible();
  });

  test('Preferences (/preferences)', async ({ userPage }) => {
    const pageErrors: string[] = [];
    userPage.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    const response = await gotoAndWait(userPage, '/preferences');
    expect(response?.status()).toBe(200);

    const preferenceOptions = userPage.locator(
      'input[type="checkbox"], button[aria-pressed], button:has-text("#"), [role="checkbox"]',
    );
    await expect(preferenceOptions.first()).toBeVisible();

    const firstOption = preferenceOptions.first();
    await firstOption.click();
    await userPage.waitForLoadState('networkidle');

    expect(pageErrors, `Unexpected page errors: ${pageErrors.join('\n')}`).toEqual([]);
  });

  test('Account page (/account)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/account');
    expect(response?.status()).toBe(200);

    const accountHeading = userPage.locator('h1, h2').filter({ hasText: /my account|account/i }).first();
    const userName = userPage.locator('[data-testid="user-name"], [aria-label*="name" i], p, span').filter({
      hasText: /[A-Za-z]{2,}/,
    }).first();

    await expect(accountHeading.or(userName)).toBeVisible();
  });

  test('Notifications (/notifications)', async ({ userPage }) => {
    const pageErrors: string[] = [];
    userPage.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    const response = await gotoAndWait(userPage, '/notifications');
    expect(response?.status()).toBe(200);
    expect(pageErrors, `Unexpected page errors: ${pageErrors.join('\n')}`).toEqual([]);

    const notificationState = userPage
      .locator('label, [role="switch"], [role="checkbox"], p, div')
      .filter({ hasText: /notification|email|push|no notifications/i })
      .first();

    await expect(notificationState).toBeVisible();
  });

  test('Following feed (/following)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/following');
    expect(response?.status()).toBe(200);

    const feedOrEmptyState = userPage
      .locator('main, section, [data-testid="feed"], [data-testid="empty-state"]')
      .filter({ hasText: /following|feed|no follows|discover|find people|empty/i })
      .first();

    await expect(feedOrEmptyState).toBeVisible();
  });

  test('Unauthenticated redirect from /account', async ({ page }) => {
    await gotoAndWait(page, '/account');

    const onLogin = /\/login(?:\?|$)/.test(page.url());
    const signInPrompt = page.locator('text=/sign in|log in|continue with google/i').first();

    if (!onLogin) {
      await expect(signInPrompt).toBeVisible();
      return;
    }

    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  });

  test('Unsubscribe (/unsubscribe)', async ({ page }) => {
    const response = await gotoAndWait(page, '/unsubscribe?token=invalid-token');
    expect(response?.status()).toBe(200);

    const stateMessage = page.locator('main, body').filter({ hasText: /invalid|expired|unsubscribe|token|error/i }).first();
    await expect(stateMessage).toBeVisible();

    const serverError = page.locator('text=/500|internal server error|application error/i').first();
    await expect(serverError).toHaveCount(0);
  });
});
