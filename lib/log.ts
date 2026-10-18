// Structured JSON logs (one line per event) with a correlation id. Values under
// sensitive keys are redacted and email addresses are masked, so logs never
// carry passwords, tokens, secrets or full customer emails.

type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

const SENSITIVE_KEY = /pass(word)?|secret|token|authori[sz]ation|cookie|api[-_]?key|signature|verif-hash|card|cvv|pin\b/i
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]'
  if (typeof value === 'string') return value.replace(EMAIL, '$1***@$2').slice(0, 2000)
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1))
  if (value instanceof Error) return { name: value.name, message: scrub(value.message, depth + 1) }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : scrub(v, depth + 1)
    return out
  }
  return value
}

export function log(level: Level, event: string, fields: Fields = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...(scrub(fields) as Fields) })
  if (level === 'error' || level === 'warn') console.error(line)
  else console.log(line)
}

export const logger = {
  debug: (event: string, fields?: Fields) => log('debug', event, fields),
  info: (event: string, fields?: Fields) => log('info', event, fields),
  warn: (event: string, fields?: Fields) => log('warn', event, fields),
  error: (event: string, fields?: Fields) => log('error', event, fields),
}
