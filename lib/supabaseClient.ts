import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY || ''

function getSupabaseUrl() {
  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL environment variable')
  }
  return supabaseUrl
}

function getSupabaseAnonKey() {
  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY, or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable')
  }
  return supabaseAnonKey
}

function getSupabaseServerKey() {
  const serverKey = supabaseServiceRoleKey || supabaseAnonKey
  if (!serverKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE, SUPABASE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable')
  }
  return serverKey
}

export function createSupabaseBrowserClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey())
}

export function createSupabaseServerClient() {
  return createClient(getSupabaseUrl(), getSupabaseServerKey())
}
