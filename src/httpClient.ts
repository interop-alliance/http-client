/*!
 * Copyright (c) 2020-2026 Digital Bazaar. All rights reserved.
 * Copyright (c) 2026 Interop Alliance (Conversion to Typescript).
 */
import type { KyInstance, Options as KyOptions, Input } from 'ky'
import { deferred, type Deferred } from './deferred.js'

export type { Input }

/** Signature of a node-agent to undici-dispatcher converter (or a no-op). */
export type ConvertAgentFn = (
  options: Record<string, unknown> | undefined
) => Record<string, unknown> | undefined

/** Extended ky Options with legacy agent support and response-parsing control. */
export type HttpClientOptions = KyOptions & {
  /** @deprecated Pass an undici dispatcher via the `fetch` option instead. */
  agent?: unknown
  /** @deprecated Pass an undici dispatcher via the `fetch` option instead. */
  httpsAgent?: unknown
  /** Set to false to skip auto-parsing a JSON response body into `response.data`. */
  parseBody?: boolean
}

/** A `Response` augmented with a `.data` property containing the parsed JSON body. */
export interface HttpResponse extends Response {
  readonly data?: unknown
}

/** A callable http client with method shortcuts and `.create()`/`.extend()`. */
export interface HttpClient {
  (url: Input, options?: HttpClientOptions): Promise<HttpResponse>
  get(url: Input, options?: HttpClientOptions): Promise<HttpResponse>
  post(url: Input, options?: HttpClientOptions): Promise<HttpResponse>
  put(url: Input, options?: HttpClientOptions): Promise<HttpResponse>
  patch(url: Input, options?: HttpClientOptions): Promise<HttpResponse>
  head(url: Input, options?: HttpClientOptions): Promise<HttpResponse>
  delete(url: Input, options?: HttpClientOptions): Promise<HttpResponse>
  /** Create a new instance with entirely fresh defaults (inherits nothing). */
  create(options?: HttpClientOptions): HttpClient
  /** Create a new instance that inherits this instance's defaults. */
  extend(options?: HttpClientOptions): HttpClient
  readonly stop: Promise<symbol>
}

export const DEFAULT_HEADERS = {
  Accept: 'application/ld+json, application/json'
} as const

// Lazy-loads the ky default instance; deferred so import is skipped until first use.
export const kyOriginalPromise: Deferred<KyInstance> = deferred(() =>
  import('ky').then(({ default: ky }) => ky)
)

type ProxyMethod = 'get' | 'post' | 'put' | 'patch' | 'head' | 'delete'

const PROXY_METHODS: ProxyMethod[] = [
  'get',
  'post',
  'put',
  'patch',
  'head',
  'delete'
]

const _noopConvert: ConvertAgentFn = opts => opts

interface CreateInstanceOptions extends HttpClientOptions {
  convertAgent?: ConvertAgentFn
  /** Internal: the parent ky-promise to inherit from (used by extend()). */
  parent?: Deferred<KyInstance>
}

/**
 * Returns a custom HttpClient instance. Used to specify default headers and
 * other default overrides.
 *
 * @param options {CreateInstanceOptions}
 * @param [options.convertAgent] {ConvertAgentFn} - Agent converter (injected by entry points).
 * @param [options.parent] {Deferred<KyInstance>} - Parent ky promise to inherit from.
 * @param [options.headers] {object} - Default header overrides.
 * @returns {HttpClient} Custom httpClient instance.
 */
export function createInstance({
  convertAgent = _noopConvert,
  parent = kyOriginalPromise,
  headers = {},
  ...params
}: CreateInstanceOptions = {}): HttpClient {
  // convert legacy agent options
  const convertedParams = convertAgent(params as Record<string, unknown>) ?? {}

  // create new ky instance that will asynchronously resolve
  const kyPromise: Deferred<KyInstance> = deferred(() =>
    parent.then(kyBase => {
      let ky: KyInstance
      if (parent === kyOriginalPromise) {
        // ensure default headers, allow overrides
        ky = kyBase.create({
          headers: { ...DEFAULT_HEADERS, ...headers },
          ...(convertedParams as KyOptions)
        })
      } else {
        // extend parent
        ky = kyBase.extend({
          headers,
          ...(convertedParams as KyOptions)
        })
      }
      return ky
    })
  )

  return _createHttpClient(kyPromise, convertAgent)
}

function _createHttpClient(
  kyPromise: Deferred<KyInstance>,
  convertAgent: ConvertAgentFn
): HttpClient {
  async function httpClientFn(
    ...args: [Input, HttpClientOptions?]
  ): Promise<HttpResponse> {
    const ky = await kyPromise
    const method = (
      (args[1]?.method as string | undefined) ?? 'get'
    ).toLowerCase() as ProxyMethod

    if (PROXY_METHODS.includes(method)) {
      return client[method](...args)
    }

    // unknown method — convert agent and call ky directly
    args[1] = convertAgent(
      args[1] as Record<string, unknown>
    ) as HttpClientOptions | undefined
    return _handleResponse(
      ky[method as keyof KyInstance] as KyMethodFn,
      ky,
      args,
      convertAgent
    )
  }

  const methodImpls = Object.fromEntries(
    PROXY_METHODS.map(method => [
      method,
      async (...args: [Input, HttpClientOptions?]): Promise<HttpResponse> => {
        const ky = await kyPromise
        return _handleResponse(
          ky[method] as KyMethodFn,
          ky,
          args,
          convertAgent
        )
      }
    ])
  ) as Record<ProxyMethod, (...args: [Input, HttpClientOptions?]) => Promise<HttpResponse>>

  const client = Object.assign(httpClientFn, methodImpls, {
    create({ headers = {}, ...params }: HttpClientOptions = {}): HttpClient {
      return createInstance({ convertAgent, headers, ...params })
    },
    extend({ headers = {}, ...params }: HttpClientOptions = {}): HttpClient {
      return createInstance({
        convertAgent,
        parent: kyPromise,
        headers,
        ...params
      })
    }
  }) as HttpClient

  Object.defineProperty(client, 'stop', {
    get(): Promise<symbol> {
      return kyPromise.then(ky => ky.stop as symbol)
    }
  })

  return client
}

type KyMethodFn = (
  url: Input,
  options?: KyOptions
) => { then: Promise<Response>['then'] }

async function _handleResponse(
  kyMethod: KyMethodFn,
  kyInstance: KyInstance,
  args: [Input, HttpClientOptions?],
  convertAgent: ConvertAgentFn
): Promise<HttpResponse> {
  // convert legacy agent options
  args[1] = convertAgent(args[1] as Record<string, unknown>) as
    | HttpClientOptions
    | undefined

  const [url] = args
  let response: Response
  try {
    response = await (kyMethod.call(
      kyInstance,
      ...args
    ) as unknown as Promise<Response>)
  } catch (err) {
    return await _handleError({
      err: err as Error & {
        response?: Response
        data?: unknown
        status?: number
      },
      url
    })
  }

  const { parseBody = true } = args[1] ?? {}
  // always set 'data', default to undefined
  let data: unknown
  if (parseBody) {
    // a 204 will not include a content-type header
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('json')) {
      data = await response.json()
    }
  }
  Object.defineProperty(response, 'data', { value: data })
  return response as HttpResponse
}

type HttpError = Error & {
  response?: Response
  data?: unknown
  status?: number
  requestUrl?: string
  name: string
}

async function _handleError({
  err,
  url
}: {
  err: HttpError
  url: Input
}): Promise<never> {
  err.requestUrl = String(url)

  // handle network errors and system errors that do not have a response
  if (!err.response) {
    if (err.message === 'Failed to fetch') {
      err.message = `Failed to fetch "${String(url)}". Possible CORS error.`
    }
    // ky's TimeoutError class
    if (err.name === 'TimeoutError') {
      err.message = `Request to "${String(url)}" timed out.`
    }
    throw err
  }

  // always move status up to the root of error
  err.status = err.response.status

  // ky v1 does not auto-populate error.data; read the JSON body explicitly
  if (!err.response.bodyUsed) {
    const contentType = err.response.headers.get('content-type')
    if (contentType?.includes('json')) {
      try {
        err.data = await err.response.json()
      } catch {
        /* non-JSON body */
      }
    }
  }

  if ((err.data as { message?: string } | undefined)?.message) {
    err.message = (err.data as { message: string }).message
  }
  throw err
}
