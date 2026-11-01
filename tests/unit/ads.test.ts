import { describe, expect, it } from 'vitest'
import { CAMPAIGNS, budgetProblem, dailyBudget } from '@/lib/ads/budget'
import { audienceCsv, hashEmail } from '@/lib/ads/audience'
import { MAX_TAG, cleanTag, cleanTouch, mergeLanding, parseAttribution, touchFromParams } from '@/lib/attribution'

describe('budget helper', () => {
  it('works out the daily budget from target × expected cost ÷ days', () => {
    const b = dailyBudget({ targetConversions: 30, expectedCpa: 5000, testDays: 7 })!
    expect(b.total).toBe(150000)
    expect(b.daily).toBe(21429) // 21,428.57 rounded up, so the test reaches its target
  })

  it('splits 70 / 20 / 10 and the shares always add up to the daily budget', () => {
    const exact = dailyBudget({ targetConversions: 10, expectedCpa: 1000, testDays: 10 })!
    expect(exact.split).toEqual([
      { campaign: 'Prospecting', percent: 70, daily: 700 },
      { campaign: 'Retention', percent: 20, daily: 200 },
      { campaign: 'Retargeting', percent: 10, daily: 100 },
    ])
    for (const [t, c, d] of [[7, 333, 3], [1, 1, 1], [13, 4999, 9], [99, 12345, 17]]) {
      const b = dailyBudget({ targetConversions: t, expectedCpa: c, testDays: d })!
      expect(b.split.reduce((s, x) => s + x.daily, 0)).toBe(b.daily)
      expect(b.split.map((x) => x.campaign)).toEqual([...CAMPAIGNS])
    }
  })

  it('refuses inputs that aren’t whole numbers in range, with a sentence', () => {
    expect(dailyBudget({ targetConversions: 0, expectedCpa: 5000, testDays: 7 })).toBeNull()
    expect(dailyBudget({ targetConversions: 10, expectedCpa: 1.5, testDays: 7 })).toBeNull()
    expect(dailyBudget({ targetConversions: 10, expectedCpa: 5000, testDays: 91 })).toBeNull()
    expect(dailyBudget({ targetConversions: NaN, expectedCpa: 5000, testDays: 7 })).toBeNull()
    expect(budgetProblem({ targetConversions: 10, expectedCpa: 5000, testDays: 0 })).toMatch(/Test days must be a whole number between 1 and 90/)
    expect(budgetProblem({ targetConversions: 10, expectedCpa: 5000, testDays: 7 })).toBeNull()
  })
})

describe('audience files', () => {
  it('hashes the lower-cased, trimmed address with SHA-256', () => {
    // sha256("test@example.com"), the value Meta documents for its own example.
    expect(hashEmail('  Test@Example.com ')).toBe('973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b')
  })

  it('writes an "email" header, each address once, and drops anything that isn’t an address', () => {
    const { csv, count } = audienceCsv(['a@x.test', 'A@X.TEST ', 'b@x.test', 'not an email', '', 'c@x'])
    expect(count).toBe(2)
    expect(csv).toBe(`email\r\n${hashEmail('a@x.test')}\r\n${hashEmail('b@x.test')}\r\n`)
    expect(csv).not.toContain('@')
  })

  it('is just the header for an empty list', () => {
    expect(audienceCsv([])).toEqual({ csv: 'email\r\n', count: 0 })
  })
})

describe('attribution tags', () => {
  it('reads the six tags from a landing address', () => {
    const t = touchFromParams(new URLSearchParams('utm_source=facebook&utm_medium=paid&utm_campaign=rose&utm_content=adset-1&utm_term=ad-1&fbclid=AbC_1-2&other=x'))
    expect(t).toEqual({ utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'rose', utm_content: 'adset-1', utm_term: 'ad-1', fbclid: 'AbC_1-2' })
    expect(touchFromParams(new URLSearchParams('page=2&q=shoes'))).toBeNull()
  })

  it('limits every value to 200 characters and strips characters that can break out of text', () => {
    expect(cleanTag('utm_campaign', 'x'.repeat(5000))).toHaveLength(MAX_TAG)
    expect(cleanTag('utm_term', '  <script>"hi"</script>  ')).toBe('scripthi/script')
    expect(cleanTag('utm_term', 'two\nlines\u0000')).toBe('twolines')
    expect(cleanTag('utm_source', '   ')).toBeNull()
    expect(cleanTag('utm_source', 42)).toBeNull()
    expect(cleanTag('fbclid', 'abc def')).toBeNull()
    expect(cleanTag('fbclid', 'a'.repeat(300))).toHaveLength(MAX_TAG)
  })

  it('keeps only known keys from a request body, and never throws on rubbish', () => {
    expect(parseAttribution({ first: { utm_campaign: 'a', price: 1, total: 0 }, last: { utm_source: 'b' }, price: 5 }))
      .toEqual({ first: { utm_campaign: 'a' }, last: { utm_source: 'b' } })
    for (const junk of [null, undefined, 'x', 7, [], {}, { first: 'x' }, { first: [], last: null }, { first: { price: 1 } }]) {
      expect(parseAttribution(junk)).toBeNull()
    }
    expect(cleanTouch({ utm_campaign: { toString: 'x' } })).toBeNull()
  })

  it('keeps the first touch for 30 days and replaces the last with every tagged landing', () => {
    const day = 86_400_000
    const a = mergeLanding(null, { utm_campaign: 'one' }, 0)!
    expect(a.attribution).toEqual({ first: { utm_campaign: 'one' }, last: { utm_campaign: 'one' } })
    const b = mergeLanding(a, { utm_campaign: 'two' }, 5 * day)!
    expect(b.attribution).toEqual({ first: { utm_campaign: 'one' }, last: { utm_campaign: 'two' } })
    // A plain visit changes nothing.
    expect(mergeLanding(b, null, 6 * day)).toEqual(b)
    // After 30 days the first touch is forgotten: a new landing starts again.
    expect(mergeLanding(b, null, 31 * day)).toBeNull()
    expect(mergeLanding(b, { utm_campaign: 'three' }, 31 * day)!.attribution).toEqual({ first: { utm_campaign: 'three' }, last: { utm_campaign: 'three' } })
  })
})
