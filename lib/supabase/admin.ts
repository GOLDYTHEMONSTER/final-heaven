import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabaseUrl } from './env'

/**
 * Service-role client. It BYPASSES row level security, so use it only in
 * server code that has already validated its input: placing an order,
 * looking one up for a customer who proved the order number and email,
 * and newsletter sign-ups. `server-only` makes importing this from a
 * Client Component a build error, so the secret key never reaches a browser.
 */
export function createSupabaseServiceClient() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)')
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
