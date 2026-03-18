import { expect, type Page } from '@playwright/test';

import { test } from './fixtures';

async function gotoAndWait(page: Page, path: string) {
  const response = await page.goto(path);
  await page.waitForLoadState('networkidle');
  return response;
}

function pageMainContent(page: Page) {
  return page.locator('main, body').first();
}

test.describe('User dashboard', () => {
  test('Dashboard home (/my)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my');
    expect(response?.status()).toBeLessThan(500);

    const headingOrName = userPage
      .locator('h1, h2, [data-testid="user-name"], [aria-label*="name" i]')
      .filter({ hasText: /dashboard|welcome|my|[A-Za-z]{2,}/i })
      .first();

    await expect(headingOrName).toBeVisible();
  });

  test('Events list (/my/events)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/events');
    expect(response?.status()).toBeLessThan(500);

    const listOrEmpty = pageMainContent(userPage)
      .locator('a, li, div, p, h1, h2')
      .filter({ hasText: /event|no events|empty|nothing here|you have no/i })
      .first();
    await expect(listOrEmpty).toBeVisible();

    const createEventCta = userPage
      .locator('a, button')
      .filter({ hasText: /create event|new event/i })
      .first();
    await expect(createEventCta).toBeVisible();
  });

  test('Create event form (/my/events/new)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/events/new');
    expect(response?.status()).toBeLessThan(500);

    const form = userPage.locator('form').first();
    await expect(form).toBeVisible();

    const titleInput = form
      .locator('input[name*="title" i], input[id*="title" i], input[placeholder*="title" i]')
      .first();
    const dateInput = form.locator('input[type="date"], input[name*="date" i], input[id*="date" i]').first();
    const submitButton = form.locator('button[type="submit"], input[type="submit"]').first();

    await expect(titleInput).toBeVisible();
    await expect(dateInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    await submitButton.click();

    const validationOrNo500 = userPage
      .locator('[role="alert"], .error, [aria-invalid="true"], p, div')
      .filter({ hasText: /required|invalid|please|must|error/i })
      .first();

    await expect(validationOrNo500).toBeVisible();
    await expect(userPage.locator('text=/500|internal server error|application error/i')).toHaveCount(0);
  });

  test('Venues list (/my/venues)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/venues');
    expect(response?.status()).toBeLessThan(500);

    const venuesOrEmpty = pageMainContent(userPage)
      .locator('a, li, div, p, h1, h2')
      .filter({ hasText: /venue|no venues|empty|nothing here|you have no/i })
      .first();
    await expect(venuesOrEmpty).toBeVisible();

    const addVenue = userPage
      .locator('a, button')
      .filter({ hasText: /add venue|new venue/i })
      .first();
    await expect(addVenue).toBeVisible();
  });

  test('Create venue form (/my/venues/new)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/venues/new');
    expect(response?.status()).toBeLessThan(500);

    const form = userPage.locator('form').first();
    await expect(form).toBeVisible();

    const nameInput = form
      .locator('input[name*="name" i], input[id*="name" i], input[placeholder*="name" i]')
      .first();
    const submitButton = form.locator('button[type="submit"], input[type="submit"]').first();

    await expect(nameInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    await submitButton.click();

    const validationOrNo500 = userPage
      .locator('[role="alert"], .error, [aria-invalid="true"], p, div')
      .filter({ hasText: /required|invalid|please|must|error/i })
      .first();

    await expect(validationOrNo500).toBeVisible();
    await expect(userPage.locator('text=/500|internal server error|application error/i')).toHaveCount(0);
  });

  test('Artist profile (/my/artist)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/artist');
    expect(response?.status()).toBeLessThan(500);

    const profileFormOrClaimCta = userPage
      .locator('form, a, button, h1, h2, p, div')
      .filter({ hasText: /artist profile|claim your artist profile|claim profile|become an artist/i })
      .first();

    await expect(profileFormOrClaimCta).toBeVisible();
  });

  test('Artwork list (/my/artwork)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/artwork');
    expect(response?.status()).toBeLessThan(500);

    const artworksOrEmpty = pageMainContent(userPage)
      .locator('a, li, div, p, h1, h2')
      .filter({ hasText: /artwork|no artwork|empty|nothing here|you have no/i })
      .first();

    await expect(artworksOrEmpty).toBeVisible();
  });

  test('Create artwork (/my/artwork/new)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/artwork/new');
    expect(response?.status()).toBeLessThan(500);

    // /my/artwork/new auto-creates a draft and redirects to the edit page
    // Wait for the redirect to settle
    await userPage.waitForLoadState('networkidle');

    // The edit page renders inputs directly (not inside a <form> tag)
    const titleField = userPage
      .locator('input[name*="title" i], input[id*="title" i], input[placeholder*="title" i], input[id="title"]')
      .first();
    const descriptionField = userPage
      .locator('textarea[name*="description" i], textarea[id*="description" i], textarea[id="description"], textarea')
      .first();

    await expect(titleField).toBeVisible({ timeout: 10000 });
    await expect(descriptionField).toBeVisible({ timeout: 10000 });

    await expect(userPage.locator('text=/500|internal server error|application error/i')).toHaveCount(0);
  });

  test('Collection (/my/collection)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/collection');
    expect(response?.status()).toBeLessThan(500);

    const savedOrEmpty = pageMainContent(userPage)
      .locator('a, li, div, p, h1, h2')
      .filter({ hasText: /collection|saved|favorites|no items|empty/i })
      .first();

    await expect(savedOrEmpty).toBeVisible();
  });

  test('Settings (/my/settings)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/settings');
    expect(response?.status()).toBeLessThan(500);

    const nameOrEmailField = userPage
      .locator('input[type="email"], input[name*="email" i], input[name*="name" i], input[id*="name" i]')
      .first();

    await expect(nameOrEmailField).toBeVisible();
  });

  test('Analytics (/my/analytics)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/analytics');
    expect(response?.status()).toBeLessThan(500);

    const analyticsWidgetOrEmpty = userPage
      .locator('canvas, svg, table, [role="table"], p, div, h1, h2')
      .filter({ hasText: /analytics|no data yet|no data|views|visits|performance/i })
      .first();

    await expect(analyticsWidgetOrEmpty).toBeVisible();
    await expect(userPage.locator('text=/500|internal server error|application error/i')).toHaveCount(0);
  });

  test('Unauthenticated access redirects to /login', async ({ page }) => {
    await gotoAndWait(page, '/my');
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  });
});
