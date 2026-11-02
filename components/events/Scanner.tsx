'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCamera, FiX } from 'react-icons/fi'
import { readRef } from '@/lib/events'
import type { DoorResult } from '@/lib/events/store'
import { DoorResultView, doorCall } from './Door'

/* ── the ticket scanner ──────────────────────────────────────────
 * Opens the back camera full screen and reads ticket QR codes (which
 * hold https://…/t/<token>). Each one is looked up through the door API
 * as this phone's door actor (a door link, or staff with check-in), shown
 * with its Check in button, then "Scan next". One code at a time: the
 * camera keeps running but nothing is read while a result is open.
 *
 * Decoding: the browser's own BarcodeDetector where there is one (Chrome
 * on Android); otherwise jsQR (iPhone Safari), loaded only then.
 * The camera is allowed on /studio and /door only (next.config.js).
 * ─────────────────────────────────────────────────────────────── */

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type Decode = (video: HTMLVideoElement) => Promise<string | null>
type Phase = 'starting' | 'scanning' | 'checking' | 'result' | 'error'

/** How often a frame is read, in ms: quick enough to feel instant, light on the battery. */
const EVERY = 180

async function makeDecoder(): Promise<Decode> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector
  const formats: string[] = BD ? (await BD.getSupportedFormats?.().catch((): string[] => [])) ?? [] : []
  if (BD && formats.includes('qr_code')) {
    const detector = new BD({ formats: ['qr_code'] })
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
  }
  const jsQR = (await import('jsqr')).default
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return async (video) => {
    if (!ctx || !video.videoWidth) return null
    const scale = Math.min(1, 640 / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}

function Scanner({ event, onClose }: { event: string | null; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const reading = useRef(false)
  const found = useRef<(text: string) => void>(() => {})
  const [phase, setPhase] = useState<Phase>('starting')
  const [result, setResult] = useState<DoorResult | null>(null)
  const [ref, setRef] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  found.current = async (text) => {
    const r = readRef(text)
    setError('')
    setResult(null)
    if (!r) {
      setError('That QR code isn’t a Final Heaven ticket.')
      setPhase('result')
      return
    }
    navigator.vibrate?.(60)
    setRef(r.value)
    setPhase('checking')
    try {
      setResult(await doorCall(r.value, event, false))
    } catch (e) {
      setError((e as Error).message)
    }
    setPhase('result')
  }

  useEffect(() => {
    let stream: MediaStream | null = null
    let stopped = false
    let timer = 0
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no camera api'), { name: 'NotFoundError' })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        const v = video.current!
        v.srcObject = stream
        await v.play()
        const decode = await makeDecoder()
        reading.current = true
        setPhase('scanning')
        const loop = async () => {
          if (stopped) return
          if (reading.current && v.readyState >= 2) {
            const text = await decode(v).catch(() => null)
            if (text && reading.current && !stopped) {
              reading.current = false
              found.current(text)
            }
          }
          timer = window.setTimeout(loop, EVERY)
        }
        loop()
      } catch (e) {
        const name = (e as Error).name
        setError(name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera access was refused. Allow the camera for this site in your browser’s settings, then open the scanner again.'
          : 'No camera could be opened on this device. Type the ticket code instead.')
        setPhase('error')
      }
    }
    start()
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [])

  // Esc closes; the page behind doesn't scroll while the scanner is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [onClose])

  const checkIn = async () => {
    setBusy(true)
    try { setResult(await doorCall(ref, event, true)) } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  const next = () => {
    setResult(null)
    setError('')
    setRef('')
    setPhase('scanning')
    reading.current = true
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan tickets" className="fixed inset-0 z-[70] flex flex-col bg-black text-final-off-white">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-final-muted">Scan tickets</p>
        <button type="button" autoFocus onClick={onClose} aria-label="Close the scanner" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"><FiX className="h-5 w-5" aria-hidden /></button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {(phase === 'scanning' || phase === 'starting') && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-[62vmin] w-[62vmin] max-h-80 max-w-80 rounded-2xl border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
            <p className="absolute bottom-6 font-mono text-xs uppercase tracking-[0.2em] text-white/85">{phase === 'starting' ? 'Opening the camera…' : 'Point at the ticket’s QR code'}</p>
          </div>
        )}
      </div>

      {(phase === 'checking' || phase === 'result' || phase === 'error') && (
        <div className="max-h-[70vh] overflow-y-auto border-t border-white/10 bg-final-black p-4" aria-live="polite">
          {phase === 'checking' && <p className="py-6 text-center text-final-muted">Checking the ticket…</p>}
          {result && <DoorResultView result={result} onCheckIn={checkIn} busy={busy} />}
          {error && <p role="alert" className="rounded-xl border border-red-400/50 bg-red-400/10 p-4 text-sm">{error}</p>}
          {phase !== 'checking' && phase !== 'error' && (
            <button type="button" onClick={next} className="btn-secondary mt-4 w-full py-3">Scan next</button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A button that opens the scanner. `event` limits typed codes to one event;
 * scanned QR codes carry their own ticket, so staff can scan any of theirs.
 */
export function ScanButton({ event = null, label = 'Scan', className = '' }: { event?: string | null; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <FiCamera className="h-4 w-4" aria-hidden />
        <span>{label}</span>
      </button>
      {/* In a portal: a header with backdrop blur would otherwise trap a fixed overlay inside itself. */}
      {open && mounted && createPortal(<Scanner event={event} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}
