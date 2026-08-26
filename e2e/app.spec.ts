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

test('keeps the navbar visible while the timer is running', async ({ page }) => {
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
  await page.waitForTimeout(800)
  await page.mouse.up()
  await expect(hint(page)).toContainText(/stop/i, { timeout: 8000 })
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()

  await page.mouse.down()
  await page.mouse.up()
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

test('hides account solves once a stored session is revoked', async ({ page }) => {
  const accountId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  await mockCubeSync(page, 'user')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByLabel('Email').fill('user@example.com')
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForTimeout(500)

  await page.evaluate(
    (ownerId) =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('cubetimer')
        req.onsuccess = () => {
          const db = req.result
          const now = new Date().toISOString()
          db.transaction('sessions', 'readwrite').objectStore('sessions').put({
            id: 'session-1', ownerId, name: 'Main', event: '3x3', kind: 'manual',
            startedAt: now, endedAt: null, archived: false, version: 0, updatedAt: now, deletedAt: null,
          })
          db.transaction('solves', 'readwrite').objectStore('solves').put({
            id: 'solve-1', ownerId, sessionId: 'session-1', durationMs: 1000, penalty: 'none',
            solvedAt: now, scramble: 'R U', event: '3x3', version: 0, updatedAt: now, deletedAt: null,
          })
          resolve()
        }
      }),
    accountId,
  )
  await page.goto('/stats')
  await expect(page.locator('.stat-card').filter({ hasText: 'Solves' }).locator('.value').first()).toHaveText('1', { timeout: 8000 })

  await page.route('**/v1/auth/refresh', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'invalid_refresh_token', message: 'invalid' } } }),
  )
  await page.reload()
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible({ timeout: 8000 })
  await page.goto('/stats')
  await expect(page.getByText('No solves yet')).toBeVisible()
  await expect(page.locator('.stat-card')).toHaveCount(0)

  const currentOwner = await page.evaluate(() =>
    new Promise<string>((resolve) => {
      const req = indexedDB.open('cubetimer')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('meta', 'readonly')
        const get = tx.objectStore('meta').get('owner.current')
        get.onsuccess = () => resolve(String(get.result?.value ?? ''))
      }
    }),
  )
  expect(currentOwner.startsWith('guest:')).toBe(true)
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

function mockAuthSession(role: 'user' | 'admin') {
  return {
    access_token: `access-${role}`,
    refresh_token: `refresh-${role}`,
    token_type: 'Bearer',
    expires_in: 900,
    user: {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      email: `${role}@example.com`,
      email_verified: true,
      user_role: role,
    },
  }
}

async function mockCubeSync(page: Page, role: 'user' | 'admin' = 'user') {
  await page.route('**/v1/auth/login', async (route) => {
    await route.fulfill({ json: mockAuthSession(role) })
  })
  await page.route('**/v1/auth/refresh', async (route) => {
    await route.fulfill({ json: mockAuthSession(role) })
  })
  await page.route('**/v1/sync', async (route) => {
    await route.fulfill({
      json: { outcomes: [], changes: [], next_cursor: 0, has_more: false },
    })
  })
}

test('hides admin navigation from guests and sends them to sign-in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Admin' })).toHaveCount(0)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('shows admin metrics for an admin account', async ({ page }) => {
  await mockCubeSync(page, 'admin')
  await page.route('**/v1/admin/stats/overview', async (route) => {
    await route.fulfill({
      json: {
        total_users: 12,
        verified_users: 10,
        new_users_24h: 1,
        new_users_7d: 3,
        new_users_30d: 8,
        active_users_24h: 4,
        active_users_7d: 7,
        active_users_30d: 9,
        total_devices: 15,
        total_sessions: 40,
        total_solves: 200,
      },
    })
  })
  await page.route('**/v1/admin/stats/requests**', async (route) => {
    await route.fulfill({
      json: {
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-25T00:00:00.000Z',
        interval: 'day',
        points: [
          {
            bucket: '2026-08-24T00:00:00.000Z',
            request_count: 10,
            status_2xx: 8,
            status_3xx: 0,
            status_4xx: 1,
            status_5xx: 1,
            average_duration_ms: 12.5,
            max_duration_ms: 40,
          },
        ],
      },
    })
  })
  await page.route('**/v1/admin/stats/errors**', async (route) => {
    await route.fulfill({
      json: {
        from: '2026-08-18T00:00:00.000Z',
        to: '2026-08-25T00:00:00.000Z',
        interval: 'day',
        points: [
          {
            bucket: '2026-08-24T00:00:00.000Z',
            method: 'POST',
            route: '/v1/sync',
            status_code: 409,
            request_count: 4,
          },
        ],
      },
    })
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('link', { name: 'Admin', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible()
  await expect(page.locator('.stat-card').filter({ hasText: 'Users' }).locator('.value')).toHaveText('12')
  await expect(page.getByRole('heading', { name: 'Errors by route' })).toBeVisible()
  await expect(page.getByText('/v1/sync')).toBeVisible()
})

test('denies the admin dashboard to signed-in users', async ({ page }) => {
  await mockCubeSync(page, 'user')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByLabel('Email').fill('user@example.com')
  await page.getByLabel('Password').fill('supersecret1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Admin' })).toHaveCount(0)
  await page.goto('/admin')
  await expect(page.getByText('Access denied')).toBeVisible()
})

