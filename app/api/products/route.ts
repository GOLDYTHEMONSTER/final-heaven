import { NextResponse } from 'next/server'
import { handle } from '@/lib/api'
import { CATALOGUE_CACHE } from '@/lib/catalog'
import { publicProducts } from '@/lib/storefront'

// Public catalogue: only active products, whatever the query string says.
// RLS enforces the same rule in the database. Each product carries its
// purchase state (available, pre-order, sold out, coming soon, members only),
// computed by the same rules checkout enforces.
export const GET = handle('products.list', async (req: Request) => {
  const params = new URL(req.url).searchParams
  const products = await publicProducts({ category: params.get('category'), isNew: params.get('isNew') === 'true' })
  return NextResponse.json({ products }, { headers: CATALOGUE_CACHE })
})
