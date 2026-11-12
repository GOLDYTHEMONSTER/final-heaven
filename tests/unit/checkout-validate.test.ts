import { describe, expect, it } from 'vitest'
import { CHECKOUT_FIELDS, validateCheckout } from '@/lib/checkout-validate'

const ok = { email: 'ada@example.com', shippingAddress: '12 Allen Avenue', state: 'Lagos', city: 'Ikeja', termsAccepted: true }

describe('validateCheckout', () => {
  it('passes a complete form', () => {
    expect(validateCheckout(ok)).toEqual({})
  })

  it('names a missing state (it used to fail silently on phones)', () => {
    expect(validateCheckout({ ...ok, state: '' })).toEqual({ state: 'Choose your state.' })
    expect(validateCheckout({ ...ok, state: 'Texas' }).state).toBe('Choose your state.')
  })

  it('gives every empty field its own message, in form order', () => {
    const e = validateCheckout({ email: ' ', shippingAddress: '', state: '', city: '  ', termsAccepted: false })
    expect(CHECKOUT_FIELDS.filter((f) => e[f])).toEqual(['email', 'shippingAddress', 'state', 'city', 'terms'])
  })

  it('catches a mistyped email', () => {
    expect(validateCheckout({ ...ok, email: 'ada@gmail' }).email).toMatch(/Check your email/)
    expect(validateCheckout({ ...ok, email: ' ada@gmail.com ' })).toEqual({})
  })

  it('keeps to the order API limits', () => {
    expect(validateCheckout({ ...ok, shippingAddress: 'x'.repeat(301) }).shippingAddress).toBeTruthy()
    expect(validateCheckout({ ...ok, city: 'x'.repeat(101) }).city).toBeTruthy()
  })
})
