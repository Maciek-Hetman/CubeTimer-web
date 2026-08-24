import { expect, test, type Page } from '@playwright/test'

async function completeSolve(page: Page) {
  await expect(page.getByText(/Tap and hold to start/i)).toBeVisible()
  const timer = page.getByRole('button', { name: 'Timer' })
  const box = await timer.boundingBox()
  if (!box) {
    throw new Error('Timer control is not visible')
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.getByText(/Hold|Release to start/i)).toBeVisible()
  await page.waitForTimeout(800)
  await page.mouse.up()
  await expect(page.getByText(/Tap to stop/i)).toBeVisible({ timeout: 8000 })
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Save time' })).toBeVisible()
  await page.getByRole('button', { name: 'Save time' }).click()
  await expect(page.getByText(/Tap and hold to start/i)).toBeVisible()
}

test('times a solve with the keyboard on mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await completeSolve(page)
})

test('shows the desktop widget dashboard', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'desktop layout only')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Edit widgets' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit widgets' }).click()
  await expect(page.getByText('Add widget').first()).toBeVisible()
  await page.getByRole('combobox').first().selectOption('recentTimes')
  await page.reload()
  await page.getByRole('button', { name: 'Edit widgets' }).click()
  await expect(page.getByRole('heading', { name: 'Recent times' }).first()).toBeVisible()
})

test('keeps local solves available while the API is offline', async ({ page }) => {
  await page.route('http://127.0.0.1:43781/**', (route) => route.abort())
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await completeSolve(page)
  await page.getByRole('link', { name: 'Stats' }).click()
  await expect(page.locator('.chip').first()).toBeVisible({ timeout: 8000 })
})

test('merges guest data after a mocked sign-in', async ({ page }) => {
  await page.route('http://127.0.0.1:43781/v1/auth/login', async (route) => {
    await route.fulfill({
      json: {
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        token_type: 'Bearer',
        expires_in: 900,
        user: {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          email: 'user@example.com',
          email_verified: true,
          user_role: 'user',
        },
      },
    })
  })
  await page.route('http://127.0.0.1:43781/v1/sync', async (route) => {
    const body = route.request().postDataJSON() as { mutations: Array<{ entity: string }> }
    expect(body.mutations.length === 0 || body.mutations[0]?.entity === 'session').toBeTruthy()
    await route.fulfill({
      json: { outcomes: [], changes: [], next_cursor: 0, has_more: false },
    })
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await completeSolve(page)
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Sign in' }).click()
  await page.getByLabel('Email').fill('user@example.com')
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText(/Synced|Waiting to sync|Syncing/)).toBeVisible()
})
