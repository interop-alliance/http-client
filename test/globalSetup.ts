/*!
 * Copyright (c) 2024 Digital Credentials Consortium. All rights reserved.
 */
import type { FullConfig } from '@playwright/test'
import { startHttpServer } from './testServer.js'

export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  const { host, close } = await startHttpServer()
  process.env['TEST_HTTP_HOST'] = host
  return close
}
