import 'server-only'
import { NextResponse } from 'next/server'

export class BadRequest extends Error {}

/** Logs the real error on the server; the client only ever sees a generic message. */
export function serverError(error: unknown, context: string) {
  console.error(`[${context}]`, error)
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/** Parses a JSON body, refusing anything over `maxBytes` or not an object. */
export async function readJson(req: Request, maxBytes = 32_000): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (text.length > maxBytes) throw new BadRequest('Request body is too large.')
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  } catch {
    throw new BadRequest('Request body must be a JSON object.')
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function email(value: unknown, field = 'email'): string {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!EMAIL.test(s) || s.length > 254) throw new BadRequest(`Enter a valid ${field}.`)
  return s
}

/** Trimmed string within a length limit. Optional fields return null when empty. */
export function text(value: unknown, field: string, { max = 200, required = false } = {}): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new BadRequest(`${field} is required.`)
    return null
  }
  if (typeof value !== 'string') throw new BadRequest(`${field} must be text.`)
  const s = value.trim()
  if (required && !s) throw new BadRequest(`${field} is required.`)
  if (s.length > max) throw new BadRequest(`${field} must be ${max} characters or fewer.`)
  return s || null
}

export function int(value: unknown, field: string, { min = 0, max = 1_000_000 } = {}): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new BadRequest(`${field} must be a whole number between ${min} and ${max}.`)
  }
  return n
}

export function money(value: unknown, field: string): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100_000_000) {
    throw new BadRequest(`${field} must be a valid amount.`)
  }
  return Math.round(n * 100) / 100
}

/** Only http(s) URLs or site-relative paths, so no javascript: or data: links. */
export function url(value: unknown, field: string): string | null {
  const s = text(value, field, { max: 2000 })
  if (!s) return null
  if (s.startsWith('/') && !s.startsWith('//')) return s
  try {
    const u = new URL(s)
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString()
  } catch {}
  throw new BadRequest(`${field} must be an http(s) URL.`)
}

/** Keeps only the listed keys that are present in `body`. */
export function pick<T extends string>(body: Record<string, unknown>, keys: readonly T[]) {
  const out: Partial<Record<T, unknown>> = {}
  for (const key of keys) if (key in body) out[key] = body[key]
  return out
}

/** Unguessable public reference like FH-7K2Q9XWMRA (Crockford base32, ~50 bits). */
export function reference(prefix: string) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return `${prefix}-${Array.from(bytes, (b) => alphabet[b % 32]).join('')}`
}

/** Wraps a handler so BadRequest becomes a 400 and anything else a generic 500. */
export function handle<A extends unknown[]>(context: string, fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args)
    } catch (error) {
      // Next.js control-flow errors (dynamic usage, redirect, notFound) carry a
      // `digest` and must propagate, or Next could cache a 500 as a static page.
      if (error && typeof error === 'object' && 'digest' in error) throw error
      if (error instanceof BadRequest) return badRequest(error.message)
      return serverError(error, context)
    }
  }
}
