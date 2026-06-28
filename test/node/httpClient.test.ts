import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { httpClient, kyPromise, DEFAULT_HEADERS } from '../../src/index.js'
import {
  startTestServers,
  makeHttpsAgent,
  type TestServers
} from '../testServer.js'

let servers: TestServers
let httpHost: string
let httpsHost: string

beforeAll(async () => {
  servers = await startTestServers()
  httpHost = servers.httpHost
  httpsHost = servers.httpsHost
})

afterAll(async () => {
  await servers.close()
})

describe('http-client API', () => {
  it('has proper exports', async () => {
    const ky = await kyPromise
    expect(ky).toBeTruthy()
    expect(ky).toBeTypeOf('function')
    expect(DEFAULT_HEADERS).toHaveProperty('Accept')
    expect(httpClient).toBeTypeOf('function')
  })

  it('can ping HTTP test server', async () => {
    const response = await httpClient.get(`http://${httpHost}/ping`)
    expect(response.status).toBe(200)
    expect(response.data).toBeTruthy()
  })

  it('can ping HTTPS test server with self-signed cert', async () => {
    const agent = makeHttpsAgent({ rejectUnauthorized: false })
    const response = await httpClient.get(`https://${httpsHost}/ping`, {
      agent
    })
    expect(response.status).toBe(200)
    expect(response.data).toBeTruthy()
  })

  it('handles a get not found error', async () => {
    const url = `http://${httpHost}/status/404`
    let err: (Error & { response?: Response; requestUrl?: string }) | undefined
    try {
      await httpClient.get(url)
    } catch (caught) {
      err = caught as typeof err
    }
    expect(err).toBeTruthy()
    expect(err!.message.toUpperCase()).toContain('NOT FOUND')
    expect(err!.response).toBeTruthy()
    expect(err!.response!.status).toBe(404)
    expect(err!.requestUrl).toBe(url)
  })

  it('handles a connection refused error', async () => {
    const url = 'https://localhost:65535'
    let err:
      | (Error & {
          response?: Response
          requestUrl?: string
          cause?: { code?: string }
          code?: string
        })
      | undefined
    try {
      await httpClient.get(url, { headers: { Accept: 'text/plain' } })
    } catch (caught) {
      err = caught as typeof err
    }
    expect(err).toBeTruthy()
    expect(err!.response).toBeUndefined()
    expect(err!.requestUrl).toBe(url)
    // Node 18+ places error code in err.cause
    const cause = err!.cause ?? err!
    if ((cause as { code?: string }).code) {
      expect((cause as { code?: string }).code).toBe('ECONNREFUSED')
    }
  })

  it('handles a network error', async () => {
    let err: Error | undefined
    try {
      await httpClient.get('http://localhost:9876/does-not-exist')
    } catch (caught) {
      err = caught as Error
    }
    expect(err).toBeTruthy()
    expect(err!.message).toSatisfy(
      (msg: string) =>
        msg.includes('connect ECONNREFUSED') || msg.includes('fetch failed')
    )
  })

  it('handles a TimeoutError', async () => {
    const url = `http://${httpHost}/delay/2`
    let err: (Error & { requestUrl?: string }) | undefined
    try {
      await httpClient.get(url, { timeout: 1000 })
    } catch (caught) {
      err = caught as typeof err
    }
    expect(err).toBeTruthy()
    expect(err!.message).toBe(`Request to "${url}" timed out.`)
    expect(err!.requestUrl).toBe(url)
  })

  it('sends default JSON Accept header', async () => {
    const response = await httpClient.get(`http://${httpHost}/headers`)
    expect(response.status).toBe(200)
    const body = response.data as { headers: Record<string, string> }
    expect(body.headers['accept']).toBe('application/ld+json, application/json')
  })

  it('allows overriding the Accept header', async () => {
    const response = await httpClient.get(`http://${httpHost}/headers`, {
      headers: { accept: 'text/html' }
    })
    expect(response.status).toBe(200)
    const body = response.data as { headers: Record<string, string> }
    expect(body.headers['accept']).toBe('text/html')
  })

  it('handles a successful get with JSON data', async () => {
    const response = await httpClient.get(`http://${httpHost}/json`)
    expect(response.status).toBe(200)
    expect(response.data).toBeTruthy()
    const ct = response.headers.get('content-type')
    expect(ct!.includes('application/json')).toBe(true)
  })

  it('handles a successful get with HTML data (no response.data)', async () => {
    const response = await httpClient.get(`http://${httpHost}/html`)
    expect(response.status).toBe(200)
    expect(response.data).toBeUndefined()
    const text = await response.text()
    expect(text).toBeTruthy()
    const ct = response.headers.get('content-type')
    expect(ct!.includes('text/html')).toBe(true)
  })

  it('does not auto-parse a json-substring content-type (application/jsonl)', async () => {
    // `application/jsonl` contains the substring "json" but is a JSON-Lines body
    // (several JSON values). It must NOT be auto-parsed into `response.data`
    // (response.json() would throw); the raw body remains readable via .text().
    const response = await httpClient.get(`http://${httpHost}/jsonl`)
    expect(response.status).toBe(200)
    expect(response.data).toBeUndefined()
    expect(await response.text()).toBe('{"a":1}\n{"a":2}\n')
    const ct = response.headers.get('content-type')
    expect(ct!.includes('application/jsonl')).toBe(true)
  })

  it('handles a direct call (httpClient(url))', async () => {
    const response = await httpClient(`http://${httpHost}/json`)
    expect(response.status).toBe(200)
    expect(response.data).toBeTruthy()
  })

  it('handles a get not found error with JSON data in error.data', async () => {
    const url = `http://${httpHost}/404`
    let err:
      | (Error & {
          response?: Response
          status?: number
          data?: { code: number; description: string }
          requestUrl?: string
        })
      | undefined
    try {
      await httpClient.get(url)
    } catch (caught) {
      err = caught as typeof err
    }
    expect(err).toBeTruthy()
    expect(err!.message).toContain('404 Not Found')
    expect(err!.response).toBeTruthy()
    expect(err!.status).toBe(404)
    expect(err!.data).toBeTypeOf('object')
    expect(err!.data!.code).toBe(404)
    expect(err!.data!.description).toBe('Not Found')
    expect(err!.requestUrl).toBe(url)
  })

  it('handles a direct call not found error with JSON data', async () => {
    const url = `http://${httpHost}/404`
    let err:
      | (Error & {
          status?: number
          data?: { code: number; description: string }
        })
      | undefined
    try {
      await httpClient(url)
    } catch (caught) {
      err = caught as typeof err
    }
    expect(err).toBeTruthy()
    expect(err!.status).toBe(404)
    expect(err!.data!.code).toBe(404)
  })

  describe('extend() — custom client', () => {
    it('adds an Authorization header to all requests', async () => {
      const accessToken = '12345'
      const client = httpClient.extend({
        headers: { Authorization: `Bearer ${accessToken}` }
      })

      const response = await client.get(`http://${httpHost}/headers`)
      expect(response.status).toBe(200)
      const body = response.data as { headers: Record<string, string> }
      expect(body.headers['authorization']).toBe('Bearer 12345')
    })
  })
})
