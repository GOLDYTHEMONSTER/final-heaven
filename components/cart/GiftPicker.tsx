'use client'

import Image from 'next/image'
import { FiAlertCircle, FiCheck, FiGift } from 'react-icons/fi'
import { sized } from '@/lib/images'
import { formatCurrency } from '@/lib/utils/format'
import type { GiftChoice } from '@/lib/stores/cartStore'
import type { ServerQuote } from '@/lib/useQuote'

/**
 * The store's free gift in the cart: the pieces on offer, the one picked and
 * its colour. The server decides whether the cart earns it (lib/checkout).
 */
export function GiftPicker({ offer, subtotal, gift, setGift }: {
  offer: NonNullable<ServerQuote['gift']>
  subtotal: number
  gift: GiftChoice | null
  setGift: (gift: GiftChoice | null) => void
}) {
  const options = offer.options
  if (!options.some((o) => o.available)) return null
  const picked = gift ? options.find((o) => o.id === gift.id) : undefined
  const topValue = Math.max(...options.map((o) => Number(o.value)))

  return (
    <section aria-labelledby="gift-heading" className="mt-8 rounded-lg border border-final-accent/40 bg-final-dark-gray/50 p-6">
      <div className="flex items-start gap-3">
        <FiGift className="mt-1 h-5 w-5 shrink-0 text-final-accent" aria-hidden />
        <div>
          <h2 id="gift-heading" className="text-lg font-semibold text-final-off-white">
            {offer.eligible ? 'Pick your free gift' : 'Free gift with your order'}
          </h2>
          <p className="text-sm text-final-off-white/70">
            {offer.eligible
              ? `Pick one, worth up to ${formatCurrency(topValue)}, free with this order.`
              : `Spend ${formatCurrency(Math.max(0, Number(offer.min) - subtotal))} more to pick one, free.`}
          </p>
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {options.map((o) => {
          const selected = picked?.id === o.id
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={!o.available || !offer.eligible}
                aria-pressed={selected}
                onClick={() => setGift(selected ? null : { id: o.id, color: o.colors[0] ?? null })}
                className={`group block w-full text-left disabled:cursor-not-allowed ${offer.eligible ? '' : 'opacity-60'}`}
              >
                <span className={`relative block aspect-[4/5] overflow-hidden rounded-md bg-final-gray ring-2 transition ${selected ? 'ring-final-ember' : 'ring-transparent group-enabled:group-hover:ring-final-off-white/30'}`}>
                  {o.image && <Image src={sized(o.image, 640)} alt="" fill sizes="(max-width: 640px) 30vw, 140px" className="object-cover" />}
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-final-ember text-final-black">
                      <FiCheck className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                  {!o.available && <span className="absolute inset-x-0 bottom-0 bg-final-black/80 py-1 text-center text-xs text-final-off-white">Gone</span>}
                </span>
                <span className={`mt-1.5 block text-xs leading-snug ${selected ? 'text-final-ember' : 'text-final-off-white'}`}>{o.name}</span>
                <span className="block text-xs text-final-off-white/50">Worth {formatCurrency(Number(o.value))}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {picked && offer.eligible && (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          {picked.colors.length > 0 && (
            <>
              <span className="text-final-off-white/70">Colour</span>
              {picked.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={gift?.color === c}
                  onClick={() => setGift({ id: picked.id, color: c })}
                  className={`rounded-full border px-3 py-1 ${gift?.color === c ? 'border-final-accent text-final-accent' : 'border-final-light-gray/40 text-final-off-white hover:border-final-off-white/60'}`}
                >
                  {c}
                </button>
              ))}
            </>
          )}
          <button type="button" onClick={() => setGift(null)} className="ml-auto text-final-off-white/60 underline underline-offset-2 hover:text-final-off-white">
            No gift, thanks
          </button>
        </div>
      )}

      {offer.issue && (
        <p className="mt-4 flex items-start gap-1.5 text-sm text-red-400" role="alert">
          <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{offer.issue}</span>
        </p>
      )}
    </section>
  )
}
