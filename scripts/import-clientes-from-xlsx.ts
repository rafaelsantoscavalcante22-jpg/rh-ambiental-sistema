/**
 * Importa clientes reais de um .xlsx e remove clientes de teste (Seed/Demo/Teste).
 *
 * - Upsert por CNPJ (update se existir, insert se novo).
 * - Remove apenas clientes claramente "de teste" (por padrões de nome/e-mail), para evitar apagar clientes reais.
 *
 * Uso:
 *   npx tsx scripts/import-clientes-from-xlsx.ts "C:\caminho\arquivo.xlsx"
 *
 * Requer: VITE_SUPABASE_URL (ou SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY no .env
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";

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

function normalizarHeader(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatarCNPJ(valor: string) {
  const digitos = valor.replace(/\D/g, "").slice(0, 14);

  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 5) return digitos.replace(/^(\d{2})(\d+)/, "$1.$2");
  if (digitos.length <= 8) return digitos.replace(/^(\d{2})(\d{3})(\d+)/, "$1.$2.$3");
  if (digitos.length <= 12) {
    return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d+)/, "$1.$2.$3/$4");
  }

  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, "$1.$2.$3/$4-$5");
}

function normalizarCnpjParaArmazenar(valor: string): string {
  const digitos = String(valor || "").replace(/\D/g, "").slice(0, 14);
  return formatarCNPJ(digitos);
}

function limparOuNull(valor: unknown): string | null {
  const texto = String(valor ?? "").trim();
  return texto === "" ? null : texto;
}

function parseExcelDateToIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d || !d.y || !d.m || !d.d) return null;
    const yyyy = String(d.y).padStart(4, "0");
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

type ImportRow = Partial<{
  nome: string;
  razao_social: string;
  cnpj: string;
  status: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  endereco_coleta: string;
  endereco_faturamento: string;
  email_nf: string;
  responsavel_nome: string;
  telefone: string;
  email: string;
  tipo_residuo: string;
  classificacao: string;
  unidade_medida: string;
  frequencia_coleta: string;
  licenca_numero: string;
  validade: string;
  status_ativo_desde: string;
  status_inativo_desde: string;
}>;

const IMPORT_HEADER_ALIASES: Record<string, keyof ImportRow> = {
  "razao social": "razao_social",
  razao_social: "razao_social",
  cnpj: "cnpj",
  status: "status",
  situacao: "status",
  cep: "cep",
  rua: "rua",
  numero: "numero",
  complemento: "complemento",
  bairro: "bairro",
  cidade: "cidade",
  estado: "estado",
  uf: "estado",
  nome: "nome",
  "nome fantasia": "nome",
  cliente: "nome",
  "endereco coleta": "endereco_coleta",
  endereco_coleta: "endereco_coleta",
  "endereco faturamento": "endereco_faturamento",
  endereco_faturamento: "endereco_faturamento",
  endereco: "endereco_coleta",
  "endereco ": "endereco_coleta",
  "email nf": "email_nf",
  email_nf: "email_nf",
  responsavel: "responsavel_nome",
  responsavel_nome: "responsavel_nome",
  telefone: "telefone",
  email: "email",
  "tipo residuo": "tipo_residuo",
  tipo_residuo: "tipo_residuo",
  residuo: "tipo_residuo",
  classificacao: "classificacao",
  "unidade medida": "unidade_medida",
  unidade_medida: "unidade_medida",
  "frequencia coleta": "frequencia_coleta",
  frequencia_coleta: "frequencia_coleta",
  "licenca numero": "licenca_numero",
  licenca_numero: "licenca_numero",
  validade: "validade",
  "ativo desde": "status_ativo_desde",
  status_ativo_desde: "status_ativo_desde",
  "inativo desde": "status_inativo_desde",
  status_inativo_desde: "status_inativo_desde",
  "razao social (nf)": "razao_social",
  "responsavel nome": "responsavel_nome",
};

function isClienteDeTeste(c: { nome?: string | null; email?: string | null; email_nf?: string | null }) {
  const nome = String(c.nome ?? "").trim().toLowerCase();
  const email = String(c.email ?? "").trim().toLowerCase();
  const emailNf = String(c.email_nf ?? "").trim().toLowerCase();

  const nomeTeste =
    nome.startsWith("cliente demo") ||
    nome.startsWith("seed brasil") ||
    nome.includes(" teste") ||
    nome.startsWith("teste");

  const emailTeste =
    email.endsWith(".invalid") ||
    email.includes("exemplo-seed.invalid") ||
    email.includes("mail-seed.invalid") ||
    emailNf.endsWith(".invalid") ||
    emailNf.includes("exemplo-seed.invalid") ||
    emailNf.includes("mail-seed.invalid");

  return nomeTeste || emailTeste;
}

async function deleteByIds(
  supabase: ReturnType<typeof createClient>,
  table: string,
  ids: string[]
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error } = await supabase.from(table).delete().in("id", chunk);
    if (error) throw error;
    deleted += chunk.length;
  }
  return deleted;
}

carregarEnvArquivo();

async function main() {
  const filePath = process.argv[2]?.trim() || "";
  if (!filePath) {
    console.error('Informe o caminho do .xlsx. Ex.: npx tsx scripts/import-clientes-from-xlsx.ts "C:\\\\path\\\\clientes.xlsx"');
    process.exit(1);
  }
  if (!existsSync(filePath)) {
    console.error("Arquivo não encontrado:", filePath);
    process.exit(1);
  }

  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const keyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = keyRaw ? normalizarChaveSupabase(keyRaw) : "";

  if (!url || !key) {
    console.error("Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env");
    process.exit(1);
  }

  if (key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) {
    console.error("Use o JWT service_role (eyJ...) em Project Settings → API.");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log("Lendo planilha:", filePath);
  const fileBuf = readFileSync(filePath);
  const wb = XLSX.read(fileBuf, { type: "buffer", dense: true, cellDates: true });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) throw new Error("A planilha não possui abas.");
  const sheet = wb.Sheets[sheetName];

  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    raw: true,
  }) as unknown[][];

  if (!Array.isArray(aoa) || aoa.length < 2) {
    throw new Error("Planilha vazia. Precisa ter cabeçalho e pelo menos 1 linha.");
  }

  const headerRow = aoa[0] ?? [];
  const colMap = new Map<number, keyof ImportRow>();
  for (let c = 0; c < headerRow.length; c++) {
    const h = normalizarHeader(headerRow[c]);
    const mapped = IMPORT_HEADER_ALIASES[h];
    if (mapped) colMap.set(c, mapped);
  }

  const required: Array<keyof ImportRow> = ["razao_social", "cnpj"];
  const missing = required.filter((r) => !Array.from(colMap.values()).includes(r));
  if (missing.length) {
    throw new Error(`Cabeçalhos obrigatórios ausentes: ${missing.join(", ")}.`);
  }

  const rows: ImportRow[] = [];
  const erros: string[] = [];

  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const obj: ImportRow = {};

    for (const [idx, key] of colMap.entries()) {
      const v = (row as unknown[])[idx];
      if (key === "validade" || key === "status_ativo_desde" || key === "status_inativo_desde") {
        const iso = parseExcelDateToIso(v);
        if (iso) (obj as Record<keyof ImportRow, string | undefined>)[key] = iso;
        continue;
      }
      const s = String(v ?? "").trim();
      if (s) (obj as Record<keyof ImportRow, string | undefined>)[key] = s;
    }

    const razao = (obj.razao_social || "").trim();
    const cnpj = normalizarCnpjParaArmazenar(String(obj.cnpj || ""));
    const nome = (obj.nome || razao || "").trim();

    if (!razao || !cnpj || cnpj.replace(/\D/g, "").length !== 14) {
      erros.push(`Linha ${r + 1}: razão/CNPJ inválidos.`);
      continue;
    }

    obj.nome = nome;
    obj.razao_social = razao;
    obj.cnpj = cnpj;
    obj.status = (obj.status || "Ativo").trim() || "Ativo";

    if (!obj.tipo_residuo) obj.tipo_residuo = "—";
    if (!obj.classificacao) obj.classificacao = "—";

    rows.push(obj);
  }

  if (rows.length === 0) {
    throw new Error(erros.length ? `Nenhuma linha válida.\n${erros.slice(0, 12).join("\n")}` : "Nenhuma linha válida.");
  }

  console.log(`Planilha: ${rows.length} linhas válidas. ${erros.length} ignoradas.`);

  console.log("1) Removendo clientes de teste (Seed/Demo/Teste)...");
  const idsParaApagar: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome, email, email_nf")
      .range(offset, offset + 999);
    if (error) throw error;
    const arr = (data as Array<{ id: string; nome: string | null; email: string | null; email_nf: string | null }>) || [];
    for (const c of arr) {
      if (isClienteDeTeste(c)) idsParaApagar.push(c.id);
    }
    if (!arr.length || arr.length < 1000) break;
  }
  const apagados = idsParaApagar.length ? await deleteByIds(supabase, "clientes", idsParaApagar) : 0;
  console.log(`  - apagados: ${apagados}`);

  console.log("2) Upsert (por CNPJ): inserir/atualizar clientes reais...");
  const cnpjs = Array.from(new Set(rows.map((r) => r.cnpj!).filter(Boolean)));
  const existingMap = new Map<string, string>();

  for (let i = 0; i < cnpjs.length; i += 200) {
    const chunk = cnpjs.slice(i, i + 200);
    const { data, error } = await supabase.from("clientes").select("id, cnpj").in("cnpj", chunk);
    if (error) throw error;
    for (const item of (data as Array<{ id: string; cnpj: string | null }>) || []) {
      if (item?.cnpj) existingMap.set(String(item.cnpj).trim(), item.id);
    }
  }

  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  for (const r of rows) {
    const payload = {
      nome: r.nome!,
      razao_social: r.razao_social!,
      cnpj: r.cnpj!,
      status: (r.status || "Ativo").trim() || "Ativo",
      cep: limparOuNull(r.cep),
      rua: limparOuNull(r.rua),
      numero: limparOuNull(r.numero),
      complemento: limparOuNull(r.complemento),
      bairro: limparOuNull(r.bairro),
      cidade: limparOuNull(r.cidade),
      estado: limparOuNull(r.estado),
      endereco_coleta: limparOuNull(r.endereco_coleta),
      endereco_faturamento: limparOuNull(r.endereco_faturamento),
      email_nf: limparOuNull(r.email_nf),
      responsavel_nome: limparOuNull(r.responsavel_nome),
      telefone: limparOuNull(r.telefone),
      email: limparOuNull(r.email),
      tipo_residuo: limparOuNull(r.tipo_residuo),
      classificacao: limparOuNull(r.classificacao),
      unidade_medida: limparOuNull(r.unidade_medida),
      frequencia_coleta: limparOuNull(r.frequencia_coleta),
      licenca_numero: limparOuNull(r.licenca_numero),
      validade: limparOuNull(r.validade),
    };

    const id = existingMap.get(r.cnpj!);
    if (id) updates.push({ id, payload });
    else inserts.push(payload);
  }

  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { error } = await supabase.from("clientes").insert(chunk);
    if (error) throw error;
    console.log(`  - inseridos: ${Math.min(i + chunk.length, inserts.length)}/${inserts.length}`);
  }

  let atualizados = 0;
  for (const u of updates) {
    const { error } = await supabase.from("clientes").update(u.payload).eq("id", u.id);
    if (error) throw error;
    atualizados++;
    if (atualizados % 50 === 0) console.log(`  - atualizados: ${atualizados}/${updates.length}`);
  }

  console.log("\nConcluído.");
  console.log(`- apagados (teste): ${apagados}`);
  console.log(`- inseridos (novos): ${inserts.length}`);
  console.log(`- atualizados: ${updates.length}`);
  if (erros.length) console.log(`- ignorados (linhas inválidas): ${erros.length} (ex.: ${erros[0]})`);
}

main().catch((err: unknown) => {
  const e = err as Partial<PostgrestError> & { message?: string };
  console.error("Falha:", e?.message || err);
  process.exit(1);
});

