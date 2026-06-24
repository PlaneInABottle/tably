import "react-native-url-polyfill/auto"
import "react-native-get-random-values"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "./database.types"
import { secureAuthStorage } from "./secureAuthStorage"

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

function requireEnvValue(name: string, value: string | undefined): string {
  if (value) return value

  throw new Error(`${name} is required. Copy .env.example to .env.local and set local values.`)
}

export const supabase = createClient<Database>(
  requireEnvValue("EXPO_PUBLIC_SUPABASE_URL", supabaseUrl),
  requireEnvValue("EXPO_PUBLIC_SUPABASE_ANON_KEY", supabaseAnonKey),
  {
    auth: {
      storage: secureAuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)
