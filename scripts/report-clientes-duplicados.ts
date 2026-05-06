/**
 * Relatório de clientes duplicados (somente leitura).
 *
 * Chaves de duplicidade (evita unir matriz/filial):
 * - Preferencial: CNPJ (14 dígitos) + razão social normalizada + local (cidade/UF) + endereço normalizado.
 * - Fallback: razão social normalizada + local + endereço (quando CNPJ faltar/for inválido).
 *
 * Uso:
 *   npx tsx scripts/report-clientes-duplicados.ts
 *
 * Requer: VITE_SUPABASE_URL (ou SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY no .env
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

function onlyDigits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function normText(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normAddr(v: unknown): string {
  // remove pontuação para ajudar em pequenas variações
  return normText(v).replace(/[.,;:()\-–—/\\]+/g, " ").replace(/\s+/g, " ").trim();
}

carregarEnvArquivo();

async function main() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const keyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = keyRaw ? normalizarChaveSupabase(keyRaw) : "";

  if (!url || !key) {
    console.error("Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const PAGE = 1000;
  const rows: Array<{
    id: string;
    nome: string | null;
    razao_social: string | null;
    cnpj: string | null;
    cidade: string | null;
    estado: string | null;
    endereco_coleta: string | null;
    rua: string | null;
    numero: string | null;
    bairro: string | null;
    cep: string | null;
  }> = [];

  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome, razao_social, cnpj, cidade, estado, endereco_coleta, rua, numero, bairro, cep")
      .order("razao_social", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const chunk = (data as typeof rows) || [];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  const groupsCnpj = new Map<string, typeof rows>();
  const groupsFallback = new Map<string, typeof rows>();

  const makeLocalKey = (r: (typeof rows)[number]) => {
    const rz = normText(r.razao_social);
    const cidade = normText(r.cidade);
    const uf = normText(r.estado);
    const enderecoLivre = normAddr(r.endereco_coleta);
    const estruturado = normAddr(
      [r.rua, r.numero, r.bairro, r.cep].filter(Boolean).join(" ")
    );
    const addr = enderecoLivre || estruturado;
    return { rz, cidade, uf, addr };
  };

  for (const r of rows) {
    const cnpjDigits = onlyDigits(r.cnpj);
    const { rz, cidade, uf, addr } = makeLocalKey(r);
    // se não tiver info mínima de razão/local, não tenta agrupar
    const hasLocal = Boolean(rz && (cidade || uf || addr));
    if (cnpjDigits.length === 14) {
      const key = hasLocal ? `${cnpjDigits}|${rz}|${cidade}|${uf}|${addr}` : cnpjDigits;
      const arr = groupsCnpj.get(key) ?? [];
      arr.push(r);
      groupsCnpj.set(key, arr);
      continue;
    }
    if (!hasLocal) continue;
    const fbKey = `${rz}|${cidade}|${uf}|${addr}`;
    const arr = groupsFallback.get(fbKey) ?? [];
    arr.push(r);
    groupsFallback.set(fbKey, arr);
  }

  const dupCnpj = Array.from(groupsCnpj.entries()).filter(([, arr]) => arr.length > 1);
  const dupFallback = Array.from(groupsFallback.entries()).filter(([, arr]) => arr.length > 1);

  const totalDupRowsCnpj = dupCnpj.reduce((acc, [, arr]) => acc + arr.length, 0);
  const totalDupRowsFallback = dupFallback.reduce((acc, [, arr]) => acc + arr.length, 0);

  console.log(`Total clientes: ${rows.length}`);
  console.log(
    `Grupos duplicados por CNPJ+local: ${dupCnpj.length} (linhas envolvidas: ${totalDupRowsCnpj})`
  );
  console.log(
    `Grupos duplicados por Razão+local (fallback sem CNPJ válido): ${dupFallback.length} (linhas envolvidas: ${totalDupRowsFallback})`
  );

  // imprime amostra resumida (top 30) para inspeção rápida
  const sample = dupCnpj.slice(0, 30);
  if (sample.length) {
    console.log("\nAmostra (duplicados por CNPJ+local):");
    for (const [k, arr] of sample) {
      const cnpj = k.split("|")[0] || k;
      console.log(`- CNPJ ${cnpj}: ${arr.length} registros`);
      for (const it of arr.slice(0, 5)) {
        const nome = (it.nome || "").trim();
        const razao = (it.razao_social || "").trim();
        const loc = [it.cidade, it.estado].filter(Boolean).join("/") || "-";
        console.log(`  - id=${it.id} | nome="${nome}" | razao="${razao}" | ${loc}`);
      }
      if (arr.length > 5) console.log(`  ... +${arr.length - 5}`);
    }
  }
}

main().catch((e) => {
  console.error("Falha:", e?.message ?? e);
  process.exit(1);
});

