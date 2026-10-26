'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { FiChevronLeft, FiChevronRight, FiZoomIn } from 'react-icons/fi'
import { sized } from '@/lib/images'

export type GalleryImage = { url: string; color?: string }

/**
 * The product photos as a swipeable strip. Native scroll with snap points does
 * the gesture: it tracks the finger 1:1, carries the flick's momentum and can
 * be grabbed mid-glide, which no scripted animation matches. Photos tied to a
 * colour stay in step with the colour picker both ways: swiping onto one picks
 * its colour; picking a colour brings its photo into view.
 */
export function ProductGallery({ images, name, color, onColor, onZoom, badges }: {
  images: GalleryImage[]
  name: string
  /** The selected colour, if any. */
  color: string
  /** Called when a swipe lands on a photo of another colour. */
  onColor?: (color: string) => void
  onZoom: (index: number) => void
  badges?: React.ReactNode
}) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const settling = useRef<number | null>(null)

  const go = useCallback((i: number, smooth = true) => {
    const el = track.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth && !reduce ? 'smooth' : 'auto' })
  }, [])

  // Which photo is in view: read on scroll, once per frame.
  useEffect(() => {
    const el = track.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [])

  // A swipe that comes to rest on another colour's photo picks that colour.
  useEffect(() => {
    if (!onColor) return
    clearTimeout(settling.current ?? undefined)
    settling.current = window.setTimeout(() => {
      const c = images[index]?.color
      if (c && c !== color) onColor(c)
    }, 120)
    return () => clearTimeout(settling.current ?? undefined)
    // Only the photo in view decides; reacting to `color` here would undo a colour just picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Picking a colour brings its first photo into view (unless one of its photos already is).
  useEffect(() => {
    if (!color || images[index]?.color === color) return
    const i = images.findIndex((img) => img.color === color)
    if (i >= 0) go(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color])

  // Keyboard: arrows move between photos when the strip has focus.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.min(images.length - 1, index + 1)) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.max(0, index - 1)) }
  }

  const many = images.length > 1
  const step = 'grid h-11 w-11 place-items-center rounded-full bg-final-black/60 text-final-off-white backdrop-blur-md transition-[transform,opacity] duration-100 active:scale-90 disabled:opacity-0'

  return (
    <div className="space-y-4">
      <div className="group relative aspect-[4/5] overflow-hidden rounded-xl bg-final-dark-gray">
        <div
          ref={track}
          tabIndex={0}
          onKeyDown={onKey}
          role="region"
          aria-roledescription="carousel"
          aria-label={`${name} photos`}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain focus-visible:outline-none"
        >
          {images.map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              type="button"
              onClick={() => onZoom(i)}
              aria-label={`${name}, photo ${i + 1} of ${images.length}${img.color ? `, ${img.color}` : ''}. Open full size`}
              className="relative h-full w-full shrink-0 snap-center snap-always cursor-zoom-in"
            >
              <Image
                src={sized(img.url, 1200)}
                alt={`${name}${img.color ? `, ${img.color}` : ''}`}
                fill
                unoptimized
                priority={i === 0}
                loading={i === 0 ? 'eager' : 'lazy'}
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>

        {badges}

        {many && (
          <>
            {/* Arrows for a pointer; on touch the photo itself is the control. */}
            <div className="pointer-events-none absolute inset-x-3 top-1/2 hidden -translate-y-1/2 justify-between [@media(hover:hover)]:flex">
              <button type="button" aria-label="Previous photo" disabled={index === 0} onClick={() => go(index - 1)} className={`${step} pointer-events-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}>
                <FiChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" aria-label="Next photo" disabled={index === images.length - 1} onClick={() => go(index + 1)} className={`${step} pointer-events-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}>
                <FiChevronRight className="h-5 w-5" />
              </button>
            </div>
            {/* Where you are: dots, plus the colour of the photo in view. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2">
              {images[index]?.color && (
                <span className="rounded-full bg-final-black/60 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-final-off-white backdrop-blur-md">
                  {images[index].color}
                </span>
              )}
              <div className="flex gap-1.5 rounded-full bg-final-black/40 px-2 py-1.5 backdrop-blur-md" aria-hidden="true">
                {images.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full bg-final-off-white transition-[width,opacity] duration-200 ${i === index ? 'w-4 opacity-100' : 'w-1.5 opacity-50'}`} />
                ))}
              </div>
            </div>
          </>
        )}
        <span className="pointer-events-none absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-final-black/50 text-final-off-white backdrop-blur-md" aria-hidden="true">
          <FiZoomIn className="h-4 w-4" />
        </span>
      </div>

      {many && (
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={`${img.url}-thumb-${i}`}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show photo ${i + 1}${img.color ? `, ${img.color}` : ''}`}
              aria-current={i === index}
              className={`relative aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-lg bg-final-dark-gray ring-2 transition-[box-shadow,transform] duration-100 active:scale-95 ${
                i === index ? 'ring-final-off-white' : 'ring-transparent hover:ring-final-off-white/40'
              }`}
            >
              <Image src={sized(img.url, 640)} alt="" fill unoptimized sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
