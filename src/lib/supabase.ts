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
 * Cliente único do Supabase. Sessão em `localStorage` (padrão) — adequado para reabrir a app
 * sem rede e alinhar com PWA. O service worker (produção) usa NetworkFirst em `/rest/v1/` para
 * reutilizar a última resposta GET quando offline; `/auth/v1/` permanece sempre em rede.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});