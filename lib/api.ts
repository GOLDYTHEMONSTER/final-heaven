import 'server-only'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/log'

export class BadRequest extends Error {}

/** An HTTP error with a status and a message that is safe to show the client. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** Logs the real error on the server; the client only ever sees a generic message. */
export function serverError(error: unknown, context: string, requestId?: string) {
  logger.error('request.failed', { context, requestId, error: describe(error) })
  return NextResponse.json({ error: 'Something went wrong. Please try again.', requestId }, { status: 500 })
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
export function reference(prefix: string, length = 10) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return `${prefix}-${Array.from(bytes, (b) => alphabet[b % 32]).join('')}`
}

/** Correlation id for a request: the caller's x-request-id if sane, else a new one. */
export function requestIdOf(req: unknown) {
  const incoming = req instanceof Request ? req.headers.get('x-request-id') : null
  return incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID()
}

type PgLike = { code?: string; message?: string; hint?: string; details?: string }
const isPg = (e: unknown): e is PgLike => !!e && typeof e === 'object' && 'code' in e && 'message' in e

/**
 * Database rule violations that are the caller's fault become 4xx with the
 * database's own message (it is written for humans, e.g. "invalid order
 * status transition: shipped -> pending_payment"). Everything else is a 500.
 */
function fromDatabase(e: unknown): Response | null {
  if (!isPg(e)) return null
  if (e.hint === 'order_transition') return NextResponse.json({ error: e.message }, { status: 409 })
  if (e.code === '22023') return NextResponse.json({ error: e.message }, { status: 400 })
  if (e.code === '42501') return NextResponse.json({ error: 'Not permitted.' }, { status: 403 })
  if (e.code === '23505') return NextResponse.json({ error: 'That already exists.' }, { status: 409 })
  return null
}

function describe(e: unknown) {
  if (isPg(e)) return { code: e.code, message: e.message, hint: e.hint }
  return e
}

/**
 * Wraps a route handler: attaches a request id, turns validation and known
 * database errors into 4xx, logs and hides everything else behind a 500.
 */
export function handle<A extends unknown[]>(context: string, fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    const requestId = requestIdOf(args[0])
    const started = Date.now()
    let res: Response
    try {
      res = await fn(...args)
    } catch (error) {
      // Next.js control-flow errors (dynamic usage, redirect, notFound) carry a
      // `digest` and must propagate, or Next could cache a 500 as a static page.
      if (error && typeof error === 'object' && 'digest' in error) throw error
      if (error instanceof BadRequest) res = badRequest(error.message)
      else if (error instanceof HttpError) res = NextResponse.json({ error: error.message }, { status: error.status })
      else res = fromDatabase(error) ?? serverError(error, context, requestId)
    }
    try {
      res.headers.set('x-request-id', requestId)
    } catch {
      // Some responses (e.g. Response.redirect) have immutable headers.
    }
    if (res.status >= 400 && res.status < 500) {
      // The reason (e.g. "Request body is too large.") is safe to log: these
      // messages are written for the customer and contain no personal data.
      const reason = await res.clone().json().then((b) => b?.error).catch(() => undefined)
      logger.info('request.rejected', { context, requestId, status: res.status, reason, ms: Date.now() - started })
    }
    return res
  }
}
