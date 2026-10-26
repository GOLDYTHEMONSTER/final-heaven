import { NextResponse } from 'next/server'
import { handle } from '@/lib/api'
import { CATALOGUE_CACHE } from '@/lib/catalog'
import { publicProduct } from '@/lib/storefront'

export const GET = handle('products.get', async (_req: Request, { params }: { params: { id: string } }) => {
  const product = await publicProduct(params.id)
  if (!product) return NextResponse.json({ product: null }, { status: 404 })
  return NextResponse.json({ product }, { headers: CATALOGUE_CACHE })
})
