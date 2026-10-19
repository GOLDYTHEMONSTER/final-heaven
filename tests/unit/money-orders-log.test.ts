import { describe, expect, it } from 'vitest'
import { fromMinor, toMinor } from '@/lib/money'
import { scrub } from '@/lib/log'

describe('money', () => {
  it('converts major to minor units exactly, without float drift', () => {
    expect(toMinor(24999.9, 'NGN')).toBe(2499990)
    expect(toMinor('24999.90', 'NGN')).toBe(2499990)
    expect(toMinor(0.1, 'NGN') + toMinor(0.2, 'NGN')).toBe(toMinor(0.3, 'NGN')) // 0.1 + 0.2 !== 0.3 in floats
    expect(toMinor(1005, 'XOF')).toBe(1005)
  })

  it('refuses to silently round extra decimals', () => {
    expect(() => toMinor('10.005', 'NGN')).toThrow(/at most 2 decimal/)
    expect(() => toMinor('10.5', 'XOF')).toThrow(/at most 0 decimal/)
    expect(toMinor('10.500', 'NGN')).toBe(1050) // trailing zeros are fine
  })

  it('rejects garbage', () => {
    for (const bad of ['', 'abc', '1e5', '--1', 'NaN']) expect(() => toMinor(bad, 'NGN'), bad).toThrow()
    expect(() => toMinor(Number.NaN, 'NGN')).toThrow()
  })

  it('formats minor units back to a decimal string', () => {
    expect(fromMinor(2499990, 'NGN')).toBe('24999.90')
    expect(fromMinor(5, 'NGN')).toBe('0.05')
    expect(fromMinor(1005, 'XOF')).toBe('1005')
  })
})

describe('log scrubbing', () => {
  it('redacts secrets and masks emails', () => {
    const out = scrub({
      authorization: 'Bearer FLWSECK-123', password: 'hunter2', 'verif-hash': 'abc',
      nested: { apiKey: 'k', note: 'paid by jane.doe@example.com' }, ok: 'fine',
    }) as Record<string, any>
    expect(out.authorization).toBe('[redacted]')
    expect(out.password).toBe('[redacted]')
    expect(out['verif-hash']).toBe('[redacted]')
    expect(out.nested.apiKey).toBe('[redacted]')
    expect(out.nested.note).toBe('paid by j***@example.com')
    expect(out.ok).toBe('fine')
  })
})
