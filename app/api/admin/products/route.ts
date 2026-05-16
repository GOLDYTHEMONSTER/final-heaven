import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseClient'

const supabase = createSupabaseServerClient()

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ products: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      id,
      name,
      description,
      price,
      original_price,
      category,
      images,
      stock,
      status,
      is_new,
      is_limited,
      is_trending,
      members_only,
      release_date,
      rating,
      reviews,
      sales,
      colors,
      sizes,
      tags,
      card_size,
    } = body

    const productId = id || `p${Date.now()}`

    if (!name || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: name, category' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('products')
      .insert({
        id: productId,
        name,
        description,
        price,
        original_price,
        category,
        images: images || [],
        stock: stock || 0,
        status: status || 'active',
        is_new: is_new || false,
        is_limited: is_limited || false,
        is_trending: is_trending || false,
        members_only: members_only || false,
        release_date,
        rating,
        reviews: reviews || 0,
        sales: sales || 0,
        colors: colors || [],
        sizes: sizes || [],
        tags: tags || [],
        card_size: card_size || 'medium',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ product: data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ product: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ message: 'Product deleted' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
