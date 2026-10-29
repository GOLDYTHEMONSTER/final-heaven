'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AUDIENCES, LIMITS, campaignProblems, renderCampaign, type Audience, type CampaignProduct } from '@/lib/email/campaign'

// Studio → Campaigns: write an email to the store's lists, see exactly what
// subscribers get, send yourself a test, then send. Sending runs in small
// batches (app/api/admin/campaigns/[id]/send) while this page stays open.

type Campaign = {
  id: string; subject: string; preheader: string; heading: string; body: string
  cta_label: string | null; cta_url: string | null; product_ids: string[]; audience: Audience[]
  status: 'draft' | 'sending' | 'sent'; recipients: number; sent: number; failed: number
  created_at: string; sent_at: string | null
}
type Draft = { subject: string; preheader: string; heading: string; body: string; ctaLabel: string; ctaUrl: string; productIds: string[]; audience: Audience[] }
type StoreProduct = { id: string; name: string; price: number; category: string; images?: { url?: string }[] }

const blank: Draft = { subject: '', preheader: '', heading: '', body: '', ctaLabel: '', ctaUrl: '', productIds: [], audience: [] }
const fromCampaign = (c: Campaign): Draft => ({
  subject: c.subject, preheader: c.preheader, heading: c.heading, body: c.body, ctaLabel: c.cta_label ?? '', ctaUrl: c.cta_url ?? '',
  productIds: c.product_ids ?? [], audience: c.audience ?? [],
})
const field = 'w-full rounded-lg border border-final-off-white/15 bg-final-black px-3 py-2 text-sm text-final-off-white focus:border-final-off-white/40 focus:outline-none'
const label = 'mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-final-muted'
const btn = 'rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40'
const date = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.')
  return data as T
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [audiences, setAudiences] = useState<Record<string, number>>({})
  const [email, setEmail] = useState<{ ready: boolean; from: string | null; testTo: string | null } | null>(null)
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(blank)
  const [saved, setSaved] = useState<Draft>(blank)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'send'>('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const sending = useRef(false)

  const load = useCallback(async () => {
    const data = await api<{ campaigns: Campaign[]; audiences: Record<string, number>; email: typeof email }>('/api/admin/campaigns')
    setCampaigns(data.campaigns)
    setAudiences(data.audiences)
    setEmail(data.email)
    return data.campaigns
  }, [])

  useEffect(() => {
    load().catch((e) => setError((e as Error).message))
    fetch('/api/products').then((r) => r.json()).then((d) => setProducts(d.products ?? [])).catch(() => {})
  }, [load])

  const current = campaigns.find((c) => c.id === selected) ?? null
  const editable = !current || current.status === 'draft'
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const reach = useMemo(() => draft.audience.reduce((n, a) => n + (audiences[a] ?? 0), 0), [draft.audience, audiences])
  const chosen: CampaignProduct[] = useMemo(() => draft.productIds.flatMap((id) => {
    const p = products.find((x) => x.id === id)
    return p ? [{ id: p.id, name: p.name, price: Number(p.price), image: p.images?.[0]?.url ?? null }] : []
  }), [draft.productIds, products])
  const problems = campaignProblems({ ...draft, ctaLabel: draft.ctaLabel || null, ctaUrl: draft.ctaUrl || null, audience: draft.audience })

  const preview = useMemo(() => {
    const site = typeof window === 'undefined' ? '' : window.location.origin
    return renderCampaign({ ...draft, ctaLabel: draft.ctaLabel || null, ctaUrl: draft.ctaUrl || null }, {
      products: chosen, site, unsubscribeUrl: `${site}/unsubscribe`,
      reason: draft.audience[0] ? AUDIENCES[draft.audience[0]].reason : 'you signed up for Final Heaven emails',
    }).html
  }, [draft, chosen])

  function open(c: Campaign | null) {
    if (dirty && !confirm('Leave this draft? Unsaved changes will be lost.')) return
    setSelected(c?.id ?? null)
    const d = c ? fromCampaign(c) : blank
    setDraft(d)
    setSaved(d)
    setError('')
    setNote('')
  }

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }))

  async function save(): Promise<string | null> {
    setBusy('save'); setError(''); setNote('')
    try {
      const body = JSON.stringify({ ...(selected ? { id: selected } : {}), ...draft, ctaLabel: draft.ctaLabel || null, ctaUrl: draft.ctaUrl || null })
      const { campaign } = await api<{ campaign: Campaign }>('/api/admin/campaigns', { method: selected ? 'PUT' : 'POST', body })
      setCampaigns((list) => (selected ? list.map((c) => (c.id === campaign.id ? campaign : c)) : [campaign, ...list]))
      setSelected(campaign.id)
      setSaved(draft)
      setNote('Saved.')
      return campaign.id
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setBusy('')
    }
  }

  async function test() {
    const id = dirty || !selected ? await save() : selected
    if (!id) return
    setBusy('test'); setError(''); setNote('')
    try {
      const { message } = await api<{ message: string }>(`/api/admin/campaigns/${id}/test`, { method: 'POST' })
      setNote(message)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  async function send() {
    if (sending.current) return
    const resuming = current?.status === 'sending'
    if (!resuming) {
      if (problems.length) { setError(problems.join(' ')); return }
      const lists = draft.audience.map((a) => AUDIENCES[a].label).join(' + ')
      if (!confirm(`Send “${draft.subject}” to ${reach} ${reach === 1 ? 'person' : 'people'} (${lists})? This can’t be undone.`)) return
    }
    const id = resuming ? selected : dirty || !selected ? await save() : selected
    if (!id) return
    sending.current = true
    setBusy('send'); setError(''); setNote('')
    try {
      let first = !resuming
      for (;;) {
        const { progress } = await api<{ progress: { status: string; recipients: number; sent: number; failed: number; remaining: number; paused: string | null } }>(
          `/api/admin/campaigns/${id}/send`, { method: 'POST', body: JSON.stringify(first ? { confirm: true } : {}) })
        first = false
        setCampaigns((list) => list.map((c) => (c.id === id ? { ...c, status: progress.status as Campaign['status'], recipients: progress.recipients, sent: progress.sent, failed: progress.failed } : c)))
        if (progress.paused) { setError(progress.paused); break }
        if (progress.remaining === 0) { setNote(`Sent to ${progress.sent} ${progress.sent === 1 ? 'person' : 'people'}${progress.failed ? `; ${progress.failed} couldn’t be delivered` : ''}.`); break }
      }
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      sending.current = false
      setBusy('')
    }
  }

  const toggleAudience = (a: Audience) => setDraft((d) => ({ ...d, audience: d.audience.includes(a) ? d.audience.filter((x) => x !== a) : [...d.audience, a] }))
  const toggleProduct = (id: string) => setDraft((d) => ({
    ...d, productIds: d.productIds.includes(id) ? d.productIds.filter((x) => x !== id) : d.productIds.length >= LIMITS.products ? d.productIds : [...d.productIds, id],
  }))
  const matches = search.trim()
    ? products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : []

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl md:text-4xl">Campaigns</h1>
          <p className="mt-1 max-w-[60ch] text-sm text-final-muted">
            Email the people who signed up. Everyone gets their own one-click unsubscribe link, and nobody gets the same campaign twice.
          </p>
        </div>
        <button type="button" onClick={() => open(null)} className={`${btn} bg-final-off-white text-final-black hover:bg-final-off-white/90`}>New campaign</button>
      </div>

      {email && !email.ready && (
        <div role="status" className="mb-6 rounded-lg border border-yellow-400/40 bg-yellow-400/10 p-4 text-sm text-final-off-white">
          Sending isn’t set up yet. You can write and preview campaigns now; to send, add <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> in Vercel and verify your domain in Resend.
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="mb-8 flex gap-2 overflow-x-auto pb-1">
          {campaigns.map((c) => (
            <button key={c.id} type="button" onClick={() => open(c)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selected === c.id ? 'border-final-off-white/60 bg-final-gray' : 'border-final-off-white/10 hover:border-final-off-white/30'}`}>
              <span className="block max-w-[220px] truncate font-medium">{c.subject || 'Untitled'}</span>
              <span className="text-xs text-final-muted">
                {c.status === 'draft' ? 'Draft' : c.status === 'sending' ? `Sending · ${c.sent}/${c.recipients}` : `Sent ${c.sent_at ? date(c.sent_at) : ''} · ${c.sent}/${c.recipients}`}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-5">
          {!editable && current && (
            <div className="rounded-lg border border-final-off-white/10 bg-final-gray p-4 text-sm">
              {current.status === 'sent'
                ? <>Sent to <b>{current.sent}</b> of {current.recipients}{current.failed ? `, ${current.failed} undeliverable` : ''}. Sent campaigns can’t be edited.</>
                : <>Sending: <b>{current.sent}</b> of {current.recipients} so far.</>}
            </div>
          )}
          <fieldset disabled={!editable || busy === 'send'} className="space-y-5 disabled:opacity-70">
            <div>
              <label className={label} htmlFor="c-subject">Subject</label>
              <input id="c-subject" className={field} maxLength={LIMITS.subject} value={draft.subject} onChange={set('subject')} placeholder="We’re open" />
            </div>
            <div>
              <label className={label} htmlFor="c-pre">Preview line <span className="normal-case tracking-normal">(shown after the subject in the inbox)</span></label>
              <input id="c-pre" className={field} maxLength={LIMITS.preheader} value={draft.preheader} onChange={set('preheader')} placeholder="The first drop is live." />
            </div>
            <div>
              <label className={label} htmlFor="c-heading">Heading</label>
              <input id="c-heading" className={field} maxLength={LIMITS.heading} value={draft.heading} onChange={set('heading')} />
            </div>
            <div>
              <label className={label} htmlFor="c-body">Message <span className="normal-case tracking-normal">(a blank line starts a new paragraph)</span></label>
              <textarea id="c-body" className={`${field} min-h-[160px]`} maxLength={LIMITS.body} value={draft.body} onChange={set('body')} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="c-cta">Button words</label>
                <input id="c-cta" className={field} maxLength={LIMITS.ctaLabel} value={draft.ctaLabel} onChange={set('ctaLabel')} placeholder="Shop the drop" />
              </div>
              <div>
                <label className={label} htmlFor="c-url">Button link</label>
                <input id="c-url" className={field} maxLength={LIMITS.ctaUrl} value={draft.ctaUrl} onChange={set('ctaUrl')} placeholder="/drop-01" />
              </div>
            </div>

            <div>
              <span className={label}>Products <span className="normal-case tracking-normal">(up to {LIMITS.products}, shown as cards)</span></span>
              {chosen.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {chosen.map((p) => (
                    <button key={p.id} type="button" onClick={() => toggleProduct(p.id)} className="rounded-full border border-final-off-white/20 px-3 py-1 text-xs hover:border-final-ember">
                      {p.name} ×
                    </button>
                  ))}
                </div>
              )}
              <input className={field} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the store to add a product" aria-label="Search products" />
              {matches.length > 0 && (
                <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-final-off-white/10">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => toggleProduct(p.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-final-gray">
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-final-muted">{draft.productIds.includes(p.id) ? 'Added' : p.category}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <span className={label}>Send to</span>
              <div className="space-y-2">
                {(Object.keys(AUDIENCES) as Audience[]).map((a) => (
                  <label key={a} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-final-off-white/10 px-3 py-2 text-sm">
                    <span className="flex items-center gap-3">
                      <input type="checkbox" checked={draft.audience.includes(a)} onChange={() => toggleAudience(a)} />
                      {AUDIENCES[a].label}
                    </span>
                    <span className="text-final-muted">{audiences[a] ?? 0}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-final-muted">Only people who ticked the consent box and haven’t unsubscribed. Someone on two lists gets it once.</p>
            </div>
          </fieldset>

          <p role="alert" className="min-h-[1.25rem] text-sm text-final-ember">{error}</p>
          {note && <p role="status" className="text-sm text-green-400">{note}</p>}

          <div className="flex flex-wrap gap-3">
            {editable && (
              <button type="button" onClick={save} disabled={!!busy || (!dirty && !!selected)} className={`${btn} border border-final-off-white/20 hover:border-final-off-white/50`}>
                {busy === 'save' ? 'Saving…' : 'Save draft'}
              </button>
            )}
            <button type="button" onClick={test} disabled={!!busy || !email?.ready} className={`${btn} border border-final-off-white/20 hover:border-final-off-white/50`}
              title={email?.testTo ? `Sends to ${email.testTo}` : undefined}>
              {busy === 'test' ? 'Sending test…' : 'Send me a test'}
            </button>
            {(editable || current?.status === 'sending') && (
              <button type="button" onClick={send} disabled={!!busy || !email?.ready || (editable && (problems.length > 0 || reach === 0))}
                className={`${btn} bg-final-ember text-final-black hover:bg-final-ember/90`}>
                {busy === 'send' ? 'Sending…' : current?.status === 'sending' ? 'Carry on sending' : `Send to ${reach} ${reach === 1 ? 'person' : 'people'}`}
              </button>
            )}
          </div>
          {editable && problems.length > 0 && <p className="text-xs text-final-muted">Before sending: {problems.join(' ')}</p>}
        </div>

        <div>
          <span className={label}>Preview{draft.subject && <> · <span className="normal-case tracking-normal text-final-off-white">{draft.subject}</span></>}</span>
          <iframe title="Email preview" srcDoc={preview} sandbox="" className="h-[760px] w-full rounded-xl border border-final-off-white/10 bg-[#f2f1ee]" />
        </div>
      </div>
    </div>
  )
}
