/**
 * Remove todos os registos de caminhões e motoristas (dados de teste ou anteriores).
 *
 * Ordem: caminhões primeiro (clientes.caminhao_id fica NULL). Depois motoristas.
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY (RLS pode bloquear DELETE com anon).
 *
 * Uso:
 *   npx tsx scripts/cleanup-motoristas-caminhoes.ts
 *   npx tsx scripts/cleanup-motoristas-caminhoes.ts --yes
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

carregarEnvArquivo();

const dummy = "00000000-0000-0000-0000-000000000000";
const yes = process.argv.includes("--yes");

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

  if (!yes) {
    console.error(
      'Confirme com --yes para apagar todos os caminhões e motoristas: npx tsx scripts/cleanup-motoristas-caminhoes.ts --yes'
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: e1 } = await supabase.from("caminhoes").delete().neq("id", dummy);
  if (e1) {
    console.error("Erro ao excluir caminhões:", e1.message, e1);
    process.exit(1);
  }

  const { error: e2 } = await supabase.from("motoristas").delete().neq("id", dummy);
  if (e2) {
    console.error("Erro ao excluir motoristas:", e2.message, e2);
    process.exit(1);
  }

  console.log("OK: todos os caminhões e motoristas foram removidos.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
