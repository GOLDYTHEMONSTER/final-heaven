// The admin area moved to /studio; activity links stored by the database still
// say /admin and are rewritten on the way out.
import { describe, expect, it } from 'vitest'
import { studioLink } from '@/lib/admin/paths'

describe('studioLink', () => {
  it('moves stored /admin links to /studio', () => {
    expect(studioLink('/admin')).toBe('/studio')
    expect(studioLink('/admin/orders?q=FH-A1')).toBe('/studio/orders?q=FH-A1')
    expect(studioLink('/admin/messages')).toBe('/studio/messages')
    expect(studioLink('/admin?edit=p1')).toBe('/studio?edit=p1')
  })

  it('leaves everything else alone', () => {
    expect(studioLink(null)).toBeNull()
    expect(studioLink('')).toBe('')
    expect(studioLink('/studio/orders')).toBe('/studio/orders')
    expect(studioLink('/administrator')).toBe('/administrator')
    expect(studioLink('/api/admin/orders')).toBe('/api/admin/orders')
  })
})
