'use client'

import Image from 'next/image'
import { sized } from '@/lib/images'
import { swatchBackground, swatchMode } from '@/lib/swatches'

/**
 * The colour picker as swatches: paint for names we can read as colours, the
 * product's own photo for that colour otherwise, the name as text as a last
 * resort. The chosen name is shown beside the heading by the caller.
 */
export function ColorSwatches({ colors, images, value, onChange, size = 'md' }: {
  colors: string[]
  images?: { url: string; color?: string | null }[]
  value: string
  onChange: (color: string) => void
  size?: 'sm' | 'md'
}) {
  const box = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
  // A photo needs more room than paint to be recognised: portrait tiles, like the photos.
  const tile = size === 'sm' ? 'h-14 w-11' : 'h-20 w-16'
  const photoOf = (c: string) => images?.find((i) => i.color === c)?.url
  const mode = swatchMode(colors, new Set(colors.filter((c) => photoOf(c))))
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2.5">
      {colors.map((c) => {
        const on = value === c
        const paint = mode === 'photo' ? null : swatchBackground(c)
        const photo = !paint ? photoOf(c) : undefined
        const ring = on ? 'ring-2 ring-final-accent ring-offset-2 ring-offset-final-black' : 'ring-1 ring-final-off-white/25 hover:ring-final-off-white/60'
        if (!paint && !photo) {
          return (
            <button key={c} type="button" role="radio" aria-checked={on} onClick={() => onChange(c)}
              className={`rounded-lg border-2 px-3 py-2 text-sm transition-colors ${on ? 'border-final-accent bg-final-accent text-final-black' : 'border-final-light-gray/30 text-final-off-white hover:border-final-accent/50'}`}>
              {c}
            </button>
          )
        }
        return (
          <button key={c} type="button" role="radio" aria-checked={on} aria-label={c} title={c} onClick={() => onChange(c)}
            className={`relative ${paint ? `${box} rounded-full` : `${tile} rounded-lg`} shrink-0 overflow-hidden transition-shadow ${ring}`}>
            {paint
              ? <span aria-hidden className="absolute inset-0 rounded-full border border-black/20" style={{ background: paint }} />
              : <Image src={sized(photo!, 640)} alt="" fill unoptimized sizes="64px" className="object-cover" />}
          </button>
        )
      })}
    </div>
  )
}
