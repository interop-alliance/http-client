/*!
 * Copyright (c) 2020-2026 Digital Bazaar. All rights reserved.
 * Copyright (c) 2026 Interop Alliance (Conversion to Typescript).
 */

// Browser / React Native entry point — agent options are a no-op.
import { convertAgent } from './agentCompatibility.browser.js'
import {
  createInstance,
  kyOriginalPromise,
  DEFAULT_HEADERS
} from './httpClient.js'

export type {
  HttpClient,
  HttpClientOptions,
  HttpResponse,
  ConvertAgentFn,
  Input
} from './httpClient.js'

export { kyOriginalPromise as kyPromise, DEFAULT_HEADERS }

export const httpClient = createInstance({ convertAgent })
