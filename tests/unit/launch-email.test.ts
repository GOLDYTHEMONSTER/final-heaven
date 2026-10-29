// The launch-day email flow, with a fake store and a fake sender step.
import { describe, expect, it, vi } from 'vitest'
import { campaignProblems } from '@/lib/email/campaign'
import { launchCampaignContent, runLaunchEmail, type LaunchStore } from '@/lib/email/launch'
import { LAUNCH_WINDOW } from '@/lib/catalog'

function setup(state: Partial<Awaited<ReturnType<LaunchStore['state']>>> = {}) {
  const store: LaunchStore = {
    state: vi.fn(async () => ({ paymentsOpenOn: '2026-11-05', purchasesPaused: false, campaignId: null, sentAt: null, ...state })),
    ensureCampaign: vi.fn(async () => 'camp_1'),
    markSent: vi.fn(async () => {}),
  }
  return store
}
const run = (store: LaunchStore, step: Parameters<typeof runLaunchEmail>[0]['step'], over: Partial<Parameters<typeof runLaunchEmail>[0]> = {}) =>
  runLaunchEmail({ store, step, today: '2026-11-05', deadline: 1_000_000, now: () => 0, stepMs: 1, ...over })

describe('launch email', () => {
  it('uses ready-to-send copy built on the public launch wording', () => {
    const c = launchCampaignContent()
    expect(c.heading).toBe("We're open")
    expect(c.ctaUrl).toBe('/shop')
    expect(c.body).toContain(LAUNCH_WINDOW)
    expect(campaignProblems({ ...c, audience: ['launch_waitlist'] }, 'https://s.test')).toEqual([])
  })

  it('waits for the launch day, and while no day is set or the store is paused', async () => {
    const step = vi.fn()
    expect(await run(setup({ paymentsOpenOn: '2026-11-06' }), step)).toEqual({ state: 'not_open' })
    expect(await run(setup({ paymentsOpenOn: null }), step)).toEqual({ state: 'not_open' })
    expect(await run(setup({ purchasesPaused: true }), step)).toEqual({ state: 'not_open' })
    expect(step).not.toHaveBeenCalled()
  })

  it('on the day, makes the campaign once, sends batches until done, and marks it sent', async () => {
    const store = setup()
    const step = vi.fn()
      .mockResolvedValueOnce({ status: 'sending', remaining: 8, paused: null })
      .mockResolvedValueOnce({ status: 'sent', remaining: 0, paused: null })
    expect(await run(store, step)).toEqual({ state: 'sent' })
    expect(store.ensureCampaign).toHaveBeenCalledTimes(1)
    expect(step).toHaveBeenCalledWith('camp_1')
    expect(store.markSent).toHaveBeenCalledTimes(1)
  })

  it('never sends twice: once marked sent, later runs do nothing', async () => {
    const step = vi.fn()
    expect(await run(setup({ sentAt: '2026-11-05T06:00:00Z', campaignId: 'camp_1' }), step)).toEqual({ state: 'already_sent' })
    expect(step).not.toHaveBeenCalled()
  })

  it('reuses the campaign from an earlier run and stops (not marked) when the quota pauses it', async () => {
    const store = setup({ campaignId: 'camp_0' })
    const step = vi.fn(async () => ({ status: 'sending', remaining: 40, paused: 'limit reached' }))
    expect(await run(store, step)).toEqual({ state: 'paused', reason: 'limit reached' })
    expect(store.ensureCampaign).not.toHaveBeenCalled()
    expect(store.markSent).not.toHaveBeenCalled()
  })

  it('stops starting batches when the time budget is used up, and the next run continues', async () => {
    let t = 0
    const store = setup()
    const step = vi.fn(async () => { t += 4000; return { status: 'sending', remaining: 50, paused: null } })
    const result = await runLaunchEmail({ store, step, today: '2026-11-05', deadline: 10_000, now: () => t, stepMs: 4000 })
    expect(result).toEqual({ state: 'continuing' })
    expect(step).toHaveBeenCalledTimes(2) // 0→4000→8000; a third would end at 12000, past the deadline
    expect(store.markSent).not.toHaveBeenCalled()
  })
})
