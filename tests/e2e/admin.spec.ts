import { PrismaClient } from '@prisma/client';
import { expect, type Page } from '@playwright/test';

import { test } from './fixtures';

const prisma = new PrismaClient();

let editedEventId: string | null = null;
let originalEditedEventTitle: string | null = null;

async function gotoAndWait(page: Page, path: string) {
  const response = await page.goto(path);
  await page.waitForLoadState('networkidle');
  return response;
}

function mainContent(page: Page) {
  return page.locator('main, body').first();
}

function noServerErrorLocator(page: Page) {
  return page.locator('text=/500|internal server error|application error|unhandled/i');
}

test.describe('Admin @slow', () => {
  test.beforeEach(async ({}) => {
    test.info().annotations.push({ type: 'tag', description: '@slow' });
  });

  test('Admin access (unauthenticated)', async ({ page }) => {
    await gotoAndWait(page, '/admin');
    await expect(page).toHaveURL(/\/login/i);
  });

  test('Admin access (wrong role)', async ({ userPage }) => {
    await gotoAndWait(userPage, '/admin');

    const redirectedToLogin = /\/login/i.test(userPage.url());
    if (!redirectedToLogin) {
      const denied = mainContent(userPage)
        .locator('h1, h2, p, div')
        .filter({ hasText: /403|forbidden|access denied|not authorized|unauthorized/i })
        .first();
      await expect(denied).toBeVisible();
    }
  });

  test('Admin dashboard (/admin)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin');
    expect(response?.status()).toBeLessThan(500);

    const dashboardMarker = mainContent(adminPage)
      .locator('h1, h2, h3, p, div')
      .filter({ hasText: /admin|dashboard|summary|overview/i })
      .first();

    await expect(dashboardMarker).toBeVisible();
  });

  test('Moderation queue (/admin/moderation)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/moderation');
    expect(response?.status()).toBeLessThan(500);

    const queueOrEmpty = mainContent(adminPage)
      .locator('table, li, div, p, h1, h2')
      .filter({ hasText: /pending|review|moderation|nothing to review|empty|no items/i })
      .first();
    await expect(queueOrEmpty).toBeVisible();

    const approveButton = adminPage.getByRole('button', { name: /approve/i }).first();
    if (await approveButton.count()) {
      await expect(approveButton).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /reject/i }).first()).toBeVisible();
    }
  });

  test('Approve action (moderation)', async ({ adminPage }) => {
    await gotoAndWait(adminPage, '/admin/moderation');

    const approveButtons = adminPage.getByRole('button', { name: /approve/i });
    const beforeCount = await approveButtons.count();
    if (!beforeCount) {
      test.skip(true, 'No pending moderation item available to approve');
    }

    await approveButtons.first().click();
    await adminPage.waitForLoadState('networkidle');

    const afterCount = await adminPage.getByRole('button', { name: /approve/i }).count();
    const approvedMarker = mainContent(adminPage)
      .locator('td, li, div, p, span')
      .filter({ hasText: /approved/i })
      .first();

    if (afterCount >= beforeCount) {
      await expect(approvedMarker).toBeVisible();
    }
    await expect(noServerErrorLocator(adminPage)).toHaveCount(0);
  });

  test('Events admin list (/admin/events)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/events');
    expect(response?.status()).toBeLessThan(500);

    await expect(
      mainContent(adminPage)
        .locator('table, ul, ol, div, h1, h2')
        .filter({ hasText: /event|events|no events|empty/i })
        .first(),
    ).toBeVisible();

    await expect(adminPage.getByRole('link', { name: /new event|create event/i }).first()).toBeVisible();
  });

  test('Create event (admin) (/admin/events/new)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/events/new');
    expect(response?.status()).toBeLessThan(500);

    const form = adminPage.locator('form').first();
    await expect(form).toBeVisible();

    const titleInput = form.locator('input[name*="title" i], input[id*="title" i], input').first();
    const startDateInput = form.locator('input[type="date"], input[type="datetime-local"], input[name*="start" i]').first();
    const venueSelector = form.locator('select[name*="venue" i], select[id*="venue" i], [role="combobox"]').first();

    await expect(titleInput).toBeVisible();
    await expect(startDateInput).toBeVisible();
    await expect(venueSelector).toBeVisible();

    await titleInput.fill('E2E Admin Create Event Validation');
    await form.locator('button[type="submit"], input[type="submit"]').first().click();
    await adminPage.waitForLoadState('networkidle');

    const validation = mainContent(adminPage)
      .locator('[role="alert"], .error, [aria-invalid="true"], p, div')
      .filter({ hasText: /required|invalid|please|must|error/i })
      .first();
    await expect(validation).toBeVisible();
    await expect(noServerErrorLocator(adminPage)).toHaveCount(0);
  });

  test('Edit event (/admin/events/[id])', async ({ adminPage }) => {
    await gotoAndWait(adminPage, '/admin/events');

    const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
    if (!(await editLink.count())) {
      test.skip(true, 'No event available to edit');
    }

    const editHref = await editLink.getAttribute('href');
    if (editHref) {
      const idMatch = editHref.match(/\/admin\/events\/([0-9a-f-]{8,})/i);
      editedEventId = idMatch?.[1] ?? null;
    }

    await editLink.click();
    await adminPage.waitForLoadState('networkidle');

    const form = adminPage.locator('form').first();
    await expect(form).toBeVisible();

    const titleInput = form.locator('input[name*="title" i], input[id*="title" i], input').first();
    await expect(titleInput).toBeVisible();

    originalEditedEventTitle = await titleInput.inputValue();
    expect(originalEditedEventTitle.trim().length).toBeGreaterThan(0);

    await titleInput.fill('E2E Admin Updated Title');
    await form.locator('button[type="submit"], input[type="submit"]').first().click();
    await adminPage.waitForLoadState('networkidle');

    const successOrRedirect =
      /\/admin\/events(?:\?|$)/i.test(adminPage.url()) ||
      (await mainContent(adminPage)
        .locator('p, div, [role="status"], [role="alert"]')
        .filter({ hasText: /saved|updated|success/i })
        .first()
        .isVisible());

    expect(successOrRedirect).toBeTruthy();
    await expect(noServerErrorLocator(adminPage)).toHaveCount(0);
  });

  test('Venues admin (/admin/venues)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/venues');
    expect(response?.status()).toBeLessThan(500);

    await expect(
      mainContent(adminPage)
        .locator('table, ul, ol, div, h1, h2')
        .filter({ hasText: /venue|venues|no venues|empty/i })
        .first(),
    ).toBeVisible();
    await expect(adminPage.getByRole('link', { name: /new venue|create venue/i }).first()).toBeVisible();
  });

  test('Users list (/admin/users)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/users');
    expect(response?.status()).toBeLessThan(500);

    await expect(mainContent(adminPage).locator('table, ul, ol, div').first()).toBeVisible();
    await expect(mainContent(adminPage).locator('text=/e2e-admin@test\.local/i')).toBeVisible();
    await expect(mainContent(adminPage).locator('text=/e2e-user@test\.local/i')).toBeVisible();
  });

  test('Ops dashboard (/admin/ops)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/ops');
    expect(response?.status()).toBeLessThan(500);

    await expect(
      mainContent(adminPage)
        .locator('h1, h2, h3, p, div')
        .filter({ hasText: /ops|health|status|jobs|summary/i })
        .first(),
    ).toBeVisible();
    await expect(noServerErrorLocator(adminPage)).toHaveCount(0);
  });

  test('Audit log (/admin/ops/audit)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/ops/audit');
    expect(response?.status()).toBeLessThan(500);

    await expect(
      mainContent(adminPage)
        .locator('table, li, div, p, h1, h2')
        .filter({ hasText: /audit|log|entry|no entries|empty/i })
        .first(),
    ).toBeVisible();
  });

  test('Ingest dashboard (/admin/ingest)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/ingest');
    expect(response?.status()).toBeLessThan(500);

    await expect(
      mainContent(adminPage)
        .locator('h1, h2, h3, p, div')
        .filter({ hasText: /ingest|status|run|dashboard|pipeline/i })
        .first(),
    ).toBeVisible();
    await expect(noServerErrorLocator(adminPage)).toHaveCount(0);
  });

  test('Tags (/admin/tags)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/tags');
    expect(response?.status()).toBeLessThan(500);

    await expect(mainContent(adminPage).locator('text=/painting/i').first()).toBeVisible();
  });

  test('Settings (/admin/settings)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/settings');
    expect(response?.status()).toBeLessThan(500);

    await expect(
      mainContent(adminPage)
        .locator('input, select, textarea, [role="switch"], [role="checkbox"]')
        .first(),
    ).toBeVisible();
  });

  test('Venue claims queue (/admin/venue-claims)', async ({ adminPage }) => {
    const response = await gotoAndWait(adminPage, '/admin/venue-claims');
    expect(response?.status()).toBeLessThan(500);

    await expect(
      mainContent(adminPage)
        .locator('table, li, div, p, h1, h2')
        .filter({ hasText: /claim|queue|review|no claims|empty/i })
        .first(),
    ).toBeVisible();
  });

  test.afterAll(async () => {
    if (editedEventId && originalEditedEventTitle) {
      const event = await prisma.event.findUnique({
        where: { id: editedEventId },
        select: { id: true, title: true },
      });

      if (event?.title.includes('E2E Admin Updated')) {
        await prisma.event.update({
          where: { id: editedEventId },
          data: { title: originalEditedEventTitle },
        });
      }
    }

    await prisma.$disconnect();
  });
});
