import type { SizeChart, Spec } from '@/lib/product-tables'

// The product page's two tables. Plain markup (a real <table>, with a caption and
// header cells) so screen readers can walk them; wide charts scroll inside their
// own box, never the page.

const wrap = 'overflow-x-auto rounded-lg border border-final-light-gray/30'
const cell = 'px-4 py-2.5 text-left text-sm'

export function SpecsTable({ specs }: { specs: Spec[] }) {
  if (!specs.length) return null
  return (
    <div className={wrap}>
      <table className="w-full border-collapse">
        <caption className="sr-only">Product specifications</caption>
        <tbody>
          {specs.map((s, i) => (
            <tr key={s.label} className={i % 2 ? 'bg-final-gray/40' : undefined}>
              <th scope="row" className={`${cell} w-2/5 font-medium text-final-muted`}>{s.label}</th>
              <td className={`${cell} text-final-off-white`}>{s.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SizeChartTable({ chart }: { chart: SizeChart }) {
  return (
    <div className={wrap}>
      <table className="w-full min-w-max border-collapse">
        <caption className="sr-only">Size guide{chart.unit ? `, in ${chart.unit}` : ''}</caption>
        <thead>
          <tr className="bg-final-gray">
            {chart.headers.map((h, i) => (
              <th key={`${h}-${i}`} scope="col" className={`${cell} font-semibold text-final-off-white ${i ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((row, r) => (
            <tr key={`${row[0]}-${r}`} className={r % 2 ? 'bg-final-gray/40' : undefined}>
              {row.map((c, i) => (i === 0
                ? <th key={i} scope="row" className={`${cell} font-medium text-final-off-white`}>{c}</th>
                : <td key={i} className={`${cell} text-right tabular-nums text-final-off-white/80`}>{c}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
