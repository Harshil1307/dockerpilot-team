import { expect, test, type Page } from '@playwright/test';

async function mockSignedOutSession(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/auth/me') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Authentication required.' }) });
    }
    if (path === '/auth/google/config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: false }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found.' }) });
  });
}

test('public landing page introduces DockerPilot and offers account creation', async ({ page }) => {
  await mockSignedOutSession(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your Docker Engine/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Get started/ }).first()).toHaveAttribute('href', '/register');
});

test('visitors can open the sign-in page from the landing page', async ({ page }) => {
  await mockSignedOutSession(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
