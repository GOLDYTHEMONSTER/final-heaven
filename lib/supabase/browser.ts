import { createBrowserClient } from '@supabase/ssr'
import { supabasePublishableKey, supabaseUrl } from './env'

// Used only for sign-in and sign-out. Data access goes through the API routes.
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey())
}
