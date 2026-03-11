import { PrismaClient } from '@prisma/client';
import { expect, type Page } from '@playwright/test';

import { test } from './fixtures';

const prisma = new PrismaClient();

let createdVenueId: string | null = null;
let firstArtistSlugForDupCheck: string | null = null;

async function gotoAndWait(page: Page, path: string) {
  const response = await page.goto(path);
  await page.waitForLoadState('networkidle');
  return response;
}

async function getFirstSlugFromListing(page: Page, listingPath: string, segment: 'artists' | 'venues') {
  await gotoAndWait(page, listingPath);

  const links = page.locator(`a[href^="/${segment}/"]`);
  const total = await links.count();

  for (let i = 0; i < total; i += 1) {
    const href = await links.nth(i).getAttribute('href');
    if (!href) continue;
    const match = href.match(new RegExp(`^/${segment}/([^/?#]+)$`));
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  throw new Error(`Could not find a ${segment.slice(0, -1)} slug from ${listingPath}`);
}

function submissionFeedbackLocator(page: Page) {
  return page
    .locator('p, div, [role="alert"], main')
    .filter({ hasText: /check your email|under review|submitted|success|verify|pending review|already/i })
    .first();
}

test.describe('Claims & submissions', () => {
  test('Artist claim page (unauthenticated)', async ({ page }) => {
    const slug = await getFirstSlugFromListing(page, '/artists', 'artists');
    const response = await gotoAndWait(page, `/artists/${slug}/claim`);

    expect(response?.status()).toBeLessThan(500);

    const claimForm = page.locator('form').first();
    const signInPrompt = page.locator('a, button').filter({ hasText: /sign in|log in|claim/i }).first();

    if (await claimForm.isVisible()) {
      await expect(claimForm).toBeVisible();
      await expect(page.locator('input[type="email"], input').first()).toBeVisible();
      return;
    }

    await expect(signInPrompt).toBeVisible();
    await signInPrompt.click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  });

  test('Artist claim (authenticated)', async ({ userPage }) => {
    const slug = await getFirstSlugFromListing(userPage, '/artists', 'artists');
    firstArtistSlugForDupCheck = slug;

    const response = await gotoAndWait(userPage, `/artists/${slug}/claim`);
    expect(response?.status()).toBeLessThan(500);

    const form = userPage.locator('form').first();
    await expect(form).toBeVisible();

    const nameInput = form.locator('input[type="text"], input').first();
    const emailInput = form.locator('input[type="email"]').first();

    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();

    await nameInput.fill('E2E Claimant');
    await emailInput.fill('e2e-claimant@example.com');

    await form.locator('button[type="submit"], input[type="submit"]').first().click();
    await userPage.waitForLoadState('networkidle');

    const onVerifyPage = new RegExp(`/artists/${slug}/claim/verify(?:\\?|$)`).test(userPage.url());
    if (!onVerifyPage) {
      await expect(submissionFeedbackLocator(userPage)).toBeVisible();
    }
  });

  test('Venue claim page (authenticated)', async ({ userPage }) => {
    const slug = await getFirstSlugFromListing(userPage, '/venues', 'venues');

    const response = await gotoAndWait(userPage, `/venues/${slug}/claim`);
    expect(response?.status()).toBeLessThan(500);

    const form = userPage.locator('form').first();
    await expect(form).toBeVisible();

    const roleInput = form.locator('input, textarea').first();
    await expect(roleInput).toBeVisible();

    await form.locator('input').first().fill('Owner');
    const optionalMessage = form.locator('textarea').first();
    if (await optionalMessage.count()) {
      await optionalMessage.fill('E2E venue claim request.');
    }

    await form.locator('button[type="submit"], input[type="submit"]').first().click();
    await userPage.waitForLoadState('networkidle');

    const onVerifyPage = new RegExp(`/venues/${slug}/claim/verify(?:\\?|$)`).test(userPage.url());
    if (!onVerifyPage) {
      await expect(submissionFeedbackLocator(userPage)).toBeVisible();
    }
  });

  test('Claim verify page (token validation)', async ({ page }) => {
    const slug = await getFirstSlugFromListing(page, '/artists', 'artists');
    const response = await gotoAndWait(page, `/artists/${slug}/claim/verify?token=invalid-token`);

    expect(response?.status()).toBeLessThan(500);

    const invalidMessage = page.locator('main, p, div').filter({ hasText: /invalid|expired|token/i }).first();
    await expect(invalidMessage).toBeVisible();
    await expect(page.locator('text=/500|internal server error|application error/i')).toHaveCount(0);
  });

  test('New venue submission (/my/venues/new)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/venues/new');
    expect(response?.status()).toBeLessThan(500);

    const form = userPage.locator('form').first();
    await expect(form).toBeVisible();

    await form.locator('input').first().fill('E2E Test Venue');
    await form.locator('input').nth(1).fill('London');

    await form.locator('button[type="submit"]').first().click();
    await userPage.waitForLoadState('networkidle');

    const venueUrlMatch = userPage.url().match(/\/my\/venues\/([0-9a-f-]{36})/i);
    createdVenueId = venueUrlMatch?.[1] ?? createdVenueId;

    if (!venueUrlMatch) {
      const messageOrValidation = userPage
        .locator('p, div, [role="alert"], main')
        .filter({ hasText: /success|created|required|invalid|error/i })
        .first();
      await expect(messageOrValidation).toBeVisible();
    }

    await expect(userPage.locator('text=/500|internal server error|application error|unhandled/i')).toHaveCount(0);
  });

  test('New event submission (/my/events/new)', async ({ userPage }) => {
    const response = await gotoAndWait(userPage, '/my/events/new');
    expect(response?.status()).toBeLessThan(500);

    const form = userPage.locator('form').first();
    await expect(form).toBeVisible();

    await form.locator('input').first().fill('E2E Test Event');

    const future = new Date();
    future.setDate(future.getDate() + 7);
    const futureDate = future.toISOString().split('T')[0];

    const dateField = form.locator('input[type="date"], input[type="datetime-local"]').first();
    if (await dateField.count()) {
      await dateField.fill(futureDate);
    }

    await form.locator('button[type="submit"], input[type="submit"]').first().click();
    await userPage.waitForLoadState('networkidle');

    const createdDetailPage = /\/my\/events\/[0-9a-f-]{36}(?:\?|$)/i.test(userPage.url());
    if (!createdDetailPage) {
      await gotoAndWait(userPage, '/my/events');
      await expect(
        userPage
          .locator('table, main, body')
          .filter({ hasText: /E2E Test Event|event|draft|submitted|empty/i })
          .first(),
      ).toBeVisible();
    }
  });

  test('Submit event for venue (/my/venues/[id]/submit-event)', async ({ userPage }) => {
    if (!createdVenueId) {
      const venuesResponse = await gotoAndWait(userPage, '/my/venues');
      expect(venuesResponse?.status()).toBeLessThan(500);
      const submitLink = userPage.locator('a[href*="/submit-event"]').first();
      if (!(await submitLink.count())) {
        test.skip(true, 'No venue available for submit-event flow');
      }
      const href = await submitLink.getAttribute('href');
      if (!href) {
        test.skip(true, 'No submit-event route found for user venues');
      }
      const match = href?.match(/\/my\/venues\/([0-9a-f-]{36})\/submit-event/i);
      createdVenueId = match?.[1] ?? null;
    }

    if (!createdVenueId) {
      test.skip(true, 'No venue id available for submit-event test');
    }

    const response = await gotoAndWait(userPage, `/my/venues/${createdVenueId}/submit-event`);
    expect(response?.status()).toBeLessThan(500);

    await expect(userPage).toHaveURL(/\/my\/events\?/);

    const titleField = userPage.locator('input[name*="title" i], input[id*="title" i], input[placeholder*="title" i]').first();
    if (await titleField.count()) {
      await expect(titleField).toBeVisible();
    } else {
      const createEventLink = userPage.locator('a[href^="/my/events/new"]').first();
      await expect(createEventLink).toBeVisible();
    }

    const dateField = userPage.locator('input[type="date"], input[type="datetime-local"]').first();
    if (await dateField.count()) {
      await expect(dateField).toBeVisible();
    }
  });

  test('Submission duplicate prevention', async ({ userPage }) => {
    const slug = firstArtistSlugForDupCheck ?? (await getFirstSlugFromListing(userPage, '/artists', 'artists'));

    await gotoAndWait(userPage, `/artists/${slug}/claim`);
    const form = userPage.locator('form').first();
    await expect(form).toBeVisible();

    await form.locator('input').first().fill('E2E Claimant Duplicate Attempt');
    await form.locator('input[type="email"]').first().fill('e2e-claimant@example.com');
    await form.locator('button[type="submit"], input[type="submit"]').first().click();
    await userPage.waitForLoadState('networkidle');

    const duplicateGuard = userPage
      .locator('p, div, [role="alert"], main')
      .filter({ hasText: /already claimed|pending review|already exists|already submitted|under review/i })
      .first();

    await expect(duplicateGuard).toBeVisible();
    await expect(userPage.locator('text=/500|internal server error|application error|unhandled/i')).toHaveCount(0);
  });

  test.afterAll(async () => {
    await prisma.submission.deleteMany({
      where: {
        OR: [
          { note: { contains: 'E2E', mode: 'insensitive' } },
          { targetVenue: { name: { contains: 'E2E', mode: 'insensitive' } } },
          { targetEvent: { title: { contains: 'E2E', mode: 'insensitive' } } },
        ],
      },
    });

    await prisma.event.deleteMany({
      where: { title: { contains: 'E2E', mode: 'insensitive' } },
    });

    await prisma.venue.deleteMany({
      where: { name: { contains: 'E2E', mode: 'insensitive' } },
    });

    await prisma.$disconnect();
  });
});
