import { NextRequest, NextResponse } from 'next/server'

/** A neutral image for products without a photo: /api/placeholder/<width>/<height>. */
const size = (value: string | undefined, fallback: number) => {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : fallback
}

export async function GET(_req: NextRequest, { params }: { params: { dimensions: string[] } }) {
  const width = size(params.dimensions?.[0], 400)
  const height = size(params.dimensions?.[1], 500)

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#1a1a1a"/>
</svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
