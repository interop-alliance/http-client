import { test, expect } from '@playwright/test'

// TEST_HTTP_HOST is set by test/globalSetup.ts before tests run.
const httpHost = process.env['TEST_HTTP_HOST']!

test.beforeEach(async ({ page }) => {
  await page.goto('/test/index.html')
})

test('has correct exports', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const mod = await import('/src/index.browser.ts')
    return {
      hasHttpClient: typeof mod.httpClient === 'function',
      hasDefaultHeaders: typeof mod.DEFAULT_HEADERS === 'object',
      acceptHeader: (mod.DEFAULT_HEADERS as Record<string, string>)['Accept']
    }
  })
  expect(result.hasHttpClient).toBe(true)
  expect(result.hasDefaultHeaders).toBe(true)
  expect(result.acceptHeader).toBe('application/ld+json, application/json')
})

test('can make a GET request to the test server', async ({ page }) => {
  const result = await page.evaluate(async (host: string) => {
    const { httpClient } = await import('/src/index.browser.ts')
    const response = await httpClient.get(`http://${host}/ping`)
    return { status: response.status, data: (response as unknown as { data: unknown }).data }
  }, httpHost)
  expect(result.status).toBe(200)
  expect(result.data).toBeTruthy()
})

test('sends default JSON Accept header', async ({ page }) => {
  const result = await page.evaluate(async (host: string) => {
    const { httpClient } = await import('/src/index.browser.ts')
    const response = await httpClient.get(`http://${host}/headers`)
    const body = (response as unknown as { data: { headers: Record<string, string> } }).data
    return body.headers['accept']
  }, httpHost)
  expect(result).toBe('application/ld+json, application/json')
})

test('handles a CORS error', async ({ page }) => {
  const result = await page.evaluate(async (host: string) => {
    const { httpClient } = await import('/src/index.browser.ts')
    const url = `http://${host}/nocors`
    try {
      await httpClient.get(url)
      return { caught: false, message: null }
    } catch (err) {
      return { caught: true, message: (err as Error).message }
    }
  }, httpHost)
  expect(result.caught).toBe(true)
  expect(result.message).toContain('Possible CORS error')
})

test('handles a 404 error with JSON body in error.data', async ({ page }) => {
  const result = await page.evaluate(async (host: string) => {
    const { httpClient } = await import('/src/index.browser.ts')
    const url = `http://${host}/404`
    try {
      await httpClient.get(url)
      return { caught: false, status: null, data: null }
    } catch (err) {
      const e = err as { status?: number; data?: { code: number; description: string } }
      return { caught: true, status: e.status, data: e.data }
    }
  }, httpHost)
  expect(result.caught).toBe(true)
  expect(result.status).toBe(404)
  expect(result.data).toEqual({ code: 404, description: 'Not Found' })
})

test('extend() adds Authorization header', async ({ page }) => {
  const result = await page.evaluate(async (host: string) => {
    const { httpClient } = await import('/src/index.browser.ts')
    const client = httpClient.extend({ headers: { Authorization: 'Bearer test123' } })
    const response = await client.get(`http://${host}/headers`)
    const body = (response as unknown as { data: { headers: Record<string, string> } }).data
    return body.headers['authorization']
  }, httpHost)
  expect(result).toBe('Bearer test123')
})
