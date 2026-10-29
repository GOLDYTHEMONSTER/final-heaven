// Campaign emails (lib/email/campaign): escaping, links, unsubscribe and readiness.
import { describe, expect, it } from 'vitest'
import { campaignLink, campaignProblems, renderCampaign } from '@/lib/email/campaign'

const site = 'https://www.finalheaven.shop'
const base = { subject: 'Doors open', preheader: '', heading: 'We’re open', body: 'Come through.\n\nNew pieces <inside>.', ctaLabel: 'Shop now', ctaUrl: '/shop' }

describe('campaign email', () => {
  it('escapes what staff type, links products and the button, and carries the unsubscribe link', () => {
    const r = renderCampaign(base, { site, unsubscribeUrl: `${site}/unsubscribe?token=abc`, reason: 'you joined the waitlist',
      products: [{ id: 'p1', name: 'Tee <b>', price: 15000, image: null }] })
    expect(r.html).toContain('New pieces &lt;inside&gt;.')
    expect(r.html).toContain('Tee &lt;b&gt;')
    expect(r.html).toContain(`${site}/product/p1`)
    expect(r.html).toContain(`href="${site}/shop"`)
    expect(r.html).toContain(`${site}/unsubscribe?token=abc`)
    expect(r.text).toContain('Unsubscribe: https://www.finalheaven.shop/unsubscribe?token=abc')
    expect(r.text).toContain('You’re getting this because you joined the waitlist.')
  })

  it('only allows https links or the store’s own paths', () => {
    expect(campaignLink('/drop-01', site)).toBe(`${site}/drop-01`)
    expect(campaignLink('https://instagram.com/finalheaven', site)).toBe('https://instagram.com/finalheaven')
    expect(campaignLink('javascript:alert(1)', site)).toBeNull()
    expect(campaignLink('http://insecure.example', site)).toBeNull()
  })

  it('says what is missing before it can be sent', () => {
    expect(campaignProblems({ ...base, audience: ['launch_waitlist'] })).toEqual([])
    expect(campaignProblems({ ...base, subject: '', audience: [] })).toEqual(['Add a subject.', 'Choose who it goes to.'])
    expect(campaignProblems({ ...base, ctaUrl: null, audience: ['footer'] })).toEqual(['A button needs both its words and its link.'])
    expect(campaignProblems({ ...base, ctaUrl: 'javascript:x', audience: ['footer'] })[0]).toMatch(/https:\/\//)
  })
})
