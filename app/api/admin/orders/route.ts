import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseClient'

const getSupabase = () => createSupabaseServerClient()

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await getSupabase().from('orders').select('*').order('created_at', { ascending: false }).limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ orders: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { orderNumber, status } = body
    if (!orderNumber || !status) {
      return NextResponse.json({ error: 'Missing orderNumber or status' }, { status: 400 })
    }

    // Fetch current order to append timeline
    const { data: existing, error: fetchErr } = await getSupabase().from('orders').select('*').eq('order_number', orderNumber).maybeSingle()
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const newEvent = {
      status,
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toISOString().slice(11, 16),
      description: `Status updated to ${status}`,
    }

    const updatedTimeline = Array.isArray(existing.timeline) ? [...existing.timeline, newEvent] : [newEvent]

    const { data, error } = await getSupabase().from('orders').update({ status, timeline: updatedTimeline }).eq('order_number', orderNumber).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ order: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}
