// Supabase Client — Rehla Management System
// Provides both service-role (backend) and anon (frontend-safe) clients

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[WARN] Supabase credentials not set. Database operations will fail.');
}

// Service role client — full access, used for backend operations
const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Anon client — limited access, used for auth token verification
const supabaseAnon = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Helper: run raw SQL via Supabase's rpc or pg functions
async function runQuery(sql, params = []) {
  const { data, error } = await supabase.rpc('run_sql', { query: sql, params });
  if (error) throw error;
  return data;
}

module.exports = { supabase, supabaseAnon };
