// Delivery details remembered on this device only (localStorage), so a returning
// customer doesn't type their address again. Nothing here is sent anywhere until
// they place an order. Unticking "Remember" at checkout forgets them.

export type CheckoutDetails = { email: string; address: string; city: string; state: string; postalCode: string }

const KEY = 'fh-checkout-details'
const FIELDS: (keyof CheckoutDetails)[] = ['email', 'address', 'city', 'state', 'postalCode']

/** The saved details, or null when there are none (or storage is blocked). */
export function loadCheckoutDetails(): CheckoutDetails | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const out = {} as CheckoutDetails
    for (const f of FIELDS) out[f] = typeof raw[f] === 'string' ? raw[f].slice(0, 300) : ''
    return out
  } catch {
    return null
  }
}

export function saveCheckoutDetails(d: CheckoutDetails) {
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, d[f].trim().slice(0, 300)])))) } catch {}
}

export function forgetCheckoutDetails() {
  try { localStorage.removeItem(KEY) } catch {}
}
