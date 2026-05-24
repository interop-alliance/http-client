import { describe, it, expect } from 'vitest'
import { deferred } from '../../src/deferred.js'

describe('deferred()', () => {
  it('resolves to the return value of its function', async () => {
    const d = deferred(() => 'return value')
    const ret = await d
    expect(ret).toBe('return value')
  })

  it('defers execution until awaited', async () => {
    let executionCount = 0
    const d = deferred(() => {
      executionCount++
      return 'return value'
    })
    expect(executionCount).toBe(0)
    await d
    expect(executionCount).toBe(1)
  })

  it('only executes once', async () => {
    let executionCount = 0
    const d = deferred(() => {
      executionCount++
      return 'return value'
    })
    await d
    await d
    expect(executionCount).toBe(1)
  })

  it('unwraps returned promises', async () => {
    const d = deferred(() => Promise.resolve('return value'))
    const ret = await d
    expect(ret).toBe('return value')
  })
})
