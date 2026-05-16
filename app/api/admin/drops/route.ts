import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseClient'

const getSupabase = () => createSupabaseServerClient()

export async function GET() {
  try {
    const { data, error } = await getSupabase()
      .from('drops')
      .select('*')
      .order('release_date', { ascending: false })

    if (error) throw error

    return NextResponse.json({ drops: data || [] })
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
      release_date,
      release_time,
      status,
      preview_image,
      members_only,
      early_access_hours,
      products,
      tags,
    } = body

    if (!id || !name || !release_date || !release_time) {
      return NextResponse.json(
        { error: 'Missing required fields: id, name, release_date, release_time' },
        { status: 400 }
      )
    }

    const { data, error } = await getSupabase()
      .from('drops')
      .insert({
        id,
        name,
        description,
        release_date,
        release_time,
        status: status || 'draft',
        preview_image,
        members_only: members_only || false,
        early_access_hours: early_access_hours || 24,
        products: products || [],
        tags: tags || [],
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ drop: data }, { status: 201 })
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
        { error: 'Drop ID is required' },
        { status: 400 }
      )
    }

    const { data, error } = await getSupabase()
      .from('drops')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ drop: data })
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
        { error: 'Drop ID is required' },
        { status: 400 }
      )
    }

    const { error } = await getSupabase()
      .from('drops')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ message: 'Drop deleted' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
