import { expect, test } from '@playwright/test'

test('dashboard loads and container search filters rows', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Good morning, Jordan' })).toBeVisible()
  await page.getByPlaceholder('Filter containers...').fill('postgres')
  await expect(page.getByText('postgres-main', { exact: true })).toBeVisible()
  await expect(page.getByText('redis-cache', { exact: true })).toHaveCount(0)
})

test('container actions update its running state', async ({ page }) => {
  await page.goto('/')
  const worker = page.getByRole('row').filter({ hasText: 'worker-queue' })
  await worker.getByRole('button', { name: 'Start worker-queue' }).click()
  await expect(worker.getByText('Running')).toBeVisible()
})
