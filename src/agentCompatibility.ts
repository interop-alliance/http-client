/*!
 * Copyright (c) 2020-2026 Digital Bazaar. All rights reserved.
 * Copyright (c) 2026 Interop Alliance (Conversion to Typescript).
 */
import { Agent } from 'undici'

type FetchFn = typeof globalThis.fetch & { _httpClientCustomFetch?: boolean }

// Cache: https.Agent instance to custom fetch with undici dispatcher
// as long as an agent has a reference to it, its associated dispatcher will
// be kept in this cache for reuse
const AGENT_CACHE = new WeakMap<object, FetchFn>()

export type NodeAgentLike = {
  options?: Record<string, unknown>
}

export type AgentOptions = {
  agent?: NodeAgentLike
  httpsAgent?: NodeAgentLike
  fetch?: FetchFn
  [key: string]: unknown
}

/**
 * Converts a legacy `agent`/`httpsAgent` option to a custom fetch function
 * backed by an undici dispatcher. No-op when no agent is present.
 *
 * @param options {AgentOptions | undefined}
 * @returns {AgentOptions | undefined}
 */
export function convertAgent(
  options: AgentOptions | undefined
): AgentOptions | undefined {
  // do not override a custom fetch from another library
  if (options?.fetch && !options.fetch._httpClientCustomFetch) {
    return options
  }
  const agent = options?.agent ?? options?.httpsAgent
  if (!agent) {
    return options
  }

  let fetchFn = AGENT_CACHE.get(agent)
  if (!fetchFn) {
    const dispatcher = new Agent({
      // agent.options holds TLS options from https.Agent; undici's connect
      // accepts the same keys, so we cast through unknown to satisfy tsc.
      connect: agent.options as never
    })
    fetchFn = _createFetch(dispatcher)
    fetchFn._httpClientCustomFetch = true
    AGENT_CACHE.set(agent, fetchFn)
  }

  return { ...options, fetch: fetchFn }
}

// create fetch override uses custom `dispatcher`; since `ky` does not pass
// the dispatcher option through to `fetch`, we must use this override
function _createFetch(dispatcher: Agent): FetchFn {
  return function (...args: Parameters<typeof globalThis.fetch>) {
    const init = args[1] as (RequestInit & { dispatcher?: Agent }) | undefined
    const effective = init?.dispatcher ?? dispatcher
    args[1] = { ...init, dispatcher: effective } as RequestInit
    return globalThis.fetch(...args)
  }
}
