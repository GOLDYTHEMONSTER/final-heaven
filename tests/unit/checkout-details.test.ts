// Delivery details remembered on the device: read back, trimmed, forgotten, and safe when storage is broken.
import { afterEach, describe, expect, it } from 'vitest'
import { forgetCheckoutDetails, loadCheckoutDetails, saveCheckoutDetails } from '@/lib/checkout-details'

const store = new Map<string, string>()
const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
const g = globalThis as unknown as { localStorage?: unknown }

afterEach(() => { store.clear(); g.localStorage = fake })
g.localStorage = fake

describe('checkout details on this device', () => {
  const details = { email: ' ada@example.com ', address: '12 Admiralty Way', city: 'Lekki', state: 'Lagos', postalCode: '106104' }

  it('saves trimmed details and reads them back', () => {
    saveCheckoutDetails(details)
    expect(loadCheckoutDetails()).toEqual({ ...details, email: 'ada@example.com' })
  })

  it('forgets them', () => {
    saveCheckoutDetails(details)
    forgetCheckoutDetails()
    expect(loadCheckoutDetails()).toBeNull()
  })

  it('ignores junk and works without storage', () => {
    store.set('fh-checkout-details', '{"email":42,"city":"Abuja"}')
    expect(loadCheckoutDetails()).toEqual({ email: '', address: '', city: 'Abuja', state: '', postalCode: '' })
    store.set('fh-checkout-details', 'not json')
    expect(loadCheckoutDetails()).toBeNull()
    g.localStorage = undefined
    expect(loadCheckoutDetails()).toBeNull()
    expect(() => saveCheckoutDetails(details)).not.toThrow()
  })
})
