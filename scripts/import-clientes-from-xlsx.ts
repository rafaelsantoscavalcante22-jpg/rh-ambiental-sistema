/**
 * Importa clientes reais de um .xlsx e remove clientes de teste (Seed/Demo/Teste).
 *
 * - Upsert por CNPJ/CPF (update se existir, insert se novo).
 * - Remove apenas clientes claramente "de teste" (por padrões de nome/e-mail), para evitar apagar clientes reais.
 *
 * Uso:
 *   npx tsx scripts/import-clientes-from-xlsx.ts "C:\caminho\arquivo.xlsx"
 *   npx tsx scripts/import-clientes-from-xlsx.ts "C:\caminho\arquivo.xlsx" --dry-run
 *
 * Requer: VITE_SUPABASE_URL (ou SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY no .env
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
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

  if (digitos.length <= 11) {
    if (digitos.length <= 3) return digitos;
    if (digitos.length <= 6) return digitos.replace(/^(\d{3})(\d+)/, "$1.$2");
    if (digitos.length <= 9) return digitos.replace(/^(\d{3})(\d{3})(\d+)/, "$1.$2.$3");
    return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d+)/, "$1.$2.$3-$4");
  }

  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 5) return digitos.replace(/^(\d{2})(\d+)/, "$1.$2");
  if (digitos.length <= 8) return digitos.replace(/^(\d{2})(\d{3})(\d+)/, "$1.$2.$3");
  if (digitos.length <= 12) {
    return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d+)/, "$1.$2.$3/$4");
  }

  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, "$1.$2.$3/$4-$5");
}

function normalizarDocumentoParaArmazenar(valor: string): string {
  const digitos = String(valor || "").replace(/\D/g, "").slice(0, 14);
  if (digitos.length !== 11 && digitos.length !== 14) return "";
  return formatarCNPJ(digitos);
}

function documentoPossuiTamanhoValido(valor: string): boolean {
  const total = valor.replace(/\D/g, "").length;
  return total === 11 || total === 14;
}

function derivarDadosUnidadeDocumento(valor: string): { cnpj_raiz: string; tipo_unidade_cliente: string } {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length === 11) return { cnpj_raiz: "", tipo_unidade_cliente: "Pessoa física" };
  if (digitos.length !== 14) return { cnpj_raiz: "", tipo_unidade_cliente: "" };
  return {
    cnpj_raiz: digitos.slice(0, 8),
    tipo_unidade_cliente: digitos.slice(8, 12) === "0001" ? "Matriz" : "Filial",
  };
}

function limparOuNull(valor: unknown): string | null {
  const texto = String(valor ?? "").trim();
  return texto === "" ? null : texto;
}

function parseExcelDateToIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const yyyy = String(value.getFullYear()).padStart(4, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
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
  codigo_ibama: string;
  descricao_veiculo: string;
  mtr_coleta: string;
  destino: string;
  mtr_destino: string;
  residuo_destino: string;
  observacoes_operacionais: string;
  ajudante: string;
  solicitante: string;
  origem_planilha_cliente: string;
  cnpj_raiz: string;
  tipo_unidade_cliente: string;
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
  cadri: "licenca_numero",
  "venc cadri": "validade",
  validade: "validade",
  "codigo ibama": "codigo_ibama",
  codigo_ibama: "codigo_ibama",
  "descricao veiculo": "descricao_veiculo",
  descricao_veiculo: "descricao_veiculo",
  veiculo: "descricao_veiculo",
  "mtr de coleta": "mtr_coleta",
  "mtr coleta": "mtr_coleta",
  mtr: "mtr_coleta",
  mtr_coleta: "mtr_coleta",
  destino: "destino",
  "mtr de destino": "mtr_destino",
  "mtr destino": "mtr_destino",
  mtr_destino: "mtr_destino",
  "residuo de destino": "residuo_destino",
  residuo_destino: "residuo_destino",
  observacoes: "observacoes_operacionais",
  obs: "observacoes_operacionais",
  "obs:": "observacoes_operacionais",
  ajudante: "ajudante",
  solicitante: "solicitante",
  origem_planilha_cliente: "origem_planilha_cliente",
  cnpj_raiz: "cnpj_raiz",
  tipo_unidade_cliente: "tipo_unidade_cliente",
  "ativo desde": "status_ativo_desde",
  status_ativo_desde: "status_ativo_desde",
  "inativo desde": "status_inativo_desde",
  status_inativo_desde: "status_inativo_desde",
  "razao social (nf)": "razao_social",
  "responsavel nome": "responsavel_nome",
};

function dividirLista(valor?: string | null) {
  if (!valor) return [];
  return valor
    .split(" | ")
    .map((item) => item.trim())
    .filter(Boolean);
}

const IMPORT_MERGE_LIST_FIELDS: Array<keyof ImportRow> = [
  "tipo_residuo",
  "classificacao",
  "unidade_medida",
  "frequencia_coleta",
  "codigo_ibama",
  "descricao_veiculo",
  "mtr_coleta",
  "destino",
  "mtr_destino",
  "residuo_destino",
  "observacoes_operacionais",
  "ajudante",
  "solicitante",
  "origem_planilha_cliente",
];

function juntarValorLista(atual: string | undefined, proximo: string | undefined): string | undefined {
  const itens = [...dividirLista(atual), ...dividirLista(proximo)];
  const unicos = Array.from(new Set(itens.map((item) => item.trim()).filter(Boolean)));
  return unicos.length ? unicos.join(" | ") : undefined;
}

function consolidarLinhasImportacao(rows: ImportRow[]): ImportRow[] {
  const map = new Map<string, ImportRow>();
  for (const row of rows) {
    const key = row.cnpj?.trim();
    if (!key) continue;
    const existente = map.get(key);
    if (!existente) {
      map.set(key, { ...row });
      continue;
    }

    for (const [campo, valor] of Object.entries(row) as Array<[keyof ImportRow, string | undefined]>) {
      if (!valor) continue;
      if (IMPORT_MERGE_LIST_FIELDS.includes(campo)) {
        existente[campo] = juntarValorLista(existente[campo], valor);
      } else if (!existente[campo]) {
        existente[campo] = valor;
      }
    }
  }
  return Array.from(map.values());
}

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
  const dryRun = process.argv.includes("--dry-run");
  const filePath = process.argv.slice(2).find((arg) => !arg.startsWith("--"))?.trim() || "";
  if (!filePath) {
    console.error('Informe o caminho do .xlsx. Ex.: npx tsx scripts/import-clientes-from-xlsx.ts "C:\\\\path\\\\clientes.xlsx"');
    process.exit(1);
  }
  if (!existsSync(filePath)) {
    console.error("Arquivo não encontrado:", filePath);
    process.exit(1);
  }

  console.log("Lendo planilha:", filePath);
  const fileBuf = readFileSync(filePath);
  const wb = XLSX.read(fileBuf, { type: "buffer", dense: true, cellDates: true });
  if (!wb.SheetNames?.length) throw new Error("A planilha não possui abas.");

  const rows: ImportRow[] = [];
  const erros: string[] = [];
  let abasProcessadas = 0;
  let linhasLidas = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      raw: true,
    }) as unknown[][];

    if (!Array.isArray(aoa) || aoa.length < 2) continue;

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
      erros.push(`Aba ${sheetName}: cabeçalhos obrigatórios ausentes (${missing.join(", ")}).`);
      continue;
    }

    abasProcessadas++;
    linhasLidas += aoa.length - 1;

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r] ?? [];
      const obj: ImportRow = { origem_planilha_cliente: sheetName };

      for (const [idx, key] of colMap.entries()) {
        const v = (row as unknown[])[idx];
        if (key === "validade" || key === "status_ativo_desde" || key === "status_inativo_desde") {
          const iso = parseExcelDateToIso(v);
          if (iso) (obj as Record<keyof ImportRow, string | undefined>)[key] = iso;
          continue;
        }
        const s = String(v ?? "").trim();
        if (s && s !== "-") (obj as Record<keyof ImportRow, string | undefined>)[key] = s;
      }

      const razao = (obj.razao_social || "").trim();
      const cnpj = normalizarDocumentoParaArmazenar(String(obj.cnpj || ""));
      const nome = (obj.nome || razao || "").trim();

      if (!razao || !cnpj || !documentoPossuiTamanhoValido(cnpj)) {
        erros.push(`Aba ${sheetName}, linha ${r + 1}: razão/documento inválidos.`);
        continue;
      }

      obj.nome = nome;
      obj.razao_social = razao;
      obj.cnpj = cnpj;
      obj.status = (obj.status || "Ativo").trim() || "Ativo";
      Object.assign(obj, derivarDadosUnidadeDocumento(cnpj));

      if (!obj.tipo_residuo) obj.tipo_residuo = "—";
      if (!obj.classificacao) obj.classificacao = "—";

      rows.push(obj);
    }
  }

  if (abasProcessadas === 0) {
    throw new Error("Nenhuma aba com cabeçalho compatível foi encontrada.");
  }

  const rowsConsolidadas = consolidarLinhasImportacao(rows);

  if (rowsConsolidadas.length === 0) {
    throw new Error(erros.length ? `Nenhuma linha válida.\n${erros.slice(0, 12).join("\n")}` : "Nenhuma linha válida.");
  }

  console.log(
    `Planilha: ${abasProcessadas} abas, ${linhasLidas} linhas lidas, ${rows.length} linhas válidas, ${rowsConsolidadas.length} clientes consolidados. ${erros.length} ignoradas.`
  );
  if (erros.length) {
    const logPath = resolve(process.cwd(), "clientes-import-erros.log");
    writeFileSync(logPath, erros.join("\n"), "utf8");
    console.log(`Log de inconsistências: ${logPath}`);
  }

  if (dryRun) {
    console.log("Dry-run concluído. Nenhuma alteração foi enviada ao Supabase.");
    return;
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

  console.log("2) Upsert (por CNPJ/CPF): inserir/atualizar clientes reais...");
  const cnpjs = Array.from(new Set(rowsConsolidadas.map((r) => r.cnpj!).filter(Boolean)));
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

  for (const r of rowsConsolidadas) {
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
      codigo_ibama: limparOuNull(r.codigo_ibama),
      descricao_veiculo: limparOuNull(r.descricao_veiculo),
      mtr_coleta: limparOuNull(r.mtr_coleta),
      destino: limparOuNull(r.destino),
      mtr_destino: limparOuNull(r.mtr_destino),
      residuo_destino: limparOuNull(r.residuo_destino),
      observacoes_operacionais: limparOuNull(r.observacoes_operacionais),
      ajudante: limparOuNull(r.ajudante),
      solicitante: limparOuNull(r.solicitante),
      origem_planilha_cliente: limparOuNull(r.origem_planilha_cliente),
      cnpj_raiz: limparOuNull(r.cnpj_raiz),
      tipo_unidade_cliente: limparOuNull(r.tipo_unidade_cliente),
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

