/**
 * Insere a lista oficial de motoristas RG Ambiental (nomes apenas).
 *
 * Uso: npx tsx scripts/seed-motoristas-rg-lista.ts
 *
 * Requer: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function carregarEnvArquivo() {
  const p = resolve(process.cwd(), ".env");
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (v.startsWith("<") && v.endsWith(">") && v.length > 2) {
      v = v.slice(1, -1).trim();
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function normalizarChaveSupabase(key: string): string {
  let k = key.trim();
  if (k.startsWith("<") && k.endsWith(">") && k.length > 2) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

const NOMES = [
  "EDSON COELHO",
  "BRAZ CARLOS GARROTE",
  "ROQUE MENDES",
  "JOSÉ CARLOS",
  "RAFAEL HENRIQUE",
  "CLEITON",
  "RICARDO ALMEIDA",
  "CAIO VINÍCIUS",
  "RUBENS ALMEIDA",
  "JANDERSON",
  "JODISON DA SILVA (DODA)",
  "LEONARDO",
  "ANTÔNIO JOSÉ",
  "ANTÔNIO GONÇALVES",
  "ANTÔNIO JOSÉ DE OLIVEIRA (TICO)",
] as const;

carregarEnvArquivo();

async function main() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const keyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const key = keyRaw ? normalizarChaveSupabase(keyRaw) : "";

  if (!url || !key) {
    console.error(
      "Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env."
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = NOMES.map((nome) => ({
    nome,
    cpf: null,
    cnh_numero: null,
    cnh_categoria: null,
    cnh_validade: null,
    possui_nopp: false,
    nopp_validade: null,
  }));

  const { data, error } = await supabase.from("motoristas").insert([...rows]).select("id, nome");

  if (error) {
    console.error("Erro ao inserir motoristas:", error.message, error);
    process.exit(1);
  }

  console.log(`OK: ${data?.length ?? 0} motoristas inseridos.`);
  for (const r of data || []) {
    console.log(`  - ${(r as { nome: string }).nome}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
