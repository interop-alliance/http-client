/*!
 * Copyright (c) 2020-2026 Digital Bazaar. All rights reserved.
 * Copyright (c) 2026 Interop Alliance (Conversion to Typescript).
 */
/** A thenable that defers its factory until first await, caching the result. */
export interface Deferred<Value> {
  then<Fulfilled = Value, Rejected = never>(
    onfulfilled?:
      | ((value: Value) => Fulfilled | PromiseLike<Fulfilled>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => Rejected | PromiseLike<Rejected>)
      | null
      | undefined
  ): Promise<Fulfilled | Rejected>
}

/**
 * Wraps a factory function so it is called lazily — only when first awaited —
 * and its result is cached for subsequent awaits.
 *
 * @param factory {() => Value | PromiseLike<Value>}
 * @returns {Deferred<Value>}
 */
export function deferred<Value>(
  factory: () => Value | PromiseLike<Value>
): Deferred<Value> {
  let promise: Promise<Value> | undefined

  return {
    then(onfulfilled, onrejected) {
      promise ||= new Promise<Value>(resolve => resolve(factory()))
      return promise.then(onfulfilled, onrejected)
    }
  }
}
