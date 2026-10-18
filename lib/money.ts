// Money as integer minor units (kobo for NGN). Conversions go through decimal
// strings, never floating-point multiplication. Mirrors
// private.currency_exponent() in the database.

const ZERO_DECIMAL = new Set(['XOF', 'XAF', 'UGX', 'RWF', 'GNF', 'JPY', 'KRW', 'VND', 'CLP'])

export function currencyExponent(currency: string) {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2
}

/**
 * Major-unit amount (number like 24999.9 or string like "24999.90") to minor
 * units. Rejects values with more decimals than the currency allows, rather
 * than silently rounding money.
 */
export function toMinor(amount: number | string, currency: string): number {
  const exp = currencyExponent(currency)
  const raw = typeof amount === 'number' ? numberToPlainString(amount) : amount.trim()
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw)
  if (!m) throw new RangeError(`Invalid amount: ${amount}`)
  const [, sign, whole, frac = ''] = m
  const significant = frac.replace(/0+$/, '')
  if (significant.length > exp) throw new RangeError(`${currency} allows at most ${exp} decimal places: ${amount}`)
  const minor = Number(whole + frac.padEnd(exp, '0').slice(0, exp))
  if (!Number.isSafeInteger(minor)) throw new RangeError(`Amount out of range: ${amount}`)
  return sign ? -minor : minor
}

export function fromMinor(minor: number, currency: string): string {
  const exp = currencyExponent(currency)
  const neg = minor < 0
  const digits = String(Math.abs(minor)).padStart(exp + 1, '0')
  const major = exp ? `${digits.slice(0, -exp)}.${digits.slice(-exp)}` : digits
  return neg ? `-${major}` : major
}

// 24999.9 -> "24999.9"; also expands exponent notation (1e-7 -> "0.0000001").
function numberToPlainString(n: number) {
  if (!Number.isFinite(n)) throw new RangeError(`Invalid amount: ${n}`)
  const s = String(n)
  if (!/e/i.test(s)) return s
  return n.toFixed(20).replace(/\.?0+$/, '')
}

/** Display form, e.g. 2499990 NGN -> "₦24,999.90". */
export function formatMinor(minor: number, currency: string) {
  const amount = Number(fromMinor(minor, currency))
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: currencyExponent(currency) }).format(amount)
  } catch {
    return `${currency} ${fromMinor(minor, currency)}`
  }
}
