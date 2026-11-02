import { showCode, ticketUrl } from '@/lib/events'
import type { TicketView } from '@/lib/events/store'
import { qrSvg } from '@/lib/events/qr'

const STATUS = {
  valid: { label: 'Valid', tone: 'text-final-ember' },
  checked_in: { label: 'Checked in', tone: 'text-final-muted' },
  void: { label: 'Cancelled', tone: 'text-final-muted' },
} as const

/** One ticket: its QR code (opens /t/<token>), its door code and whether it still lets someone in. Server component. */
export async function TicketCard({ ticket, site, timeZone, index, of }: { ticket: TicketView; site: string; timeZone: string; index?: number; of?: number }) {
  const svg = await qrSvg(ticketUrl(site, ticket.token))
  const s = STATUS[ticket.status]
  return (
    <article className="rounded-2xl border border-final-off-white/10 bg-final-gray p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{ticket.type}{index && of && of > 1 ? <span className="ml-2 text-sm font-normal text-final-muted">{index} of {of}</span> : null}</h2>
        <p className={`text-xs font-medium uppercase tracking-[0.12em] ${s.tone}`}>{s.label}</p>
      </div>
      {ticket.status === 'void' ? (
        <p className="mt-4 text-sm text-final-muted">This ticket was cancelled and won’t open the door.</p>
      ) : (
        <>
          {/* The SVG is generated on the server from our own ticket address. */}
          <div className={`mx-auto mt-4 w-full max-w-[260px] overflow-hidden rounded-xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full ${ticket.status === 'checked_in' ? 'opacity-40' : ''}`}
            role="img" aria-label={`QR code for ticket ${showCode(ticket.code)}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-4 text-center font-mono text-2xl tracking-[0.2em]">{showCode(ticket.code)}</p>
          <p className="mt-1 text-center text-xs text-final-muted">
            {ticket.status === 'checked_in' && ticket.checkedInAt
              ? `Checked in ${new Date(ticket.checkedInAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone })}`
              : 'Show the QR code at the door. If it won’t scan, read out the code.'}
          </p>
        </>
      )}
    </article>
  )
}
