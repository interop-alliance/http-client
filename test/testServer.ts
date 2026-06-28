/*!
 * Copyright (c) 2018-2024 Digital Credentials Consortium. All rights reserved.
 */
import cors from 'cors'
import express from 'express'
import { readFile } from 'node:fs/promises'
import * as http from 'node:http'
import * as https from 'node:https'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function _sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function _createApp(): express.Express {
  const app = express()

  // Handle CORS preflights for all routes (needed for non-simple headers like Authorization).
  app.options('*', cors())

  app.get('/ping', cors(), (_req, res) => {
    res.json({ pong: true })
  })

  app.get('/json', cors(), (_req, res) => {
    res.json({ json: true })
  })

  app.get('/html', cors(), (_req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.send(
      '<!DOCTYPE html><html><head></head><body><p>HTML</p></body></html>'
    )
  })

  // JSON Lines: a content-type containing the substring "json" that is NOT a
  // single JSON value (response.json() would throw on it).
  app.get('/jsonl', cors(), (_req, res) => {
    res.setHeader('Content-Type', 'application/jsonl')
    res.send('{"a":1}\n{"a":2}\n')
  })

  // Emulates http://httpbin.org/status/404
  app.get('/status/404', cors(), (_req, res) => {
    res.status(404).send('NOT FOUND')
  })

  // Returns a JSON body with the 404 status (emulates httpstat.us)
  app.get('/404', cors(), (_req, res) => {
    res.status(404).json({ code: 404, description: 'Not Found' })
  })

  app.get('/delay/:seconds', cors(), async (req, res) => {
    await _sleep(parseFloat(req.params['seconds'] ?? '0') * 1000)
    res.status(200).send()
  })

  app.get('/headers', cors(), (req, res) => {
    res.json({ headers: req.headers })
  })

  // Intentionally no CORS headers — used to test browser CORS error handling.
  app.get('/nocors', (_req, res) => {
    res.json({ cors: false })
  })

  return app
}

function _waitForServer<T extends http.Server>(server: T): Promise<T> {
  return new Promise(resolve => {
    server.listen({ host: '0.0.0.0', port: 0 }, () => resolve(server))
  })
}

function _addressOf(server: http.Server): string {
  const addr = server.address()
  if (!addr || typeof addr === 'string') {
    throw new Error('Unexpected server address type')
  }
  return `${addr.address}:${addr.port}`
}

export interface TestServers {
  httpServer: http.Server
  httpsServer: https.Server
  httpHost: string
  httpsHost: string
  close(): Promise<void>
}

export interface TestHttpServer {
  server: http.Server
  host: string
  close(): Promise<void>
}

/** Starts both HTTP and HTTPS test servers (for Node tests). */
export async function startTestServers(): Promise<TestServers> {
  const [key, cert] = await Promise.all([
    readFile(join(__dirname, 'test-server.key')),
    readFile(join(__dirname, 'test-server.crt'))
  ])

  const app = _createApp()
  const httpServer = await _waitForServer(http.createServer(app))
  const httpsServer = await _waitForServer(
    https.createServer({ key, cert }, app)
  )

  const httpHost = _addressOf(httpServer)
  const httpsHost = _addressOf(httpsServer)

  return {
    httpServer,
    httpsServer,
    httpHost,
    httpsHost,
    close(): Promise<void> {
      return Promise.all([
        new Promise<void>((resolve, reject) =>
          httpServer.close(err => (err ? reject(err) : resolve()))
        ),
        new Promise<void>((resolve, reject) =>
          httpsServer.close(err => (err ? reject(err) : resolve()))
        )
      ]).then(() => undefined)
    }
  }
}

/** Starts only the HTTP test server (for Playwright global setup). */
export async function startHttpServer(): Promise<TestHttpServer> {
  const app = _createApp()
  const server = await _waitForServer(http.createServer(app))
  const host = _addressOf(server)

  return {
    server,
    host,
    close(): Promise<void> {
      return new Promise<void>((resolve, reject) =>
        server.close(err => (err ? reject(err) : resolve()))
      )
    }
  }
}

/** Creates an HTTPS Agent with the given options (for testing self-signed certs). */
export function makeHttpsAgent(options: https.AgentOptions): https.Agent {
  return new https.Agent(options)
}
