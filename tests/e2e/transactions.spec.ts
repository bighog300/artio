import { expect, type Page } from '@playwright/test';

import { test } from './fixtures';

async function isServerErrorResponse(response: Response | null) {
  return response?.status() === 500;
}

async function getFirstArtworkPath(page: Page) {
  const artworksResponse = await page.goto('/artwork');
  await page.waitForLoadState('networkidle');
  expect(artworksResponse?.ok()).toBeTruthy();

  const firstArtworkLink = page.locator('a[href^="/artwork/"]').first();
  await expect(firstArtworkLink).toBeVisible();

  const href = await firstArtworkLink.getAttribute('href');
  expect(href).toBeTruthy();
  return href as string;
}

async function getFirstEventSlug(page: Page) {
  const eventsResponse = await page.goto('/events');
  await page.waitForLoadState('networkidle');
  expect(eventsResponse?.ok()).toBeTruthy();

  const eventLink = page
    .locator('a[href^="/events/"]')
    .filter({ hasNotText: /register|success/i })
    .first();
  await expect(eventLink).toBeVisible();

  const href = await eventLink.getAttribute('href');
  expect(href).toBeTruthy();

  const match = href?.match(/^\/events\/([^/?#]+)/);
  expect(match?.[1]).toBeTruthy();
  return match![1];
}

test.describe('Transactions', () => {
  test('Artwork detail page (unauthenticated)', async ({ page }) => {
    const artworkPath = await getFirstArtworkPath(page);

    const detailResponse = await page.goto(artworkPath);
    await page.waitForLoadState('networkidle');
    expect(await isServerErrorResponse(detailResponse)).toBeFalsy();

    await expect(page.locator('main h1, h1').first()).toBeVisible();

    const cta = page.getByRole('button', { name: /buy|purchase|inquire/i }).first();
    await expect(cta).toBeVisible();

    await cta.click();
    await page.waitForLoadState('networkidle');

    const redirectedToLogin = /\/login/.test(page.url());
    const signInPrompt = page.locator('text=/sign in|log in|login to continue/i').first();
    const hasPrompt = await signInPrompt.isVisible().catch(() => false);

    expect(
      redirectedToLogin || hasPrompt,
      `Expected login redirect or sign-in prompt after CTA click, but URL is ${page.url()}`,
    ).toBeTruthy();
  });

  test('Artwork purchase (Stripe mock)', async ({ userPage }) => {
    await userPage.route('**/*stripe.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });

    const artworkPath = await getFirstArtworkPath(userPage);

    await userPage.goto(artworkPath);
    await userPage.waitForLoadState('networkidle');

    const cta = userPage.getByRole('button', { name: /buy|purchase|inquire/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();

    await userPage.waitForLoadState('networkidle');

    const redirectedTowardStripe = /stripe\.com/i.test(userPage.url());
    const processingOrSuccess = userPage
      .locator('text=/processing|order confirmed|success|thank you|payment/i')
      .first();
    const hasProcessingOrSuccess = await processingOrSuccess.isVisible().catch(() => false);

    expect(
      redirectedTowardStripe || hasProcessingOrSuccess,
      'Expected Stripe redirect attempt or a processing/success indicator',
    ).toBeTruthy();

    await expect(userPage.locator('text=/unhandled|exception|something went wrong/i')).toHaveCount(0);
  });

  test('Event registration success page', async ({ userPage }) => {
    const slug = await getFirstEventSlug(userPage);

    const response = await userPage.goto(
      `/events/${slug}/register/success?confirmationCode=E2E-TEST-CODE`,
    );
    await userPage.waitForLoadState('networkidle');

    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);

    await expect(
      userPage
        .locator('text=/confirmation|registered|success|invalid code|not found|unable to verify/i')
        .first(),
    ).toBeVisible();
  });

  test('Ticket transfer form', async ({ userPage }) => {
    const registrationsResponse = await userPage.goto('/my/registrations');
    await userPage.waitForLoadState('networkidle');
    expect(await isServerErrorResponse(registrationsResponse)).toBeFalsy();

    const transferLink = userPage
      .locator('a[href*="/my/registrations/"][href$="/transfer"], a:has-text("Transfer")')
      .first();

    if (await transferLink.isVisible().catch(() => false)) {
      await transferLink.click();
      await userPage.waitForLoadState('networkidle');
    } else {
      await userPage.goto('/my/registrations/E2E-FAKE-CODE/transfer');
      await userPage.waitForLoadState('networkidle');
    }

    await expect(userPage.locator('h1, main, form, [role="alert"]').first()).toBeVisible();
    await expect(userPage.locator('text=/500|internal server error/i')).toHaveCount(0);
  });

  test('Check-in page', async ({ userPage }) => {
    const eventsResponse = await userPage.goto('/events');
    await userPage.waitForLoadState('networkidle');
    if (!eventsResponse?.ok()) {
      test.skip(true, 'Could not load /events to resolve check-in route.');
    }

    const checkInLink = userPage.locator('a[href^="/checkin/"]').first();
    if (!(await checkInLink.isVisible().catch(() => false))) {
      test.skip(true, 'Could not resolve check-in eventId from UI without DB lookup.');
    }

    const href = await checkInLink.getAttribute('href');
    if (!href) {
      test.skip(true, 'Resolved check-in link was missing href.');
    }

    const response = await userPage.goto(href!);
    await userPage.waitForLoadState('networkidle');

    const status = response?.status() ?? 0;
    if (status === 401 || status === 403 || /\/(login|my)\b/.test(userPage.url())) {
      await expect(userPage).toHaveURL(/\/(login|my)\b/);
      return;
    }

    expect(status).not.toBe(404);
    expect(status).not.toBe(500);

    await expect(
      userPage
        .locator('text=/qr|scanner|check[- ]?in|manual|ticket code|registration code/i')
        .first(),
    ).toBeVisible();
  });

  test('Stripe webhook resilience (API-level check)', async ({ page }) => {
    const response = await page.request.post('/api/stripe/webhook', {
      data: '',
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(response.status()).toBe(400);
  });
});
