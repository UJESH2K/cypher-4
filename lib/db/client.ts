import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// One Supabase client for the whole server, using the secret key. This file is
// server-only: importing it from browser code fails the build, so the key can
// never reach a page.

let client: SupabaseClient | null | undefined;

export function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}

export function dbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}
