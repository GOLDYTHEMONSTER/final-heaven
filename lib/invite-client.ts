'use client'

// The friend's code from an invite link (/?invite=FH…, lib/early-access), kept
// in this browser so it still counts if they sign up on a later page.
const KEY = 'fh_invite'

/** Saves ?invite= from the address bar, if there is one. True when the page was opened from an invite link. */
export function rememberInvite(): boolean {
  try {
    const code = new URLSearchParams(window.location.search).get('invite')?.trim().toUpperCase()
    if (!code || !/^[A-Z0-9_-]{3,30}$/.test(code)) return false
    localStorage.setItem(KEY, code)
    return true
  } catch {
    return false
  }
}

export function storedInvite(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}
