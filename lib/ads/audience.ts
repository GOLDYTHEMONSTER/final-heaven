// Customer lists for Meta's custom audiences: a CSV with one column, "email",
// holding the SHA-256 of each lower-cased, trimmed address (the format Meta's
// customer-list upload takes). Staff download it and upload it by hand; nothing
// is sent from here. Pure, so the hashing and the file can be tested.
import { createHash } from 'node:crypto'

/** The hash Meta expects: SHA-256, hex, of the address lower-cased and trimmed. */
export const hashEmail = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex')

/** The upload file: header row, then each distinct address once, hashed. Anything that isn't an address is dropped. */
export function audienceCsv(emails: string[]) {
  const hashes = new Set<string>()
  for (const e of emails) if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim())) hashes.add(hashEmail(e))
  return { csv: ['email', ...hashes].join('\r\n') + '\r\n', count: hashes.size }
}
