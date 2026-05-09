/**
 * Frota RG Ambiental — planilha «Caminhões RG Ambiental» (placa, modelo/tipo, pesos).
 * Grava em public.caminhoes; upsert por placa (pode reexecutar).
 *
 * Uso: npx tsx scripts/seed-caminhoes-rg-frota.ts
 *
 * Requer: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { placaParaBanco, validarPlacaBr } from "../src/lib/brasilCadastro.ts";

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

function t(val: string | undefined): string | null {
  const s = (val ?? "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Linhas da tabela (PLACA com hífen como na planilha). */
const FROTA: readonly {
  placa: string;
  modelo: string;
  pesoTara: string;
  pesoBruto: string;
  cmt: string;
}[] = [
  { placa: "DAO-1308", modelo: "VÁCUO", pesoTara: "10.91T", pesoBruto: "22.00T", cmt: "23.00T" },
  { placa: "UEC-1B90", modelo: "VÁCUO", pesoTara: "15.00T", pesoBruto: "24.50T", cmt: "33.00T" },
  { placa: "DAJ-3559", modelo: "ROLLON", pesoTara: "11.00T", pesoBruto: "23.00T", cmt: "35.00T" },
  { placa: "FOO-9I51", modelo: "VÁCUO", pesoTara: "16.35T", pesoBruto: "23.00T", cmt: "35.00T" },
  { placa: "TIZ-2B11", modelo: "BAÚ", pesoTara: "9.3T", pesoBruto: "13.2T", cmt: "13.2T" },
  { placa: "DPF-8904", modelo: "VÁCUO", pesoTara: "17.22T", pesoBruto: "24.00T", cmt: "32.00T" },
  { placa: "EFO-2D89", modelo: "POLI-DUPLO", pesoTara: "10.85T", pesoBruto: "25.00T", cmt: "35.00T" },
  { placa: "EGK-7730", modelo: "ROLLON", pesoTara: "11.00T", pesoBruto: "23.00T", cmt: "42.00T" },
  { placa: "EKL-6J14", modelo: "BAÚ", pesoTara: "5.00T", pesoBruto: "7.85T", cmt: "8.00T" },
  { placa: "EZL-4G51", modelo: "VÁCUO", pesoTara: "15.93T", pesoBruto: "23.00T", cmt: "35.00T" },
  {
    placa: "FNB-7H31",
    modelo: "CAVALINHO BRANCO",
    pesoTara: "11.00T",
    pesoBruto: "16.00T",
    cmt: "45.15",
  },
  { placa: "GGJ-1857", modelo: "FIORINO", pesoTara: "0.65", pesoBruto: "1.80T", cmt: "2.20T" },
  { placa: "GKE-9H65", modelo: "BAÚ", pesoTara: "7.50T", pesoBruto: "10.70T", cmt: "13.20T" },
  { placa: "LOF-0B99", modelo: "", pesoTara: "3.80T", pesoBruto: "6.70T", cmt: "3.80T" },
  { placa: "IPH-1F65", modelo: "VÁCUO", pesoTara: "10.50T", pesoBruto: "23.00T", cmt: "60.00T" },
  { placa: "FFW-3J05", modelo: "ROLLON", pesoTara: "15.93T", pesoBruto: "23.00T", cmt: "35.00T" },
  { placa: "CUB-2996", modelo: "POLI-TRIPLO", pesoTara: "", pesoBruto: "23.00T", cmt: "33.00T" },
  { placa: "UEB-0B52", modelo: "CAVALINHO BRANCO", pesoTara: "", pesoBruto: "", cmt: "" },
  { placa: "DPF-8890", modelo: "POLI", pesoTara: "", pesoBruto: "", cmt: "" },
  { placa: "EFO-3858", modelo: "POLI-DUPLO", pesoTara: "", pesoBruto: "", cmt: "" },
  { placa: "AGZ-0D55", modelo: "ROLLON", pesoTara: "", pesoBruto: "", cmt: "" },
];

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

  const rows = FROTA.map((r) => {
    const placa = placaParaBanco(r.placa);
    if (!validarPlacaBr(placa)) {
      throw new Error(`Placa inválida: ${r.placa} → ${placa}`);
    }
    return {
      placa,
      modelo: t(r.modelo),
      status_disponibilidade: "Disponível",
      peso_tara: t(r.pesoTara),
      peso_bruto: t(r.pesoBruto),
      cmt: t(r.cmt),
    };
  });

  const { data, error } = await supabase
    .from("caminhoes")
    .upsert(rows, { onConflict: "placa" })
    .select("placa");

  if (error) {
    console.error("Erro ao gravar caminhões:", error.message, error);
    process.exit(1);
  }

  console.log(`OK: ${data?.length ?? 0} veículos gravados (upsert por placa).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
