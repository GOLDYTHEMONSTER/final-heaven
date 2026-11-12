import { nigerianState } from '@/lib/nigeria'

// Checkout form checks, run in the browser before anything is sent. Each message sits under its own field,
// so the customer sees exactly what to fix (the browser's own "required" check fails silently on some phones,
// above all on a styled <select>). Limits match /api/orders.
export type CheckoutField = 'email' | 'shippingAddress' | 'state' | 'city' | 'terms'
export type CheckoutErrors = Partial<Record<CheckoutField, string>>

// form order: the first field with an error is the one we scroll to
export const CHECKOUT_FIELDS: CheckoutField[] = ['email', 'shippingAddress', 'state', 'city', 'terms']

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateCheckout(v: { email: string; shippingAddress: string; state: string; city: string; termsAccepted: boolean }): CheckoutErrors {
  const e: CheckoutErrors = {}
  const email = v.email.trim()
  if (!email) e.email = 'Enter your email. Your receipt and delivery updates go here.'
  else if (!EMAIL.test(email)) e.email = 'Check your email address, e.g. you@example.com.'
  const address = v.shippingAddress.trim()
  if (!address) e.shippingAddress = 'Enter the address we should deliver to.'
  else if (address.length > 300) e.shippingAddress = 'Keep the address under 300 characters.'
  if (!nigerianState(v.state)) e.state = 'Choose your state.'
  const city = v.city.trim()
  if (!city) e.city = 'Enter your city or town.'
  else if (city.length > 100) e.city = 'Keep the city or town under 100 characters.'
  if (!v.termsAccepted) e.terms = 'Tick the box to accept the Terms of Sale and Returns Policy.'
  return e
}
