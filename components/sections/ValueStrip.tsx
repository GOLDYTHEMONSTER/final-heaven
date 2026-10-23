import Link from 'next/link'
import { FiRefreshCw, FiLayers, FiMapPin } from 'react-icons/fi'

const items = [
  { icon: FiRefreshCw, title: 'New drops weekly', body: 'Fresh pieces land every week.', href: '/shop?new=1' },
  { icon: FiLayers, title: 'Curated, limited runs', body: 'Small quantities, picked piece by piece.', href: '/shop' },
  { icon: FiMapPin, title: 'Track every order', body: 'Follow your order from checkout to door.', href: '/track-order' },
]

export function ValueStrip() {
  return (
    <section aria-label="Why Final Heaven" className="border-y border-final-off-white/10">
      <ul className="mx-auto grid max-w-7xl divide-y divide-final-off-white/10 md:grid-cols-3 md:divide-x md:divide-y-0">
        {items.map(({ icon: Icon, title, body, href }) => (
          <li key={title}>
            <Link
              href={href}
              className="group flex items-start gap-4 px-4 py-6 transition-colors duration-200 hover:bg-final-off-white/[0.03] sm:px-6 lg:px-8"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-final-muted transition-colors group-hover:text-final-off-white" strokeWidth={1.75} />
              <span>
                <span className="block font-semibold text-final-off-white">{title}</span>
                <span className="mt-1 block text-sm text-final-muted">{body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
