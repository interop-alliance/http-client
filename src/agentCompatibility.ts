/*!
 * Copyright (c) 2020-2026 Digital Bazaar. All rights reserved.
 * Copyright (c) 2026 Interop Alliance (Conversion to Typescript).
 */
import { versions } from 'node:process'
import { Agent, fetch as undiciFetch, Request as UndiciRequest } from 'undici'
import undiciPkg from 'undici/package.json' with { type: 'json' }

/**
 * Background: node ships its own copy of undici in the platform but does not
 * expose it (there is no `node:undici`), so this package installs its own. A
 * dispatcher only works with the undici that created it -- the handler
 * contract changed across majors, so handing an installed v7 dispatcher to a
 * platform v6 or v8 `fetch` fails with "invalid onError method". Which major
 * the platform provides varies by release line (node 22 has 6, node 24 has 7,
 * node 26 has 8), so no single installed version matches every supported
 * runtime -- with undici 7 installed, node 24 matches while node 22 and
 * node 26 take the fallback path below. See digitalbazaar/http-client#43.
 */

type FetchFn = typeof globalThis.fetch & { _httpClientCustomFetch?: boolean }

// as long as an agent has a reference to it, its associated dispatcher will
// be kept in this cache for reuse
const DISPATCHER_CACHE = new WeakMap<object, Agent>()

// on the fallback path, the `fetch` override built for a dispatcher is kept
// here for reuse; the dispatcher is held by DISPATCHER_CACHE for as long as
// its agent lives, so the override has the same lifetime as the agent
const FETCH_CACHE = new WeakMap<Agent, FetchFn>()

/**
 * True when the installed and platform undici majors match, meaning their
 * dispatchers are interchangeable. Both reads are guarded: a future undici
 * could hide `package.json` behind an `exports` map, and `versions.undici`
 * may be absent. Either way fall back to `false` and use the installed
 * undici's own fetch -- the always-safe path -- rather than throwing at
 * module load and breaking `import` for every consumer.
 */
const platformFetchCompatible = (() => {
  try {
    const installedMajor = parseInt(undiciPkg.version, 10)
    const platformMajor = parseInt(versions.undici ?? '', 10)
    return platformMajor === installedMajor
  } catch {
    return false
  }
})()

export type NodeAgentLike = {
  options?: Record<string, unknown>
}

export type AgentOptions = {
  agent?: NodeAgentLike
  httpsAgent?: NodeAgentLike
  fetch?: FetchFn
  dispatcher?: Agent
  [key: string]: unknown
}

/**
 * Converts a legacy `agent`/`httpsAgent` option to an undici dispatcher.
 * No-op when no agent is present.
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

  // only override if an agent option is present
  const agent = options?.agent ?? options?.httpsAgent
  if (!agent) {
    return options
  }

  // reuse the dispatcher built for this agent
  let dispatcher = DISPATCHER_CACHE.get(agent)
  if (!dispatcher) {
    dispatcher = new Agent({
      // agent.options holds TLS options from https.Agent; undici's connect
      // accepts the same keys, so we cast through unknown to satisfy tsc.
      connect: agent.options as never
    })
    DISPATCHER_CACHE.set(agent, dispatcher)
  }

  // drop the converted legacy options so they are not forwarded to `fetch`
  const rest: AgentOptions = { ...options }
  delete rest.agent
  delete rest.httpsAgent

  // majors match: hand the dispatcher to `ky`, which forwards it to the
  // platform `fetch` (`ky` deliberately keeps `dispatcher` out of its
  // request-option registry so it reaches fetch) -- no wrapper needed
  if (platformFetchCompatible) {
    return { ...rest, dispatcher }
  }

  // incompatible platform `fetch` that rejects this dispatcher, so route
  // through the installed undici's own fetch via an override
  let fetchFn = FETCH_CACHE.get(dispatcher)
  if (!fetchFn) {
    fetchFn = _createFetch(dispatcher)
    fetchFn._httpClientCustomFetch = true
    FETCH_CACHE.set(dispatcher, fetchFn)
  }
  return { ...rest, fetch: fetchFn }
}

/**
 * Create fetch override uses custom `dispatcher`; when incompatible, the
 * platform `Request` that `ky` creates cannot be consumed by the installed
 * undici's fetch directly, so it is rebuilt as the installed undici's own
 * `Request` here.
 *
 * Passing the platform `Request` as undici's `Request` *init* (its second
 * constructor argument) works because undici's own `Request` constructor
 * performs its own `RequestInit` dictionary conversion -- it reads exactly
 * the fields its own implementation understands directly off the object it's
 * given, duck-typed rather than `instanceof`-checked, so it stays correct
 * automatically as undici's own supported fields evolve. No manual
 * allow/deny-list of `RequestInit` fields is needed or maintained here.
 */
function _createFetch(defaultDispatcher: Agent): FetchFn {
  return function (...args: Parameters<typeof globalThis.fetch>) {
    let input = args[0]
    const init = args[1] as (RequestInit & { dispatcher?: Agent }) | undefined
    const dispatcher = init?.dispatcher ?? defaultDispatcher
    if (
      input &&
      typeof input === 'object' &&
      typeof (input as Request).url === 'string'
    ) {
      // undici's Request/RequestInit types differ from the DOM lib types, so
      // cast through unknown at the boundary.
      input = new UndiciRequest(
        (input as Request).url,
        input as unknown as ConstructorParameters<typeof UndiciRequest>[1]
      ) as unknown as Request
    }
    return undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      { ...init, dispatcher } as Parameters<typeof undiciFetch>[1]
    ) as unknown as Promise<Response>
  }
}
