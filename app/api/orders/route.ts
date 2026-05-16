import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseClient'

const getSupabase = () => createSupabaseServerClient()

// Check if tables exist
async function checkTablesExist() {
  try {
    const { error } = await getSupabase().from('orders').select('id').limit(1)
    if (error && error.code === 'PGRST116') {
      // Table doesn't exist
      return false
    }
    return true
  } catch (error) {
    return false
  }
}

function generateOrderNumber() {
  const prefix = 'FH'
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(Math.random() * 900 + 100).toString()
  return `${prefix}${timestamp}${random}`
}

function generateTrackingNumber() {
  const prefix = 'TRK'
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(Math.random() * 9000 + 1000).toString()
  return `${prefix}${timestamp}${random}`
}

export async function POST(req: NextRequest) {
  const tablesExist = await checkTablesExist()
  if (!tablesExist) {
    return NextResponse.json(
      {
        error: 'Database tables not found. Please create the tables manually in your Supabase dashboard SQL editor using the schema from supabase/schema.sql'
      },
      { status: 500 }
    )
  }

  const body = await req.json()
  const {
    email,
    shippingAddress,
    shippingCity,
    shippingState,
    shippingPostalCode,
    shippingCountry,
    items,
    subtotal,
    total,
  } = body

  if (!email || !shippingAddress || !items?.length || !subtotal || !total) {
    return NextResponse.json(
      { error: 'Missing required order details.' },
      { status: 400 }
    )
  }

  const orderNumber = generateOrderNumber()
  const trackingNumber = generateTrackingNumber()
  const timeline = [
    {
      status: 'ordered',
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toISOString().slice(11, 16),
      description: 'Order placed',
    },
  ]

  const { data, error } = await getSupabase().from('orders').insert({
    order_number: orderNumber,
    email,
    status: 'ordered',
    tracking_number: trackingNumber,
    shipping_address: shippingAddress,
    shipping_city: shippingCity || null,
    shipping_state: shippingState || null,
    shipping_postal_code: shippingPostalCode || null,
    shipping_country: shippingCountry || null,
    subtotal,
    total,
    order_items: items,
    timeline,
  }).select().single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    {
      orderNumber: data.order_number,
      trackingNumber: data.tracking_number,
      message: 'Order created successfully.',
    },
    { status: 201 }
  )
}

export async function GET(req: NextRequest) {
  const tablesExist = await checkTablesExist()
  if (!tablesExist) {
    return NextResponse.json(
      {
        error: 'Database tables not found. Please create the tables manually in your Supabase dashboard SQL editor using the schema from supabase/schema.sql'
      },
      { status: 500 }
    )
  }

  const url = new URL(req.url)
  const searchType = url.searchParams.get('type')
  const value = url.searchParams.get('value')

  if (!searchType || !value) {
    return NextResponse.json({ error: 'Missing search parameters.' }, { status: 400 })
  }

  let query = getSupabase().from('orders').select('*')

  if (searchType === 'orderId') {
    query = query.eq('order_number', value)
  } else if (searchType === 'email') {
    query = query.eq('email', value)
  } else {
    return NextResponse.json({ error: 'Invalid search type.' }, { status: 400 })
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  return NextResponse.json({ order: data })
}
