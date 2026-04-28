import { createClient } from "@supabase/supabase-js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (import.meta.env.DEV) {
  console.debug("[supabase] URL definida:", !!supabaseUrl, "| chave anon definida:", !!supabaseAnonKey);
}

if (!supabaseUrl) {
  throw new Error("VITE_SUPABASE_URL não definida no arquivo .env");
}

if (!supabaseAnonKey) {
  throw new Error("VITE_SUPABASE_ANON_KEY não definida no arquivo .env");
}

/**
 * Cliente único do Supabase. Sessão em `localStorage` (padrão).
 * `detectSessionInUrl: false` — o login é só por palavra-passe; reduz superfície se tokens
 * aparecerem na URL. O SW não cacheia `/rest/v1/` nem `/functions/v1/` (ver `vite.config.ts`).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});