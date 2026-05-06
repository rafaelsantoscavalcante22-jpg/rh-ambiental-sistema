/**
 * Unifica clientes duplicados por CNPJ (14 dígitos) + "local" (evita unir matriz/filial).
 *
 * Local = razão social normalizada + cidade/UF + endereço normalizado (endereco_coleta ou campos estruturados).
 *
 * - Escolhe 1 cliente "principal" por grupo (heurística: mais campos preenchidos).
 * - Une resíduos (tipo_residuo/classificacao/unidade_medida/frequencia_coleta) em listas únicas (" | ").
 * - Move referências (cliente_id) nas tabelas: coletas, programacoes, faturamento_precos_regras, contas_receber.
 * - Remove os duplicados (delete em public.clientes).
 *
 * Segurança:
 * - Por padrão roda em DRY RUN (não altera nada).
 * - Para aplicar de verdade use: --apply
 *
 * Uso:
 *   npx tsx scripts/dedupe-clientes-by-cnpj.ts
 *   npx tsx scripts/dedupe-clientes-by-cnpj.ts --apply
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
  return normText(v).replace(/[.,;:()\-–—/\\]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitList(v: unknown): string[] {
  const s = String(v ?? "").trim();
  if (!s) return [];
  return s
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
}

function joinUnique(parts: string[]): string | null {
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  return uniq.length ? uniq.join(" | ") : null;
}

type ClienteRow = {
  id: string;
  nome: string | null;
  razao_social: string | null;
  cnpj: string | null;
  status: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  endereco_coleta: string | null;
  endereco_faturamento: string | null;
  email_nf: string | null;
  responsavel_nome: string | null;
  telefone: string | null;
  email: string | null;
  tipo_residuo: string | null;
  classificacao: string | null;
  unidade_medida: string | null;
  frequencia_coleta: string | null;
  licenca_numero: string | null;
  validade: string | null;
};

function scoreCliente(c: ClienteRow): number {
  // quanto mais completo, maior o score
  const fields: Array<keyof ClienteRow> = [
    "nome",
    "razao_social",
    "cnpj",
    "status",
    "endereco_coleta",
    "endereco_faturamento",
    "email_nf",
    "cep",
    "rua",
    "numero",
    "bairro",
    "cidade",
    "estado",
    "responsavel_nome",
    "telefone",
    "email",
    "licenca_numero",
    "validade",
  ];
  let s = 0;
  for (const f of fields) {
    if (String(c[f] ?? "").trim()) s += 2;
  }
  // resíduos contam também
  s += Math.min(8, splitList(c.tipo_residuo).length) * 1;
  s += Math.min(8, splitList(c.classificacao).length) * 1;
  return s;
}

function pickBest(group: ClienteRow[]): ClienteRow {
  return [...group].sort((a, b) => scoreCliente(b) - scoreCliente(a))[0]!;
}

function mergePayload(base: ClienteRow, group: ClienteRow[]): Record<string, unknown> {
  // une listas de resíduos e preenche campos vazios do "base" com o primeiro valor não-vazio dos duplicados
  const merged: ClienteRow = { ...base };

  const fillIfEmpty = (key: keyof ClienteRow) => {
    if (String(merged[key] ?? "").trim()) return;
    for (const g of group) {
      const v = String(g[key] ?? "").trim();
      if (v) {
        merged[key] = v as never;
        return;
      }
    }
  };

  const fillKeys: Array<keyof ClienteRow> = [
    "nome",
    "razao_social",
    "status",
    "cep",
    "rua",
    "numero",
    "complemento",
    "bairro",
    "cidade",
    "estado",
    "endereco_coleta",
    "endereco_faturamento",
    "email_nf",
    "responsavel_nome",
    "telefone",
    "email",
    "licenca_numero",
    "validade",
  ];
  for (const k of fillKeys) fillIfEmpty(k);

  const tipos = joinUnique(group.flatMap((g) => splitList(g.tipo_residuo)));
  const classes = joinUnique(group.flatMap((g) => splitList(g.classificacao)));
  const unidades = joinUnique(group.flatMap((g) => splitList(g.unidade_medida)));
  const freqs = joinUnique(group.flatMap((g) => splitList(g.frequencia_coleta)));

  return {
    nome: merged.nome?.trim() || null,
    razao_social: merged.razao_social?.trim() || null,
    cnpj: merged.cnpj?.trim() || null,
    status: merged.status?.trim() || null,
    cep: merged.cep?.trim() || null,
    rua: merged.rua?.trim() || null,
    numero: merged.numero?.trim() || null,
    complemento: merged.complemento?.trim() || null,
    bairro: merged.bairro?.trim() || null,
    cidade: merged.cidade?.trim() || null,
    estado: merged.estado?.trim() || null,
    endereco_coleta: merged.endereco_coleta?.trim() || null,
    endereco_faturamento: merged.endereco_faturamento?.trim() || null,
    email_nf: merged.email_nf?.trim() || null,
    responsavel_nome: merged.responsavel_nome?.trim() || null,
    telefone: merged.telefone?.trim() || null,
    email: merged.email?.trim() || null,
    tipo_residuo: tipos,
    classificacao: classes,
    unidade_medida: unidades,
    frequencia_coleta: freqs,
    licenca_numero: merged.licenca_numero?.trim() || null,
    validade: merged.validade?.trim() || null,
  };
}

async function main() {
  carregarEnvArquivo();
  const apply = process.argv.includes("--apply");

  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const keyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = keyRaw ? normalizarChaveSupabase(keyRaw) : "";
  if (!url || !key) {
    console.error("Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const PAGE = 1000;
  const all: ClienteRow[] = [];
  const select =
    "id, nome, razao_social, cnpj, status, cep, rua, numero, complemento, bairro, cidade, estado, endereco_coleta, endereco_faturamento, email_nf, responsavel_nome, telefone, email, tipo_residuo, classificacao, unidade_medida, frequencia_coleta, licenca_numero, validade";

  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase.from("clientes").select(select).range(from, to);
    if (error) throw error;
    const chunk = (data as ClienteRow[]) || [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  const groups = new Map<string, ClienteRow[]>();
  for (const c of all) {
    const d = onlyDigits(c.cnpj);
    if (d.length !== 14) continue;
    const rz = normText(c.razao_social);
    const cidade = normText(c.cidade);
    const uf = normText(c.estado);
    const enderecoLivre = normAddr(c.endereco_coleta);
    const estruturado = normAddr([c.rua, c.numero, c.bairro, c.cep].filter(Boolean).join(" "));
    const addr = enderecoLivre || estruturado;
    const hasLocal = Boolean(rz && (cidade || uf || addr));
    // se faltar info de local, cai para agrupamento só por CNPJ (raro) mas isso pode unir matriz/filial.
    // Para proteger, nesses casos NÃO deduplicamos.
    if (!hasLocal) continue;
    const key = `${d}|${rz}|${cidade}|${uf}|${addr}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  const dupGroups = Array.from(groups.entries()).filter(([, arr]) => arr.length > 1);
  console.log(`Total clientes: ${all.length}`);
  console.log(`Grupos duplicados por CNPJ+local: ${dupGroups.length}`);
  console.log(`Modo: ${apply ? "APLICAR (vai alterar e apagar)" : "DRY RUN (somente simulação)"}`);

  const refTables = ["coletas", "programacoes", "faturamento_precos_regras", "contas_receber"] as const;

  let totalWillDelete = 0;
  let totalGroupsDone = 0;

  for (const [groupKey, group] of dupGroups) {
    const cnpjDigits = groupKey.split("|")[0] || "";
    const keep = pickBest(group);
    const others = group.filter((g) => g.id !== keep.id);
    const delIds = others.map((o) => o.id);
    totalWillDelete += delIds.length;

    const payload = mergePayload(keep, group);

    if (!apply) {
      totalGroupsDone++;
      continue;
    }

    // 1) atualizar cliente principal (junta resíduos e completa campos)
    const { error: upErr } = await supabase.from("clientes").update(payload).eq("id", keep.id);
    if (upErr) throw upErr;

    // 2) mover referencias
    for (const t of refTables) {
      const { error } = await supabase.from(t).update({ cliente_id: keep.id }).in("cliente_id", delIds);
      if (error) throw error;
    }

    // 3) apagar duplicados
    // em lotes (supabase limita payload)
    for (let i = 0; i < delIds.length; i += 200) {
      const chunk = delIds.slice(i, i + 200);
      const { error } = await supabase.from("clientes").delete().in("id", chunk);
      if (error) throw error;
    }

    totalGroupsDone++;
    if (totalGroupsDone % 10 === 0) {
      console.log(`... processados ${totalGroupsDone}/${dupGroups.length}`);
    }
  }

  console.log("\nResumo:");
  console.log(`- grupos duplicados: ${dupGroups.length}`);
  console.log(`- registros duplicados (a remover): ${totalWillDelete}`);
  if (!apply) {
    console.log("\nPara aplicar de verdade:");
    console.log("  npx tsx scripts/dedupe-clientes-by-cnpj.ts --apply");
  } else {
    console.log("\nConcluído: duplicados unificados e removidos.");
  }
}

main().catch((e) => {
  console.error("Falha:", e?.message ?? e);
  process.exit(1);
});

