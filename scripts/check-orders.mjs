import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY || ''

function getSupabaseUrl() {
  if (!supabaseUrl) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL')
    process.exit(1)
  }
  return supabaseUrl
}

function getSupabaseKey() {
  // Prefer service role when available, otherwise anon
  return supabaseServiceRoleKey || supabaseAnonKey
}

async function main() {
  const url = getSupabaseUrl()
  const key = getSupabaseKey()
  if (!key) {
    console.error('Missing Supabase key (anon or service role). Set NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  try {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(20)
    if (error) {
      console.error('Query error:', error.message || error)
      process.exit(1)
    }

    console.log(`Found ${Array.isArray(data) ? data.length : 0} orders`)
    if (Array.isArray(data) && data.length > 0) {
      console.log('Sample order:', JSON.stringify(data[0], null, 2))
    } else {
      console.log('No rows returned from `orders` table. Possible causes: empty table, RLS policies blocking anon key, or wrong project.')
    }
  } catch (err) {
    console.error('Unexpected error:', err)
    process.exit(1)
  }
}

main()
