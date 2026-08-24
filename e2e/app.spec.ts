import { expect, test, type Page } from '@playwright/test'

function hint(page: Page) {
  return page.locator('.timer-hint')
}

async function completeSolve(page: Page, method: 'pointer' | 'keyboard' = 'pointer') {
  await expect(hint(page)).toContainText(/tap and hold to start/i)
  if (method === 'keyboard') {
    await page.keyboard.down('Space')
    await expect(hint(page)).toContainText(/Hold|Release to start/i)
    await page.waitForTimeout(800)
    await page.keyboard.up('Space')
    await expect(hint(page)).toContainText(/stop/i, { timeout: 8000 })
    await page.keyboard.down('Space')
    await page.keyboard.up('Space')
    await expect(page.getByRole('button', { name: 'Save time' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(hint(page)).toContainText(/tap and hold to start/i)
    return
  }
  const timer = page.getByRole('button', { name: 'Timer' })
  const box = await timer.boundingBox()
  if (!box) {
    throw new Error('Timer control is not visible')
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(hint(page)).toContainText(/Hold|Release to start/i)
  await page.waitForTimeout(800)
  await page.mouse.up()
  await expect(hint(page)).toContainText(/stop/i, { timeout: 8000 })
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Save time' })).toBeVisible()
  await page.getByRole('button', { name: 'Save time' }).click()
  await expect(hint(page)).toContainText(/tap and hold to start/i)
}

test('times a solve with the keyboard on mobile layout', async ({ page }) => {
  test.skip(test.info().project.name === 'desktop', 'mobile layout only')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await completeSolve(page, 'keyboard')
})

test('recovers when a hold is interrupted', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(hint(page)).toContainText(/tap and hold to start/i)
  const timer = page.getByRole('button', { name: 'Timer' })
  const box = await timer.boundingBox()
  if (!box) {
    throw new Error('Timer control is not visible')
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(hint(page)).toContainText(/Hold|Release to start/i)
  await page.evaluate(() => {
    document.querySelector('[aria-label="Timer"]')?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))
  })
  await expect(hint(page)).toContainText(/tap and hold to start/i)
})

test('shows the desktop widget dashboard and shared header nav', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'desktop layout only')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(page.locator('.sync-pill')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit widgets' })).toBeVisible()

  const dashboard = page.locator('.desktop-dashboard')
  const timer = page.getByRole('button', { name: 'Timer' })
  const leftRail = page.locator('.widget-column').first()
  const timerBox = await timer.boundingBox()
  const railBox = await leftRail.boundingBox()
  const dashboardBox = await dashboard.boundingBox()
  if (!timerBox || !railBox || !dashboardBox) {
    throw new Error('Desktop dashboard layout is not visible')
  }
  expect(timerBox.width).toBeGreaterThan(railBox.width)
  expect(timerBox.width).toBeGreaterThan(dashboardBox.width * 0.4)

  const averages = page.locator('.widget-grid-item').filter({ hasText: 'Averages' })
  const ao100 = averages.getByText('Ao100', { exact: true })
  await expect(ao100).toBeVisible()
  const widgetBox = await averages.boundingBox()
  const aoBox = await ao100.boundingBox()
  if (!widgetBox || !aoBox) {
    throw new Error('Averages widget is not visible')
  }
  expect(aoBox.y + aoBox.height).toBeLessThanOrEqual(widgetBox.y + widgetBox.height + 1)

  await page.getByRole('button', { name: 'Edit widgets' }).click()
  await expect(page.getByRole('button', { name: 'Done editing widgets' })).toBeVisible()
  await expect(page.getByText('Add widget').first()).toBeVisible()
  await page.getByRole('button', { name: 'Remove' }).first().click()
  await page.getByRole('combobox').first().selectOption('recentTimes')
  await page.getByRole('button', { name: 'Done editing widgets' }).click()
  await expect(page.getByRole('button', { name: 'Edit widgets' })).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.locator('.desktop-dashboard')).toHaveCount(0)
  await expect(page.locator('.sync-pill')).toBeVisible()
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Timer', exact: true }).click()
  await expect(page.locator('.desktop-dashboard')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent times' }).first()).toBeVisible()
})

test('keeps local solves available while the API is offline', async ({ page }) => {
  await page.route('http://127.0.0.1:43781/**', (route) => route.abort())
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await completeSolve(page)
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await expect(page.locator('.chip').first()).toBeVisible({ timeout: 8000 })
})

test('locks auth submit and merges guest data after a mocked sign-in', async ({ page }) => {
  let loginCalls = 0
  await page.route('**/v1/auth/login', async (route) => {
    loginCalls += 1
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
  await page.route('**/v1/sync', async (route) => {
    const body = route.request().postDataJSON() as { mutations: Array<{ entity: string }> }
    expect(body.mutations.length === 0 || body.mutations[0]?.entity === 'session').toBeTruthy()
    await route.fulfill({
      json: { outcomes: [], changes: [], next_cursor: 0, has_more: false },
    })
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await completeSolve(page)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('link', { name: 'Sign in' }).click()
  await page.getByLabel('Email').fill('user@example.com')
  await page.getByLabel('Password').fill('supersecret1')
  const submit = page.getByRole('button', { name: 'Sign in' })
  await Promise.all([submit.click(), submit.click()])
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.locator('.sync-pill')).toBeVisible()
  expect(loginCalls).toBe(1)
})

test('closes the stats delete dialog with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await completeSolve(page)
  await page.getByRole('link', { name: 'Stats', exact: true }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('dialog', { name: /delete solve/i })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
