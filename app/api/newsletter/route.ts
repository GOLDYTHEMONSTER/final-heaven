import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseClient'

const getSupabase = () => createSupabaseServerClient()

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { email } = body

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const { error } = await getSupabase().from('newsletter_subscribers').insert({ email })

  if (error) {
    const duplicate = error.code === '23505' || error.message?.includes('duplicate')
    return NextResponse.json(
      { error: duplicate ? 'Email already subscribed.' : error.message },
      { status: duplicate ? 200 : 500 }
    )
  }

  return NextResponse.json({ message: 'Subscribed successfully.' }, { status: 201 })
}
