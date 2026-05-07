import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import MainLayout from "../layouts/MainLayout";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "../lib/coletasQueryLimits";
import { sanitizeIlikePattern } from "../lib/sanitizeIlike";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { limparSessionDraftKey, useCadastroFormDraft } from "../lib/useCadastroFormDraft";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { clienteEstaAtivo } from "../lib/brasilRegioes";
import { RgReportPdfIcon } from "../components/ui/RgReportPdfIcon";
import {
  margemLucroClienteRotuloLista,
  margemLucroDbParaCampo,
  parseMargemLucroPercentual,
} from "../lib/clienteMargemLucro";

type Cliente = {
  id: string;
  nome: string;
  razao_social: string;
  cnpj: string;
  status: string | null;

  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;

  cep_faturamento: string | null;
  rua_faturamento: string | null;
  numero_faturamento: string | null;
  complemento_faturamento: string | null;
  bairro_faturamento: string | null;
  cidade_faturamento: string | null;
  estado_faturamento: string | null;

  endereco_coleta: string | null;
  endereco_faturamento: string | null;
  email_nf: string | null;
  margem_lucro_percentual?: string | number | null;

  responsavel_nome: string | null;
  telefone: string | null;
  email: string | null;

  tipo_residuo: string | null;
  classificacao: string | null;
  unidade_medida: string | null;
  frequencia_coleta: string | null;

  licenca_numero: string | null;
  validade: string | null;
  codigo_ibama: string | null;
  descricao_veiculo: string | null;
  mtr_coleta: string | null;
  destino: string | null;
  mtr_destino: string | null;
  residuo_destino: string | null;
  observacoes_operacionais: string | null;
  ajudante: string | null;
  solicitante: string | null;
  origem_planilha_cliente: string | null;
  cnpj_raiz: string | null;
  tipo_unidade_cliente: string | null;
  status_ativo_desde: string | null;
  status_inativo_desde: string | null;

  representante_rg_id?: string | null;
  caminhao_id?: string | null;
  equipamentos?: string | null;
};

type ResiduoForm = {
  tipo_residuo: string;
  classificacao: string;
  unidade_medida: string;
  frequencia_coleta: string;
};

type FormCliente = {
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

  cep_faturamento: string;
  rua_faturamento: string;
  numero_faturamento: string;
  complemento_faturamento: string;
  bairro_faturamento: string;
  cidade_faturamento: string;
  estado_faturamento: string;

  email_nf: string;
  margem_lucro_percentual: string;

  responsavel_nome: string;
  telefone: string;
  email: string;

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

  representante_rg_id: string;
  caminhao_id: string;
  equipamentos: string;

  residuos: ResiduoForm[];
};

const residuoInicial: ResiduoForm = {
  tipo_residuo: "",
  classificacao: "",
  unidade_medida: "",
  frequencia_coleta: "",
};

const formInicial: FormCliente = {
  nome: "",
  razao_social: "",
  cnpj: "",
  status: "Ativo",

  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  endereco_coleta: "",

  cep_faturamento: "",
  rua_faturamento: "",
  numero_faturamento: "",
  complemento_faturamento: "",
  bairro_faturamento: "",
  cidade_faturamento: "",
  estado_faturamento: "",

  email_nf: "",
  margem_lucro_percentual: "",

  responsavel_nome: "",
  telefone: "",
  email: "",

  licenca_numero: "",
  validade: "",
  codigo_ibama: "",
  descricao_veiculo: "",
  mtr_coleta: "",
  destino: "",
  mtr_destino: "",
  residuo_destino: "",
  observacoes_operacionais: "",
  ajudante: "",
  solicitante: "",
  origem_planilha_cliente: "",
  cnpj_raiz: "",
  tipo_unidade_cliente: "",
  status_ativo_desde: "",
  status_inativo_desde: "",

  representante_rg_id: "",
  caminhao_id: "",
  equipamentos: "",

  residuos: [{ ...residuoInicial }],
};

function limparOuNull(valor: string) {
  const texto = valor.trim();
  return texto === "" ? null : texto;
}

function formatarData(data?: string | null) {
  if (!data) return "-";
  const limpa = data.includes("T") ? data.split("T")[0] : data;
  const partes = limpa.split("-");
  if (partes.length !== 3) return data;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

/** Endereço de coleta para relatório: estruturado; senão texto livre legado. */
function formatarEnderecoRelatorio(c: Cliente): string {
  const partes: string[] = [];
  const linha = [c.rua?.trim(), c.numero?.trim()].filter(Boolean).join(", ");
  if (linha) partes.push(linha);
  if (c.complemento?.trim()) partes.push(c.complemento.trim());
  if (c.bairro?.trim()) partes.push(c.bairro.trim());
  const uf = c.estado?.trim();
  if (uf) partes.push(uf);
  if (c.cep?.trim()) partes.push(`CEP ${c.cep.trim()}`);
  const estruturado = partes.join(" · ");
  if (estruturado) return estruturado;
  const livre = (c.endereco_coleta || "").trim();
  if (livre) return livre;
  return "-";
}

/** Endereço de faturamento para relatório: estruturado; senão texto livre legado. */
function formatarEnderecoFaturamentoRelatorio(c: Cliente): string {
  const partes: string[] = [];
  const linha = [c.rua_faturamento?.trim(), c.numero_faturamento?.trim()].filter(Boolean).join(", ");
  if (linha) partes.push(linha);
  if (c.complemento_faturamento?.trim()) partes.push(c.complemento_faturamento.trim());
  if (c.bairro_faturamento?.trim()) partes.push(c.bairro_faturamento.trim());
  const uf = c.estado_faturamento?.trim();
  if (uf) partes.push(uf);
  if (c.cep_faturamento?.trim()) partes.push(`CEP ${c.cep_faturamento.trim()}`);
  const estruturado = partes.join(" · ");
  if (estruturado) return estruturado;
  const livre = (c.endereco_faturamento || "").trim();
  if (livre) return livre;
  return "-";
}

/** Texto livre em uma linha, alinhado ao padrão visual do cadastro (rua, nº - CEP, demais partes). */
function montarEnderecoTextoLivreDosCamposEstruturados(p: {
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}): string {
  const rua = p.rua.trim();
  const numero = p.numero.trim();
  const cep = p.cep.trim();
  const complemento = p.complemento.trim();
  const bairro = p.bairro.trim();
  const cidade = p.cidade.trim();
  const estado = p.estado.trim();

  const linhaRuaNum = [rua, numero].filter(Boolean).join(", ");
  let out = linhaRuaNum;
  if (cep) {
    out = out ? `${out} - ${cep}` : cep;
  }
  const tail = [complemento, bairro, cidade, estado].filter(Boolean);
  if (tail.length) {
    out = out ? `${out}, ${tail.join(", ")}` : tail.join(", ");
  }
  return out;
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

function derivarDadosUnidadeDocumento(valor: string): Pick<FormCliente, "cnpj_raiz" | "tipo_unidade_cliente"> {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length === 11) return { cnpj_raiz: "", tipo_unidade_cliente: "Pessoa física" };
  if (digitos.length !== 14) return { cnpj_raiz: "", tipo_unidade_cliente: "" };
  return {
    cnpj_raiz: digitos.slice(0, 8),
    tipo_unidade_cliente: digitos.slice(8, 12) === "0001" ? "Matriz" : "Filial",
  };
}

function normalizarHeader(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
  cep_faturamento: string;
  rua_faturamento: string;
  numero_faturamento: string;
  complemento_faturamento: string;
  bairro_faturamento: string;
  cidade_faturamento: string;
  estado_faturamento: string;
  endereco_coleta: string;
  endereco_faturamento: string;
  email_nf: string;
  margem_lucro_percentual: string;
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

const IMPORT_MAX_BYTES = 2 * 1024 * 1024; // 2MB (mitigação)
const IMPORT_MAX_ROWS = 2000;
const IMPORT_MAX_COLS = 40;

const IMPORT_HEADER_ALIASES: Record<string, keyof ImportRow> = {
  nome: "nome",
  "nome fantasia": "nome",
  cliente: "nome",
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
  "endereco coleta": "endereco_coleta",
  endereco_coleta: "endereco_coleta",
  "endereco faturamento": "endereco_faturamento",
  endereco_faturamento: "endereco_faturamento",
  "cep faturamento": "cep_faturamento",
  cep_faturamento: "cep_faturamento",
  "rua faturamento": "rua_faturamento",
  rua_faturamento: "rua_faturamento",
  "numero faturamento": "numero_faturamento",
  numero_faturamento: "numero_faturamento",
  "complemento faturamento": "complemento_faturamento",
  complemento_faturamento: "complemento_faturamento",
  "bairro faturamento": "bairro_faturamento",
  bairro_faturamento: "bairro_faturamento",
  "cidade faturamento": "cidade_faturamento",
  cidade_faturamento: "cidade_faturamento",
  "estado faturamento": "estado_faturamento",
  estado_faturamento: "estado_faturamento",
  "email nf": "email_nf",
  email_nf: "email_nf",
  "margem lucro": "margem_lucro_percentual",
  margem_lucro: "margem_lucro_percentual",
  margem_lucro_percentual: "margem_lucro_percentual",
  "margem de lucro": "margem_lucro_percentual",
  "% margem": "margem_lucro_percentual",
  responsavel: "responsavel_nome",
  responsavel_nome: "responsavel_nome",
  telefone: "telefone",
  email: "email",
  "tipo residuo": "tipo_residuo",
  tipo_residuo: "tipo_residuo",
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
  "observações": "observacoes_operacionais",
  obs: "observacoes_operacionais",
  "obs:": "observacoes_operacionais",
  ajudante: "ajudante",
  solicitante: "solicitante",
  origem_planilha_cliente: "origem_planilha_cliente",
  cnpj_raiz: "cnpj_raiz",
  tipo_unidade_cliente: "tipo_unidade_cliente",
  "status ativo desde": "status_ativo_desde",
  status_ativo_desde: "status_ativo_desde",
  "status inativo desde": "status_inativo_desde",
  status_inativo_desde: "status_inativo_desde",
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

function serializarResiduos(residuos: ResiduoForm[]) {
  return {
    tipo_residuo: residuos
      .map((item) => item.tipo_residuo.trim())
      .filter(Boolean)
      .join(" | "),
    classificacao: residuos
      .map((item) => item.classificacao.trim())
      .filter(Boolean)
      .join(" | "),
    unidade_medida: residuos
      .map((item) => item.unidade_medida.trim())
      .filter(Boolean)
      .join(" | "),
    frequencia_coleta: residuos
      .map((item) => item.frequencia_coleta.trim())
      .filter(Boolean)
      .join(" | "),
  };
}

function montarResiduosDoCliente(cliente: Cliente): ResiduoForm[] {
  const tipos = dividirLista(cliente.tipo_residuo);
  const classes = dividirLista(cliente.classificacao);
  const unidades = dividirLista(cliente.unidade_medida);
  const frequencias = dividirLista(cliente.frequencia_coleta);

  const total = Math.max(tipos.length, classes.length, unidades.length, frequencias.length, 1);

  return Array.from({ length: total }).map((_, index) => ({
    tipo_residuo: tipos[index] || "",
    classificacao: classes[index] || "",
    unidade_medida: unidades[index] || "",
    frequencia_coleta: frequencias[index] || "",
  }));
}

const CLIENTES_SELECT_CORE =
  "id, nome, razao_social, cnpj, status, cep, rua, numero, complemento, bairro, cidade, estado";

const CLIENTES_SELECT_FAT_ENDERECO =
  "cep_faturamento, rua_faturamento, numero_faturamento, complemento_faturamento, bairro_faturamento, cidade_faturamento, estado_faturamento";

const CLIENTES_SELECT_TAIL_BASE =
  "endereco_coleta, endereco_faturamento, email_nf, responsavel_nome, telefone, email, tipo_residuo, classificacao, unidade_medida, frequencia_coleta, licenca_numero, validade, codigo_ibama, descricao_veiculo, mtr_coleta, destino, mtr_destino, residuo_destino, observacoes_operacionais, ajudante, solicitante, origem_planilha_cliente, cnpj_raiz, tipo_unidade_cliente, representante_rg_id, caminhao_id, equipamentos";

function montarClientesSelectPrincipalLegacy(
  incluirFatEstruturado: boolean,
  incluirMargemLucro: boolean
): string {
  const tail = incluirMargemLucro
    ? `${CLIENTES_SELECT_TAIL_BASE}, margem_lucro_percentual`
    : CLIENTES_SELECT_TAIL_BASE;
  return incluirFatEstruturado
    ? `${CLIENTES_SELECT_CORE}, ${CLIENTES_SELECT_FAT_ENDERECO}, ${tail}`
    : `${CLIENTES_SELECT_CORE}, ${tail}`;
}

function montarOrFilterBuscaClientesLegacy(s: string, incluirColunasFat: boolean): string {
  const base = `nome.ilike.%${s}%,razao_social.ilike.%${s}%,cnpj.ilike.%${s}%,cidade.ilike.%${s}%`;
  const rest = incluirColunasFat
    ? `,cidade_faturamento.ilike.%${s}%,tipo_residuo.ilike.%${s}%,status.ilike.%${s}%,email_nf.ilike.%${s}%,rua.ilike.%${s}%,rua_faturamento.ilike.%${s}%,endereco_coleta.ilike.%${s}%,endereco_faturamento.ilike.%${s}%,codigo_ibama.ilike.%${s}%,descricao_veiculo.ilike.%${s}%,mtr_coleta.ilike.%${s}%,destino.ilike.%${s}%,mtr_destino.ilike.%${s}%,residuo_destino.ilike.%${s}%,observacoes_operacionais.ilike.%${s}%,ajudante.ilike.%${s}%,solicitante.ilike.%${s}%,origem_planilha_cliente.ilike.%${s}%,cnpj_raiz.ilike.%${s}%,tipo_unidade_cliente.ilike.%${s}%`
    : `,tipo_residuo.ilike.%${s}%,status.ilike.%${s}%,email_nf.ilike.%${s}%,rua.ilike.%${s}%,endereco_coleta.ilike.%${s}%,endereco_faturamento.ilike.%${s}%,codigo_ibama.ilike.%${s}%,descricao_veiculo.ilike.%${s}%,mtr_coleta.ilike.%${s}%,destino.ilike.%${s}%,mtr_destino.ilike.%${s}%,residuo_destino.ilike.%${s}%,observacoes_operacionais.ilike.%${s}%,ajudante.ilike.%${s}%,solicitante.ilike.%${s}%,origem_planilha_cliente.ilike.%${s}%,cnpj_raiz.ilike.%${s}%,tipo_unidade_cliente.ilike.%${s}%`;
  return base + rest;
}

/** Migração `20260427140000_clientes_status_datas.sql` ainda não aplicada no Supabase. */
function isMissingClientesStatusDateColumnsError(
  error: { message?: string } | null | undefined
): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  if (!msg) return false;
  return (
    (msg.includes("status_ativo_desde") || msg.includes("status_inativo_desde")) &&
    (msg.includes("schema cache") || msg.includes("could not find"))
  );
}

function isMissingFaturamentoEstruturadoColumnsError(
  error: { message?: string } | null | undefined
): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("cep_faturamento") ||
    msg.includes("rua_faturamento") ||
    msg.includes("numero_faturamento") ||
    msg.includes("complemento_faturamento") ||
    msg.includes("bairro_faturamento") ||
    msg.includes("cidade_faturamento") ||
    msg.includes("estado_faturamento")
  );
}

function isMissingMargemLucroPercentualColumnError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  if (code === "PGRST204" && msg.includes("margem_lucro_percentual")) return true;
  if (!msg.includes("margem_lucro_percentual")) return false;
  return (
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    msg.includes("does not exist") ||
    msg.includes("unknown column")
  );
}

/** Rascunho do cadastro: evita perder dados se a aba for recarregada ou descartada pelo navegador. */
const CLIENTES_CADASTRO_DRAFT_KEY = "rg-ambiental-clientes-cadastro-draft";

/** Persistência da preferência da listagem (vista compacta ou réplica da planilha). */
const CLIENTES_LISTAGEM_MODO_KEY = "rg-ambiental-clientes-listagem-modo";

type ModoTabelaClientes = "compacta" | "planilha";

const MODO_TABELA_PADRAO: ModoTabelaClientes = "compacta";

function lerModoTabelaPersistido(): ModoTabelaClientes {
  if (typeof window === "undefined") return MODO_TABELA_PADRAO;
  try {
    const v = window.localStorage.getItem(CLIENTES_LISTAGEM_MODO_KEY);
    return v === "planilha" || v === "compacta" ? v : MODO_TABELA_PADRAO;
  } catch {
    return MODO_TABELA_PADRAO;
  }
}

function gravarModoTabelaPersistido(modo: ModoTabelaClientes) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLIENTES_LISTAGEM_MODO_KEY, modo);
  } catch {
    /* localStorage indisponível: ignora silenciosamente. */
  }
}

type FiltroVencCadri = "todos" | "vencidos" | "30" | "60" | "90";

const FILTRO_VENC_CADRI_OPTIONS: Array<{ value: FiltroVencCadri; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "vencidos", label: "Já vencidos" },
  { value: "30", label: "Vencendo em 30 dias" },
  { value: "60", label: "Vencendo em 60 dias" },
  { value: "90", label: "Vencendo em 90 dias" },
];

/** Calcula dias restantes até a data (negativo se já venceu). null se data inválida/ausente. */
function calcularDiasParaVencer(validade: string | null | undefined): number | null {
  if (!validade) return null;
  const limpa = String(validade).includes("T")
    ? String(validade).split("T")[0]
    : String(validade);
  const m = limpa.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (!ano || !mes || !dia) return null;
  const alvo = new Date(ano, mes - 1, dia);
  if (Number.isNaN(alvo.getTime())) return null;
  const hoje = new Date();
  const hojeNorm = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const ms = alvo.getTime() - hojeNorm.getTime();
  return Math.round(ms / 86_400_000);
}

type VencCadriEstado = {
  /** -1 = sem data, 0 = vencido, 1 = crítico (<30), 2 = atenção (30-90), 3 = ok (>90). */
  nivel: -1 | 0 | 1 | 2 | 3;
  bg: string;
  fg: string;
  borda: string;
  rotulo: string;
};

function classificarVencCadri(dias: number | null): VencCadriEstado {
  if (dias == null) {
    return { nivel: -1, bg: "transparent", fg: "#64748b", borda: "transparent", rotulo: "" };
  }
  if (dias < 0) {
    return {
      nivel: 0,
      bg: "#fee2e2",
      fg: "#991b1b",
      borda: "#fecaca",
      rotulo: `Vencido há ${Math.abs(dias)}d`,
    };
  }
  if (dias <= 30) {
    return {
      nivel: 1,
      bg: "#fef2f2",
      fg: "#b91c1c",
      borda: "#fecaca",
      rotulo: `Vence em ${dias}d`,
    };
  }
  if (dias <= 90) {
    return {
      nivel: 2,
      bg: "#fef9c3",
      fg: "#854d0e",
      borda: "#fde68a",
      rotulo: `Vence em ${dias}d`,
    };
  }
  return {
    nivel: 3,
    bg: "#dcfce7",
    fg: "#166534",
    borda: "#bbf7d0",
    rotulo: `Vence em ${dias}d`,
  };
}

function clienteAtendeFiltroVencCadri(c: Cliente, filtro: FiltroVencCadri): boolean {
  if (filtro === "todos") return true;
  const dias = calcularDiasParaVencer(c.validade);
  if (dias == null) return false;
  if (filtro === "vencidos") return dias < 0;
  const limite = Number(filtro);
  return dias >= 0 && dias <= limite;
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const buscaDebounced = useDebouncedValue(busca, 400);
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [importandoExcel, setImportandoExcel] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [importResumo, setImportResumo] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alternandoStatusId, setAlternandoStatusId] = useState<string | null>(null);
  const [form, setForm] = useState<FormCliente>(formInicial);
  const faturamentoEstruturadoColDisponivelRef = useRef(true);
  const margemLucroColDisponivelRef = useRef(true);

  const [modoTabela, setModoTabela] = useState<ModoTabelaClientes>(() => lerModoTabelaPersistido());
  const [filtroVencCadri, setFiltroVencCadri] = useState<FiltroVencCadri>("todos");
  const [linhasExpandidas, setLinhasExpandidas] = useState<Set<string>>(() => new Set());

  /** Modal de informações completas do cliente (aberto ao clicar no nome). */
  const [clienteDetalhe, setClienteDetalhe] = useState<Cliente | null>(null);

  type RepresentanteRgOpcao = { id: string; nome: string };
  const [representantesRg, setRepresentantesRg] = useState<RepresentanteRgOpcao[]>([]);

  type VeiculoCaminhaoOpcao = { id: string; placa: string; modelo: string | null };
  const [veiculosCaminhoes, setVeiculosCaminhoes] = useState<VeiculoCaminhaoOpcao[]>([]);

  const rotuloRepresentanteRgCliente = useCallback(
    (c: Cliente) => {
      const rid = c.representante_rg_id;
      if (rid) {
        const hit = representantesRg.find((r) => r.id === rid);
        if (hit) return hit.nome;
        return "Representante (indisponível na lista)";
      }
      return c.responsavel_nome?.trim() || "—";
    },
    [representantesRg]
  );

  const rotuloVeiculoCliente = useCallback(
    (c: Cliente) => {
      const vid = c.caminhao_id;
      if (!vid) return "—";
      const hit = veiculosCaminhoes.find((v) => v.id === vid);
      if (hit) {
        const m = hit.modelo?.trim();
        return m ? `${hit.placa} — ${m}` : hit.placa;
      }
      return "Veículo (indisponível na lista)";
    },
    [veiculosCaminhoes]
  );

  useEffect(() => {
    if (!clienteDetalhe) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClienteDetalhe(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clienteDetalhe]);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("representantes_rg")
        .select("id, nome")
        .order("nome", { ascending: true });
      if (error) {
        console.warn("Erro ao listar Representantes RG:", error);
        return;
      }
      setRepresentantesRg(
        ((data as Array<{ id: string; nome: string }> | null) ?? []).map((r) => ({
          id: r.id,
          nome: r.nome,
        }))
      );
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("caminhoes")
        .select("id, placa, modelo")
        .order("placa", { ascending: true });
      if (error) {
        console.warn("Erro ao listar veículos (frota):", error);
        return;
      }
      setVeiculosCaminhoes(
        ((data as Array<{ id: string; placa: string; modelo: string | null }> | null) ?? []).map((v) => ({
          id: v.id,
          placa: v.placa,
          modelo: v.modelo ?? null,
        }))
      );
    })();
  }, []);

  useEffect(() => {
    gravarModoTabelaPersistido(modoTabela);
  }, [modoTabela]);

  const alternarLinhaExpandida = useCallback((id: string) => {
    setLinhasExpandidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }, []);

  const termoFiltro = useMemo(() => buscaDebounced.trim(), [buscaDebounced]);

  const clientesFiltrados = useMemo(() => {
    if (filtroVencCadri === "todos") return clientes;
    return clientes.filter((c) => clienteAtendeFiltroVencCadri(c, filtroVencCadri));
  }, [clientes, filtroVencCadri]);

  const totalFiltradoLocalmente = clientesFiltrados.length;

  const cadastroDraftData = useMemo(() => ({ form, editingId }), [form, editingId]);
  useCadastroFormDraft({
    storageKey: CLIENTES_CADASTRO_DRAFT_KEY,
    open: mostrarCadastro,
    data: cadastroDraftData,
    onRestore: (d) => {
      setForm({ ...formInicial, ...d.form });
      setEditingId(d.editingId);
      setMostrarCadastro(true);
    },
  });

  const fetchClientes = useCallback(async () => {
    setLoading(true);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const montarQueries = (listStr: string, incluirColunasFat: boolean) => {
      let countQ = supabase.from("clientes").select("id", { count: "exact", head: true });
      let dataQ = supabase.from("clientes").select(listStr).order("nome", { ascending: true });

      if (termoFiltro) {
        const s = sanitizeIlikePattern(termoFiltro);
        const orFilter = montarOrFilterBuscaClientesLegacy(s, incluirColunasFat);
        countQ = countQ.or(orFilter);
        dataQ = dataQ.or(orFilter);
      }
      return { countQ, dataQ };
    };

    let fat = faturamentoEstruturadoColDisponivelRef.current;
    let ml = margemLucroColDisponivelRef.current;

    const executarFetch = () => {
      const listStr = montarClientesSelectPrincipalLegacy(fat, ml);
      return montarQueries(listStr, fat);
    };

    let { countQ, dataQ } = executarFetch();

    let [{ count, error: errCount }, { data, error }] = await Promise.all([
      countQ,
      dataQ.range(from, to),
    ]);

    while (error) {
      if (fat && isMissingFaturamentoEstruturadoColumnsError(error)) {
        faturamentoEstruturadoColDisponivelRef.current = false;
        fat = false;
        ({ countQ, dataQ } = executarFetch());
        [{ count, error: errCount }, { data, error }] = await Promise.all([
          countQ,
          dataQ.range(from, to),
        ]);
        continue;
      }
      if (ml && isMissingMargemLucroPercentualColumnError(error)) {
        margemLucroColDisponivelRef.current = false;
        ml = false;
        ({ countQ, dataQ } = executarFetch());
        [{ count, error: errCount }, { data, error }] = await Promise.all([
          countQ,
          dataQ.range(from, to),
        ]);
        continue;
      }
      break;
    }

    if (errCount) {
      console.error("Erro ao contar clientes:", errCount);
    } else {
      setTotalCount(typeof count === "number" ? count : 0);
    }

    if (error) {
      console.error("Erro ao buscar clientes:", error);
      const listMin = montarClientesSelectPrincipalLegacy(false, false);
      let cqMin = supabase.from("clientes").select("id", { count: "exact", head: true });
      let dqMin = supabase.from("clientes").select(listMin).order("nome", { ascending: true });
      if (termoFiltro) {
        const s = sanitizeIlikePattern(termoFiltro);
        const orFilter = montarOrFilterBuscaClientesLegacy(s, false);
        cqMin = cqMin.or(orFilter);
        dqMin = dqMin.or(orFilter);
      }
      try {
        const [cRes, dRes] = await Promise.all([cqMin, dqMin.range(from, to)]);
        if (!dRes.error && Array.isArray(dRes.data)) {
          if (!cRes.error && typeof cRes.count === "number") {
            setTotalCount(cRes.count);
          }
          faturamentoEstruturadoColDisponivelRef.current = false;
          setClientes((dRes.data as unknown as Cliente[]) || []);
          setLoading(false);
          return;
        }
      } catch {
        /* ignore */
      }
      setClientes([]);
      setLoading(false);
      return;
    }

    setClientes((data as unknown as Cliente[]) || []);
    setLoading(false);
  }, [page, pageSize, termoFiltro]);

  const fetchClientesRelatorio = useCallback(async (): Promise<Cliente[]> => {
    const PAGE = 1000;
    const montarDataQ = (listStr: string, incluirColunasFat: boolean) => {
      let dataQ = supabase.from("clientes").select(listStr).order("nome", { ascending: true });
      if (termoFiltro) {
        const s = sanitizeIlikePattern(termoFiltro);
        const orFilter = montarOrFilterBuscaClientesLegacy(s, incluirColunasFat);
        dataQ = dataQ.or(orFilter);
      }
      return dataQ;
    };

    let fat = faturamentoEstruturadoColDisponivelRef.current;
    let ml = margemLucroColDisponivelRef.current;

    const out: Cliente[] = [];
    for (let from = 0; ; from += PAGE) {
      const to = from + PAGE - 1;
      let listStr = montarClientesSelectPrincipalLegacy(fat, ml);
      let dataQ = montarDataQ(listStr, fat);
      let { data, error } = await dataQ.range(from, to);
      while (error) {
        if (fat && isMissingFaturamentoEstruturadoColumnsError(error)) {
          faturamentoEstruturadoColDisponivelRef.current = false;
          fat = false;
          listStr = montarClientesSelectPrincipalLegacy(fat, ml);
          dataQ = montarDataQ(listStr, fat);
          ({ data, error } = await dataQ.range(from, to));
          continue;
        }
        if (ml && isMissingMargemLucroPercentualColumnError(error)) {
          margemLucroColDisponivelRef.current = false;
          ml = false;
          listStr = montarClientesSelectPrincipalLegacy(fat, ml);
          dataQ = montarDataQ(listStr, fat);
          ({ data, error } = await dataQ.range(from, to));
          continue;
        }
        break;
      }
      if (error) throw error;
      const chunk = ((data as unknown as Cliente[]) || []).filter(Boolean);
      out.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    return out;
  }, [termoFiltro]);

  const handleGerarRelatorioPdf = useCallback(async () => {
    try {
      setGerandoRelatorio(true);
      const linhas = await fetchClientesRelatorio();

      const agora = new Date();
      const dataHora = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(agora);

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const titulo = "Relatório de clientes";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(titulo, 40, 36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Gerado em: ${dataHora}`, 40, 54);
      doc.text(
        termoFiltro
          ? `Buscando por: "${termoFiltro}"`
          : "Buscando por: todos os clientes (sem filtro de busca)",
        40,
        68
      );
      doc.text(`Total de registros: ${linhas.length}`, 40, 82);

      autoTable(doc, {
        startY: 96,
        head: [[
          "Nome",
          "Razão social",
          "CNPJ",
          "Cidade",
          "Endereço de Coleta",
          "Endereço de Faturamento",
          "Responsável",
          "Telefone",
          "E-mail",
          "E-mail NF",
          "Margem lucro %",
          "Resíduo",
          "Classe",
          "Licença válida até",
          "Status",
        ]],
        body: linhas.map((c) => [
          c.nome ?? "",
          c.razao_social ?? "",
          c.cnpj ?? "",
          c.cidade ?? "-",
          formatarEnderecoRelatorio(c),
          formatarEnderecoFaturamentoRelatorio(c),
          c.responsavel_nome?.trim() || "-",
          c.telefone?.trim() || "-",
          c.email?.trim() || "-",
          c.email_nf?.trim() || "-",
          margemLucroClienteRotuloLista(c.margem_lucro_percentual),
          c.tipo_residuo ?? "-",
          c.classificacao ?? "-",
          formatarData(c.validade),
          c.status ?? "Ativo",
        ]),
        styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7 },
        margin: { left: 40, right: 40 },
        tableWidth: "auto",
        columnStyles: {
          0: { cellWidth: 56 },
          1: { cellWidth: 64 },
          2: { cellWidth: 52 },
          3: { cellWidth: 40 },
          4: { cellWidth: 64 },
          5: { cellWidth: 64 },
          6: { cellWidth: 44 },
          7: { cellWidth: 42 },
          8: { cellWidth: 50 },
          9: { cellWidth: 46 },
          10: { cellWidth: 34 },
          11: { cellWidth: 40 },
          12: { cellWidth: 32 },
          13: { cellWidth: 36 },
          14: { cellWidth: 32 },
        },
      });

      const iso = agora.toISOString().slice(0, 10);
      doc.save(`relatorio-clientes_${iso}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar relatório de clientes:", err);
      alert("Não foi possível gerar o relatório em PDF. Tente novamente.");
    } finally {
      setGerandoRelatorio(false);
    }
  }, [fetchClientesRelatorio, termoFiltro]);

  const handleBaixarModeloExcel = useCallback(() => {
    const headers = [
      "nome",
      "razao_social",
      "cnpj",
      "status",
      "cep",
      "rua",
      "numero",
      "complemento",
      "bairro",
      "cidade",
      "estado",
      "cep_faturamento",
      "rua_faturamento",
      "numero_faturamento",
      "complemento_faturamento",
      "bairro_faturamento",
      "cidade_faturamento",
      "estado_faturamento",
      "email_nf",
      "margem_lucro_percentual",
      "responsavel_nome",
      "telefone",
      "email",
      "tipo_residuo",
      "classificacao",
      "unidade_medida",
      "frequencia_coleta",
      "licenca_numero",
      "validade",
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
      "cnpj_raiz",
      "tipo_unidade_cliente",
    ];

    const exemplo = [
      "Cliente Exemplo",
      "Cliente Exemplo LTDA",
      "00.000.000/0000-00",
      "Ativo",
      "01310-100",
      "Av. Paulista",
      "1000",
      "Sala 1",
      "Bela Vista",
      "São Paulo",
      "SP",
      "01310-100",
      "Av. Paulista",
      "1000",
      "Sala 1",
      "Bela Vista",
      "São Paulo",
      "SP",
      "nf@cliente.com.br",
      "15,5",
      "Fulano",
      "(11) 99999-9999",
      "contato@cliente.com.br",
      "Resíduo",
      "Classe I",
      "kg",
      "semanal",
      "",
      "2026-12-31",
      "150202",
      "BAU",
      "RG EMITE - EXCEL",
      "RG AMBIENTAL",
      "",
      "",
      "Observação operacional",
      "NÃO",
      "Compras",
      "CLIENTES",
      "00000000",
      "Matriz",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, exemplo]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "clientes");
    XLSX.writeFile(wb, "modelo_importacao_clientes.xlsx");
  }, []);

  const handleExportarExcel = useCallback(async () => {
    try {
      setExportandoExcel(true);
      const linhasOriginais = await fetchClientesRelatorio();
      const linhas =
        filtroVencCadri === "todos"
          ? linhasOriginais
          : linhasOriginais.filter((c) => clienteAtendeFiltroVencCadri(c, filtroVencCadri));

      const isPlanilha = modoTabela === "planilha";

      const headers = isPlanilha
        ? [
            "razao_social",
            "cnpj",
            "endereco",
            "cadri",
            "venc_cadri",
            "codigo_ibama",
            "descricao_veiculo",
            "tipo_residuo",
            "mtr_de_coleta",
            "destino",
            "mtr_de_destino",
            "residuo_de_destino",
            "observacoes",
            "ajudante",
          ]
        : [
            "nome",
            "razao_social",
            "cnpj",
            "status",
            "endereco_coleta",
            "endereco_faturamento",
            "email_nf",
            "margem_lucro_percentual",
            "tipo_residuo",
            "classificacao",
            "licenca_numero",
            "validade",
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
            "cnpj_raiz",
            "tipo_unidade_cliente",
          ];

      const corpo = isPlanilha
        ? linhas.map((c) => [
            c.razao_social ?? "",
            c.cnpj ?? "",
            formatarEnderecoRelatorio(c),
            c.licenca_numero ?? "",
            c.validade ?? "",
            c.codigo_ibama ?? "",
            c.descricao_veiculo ?? "",
            c.tipo_residuo ?? "",
            c.mtr_coleta ?? "",
            c.destino ?? "",
            c.mtr_destino ?? "",
            c.residuo_destino ?? "",
            c.observacoes_operacionais ?? "",
            c.ajudante ?? "",
          ])
        : linhas.map((c) => [
            c.nome ?? "",
            c.razao_social ?? "",
            c.cnpj ?? "",
            c.status ?? "Ativo",
            formatarEnderecoRelatorio(c),
            formatarEnderecoFaturamentoRelatorio(c),
            c.email_nf ?? "",
            margemLucroDbParaCampo(c.margem_lucro_percentual),
            c.tipo_residuo ?? "",
            c.classificacao ?? "",
            c.licenca_numero ?? "",
            c.validade ?? "",
            c.codigo_ibama ?? "",
            c.descricao_veiculo ?? "",
            c.mtr_coleta ?? "",
            c.destino ?? "",
            c.mtr_destino ?? "",
            c.residuo_destino ?? "",
            c.observacoes_operacionais ?? "",
            c.ajudante ?? "",
            c.solicitante ?? "",
            c.origem_planilha_cliente ?? "",
            c.cnpj_raiz ?? "",
            c.tipo_unidade_cliente ?? "",
          ]);

      const aoa = [headers, ...corpo];

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, isPlanilha ? "CLIENTES" : "clientes");

      const iso = new Date().toISOString().slice(0, 10);
      const sufixo = termoFiltro ? `_filtro-${termoFiltro.trim().slice(0, 40)}` : "";
      const sufixoVenc = filtroVencCadri !== "todos" ? `_cadri-${filtroVencCadri}` : "";
      const prefixo = isPlanilha ? "clientes_planilha" : "clientes";
      XLSX.writeFile(wb, `${prefixo}_${iso}${sufixo}${sufixoVenc}.xlsx`);
    } catch (err) {
      console.error("Erro ao exportar Excel:", err);
      alert("Não foi possível exportar em Excel. Tente novamente.");
    } finally {
      setExportandoExcel(false);
    }
  }, [fetchClientesRelatorio, filtroVencCadri, modoTabela, termoFiltro]);

  const handleImportarExcel = useCallback(
    async (file: File) => {
      setImportResumo("");
      if (!file) return;

      if (!/\.xlsx$/i.test(file.name)) {
        alert("Envie um arquivo .xlsx (Excel).");
        return;
      }

      if (file.size > IMPORT_MAX_BYTES) {
        alert(`Arquivo muito grande. Limite: ${(IMPORT_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB.`);
        return;
      }

      setImportandoExcel(true);

      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", dense: true, cellDates: true });
        const rows: ImportRow[] = [];
        const erros: string[] = [];
        let abasProcessadas = 0;
        let linhasLidas = 0;

        for (const sheetName of wb.SheetNames || []) {
          const sheet = wb.Sheets[sheetName];
          const aoa = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            blankrows: false,
            raw: true,
          }) as unknown[][];

          if (!Array.isArray(aoa) || aoa.length < 2) continue;

          const headerRow = aoa[0] ?? [];
          if ((headerRow as unknown[]).length > IMPORT_MAX_COLS) {
            throw new Error(`Muitas colunas na aba ${sheetName} (${(headerRow as unknown[]).length}). Limite: ${IMPORT_MAX_COLS}.`);
          }

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
          if (linhasLidas > IMPORT_MAX_ROWS) {
            throw new Error(`Muitas linhas (${linhasLidas}). Limite: ${IMPORT_MAX_ROWS}.`);
          }

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
          throw new Error(
            erros.length ? `Nenhuma linha válida.\n\n${erros.slice(0, 8).join("\n")}` : "Nenhuma linha válida."
          );
        }

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
          const textoColetaImp = montarEnderecoTextoLivreDosCamposEstruturados({
            cep: r.cep || "",
            rua: r.rua || "",
            numero: r.numero || "",
            complemento: r.complemento || "",
            bairro: r.bairro || "",
            cidade: r.cidade || "",
            estado: r.estado || "",
          });
          const textoFatImp = montarEnderecoTextoLivreDosCamposEstruturados({
            cep: r.cep_faturamento || r.cep || "",
            rua: r.rua_faturamento || r.rua || "",
            numero: r.numero_faturamento || r.numero || "",
            complemento: r.complemento_faturamento || r.complemento || "",
            bairro: r.bairro_faturamento || r.bairro || "",
            cidade: r.cidade_faturamento || r.cidade || "",
            estado: r.estado_faturamento || r.estado || "",
          });
          const payload = {
            nome: r.nome!,
            razao_social: r.razao_social!,
            cnpj: r.cnpj!,
            status: (r.status || "Ativo").trim() || "Ativo",
            cep: limparOuNull(r.cep || ""),
            rua: limparOuNull(r.rua || ""),
            numero: limparOuNull(r.numero || ""),
            complemento: limparOuNull(r.complemento || ""),
            bairro: limparOuNull(r.bairro || ""),
            cidade: limparOuNull(r.cidade || ""),
            estado: limparOuNull(r.estado || ""),
            cep_faturamento: limparOuNull(r.cep_faturamento || ""),
            rua_faturamento: limparOuNull(r.rua_faturamento || ""),
            numero_faturamento: limparOuNull(r.numero_faturamento || ""),
            complemento_faturamento: limparOuNull(r.complemento_faturamento || ""),
            bairro_faturamento: limparOuNull(r.bairro_faturamento || ""),
            cidade_faturamento: limparOuNull(r.cidade_faturamento || ""),
            estado_faturamento: limparOuNull(r.estado_faturamento || ""),
            endereco_coleta: limparOuNull(r.endereco_coleta || textoColetaImp),
            endereco_faturamento: limparOuNull(r.endereco_faturamento || textoFatImp),
            email_nf: limparOuNull(r.email_nf || ""),
            margem_lucro_percentual: (() => {
              const p = parseMargemLucroPercentual(String(r.margem_lucro_percentual ?? ""));
              return p.ok ? p.value : null;
            })(),
            responsavel_nome: limparOuNull(r.responsavel_nome || ""),
            telefone: limparOuNull(r.telefone || ""),
            email: limparOuNull(r.email || ""),
            tipo_residuo: limparOuNull(r.tipo_residuo || ""),
            classificacao: limparOuNull(r.classificacao || ""),
            unidade_medida: limparOuNull(r.unidade_medida || ""),
            frequencia_coleta: limparOuNull(r.frequencia_coleta || ""),
            licenca_numero: limparOuNull(r.licenca_numero || ""),
            validade: limparOuNull(r.validade || ""),
            codigo_ibama: limparOuNull(r.codigo_ibama || ""),
            descricao_veiculo: limparOuNull(r.descricao_veiculo || ""),
            mtr_coleta: limparOuNull(r.mtr_coleta || ""),
            destino: limparOuNull(r.destino || ""),
            mtr_destino: limparOuNull(r.mtr_destino || ""),
            residuo_destino: limparOuNull(r.residuo_destino || ""),
            observacoes_operacionais: limparOuNull(r.observacoes_operacionais || ""),
            ajudante: limparOuNull(r.ajudante || ""),
            solicitante: limparOuNull(r.solicitante || ""),
            origem_planilha_cliente: limparOuNull(r.origem_planilha_cliente || ""),
            cnpj_raiz: limparOuNull(r.cnpj_raiz || ""),
            tipo_unidade_cliente: limparOuNull(r.tipo_unidade_cliente || ""),
            status_ativo_desde: limparOuNull(r.status_ativo_desde || ""),
            status_inativo_desde: limparOuNull(r.status_inativo_desde || ""),
          };

          const id = existingMap.get(r.cnpj!);
          if (id) updates.push({ id, payload });
          else inserts.push(payload);
        }

        for (let i = 0; i < inserts.length; i += 200) {
          const chunk = inserts.slice(i, i + 200);
          const { error } = await supabase.from("clientes").insert(chunk);
          if (error) throw error;
        }

        for (const u of updates) {
          const { error } = await supabase.from("clientes").update(u.payload).eq("id", u.id);
          if (error) throw error;
        }

        setImportResumo(
          [
            `Importação concluída.`,
            `Abas: ${abasProcessadas}.`,
            `Linhas válidas: ${rows.length}.`,
            `Clientes consolidados: ${rowsConsolidadas.length}.`,
            `Novos: ${inserts.length}.`,
            `Atualizados: ${updates.length}.`,
            erros.length ? `Ignorados: ${erros.length} (ex.: ${erros[0]})` : "",
          ]
            .filter(Boolean)
            .join(" ")
        );

        await fetchClientes();
      } catch (err) {
        console.error("Erro ao importar Excel:", err);
        alert(err instanceof Error ? err.message : "Falha ao importar a planilha.");
      } finally {
        setImportandoExcel(false);
      }
    },
    [fetchClientes]
  );

  useEffect(() => {
    queueMicrotask(() => {
      void fetchClientes();
    });
  }, [fetchClientes]);

  useEffect(() => {
    const id = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(id);
  }, [buscaDebounced, pageSize]);

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    const rawValue = name === "cnpj" ? formatarCNPJ(value) : value;

    if (name === "representante_rg_id") {
      const nomeRep = rawValue
        ? representantesRg.find((r) => r.id === rawValue)?.nome ?? ""
        : "";
      setForm((prev) => ({ ...prev, representante_rg_id: rawValue, responsavel_nome: nomeRep }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: rawValue,
      ...(name === "cnpj" ? derivarDadosUnidadeDocumento(rawValue) : {}),
    }));
  }

  function handleResiduoChange(
    index: number,
    campo: keyof ResiduoForm,
    valor: string
  ) {
    setForm((prev) => {
      const residuosAtualizados = [...prev.residuos];
      residuosAtualizados[index] = {
        ...residuosAtualizados[index],
        [campo]: valor,
      };

      return {
        ...prev,
        residuos: residuosAtualizados,
      };
    });
  }

  function adicionarResiduo() {
    setForm((prev) => ({
      ...prev,
      residuos: [...prev.residuos, { ...residuoInicial }],
    }));
  }

  function removerResiduo(index: number) {
    setForm((prev) => {
      if (prev.residuos.length === 1) {
        return {
          ...prev,
          residuos: [{ ...residuoInicial }],
        };
      }

      return {
        ...prev,
        residuos: prev.residuos.filter((_, i) => i !== index),
      };
    });
  }

  function limparFormulario() {
    limparSessionDraftKey(CLIENTES_CADASTRO_DRAFT_KEY);
    setForm(formInicial);
    setEditingId(null);
  }

  function abrirCadastroNovo() {
    limparFormulario();
    setMostrarCadastro(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleEditar(cliente: Cliente) {
    // feedback imediato: abre o cadastro já com os dados da linha
    setEditingId(cliente.id);
    setMostrarCadastro(true);
    setSucesso("");
    window.scrollTo({ top: 0, behavior: "smooth" });

    const hydrate = (row: Cliente) => {
      setForm({
        nome: row.nome || "",
        razao_social: row.razao_social || "",
        cnpj: row.cnpj || "",
        status: row.status || "Ativo",

        cep: row.cep || "",
        rua: row.rua || "",
        numero: row.numero || "",
        complemento: row.complemento || "",
        bairro: row.bairro || "",
        cidade: row.cidade || "",
        estado: row.estado || "",
        endereco_coleta: row.endereco_coleta || "",

        cep_faturamento: row.cep_faturamento ?? row.cep ?? "",
        rua_faturamento: row.rua_faturamento ?? row.rua ?? "",
        numero_faturamento: row.numero_faturamento ?? row.numero ?? "",
        complemento_faturamento: row.complemento_faturamento ?? row.complemento ?? "",
        bairro_faturamento: row.bairro_faturamento ?? row.bairro ?? "",
        cidade_faturamento: row.cidade_faturamento ?? row.cidade ?? "",
        estado_faturamento: row.estado_faturamento ?? row.estado ?? "",

        email_nf: row.email_nf || "",
        margem_lucro_percentual: margemLucroDbParaCampo(row.margem_lucro_percentual),

        responsavel_nome:
          row.responsavel_nome ||
          (row.representante_rg_id
            ? representantesRg.find((r) => r.id === row.representante_rg_id)?.nome ?? ""
            : ""),
        telefone: row.telefone || "",
        email: row.email || "",

        representante_rg_id: row.representante_rg_id ?? "",
        caminhao_id: row.caminhao_id ?? "",
        equipamentos: row.equipamentos ?? "",

        licenca_numero: row.licenca_numero || "",
        validade: row.validade || "",
        codigo_ibama: row.codigo_ibama || "",
        descricao_veiculo: row.descricao_veiculo || "",
        mtr_coleta: row.mtr_coleta || "",
        destino: row.destino || "",
        mtr_destino: row.mtr_destino || "",
        residuo_destino: row.residuo_destino || "",
        observacoes_operacionais: row.observacoes_operacionais || "",
        ajudante: row.ajudante || "",
        solicitante: row.solicitante || "",
        origem_planilha_cliente: row.origem_planilha_cliente || "",
        cnpj_raiz: row.cnpj_raiz || derivarDadosUnidadeDocumento(row.cnpj || "").cnpj_raiz,
        tipo_unidade_cliente:
          row.tipo_unidade_cliente || derivarDadosUnidadeDocumento(row.cnpj || "").tipo_unidade_cliente,
        status_ativo_desde: row.status_ativo_desde ?? "",
        status_inativo_desde: row.status_inativo_desde ?? "",

        residuos: montarResiduosDoCliente(row),
      });
    };

    hydrate(cliente);

    try {
      let fat = faturamentoEstruturadoColDisponivelRef.current;
      let ml = margemLucroColDisponivelRef.current;
      const lista = () => montarClientesSelectPrincipalLegacy(fat, ml);
      const completa = () => `${lista()}, status_ativo_desde, status_inativo_desde`;

      let fullRes = await supabase
        .from("clientes")
        .select(completa())
        .eq("id", cliente.id)
        .maybeSingle();

      if (fullRes.error && isMissingFaturamentoEstruturadoColumnsError(fullRes.error)) {
        faturamentoEstruturadoColDisponivelRef.current = false;
        fat = false;
        fullRes = await supabase
          .from("clientes")
          .select(completa())
          .eq("id", cliente.id)
          .maybeSingle();
      }

      if (fullRes.error && isMissingMargemLucroPercentualColumnError(fullRes.error)) {
        margemLucroColDisponivelRef.current = false;
        ml = false;
        fullRes = await supabase
          .from("clientes")
          .select(completa())
          .eq("id", cliente.id)
          .maybeSingle();
      }

      if (fullRes.error && isMissingClientesStatusDateColumnsError(fullRes.error)) {
        fullRes = await supabase
          .from("clientes")
          .select(lista())
          .eq("id", cliente.id)
          .maybeSingle();
      }

      const { data: fullRow, error } = fullRes;
      if (!error && fullRow && typeof fullRow === "object" && fullRow !== null && "id" in fullRow) {
        hydrate(fullRow as Cliente);
      }
    } catch (e) {
      console.warn("Falha ao carregar cliente completo:", e);
    }
  }

  async function handleSalvarCliente(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.nome.trim()) {
      alert("Preencha o nome fantasia.");
      return;
    }

    if (!form.razao_social.trim()) {
      alert("Preencha a razão social.");
      return;
    }

    if (!form.cnpj.trim()) {
      alert("Preencha o CNPJ/CPF.");
      return;
    }

    if (!documentoPossuiTamanhoValido(form.cnpj)) {
      alert("Informe um CNPJ com 14 dígitos ou CPF com 11 dígitos.");
      return;
    }

    const residuosValidos = form.residuos.filter((item) => item.tipo_residuo.trim());

    if (residuosValidos.length === 0) {
      alert("Adicione pelo menos um resíduo.");
      return;
    }

    const margemParsed = parseMargemLucroPercentual(form.margem_lucro_percentual);
    if (!margemParsed.ok) {
      alert(margemParsed.message);
      return;
    }

    setSalvando(true);

    const residuosSerializados = serializarResiduos(residuosValidos);
    const enderecoColetaEstruturado = montarEnderecoTextoLivreDosCamposEstruturados({
      cep: form.cep,
      rua: form.rua,
      numero: form.numero,
      complemento: form.complemento,
      bairro: form.bairro,
      cidade: form.cidade,
      estado: form.estado,
    });

    const payloadBase = {
      nome: form.nome.trim(),
      razao_social: form.razao_social.trim(),
      cnpj: form.cnpj.trim(),
      cep: limparOuNull(form.cep),
      rua: limparOuNull(form.rua),
      numero: limparOuNull(form.numero),
      complemento: limparOuNull(form.complemento),
      bairro: limparOuNull(form.bairro),
      cidade: limparOuNull(form.cidade),
      estado: limparOuNull(form.estado),
      cep_faturamento: limparOuNull(form.cep_faturamento),
      rua_faturamento: limparOuNull(form.rua_faturamento),
      numero_faturamento: limparOuNull(form.numero_faturamento),
      complemento_faturamento: limparOuNull(form.complemento_faturamento),
      bairro_faturamento: limparOuNull(form.bairro_faturamento),
      cidade_faturamento: limparOuNull(form.cidade_faturamento),
      estado_faturamento: limparOuNull(form.estado_faturamento),
      endereco_coleta: limparOuNull(form.endereco_coleta || enderecoColetaEstruturado),
      endereco_faturamento: limparOuNull(
        montarEnderecoTextoLivreDosCamposEstruturados({
          cep: form.cep_faturamento,
          rua: form.rua_faturamento,
          numero: form.numero_faturamento,
          complemento: form.complemento_faturamento,
          bairro: form.bairro_faturamento,
          cidade: form.cidade_faturamento,
          estado: form.estado_faturamento,
        })
      ),
      email_nf: limparOuNull(form.email_nf),
      responsavel_nome: limparOuNull(form.responsavel_nome),
      telefone: limparOuNull(form.telefone),
      email: limparOuNull(form.email),
      tipo_residuo: limparOuNull(residuosSerializados.tipo_residuo),
      classificacao: limparOuNull(residuosSerializados.classificacao),
      unidade_medida: limparOuNull(residuosSerializados.unidade_medida),
      frequencia_coleta: limparOuNull(residuosSerializados.frequencia_coleta),
      licenca_numero: limparOuNull(form.licenca_numero),
      validade: limparOuNull(form.validade),
      codigo_ibama: limparOuNull(form.codigo_ibama),
      descricao_veiculo: limparOuNull(form.descricao_veiculo),
      mtr_coleta: limparOuNull(form.mtr_coleta),
      destino: limparOuNull(form.destino),
      mtr_destino: limparOuNull(form.mtr_destino),
      residuo_destino: limparOuNull(form.residuo_destino),
      observacoes_operacionais: limparOuNull(form.observacoes_operacionais),
      ajudante: limparOuNull(form.ajudante),
      solicitante: limparOuNull(form.solicitante),
      origem_planilha_cliente: limparOuNull(form.origem_planilha_cliente),
      cnpj_raiz: limparOuNull(derivarDadosUnidadeDocumento(form.cnpj).cnpj_raiz),
      tipo_unidade_cliente: limparOuNull(derivarDadosUnidadeDocumento(form.cnpj).tipo_unidade_cliente),
      representante_rg_id: form.representante_rg_id.trim() || null,
      caminhao_id: form.caminhao_id.trim() || null,
      equipamentos: limparOuNull(form.equipamentos),
      status: form.status?.trim() || "Ativo",
    };

    let usarMargemLucro =
      margemLucroColDisponivelRef.current || form.margem_lucro_percentual.trim() !== "";
    let usarStatusDatas = true;

    const montarPayloadSalvar = (): Record<string, unknown> => {
      const corpo: Record<string, unknown> = { ...payloadBase };
      if (usarStatusDatas) {
        corpo.status_ativo_desde = limparOuNull(form.status_ativo_desde);
        corpo.status_inativo_desde = limparOuNull(form.status_inativo_desde);
      }
      if (usarMargemLucro) {
        corpo.margem_lucro_percentual = margemParsed.value;
      }
      return corpo;
    };

    let response = editingId
      ? await supabase.from("clientes").update(montarPayloadSalvar()).eq("id", editingId)
      : await supabase.from("clientes").insert([montarPayloadSalvar()]);

    if (response.error && usarStatusDatas && isMissingClientesStatusDateColumnsError(response.error)) {
      usarStatusDatas = false;
      usarMargemLucro =
        margemLucroColDisponivelRef.current || form.margem_lucro_percentual.trim() !== "";
      response = editingId
        ? await supabase.from("clientes").update(montarPayloadSalvar()).eq("id", editingId)
        : await supabase.from("clientes").insert([montarPayloadSalvar()]);
    }

    if (response.error && usarMargemLucro && isMissingMargemLucroPercentualColumnError(response.error)) {
      margemLucroColDisponivelRef.current = false;
      usarMargemLucro = false;
      response = editingId
        ? await supabase.from("clientes").update(montarPayloadSalvar()).eq("id", editingId)
        : await supabase.from("clientes").insert([montarPayloadSalvar()]);
    }

    const error: PostgrestError | null = response.error;

    if (error) {
      console.error("Erro ao salvar cliente:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });

      alert(
        `Erro ao salvar cliente.\n\nMensagem: ${error.message}${
          error.details ? `\nDetalhes: ${error.details}` : ""
        }`
      );

      setSalvando(false);
      return;
    }

    const mensagem = editingId
      ? "Cliente atualizado com sucesso!"
      : "Cliente cadastrado com sucesso!";

    limparFormulario();
    setSalvando(false);
    setMostrarCadastro(false);
    await fetchClientes();

    setSucesso(mensagem);

    setTimeout(() => {
      setSucesso("");
    }, 3000);
  }

  async function handleDelete(id: string) {
    const confirmar = window.confirm("Deseja realmente remover este cliente?");
    if (!confirmar) return;

    const { error } = await supabase.from("clientes").delete().eq("id", id);

    if (error) {
      console.error("Erro ao remover cliente:", error);
      alert("Erro ao remover cliente.");
      return;
    }

    if (editingId === id) {
      limparFormulario();
    }

    await fetchClientes();
  }

  async function alternarInativoRapido(cliente: Cliente, marcarInativo: boolean) {
    const novoStatus = marcarInativo ? "Inativo" : "Ativo";
    setAlternandoStatusId(cliente.id);
    const { error } = await supabase.from("clientes").update({ status: novoStatus }).eq("id", cliente.id);
    setAlternandoStatusId(null);
    if (error) {
      console.error("Erro ao atualizar status do cliente:", error);
      alert(`Erro ao atualizar status.\n\n${error.message}`);
      return;
    }
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, status: novoStatus } : c)));
  }

  const totalPaginas =
    totalCount != null && totalCount > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  const totalExibidoKpi = totalCount != null ? totalCount : clientes.length;

  useEffect(() => {
    if (page <= totalPaginas) return;
    const id = window.setTimeout(() => setPage(totalPaginas), 0);
    return () => window.clearTimeout(id);
  }, [page, totalPaginas]);

  return (
    <MainLayout>
      <div className="page-shell">
      <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
        {sucesso && (
          <div
            style={{
              background: "#16a34a",
              color: "#ffffff",
              padding: "14px 16px",
              borderRadius: "12px",
              fontWeight: 700,
              boxShadow: "0 4px 12px rgba(22, 163, 74, 0.18)",
              border: "1px solid #15803d",
            }}
          >
            {sucesso}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "26px",
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Cadastro da carteira de clientes
            </h1>
            <p className="page-header__lead" style={{ margin: "6px 0 0" }}>
              Cadastro base para <strong>Programação</strong>, <strong>MTR</strong>,{" "}
              <strong>Controle de Massa</strong> e o seguimento da coleta.
            </p>
          </div>

          <div className="rg-page-toolbar">
            <div className="rg-kpi-card">
              <div className="rg-kpi-card__label">Total de clientes</div>
              <div className="rg-kpi-card__value">{totalExibidoKpi}</div>
            </div>

            <button
              type="button"
              className="rg-btn rg-btn--report"
              disabled={gerandoRelatorio}
              onClick={() => void handleGerarRelatorioPdf()}
              title="Gera um PDF com todos os clientes conforme o filtro atual"
            >
              <RgReportPdfIcon className="rg-btn__icon" />
              {gerandoRelatorio ? "Gerando PDF…" : "Relatório (PDF)"}
            </button>

            <div className="rg-page-toolbar" style={{ gap: "8px" }}>
              <input
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                id="clientes-import-xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f || importandoExcel) return;
                  void handleImportarExcel(f);
                }}
              />
              <button
                type="button"
                className="rg-btn rg-btn--outline"
                disabled={importandoExcel}
                onClick={() => document.getElementById("clientes-import-xlsx")?.click()}
                title="Importa clientes a partir de uma planilha .xlsx (valida e insere/atualiza por CNPJ/CPF)"
              >
                {importandoExcel ? "Importando…" : "Importar (Excel)"}
              </button>
              <button
                type="button"
                className="rg-btn rg-btn--outline"
                disabled={exportandoExcel}
                onClick={() => void handleExportarExcel()}
                title="Exporta os clientes em .xlsx conforme o filtro atual"
              >
                {exportandoExcel ? "Exportando…" : "Exportar (Excel)"}
              </button>
              <button
                type="button"
                className="rg-btn rg-btn--outline"
                onClick={handleBaixarModeloExcel}
                title="Baixa um modelo .xlsx com os cabeçalhos esperados"
              >
                Modelo Excel
              </button>
            </div>

            <button type="button" className="rg-btn rg-btn--primary" onClick={abrirCadastroNovo}>
              Novo cliente
            </button>
          </div>
        </div>

        {importResumo ? (
          <div
            style={{
              background: "#0ea5e9",
              color: "#ffffff",
              padding: "12px 16px",
              borderRadius: "12px",
              fontWeight: 700,
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            {importResumo}
          </div>
        ) : null}

        {mostrarCadastro && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div
            style={{
              padding: "18px 20px",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                fontSize: "18px",
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {editingId ? "Editar cliente" : "Novo cliente"}
            </div>
          </div>

            <form
              onSubmit={handleSalvarCliente}
              style={{
                padding: "22px 20px 20px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 800,
                    color: "#334155",
                    marginBottom: "12px",
                  }}
                >
                  Dados básicos
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "12px",
                  }}
                >
                  <input
                    name="nome"
                    value={form.nome}
                    onChange={handleInputChange}
                    placeholder="Nome fantasia"
                    style={inputStyle}
                  />

                  <input
                    name="razao_social"
                    value={form.razao_social}
                    onChange={handleInputChange}
                    placeholder="Razão social"
                    style={inputStyle}
                  />

                  <input
                    name="cnpj"
                    value={form.cnpj}
                    onChange={handleInputChange}
                    placeholder="CNPJ/CPF"
                    style={inputStyle}
                  />

                  <select
                    name="status"
                    value={form.status}
                    onChange={handleInputChange}
                    style={inputStyle}
                  >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "12px",
                    marginTop: "12px",
                  }}
                >
                  <input
                    type="date"
                    name="status_ativo_desde"
                    value={form.status_ativo_desde}
                    onChange={handleInputChange}
                    aria-label="Ativo desde"
                    title="Ativo desde (opcional)"
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    name="status_inativo_desde"
                    value={form.status_inativo_desde}
                    onChange={handleInputChange}
                    aria-label="Inativo desde"
                    title="Inativo desde (opcional)"
                    style={inputStyle}
                  />
                  <input
                    name="tipo_unidade_cliente"
                    value={form.tipo_unidade_cliente}
                    readOnly
                    placeholder="Matriz/Filial/Pessoa física"
                    title="Calculado automaticamente pelo CNPJ/CPF"
                    style={{ ...inputStyle, background: "#f8fafc" }}
                  />
                  <input
                    name="cnpj_raiz"
                    value={form.cnpj_raiz}
                    readOnly
                    placeholder="Raiz do CNPJ"
                    title="Raiz usada para agrupar matriz e filiais"
                    style={{ ...inputStyle, background: "#f8fafc" }}
                  />
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 800,
                    color: "#334155",
                    marginBottom: "12px",
                  }}
                >
                  Colunas da aba CLIENTES
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: "12px",
                    marginBottom: "12px",
                  }}
                >
                  <input
                    name="licenca_numero"
                    value={form.licenca_numero}
                    onChange={handleInputChange}
                    placeholder="CADRI"
                    title="Coluna CADRI da planilha"
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    name="validade"
                    value={form.validade}
                    onChange={handleInputChange}
                    placeholder="Venc CADRI"
                    title="Coluna Venc CADRI da planilha"
                    style={inputStyle}
                  />
                  <input
                    name="codigo_ibama"
                    value={form.codigo_ibama}
                    onChange={handleInputChange}
                    placeholder="Código IBAMA"
                    title="Coluna Código IBAMA da planilha"
                    style={inputStyle}
                  />
                  <input
                    name="descricao_veiculo"
                    value={form.descricao_veiculo}
                    onChange={handleInputChange}
                    placeholder="Descrição veículo"
                    title="Coluna Descrição veículo da planilha"
                    style={inputStyle}
                  />
                  <input
                    name="ajudante"
                    value={form.ajudante}
                    onChange={handleInputChange}
                    placeholder="Ajudante"
                    title="Coluna Ajudante da planilha"
                    style={inputStyle}
                  />
                  <input
                    name="mtr_coleta"
                    value={form.mtr_coleta}
                    onChange={handleInputChange}
                    placeholder="MTR de Coleta"
                    title="Coluna MTR de Coleta da planilha"
                    style={inputStyle}
                  />
                  <input
                    name="destino"
                    value={form.destino}
                    onChange={handleInputChange}
                    placeholder="Destino"
                    title="Coluna Destino da planilha"
                    style={inputStyle}
                  />
                  <input
                    name="mtr_destino"
                    value={form.mtr_destino}
                    onChange={handleInputChange}
                    placeholder="MTR de Destino"
                    title="Coluna MTR de Destino da planilha"
                    style={inputStyle}
                  />
                  <input
                    name="residuo_destino"
                    value={form.residuo_destino}
                    onChange={handleInputChange}
                    placeholder="Resíduo de Destino"
                    title="Coluna Resíduo de Destino da planilha"
                    style={inputStyle}
                  />
                  <input
                    name="solicitante"
                    value={form.solicitante}
                    onChange={handleInputChange}
                    placeholder="Solicitante"
                    style={inputStyle}
                  />
                  <input
                    name="origem_planilha_cliente"
                    value={form.origem_planilha_cliente}
                    onChange={handleInputChange}
                    placeholder="Origem da planilha"
                    style={inputStyle}
                  />
                </div>

                <textarea
                  name="observacoes_operacionais"
                  value={form.observacoes_operacionais}
                  onChange={handleInputChange}
                  placeholder="Observações operacionais"
                  title="Coluna Observações da planilha"
                  rows={3}
                  style={{ ...inputStyle, height: "auto", paddingTop: "10px", resize: "vertical" }}
                />
              </div>

              <div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 800,
                    color: "#334155",
                    marginBottom: "12px",
                  }}
                >
                  Endereço de Coleta
                </div>

                <textarea
                  name="endereco_coleta"
                  value={form.endereco_coleta}
                  onChange={handleInputChange}
                  placeholder="Endereço completo (coluna ENDEREÇO da planilha)"
                  title="Texto original da coluna ENDEREÇO. Os campos estruturados abaixo podem ser preenchidos quando houver separação por CEP/rua/número."
                  rows={2}
                  style={{
                    ...inputStyle,
                    height: "auto",
                    paddingTop: "10px",
                    resize: "vertical",
                    marginBottom: "12px",
                  }}
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                    gap: "12px",
                    marginBottom: "12px",
                  }}
                >
                  <input
                    name="cep"
                    value={form.cep}
                    onChange={handleInputChange}
                    placeholder="CEP"
                    style={inputStyle}
                  />
                  <input
                    name="rua"
                    value={form.rua}
                    onChange={handleInputChange}
                    placeholder="Rua"
                    style={inputStyle}
                  />
                  <input
                    name="numero"
                    value={form.numero}
                    onChange={handleInputChange}
                    placeholder="Número"
                    style={inputStyle}
                  />
                  <input
                    name="complemento"
                    value={form.complemento}
                    onChange={handleInputChange}
                    placeholder="Complemento"
                    style={inputStyle}
                  />
                  <input
                    name="bairro"
                    value={form.bairro}
                    onChange={handleInputChange}
                    placeholder="Bairro"
                    style={inputStyle}
                  />
                  <input
                    name="cidade"
                    value={form.cidade}
                    onChange={handleInputChange}
                    placeholder="Cidade"
                    style={inputStyle}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <input
                    name="estado"
                    value={form.estado}
                    onChange={handleInputChange}
                    placeholder="Estado"
                    style={{ ...inputStyle, maxWidth: "240px" }}
                  />
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 800,
                    color: "#334155",
                    marginBottom: "12px",
                  }}
                >
                  Endereço de Faturamento
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                    gap: "12px",
                    marginBottom: "12px",
                  }}
                >
                  <input
                    name="cep_faturamento"
                    value={form.cep_faturamento}
                    onChange={handleInputChange}
                    placeholder="CEP"
                    style={inputStyle}
                  />
                  <input
                    name="rua_faturamento"
                    value={form.rua_faturamento}
                    onChange={handleInputChange}
                    placeholder="Rua"
                    style={inputStyle}
                  />
                  <input
                    name="numero_faturamento"
                    value={form.numero_faturamento}
                    onChange={handleInputChange}
                    placeholder="Número"
                    style={inputStyle}
                  />
                  <input
                    name="complemento_faturamento"
                    value={form.complemento_faturamento}
                    onChange={handleInputChange}
                    placeholder="Complemento"
                    style={inputStyle}
                  />
                  <input
                    name="bairro_faturamento"
                    value={form.bairro_faturamento}
                    onChange={handleInputChange}
                    placeholder="Bairro"
                    style={inputStyle}
                  />
                  <input
                    name="cidade_faturamento"
                    value={form.cidade_faturamento}
                    onChange={handleInputChange}
                    placeholder="Cidade"
                    style={inputStyle}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <input
                    name="estado_faturamento"
                    value={form.estado_faturamento}
                    onChange={handleInputChange}
                    placeholder="Estado"
                    style={{ ...inputStyle, maxWidth: "240px" }}
                  />
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 800,
                    color: "#334155",
                    marginBottom: "12px",
                  }}
                >
                  Responsável
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 2fr 2fr",
                    gap: "12px",
                  }}
                >
                  <input
                    name="responsavel_nome"
                    value={form.responsavel_nome}
                    onChange={handleInputChange}
                    placeholder="Nome do responsável"
                    style={inputStyle}
                  />

                  <input
                    name="telefone"
                    value={form.telefone}
                    onChange={handleInputChange}
                    placeholder="Telefone"
                    style={inputStyle}
                  />

                  <input
                    name="email"
                    value={form.email}
                    onChange={handleInputChange}
                    placeholder="E-mail"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: "12px" }}>
                  <input
                    name="email_nf"
                    value={form.email_nf}
                    onChange={handleInputChange}
                    placeholder="E-mail para envio de NF (notas fiscais)"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: "10px" }}>
                  <input
                    name="margem_lucro_percentual"
                    value={form.margem_lucro_percentual}
                    onChange={handleInputChange}
                    placeholder="Margem de lucro (%) — ex.: 12,5"
                    style={inputStyle}
                    inputMode="decimal"
                    aria-label="Margem de lucro percentual do cliente"
                  />
                  <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748b", lineHeight: 1.45 }}>
                    Opcional. Usada no faturamento; deixe em branco se não aplicável.
                  </p>
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 800,
                    color: "#334155",
                    marginBottom: "12px",
                  }}
                >
                  Representante RG
                </div>

                <select
                  id="cliente-representante-rg"
                  name="representante_rg_id"
                  value={form.representante_rg_id}
                  onChange={handleInputChange}
                  aria-label="Representante RG"
                  style={inputStyle}
                >
                  <option value="">Selecione o representante RG</option>
                  {representantesRg.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>

                <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#64748b", lineHeight: 1.45 }}>
                  Cadastro em <strong>Cadastros → Representantes RG</strong>. O nome selecionado é
                  copiado para o campo "Responsável" automaticamente.
                </p>

                <div style={{ marginTop: "22px" }}>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "12px",
                    }}
                  >
                    Veículo preferencial
                  </div>
                  <label
                    htmlFor="cliente-veiculo-select"
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#475569",
                      marginBottom: "8px",
                    }}
                  >
                    Selecionar veículo
                  </label>
                  <select
                    id="cliente-veiculo-select"
                    name="caminhao_id"
                    value={form.caminhao_id}
                    onChange={handleInputChange}
                    aria-label="Veículo da frota (tabela caminhoes)"
                    style={inputStyle}
                  >
                    <option value="">Selecione o veículo</option>
                    {veiculosCaminhoes.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.modelo?.trim() ? `${v.placa} — ${v.modelo.trim()}` : v.placa}
                      </option>
                    ))}
                  </select>
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "12px",
                      color: "#64748b",
                      lineHeight: 1.45,
                    }}
                  >
                    Lista ligada ao cadastro em <strong>Cadastros → Veículos</strong>. Para incluir
                    ou editar veículos, use essa página.
                  </p>
                </div>

                <div style={{ marginTop: "22px" }}>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 800,
                      color: "#334155",
                      marginBottom: "12px",
                    }}
                  >
                    Equipamentos
                  </div>
                  <label
                    htmlFor="cliente-equipamentos"
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#475569",
                      marginBottom: "8px",
                    }}
                  >
                    Lista de equipamentos desejados
                  </label>
                  <textarea
                    id="cliente-equipamentos"
                    name="equipamentos"
                    value={form.equipamentos}
                    onChange={handleInputChange}
                    placeholder="Ex.: caçamba 3 m³, lona, EPIs..."
                    rows={4}
                    style={{
                      ...inputStyle,
                      width: "100%",
                      height: "auto",
                      minHeight: "96px",
                      paddingTop: "10px",
                      resize: "vertical",
                      fontFamily: "inherit",
                      lineHeight: 1.45,
                    }}
                  />
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    marginBottom: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 800,
                      color: "#334155",
                    }}
                  >
                    Resíduos e operação
                  </div>

                  <button
                    type="button"
                    onClick={adicionarResiduo}
                    style={{
                      background: "#0f172a",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "10px",
                      height: "40px",
                      padding: "0 16px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    + Adicionar resíduo
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {form.residuos.map((residuo, index) => (
                    <div
                      key={index}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "14px",
                        padding: "14px",
                        background: "#f8fafc",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "12px",
                          gap: "12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: 800,
                            color: "#0f172a",
                          }}
                        >
                          Resíduo {index + 1}
                        </div>

                        <button
                          type="button"
                          onClick={() => removerResiduo(index)}
                          style={{
                            background: "#ef4444",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            padding: "7px 12px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Remover
                        </button>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                          gap: "12px",
                        }}
                      >
                        <input
                          value={residuo.tipo_residuo}
                          onChange={(e) =>
                            handleResiduoChange(index, "tipo_residuo", e.target.value)
                          }
                          placeholder="Tipo de resíduo"
                          style={inputStyle}
                        />

                        <select
                          value={residuo.classificacao}
                          onChange={(e) =>
                            handleResiduoChange(index, "classificacao", e.target.value)
                          }
                          style={inputStyle}
                        >
                          <option value="">Classe do resíduo</option>
                          <option value="Classe I">Classe I</option>
                          <option value="Classe II">Classe II</option>
                        </select>

                        <select
                          value={residuo.unidade_medida}
                          onChange={(e) =>
                            handleResiduoChange(index, "unidade_medida", e.target.value)
                          }
                          style={inputStyle}
                        >
                          <option value="">Unidade de medida</option>
                          <option value="kg">kg</option>
                          <option value="ton">ton</option>
                          <option value="m3">m³</option>
                          <option value="litros">litros</option>
                        </select>

                        <input
                          value={residuo.frequencia_coleta}
                          onChange={(e) =>
                            handleResiduoChange(index, "frequencia_coleta", e.target.value)
                          }
                          placeholder="Frequência de coleta"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  marginTop: "8px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="submit"
                  disabled={salvando}
                  style={{
                    background: "#16a34a",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "10px",
                    height: "42px",
                    padding: "0 18px",
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: salvando ? 0.8 : 1,
                  }}
                >
                  {salvando
                    ? "Salvando..."
                    : editingId
                    ? "Salvar alterações"
                    : "Adicionar cliente"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    limparFormulario();
                    setMostrarCadastro(false);
                  }}
                  style={{
                    background: "#e5e7eb",
                    color: "#111827",
                    border: "none",
                    borderRadius: "10px",
                    height: "42px",
                    padding: "0 18px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
        </div>
        )}

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "18px",
            padding: "16px 18px 10px 18px",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "14px",
              marginBottom: "14px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Lista de clientes
              </h2>
            </div>

            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Busca (aguarda digitar — nome, razão social, CNPJ/CPF, cidade, e-mail NF, resíduo, endereços, MTR, destino…)"
              title="Filtra por nome, razão social, CNPJ/CPF, cidade, resíduo, status, e-mail NF, endereços, MTR, destino e dados operacionais."
              style={{
                flex: "1 1 280px",
                width: "100%",
                maxWidth: "560px",
                minWidth: "240px",
                height: "40px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                background: "#ffffff",
                outline: "none",
                padding: "0 14px",
                fontSize: "14px",
                color: "#111827",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "14px",
            }}
          >
            <div
              role="tablist"
              aria-label="Modo de exibição da lista"
              style={{
                display: "inline-flex",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "3px",
                gap: "2px",
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={modoTabela === "compacta"}
                onClick={() => setModoTabela("compacta")}
                title="Vista compacta — colunas-chave para faturamento e comercial"
                style={{
                  padding: "7px 14px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 700,
                  background: modoTabela === "compacta" ? "#ffffff" : "transparent",
                  color: modoTabela === "compacta" ? "#0f172a" : "#475569",
                  boxShadow: modoTabela === "compacta" ? "0 1px 2px rgba(15, 23, 42, 0.08)" : "none",
                }}
              >
                Vista compacta
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={modoTabela === "planilha"}
                onClick={() => setModoTabela("planilha")}
                title="Vista planilha — réplica da aba CLIENTES (CADRI, IBAMA, veículo, MTRs, destino, ajudante)"
                style={{
                  padding: "7px 14px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 700,
                  background: modoTabela === "planilha" ? "#ffffff" : "transparent",
                  color: modoTabela === "planilha" ? "#0f172a" : "#475569",
                  boxShadow: modoTabela === "planilha" ? "0 1px 2px rgba(15, 23, 42, 0.08)" : "none",
                }}
              >
                Vista planilha
              </button>
            </div>

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                color: "#475569",
                fontWeight: 600,
              }}
              title="Filtra a página atual por situação do CADRI"
            >
              CADRI:
              <select
                value={filtroVencCadri}
                onChange={(e) => setFiltroVencCadri(e.target.value as FiltroVencCadri)}
                style={{
                  height: "36px",
                  padding: "0 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  fontSize: "13px",
                  color: "#0f172a",
                  fontWeight: 600,
                }}
              >
                {FILTRO_VENC_CADRI_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {filtroVencCadri !== "todos" ? (
                <span
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    fontWeight: 500,
                  }}
                >
                  ({totalFiltradoLocalmente} de {clientes.length} na página)
                </span>
              ) : null}
            </label>
          </div>

          {loading ? (
            <div
              style={{
                padding: "30px 0",
                textAlign: "center",
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              Carregando clientes...
            </div>
          ) : (
            <div
              style={{
                overflowX: modoTabela === "planilha" ? "auto" : "hidden",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <table
                style={{
                  width: "100%",
                  tableLayout: modoTabela === "planilha" ? "auto" : "fixed",
                  minWidth: modoTabela === "planilha" ? 1480 : undefined,
                  borderCollapse: "collapse",
                  fontSize: "14px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#f8fafc",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <th
                      style={{
                        ...thStyle,
                        width: modoTabela === "planilha" ? 56 : "4%",
                        minWidth: 56,
                        maxWidth: 72,
                        textAlign: "center",
                        padding: "10px 6px",
                      }}
                      title="Marcar cliente como inativo na lista"
                    >
                      Inativo
                    </th>
                    <th
                      style={{
                        ...thStyle,
                        width: modoTabela === "planilha" ? 40 : "3%",
                        minWidth: 40,
                        textAlign: "center",
                        padding: "10px 4px",
                      }}
                      title="Expandir linha para ver todos os campos da planilha"
                      aria-label="Expandir"
                    >
                      <span aria-hidden="true">▾</span>
                    </th>

                    {modoTabela === "compacta" ? (
                      <>
                        <th style={{ ...thStyle, width: "16%" }} title="Nome e localização (cidade e UF)">
                          Cliente
                        </th>
                        <th style={{ ...thStyle, width: "13%" }}>Razão social</th>
                        <th style={{ ...thStyle, width: "9%", whiteSpace: "nowrap" }}>CNPJ/CPF</th>
                        <th style={{ ...thStyle, width: "10%" }}>E-mail NF</th>
                        <th style={{ ...thStyle, width: "5%", whiteSpace: "nowrap" }} title="Margem de lucro (%)">
                          Margem %
                        </th>
                        <th style={{ ...thStyle, width: "10%" }}>Resíduo</th>
                        <th style={{ ...thStyle, width: "10%" }} title="Veículo, destino e MTR da planilha">
                          Operação
                        </th>
                        <th style={{ ...thStyle, width: "5%", whiteSpace: "nowrap" }}>Classe</th>
                        <th
                          scope="col"
                          style={{
                            ...thStyle,
                            width: "7%",
                            whiteSpace: "normal",
                            lineHeight: 1.25,
                          }}
                          title="Validade do CADRI — verde (ok), amarelo (≤90d) e vermelho (≤30d ou vencido)"
                        >
                          Venc CADRI
                        </th>
                        <th style={{ ...thStyle, width: "5%", whiteSpace: "nowrap" }}>Status</th>
                        <th style={{ ...thStyle, width: "8%", whiteSpace: "nowrap" }}>Ações</th>
                      </>
                    ) : (
                      <>
                        <th style={{ ...thStyle, minWidth: 220 }}>Razão social</th>
                        <th style={{ ...thStyle, minWidth: 150, whiteSpace: "nowrap" }}>CNPJ/CPF</th>
                        <th style={{ ...thStyle, minWidth: 120 }}>Cidade</th>
                        <th style={{ ...thStyle, minWidth: 110 }} title="CADRI da planilha">
                          CADRI
                        </th>
                        <th
                          style={{ ...thStyle, minWidth: 130, whiteSpace: "nowrap" }}
                          title="Validade do CADRI — verde (ok), amarelo (≤90d) e vermelho (≤30d ou vencido)"
                        >
                          Venc CADRI
                        </th>
                        <th style={{ ...thStyle, minWidth: 100, whiteSpace: "nowrap" }} title="Código IBAMA">
                          IBAMA
                        </th>
                        <th style={{ ...thStyle, minWidth: 110 }} title="Descrição do veículo">
                          Veículo
                        </th>
                        <th style={{ ...thStyle, minWidth: 140 }}>Resíduo</th>
                        <th style={{ ...thStyle, minWidth: 130 }}>MTR de coleta</th>
                        <th style={{ ...thStyle, minWidth: 130 }}>Destino</th>
                        <th style={{ ...thStyle, minWidth: 130 }}>MTR de destino</th>
                        <th style={{ ...thStyle, minWidth: 140 }}>Resíduo de destino</th>
                        <th style={{ ...thStyle, minWidth: 80, whiteSpace: "nowrap" }}>Ajudante</th>
                        <th style={{ ...thStyle, minWidth: 110, whiteSpace: "nowrap" }}>Ações</th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {clientesFiltrados.map((cliente) => {
                    const linhaInativa = !clienteEstaAtivo(cliente.status);
                    const expandida = linhasExpandidas.has(cliente.id);
                    const dias = calcularDiasParaVencer(cliente.validade);
                    const venc = classificarVencCadri(dias);
                    const colSpanDetalhe = modoTabela === "compacta" ? 13 : 16;
                    return (
                      <Fragment key={cliente.id}>
                        <tr
                          onClick={(e) => {
                            const el = e.target as HTMLElement | null;
                            if (el?.closest?.("button,a,input,select,textarea,label")) return;
                            setClienteDetalhe(cliente);
                          }}
                          style={{
                            borderBottom: expandida ? "none" : "1px solid #eef2f7",
                            backgroundColor: linhaInativa ? "#fef2f2" : undefined,
                            cursor: "pointer",
                          }}
                          title="Clique para ver todas as informações deste cliente"
                        >
                          <td
                            style={{
                              ...tdStyle,
                              ...tdNowrap,
                              width: modoTabela === "planilha" ? 56 : "4%",
                              minWidth: 56,
                              textAlign: "center",
                              verticalAlign: "middle",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={linhaInativa}
                              disabled={alternandoStatusId === cliente.id}
                              onChange={(e) => void alternarInativoRapido(cliente, e.target.checked)}
                              aria-label={
                                linhaInativa
                                  ? "Desmarcar inativo (voltar a ativo)"
                                  : "Marcar como inativo"
                              }
                              title={linhaInativa ? "Cliente inativo — desmarque para reativar" : "Marcar como inativo"}
                              style={{ width: 18, height: 18, cursor: alternandoStatusId === cliente.id ? "wait" : "pointer" }}
                            />
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              ...tdNowrap,
                              width: modoTabela === "planilha" ? 40 : "3%",
                              textAlign: "center",
                              verticalAlign: "middle",
                              padding: "8px 4px",
                            }}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                alternarLinhaExpandida(cliente.id);
                              }}
                              aria-expanded={expandida}
                              aria-label={expandida ? "Recolher detalhes" : "Expandir detalhes da planilha"}
                              title={expandida ? "Recolher" : "Ver todos os campos da planilha"}
                              style={{
                                background: expandida ? "#0f172a" : "#ffffff",
                                color: expandida ? "#ffffff" : "#475569",
                                border: "1px solid #cbd5e1",
                                borderRadius: "6px",
                                width: 26,
                                height: 26,
                                fontSize: 14,
                                lineHeight: 1,
                                cursor: "pointer",
                                fontWeight: 800,
                              }}
                            >
                              {expandida ? "▾" : "▸"}
                            </button>
                          </td>

                          {modoTabela === "compacta" ? (
                            <>
                              <td
                                style={{ ...tdStyle, cursor: "pointer" }}
                                role="button"
                                tabIndex={0}
                                onClick={() => setClienteDetalhe(cliente)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setClienteDetalhe(cliente);
                                  }
                                }}
                                title="Clique para ver todas as informações deste cliente"
                              >
                                {(() => {
                                  const nomeBruto = (cliente.nome ?? "").trim();
                                  const sep = " — ";
                                  const idx = nomeBruto.indexOf(sep);
                                  const parteNome = idx >= 0 ? nomeBruto.slice(0, idx) : nomeBruto;
                                  const parteSufixo = idx >= 0 ? nomeBruto.slice(idx) : "";
                                  const labelDetalhe =
                                    parteNome || cliente.razao_social?.trim() || "cliente";
                                  return (
                                    <>
                                      <div
                                        style={{
                                          fontWeight: 700,
                                          color: "#0f172a",
                                          lineHeight: 1.4,
                                          wordBreak: "break-word",
                                        }}
                                      >
                                        {parteNome ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => setClienteDetalhe(cliente)}
                                              style={nomeClienteEditarBtnStyle}
                                              title="Ver todas as informações"
                                              aria-label={`Ver informações de ${labelDetalhe}`}
                                            >
                                              {parteNome}
                                            </button>
                                            {parteSufixo ? (
                                              <span style={{ fontWeight: 700, color: "#0f172a" }}>{parteSufixo}</span>
                                            ) : null}
                                          </>
                                        ) : cliente.razao_social?.trim() ? (
                                          <button
                                            type="button"
                                            onClick={() => setClienteDetalhe(cliente)}
                                            style={nomeClienteEditarBtnStyle}
                                            title="Ver todas as informações"
                                            aria-label={`Ver informações de ${cliente.razao_social.trim()}`}
                                          >
                                            {cliente.razao_social.trim()}
                                          </button>
                                        ) : (
                                          <span style={{ color: "#64748b" }}>—</span>
                                        )}
                                      </div>
                                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "3px" }}>
                                        {[cliente.cidade, cliente.estado].filter(Boolean).join(" · ") || "—"}
                                      </div>
                                    </>
                                  );
                                })()}
                              </td>
                              <td style={tdStyle}>{cliente.razao_social || "—"}</td>
                              <td style={{ ...tdStyle, ...tdNowrap }}>
                                <div>{cliente.cnpj || "—"}</div>
                                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                                  {cliente.tipo_unidade_cliente || "-"}
                                </div>
                              </td>
                              <td
                                style={{
                                  ...tdStyle,
                                  wordBreak: "break-all",
                                }}
                                title={cliente.email_nf || undefined}
                              >
                                {cliente.email_nf || "-"}
                              </td>
                              <td style={{ ...tdStyle, ...tdNowrap }} title="Margem de lucro (%)">
                                {margemLucroClienteRotuloLista(cliente.margem_lucro_percentual)}
                              </td>
                              <td style={tdStyle}>{cliente.tipo_residuo || "-"}</td>
                              <td
                                style={tdStyle}
                                title={[
                                  cliente.descricao_veiculo,
                                  cliente.destino,
                                  cliente.mtr_coleta,
                                  cliente.observacoes_operacionais,
                                ]
                                  .filter(Boolean)
                                  .join(" | ")}
                              >
                                {[cliente.descricao_veiculo, cliente.destino, cliente.mtr_coleta]
                                  .filter(Boolean)
                                  .join(" · ") || "-"}
                              </td>
                              <td style={{ ...tdStyle, ...tdNowrap }}>{cliente.classificacao || "-"}</td>
                              <td
                                style={{ ...tdStyle, ...tdNowrap }}
                                title={venc.rotulo || (cliente.validade ? "Validade do CADRI" : "Sem CADRI cadastrado")}
                              >
                                {cliente.validade ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      padding: "3px 8px",
                                      borderRadius: "999px",
                                      background: venc.bg,
                                      color: venc.fg,
                                      border: `1px solid ${venc.borda}`,
                                      fontSize: "12px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {formatarData(cliente.validade)}
                                  </span>
                                ) : (
                                  <span style={{ color: "#94a3b8" }}>-</span>
                                )}
                              </td>
                              <td style={{ ...tdStyle, ...tdNowrap }}>{cliente.status || "Ativo"}</td>
                            </>
                          ) : (
                            <>
                              <td style={tdStyle}>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    color: "#0f172a",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setClienteDetalhe(cliente);
                                    }}
                                    style={nomeClienteEditarBtnStyle}
                                    title="Ver todas as informações"
                                  >
                                    {cliente.razao_social?.trim() || cliente.nome?.trim() || "—"}
                                  </button>
                                </div>
                                {cliente.nome && cliente.razao_social && cliente.nome !== cliente.razao_social ? (
                                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                                    {cliente.nome}
                                  </div>
                                ) : null}
                              </td>
                              <td style={{ ...tdStyle, ...tdNowrap }}>
                                <div>{cliente.cnpj || "—"}</div>
                                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                                  {cliente.tipo_unidade_cliente || "-"}
                                </div>
                              </td>
                              <td style={{ ...tdStyle, ...tdNowrap }}>
                                {[cliente.cidade, cliente.estado].filter(Boolean).join(" · ") || "-"}
                              </td>
                              <td style={tdStyle} title={cliente.licenca_numero || undefined}>
                                {cliente.licenca_numero || "-"}
                              </td>
                              <td
                                style={{ ...tdStyle, ...tdNowrap }}
                                title={venc.rotulo || (cliente.validade ? "Validade do CADRI" : "Sem CADRI cadastrado")}
                              >
                                {cliente.validade ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      padding: "3px 8px",
                                      borderRadius: "999px",
                                      background: venc.bg,
                                      color: venc.fg,
                                      border: `1px solid ${venc.borda}`,
                                      fontSize: "12px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {formatarData(cliente.validade)}
                                  </span>
                                ) : (
                                  <span style={{ color: "#94a3b8" }}>-</span>
                                )}
                              </td>
                              <td style={tdStyle}>{cliente.codigo_ibama || "-"}</td>
                              <td style={tdStyle}>{cliente.descricao_veiculo || "-"}</td>
                              <td style={tdStyle}>{cliente.tipo_residuo || "-"}</td>
                              <td style={tdStyle}>{cliente.mtr_coleta || "-"}</td>
                              <td style={tdStyle}>{cliente.destino || "-"}</td>
                              <td style={tdStyle}>{cliente.mtr_destino || "-"}</td>
                              <td style={tdStyle}>{cliente.residuo_destino || "-"}</td>
                              <td style={{ ...tdStyle, ...tdNowrap }}>{cliente.ajudante || "-"}</td>
                            </>
                          )}

                          <td
                            style={{
                              ...tdStyle,
                              ...tdNowrap,
                              verticalAlign: "middle",
                            }}
                          >
                            <div
                              role="group"
                              aria-label="Ações do cliente"
                              style={{
                                display: "flex",
                                flexDirection: "row",
                                flexWrap: "nowrap",
                                alignItems: "center",
                                gap: "5px",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => void handleEditar(cliente)}
                                style={{
                                  flex: "0 0 auto",
                                  background: "#16a34a",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: "6px",
                                  padding: "5px 9px",
                                  fontWeight: 700,
                                  fontSize: "11px",
                                  lineHeight: 1.2,
                                  cursor: "pointer",
                                  boxShadow: "0 1px 2px rgba(22, 163, 74, 0.25)",
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(cliente.id)}
                                style={{
                                  flex: "0 0 auto",
                                  background: "#ffffff",
                                  color: "#b91c1c",
                                  border: "1px solid #fecaca",
                                  borderRadius: "6px",
                                  padding: "5px 9px",
                                  fontWeight: 700,
                                  fontSize: "11px",
                                  lineHeight: 1.2,
                                  cursor: "pointer",
                                }}
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>

                        {expandida ? (
                          <tr
                            style={{
                              borderBottom: "1px solid #eef2f7",
                              backgroundColor: linhaInativa ? "#fef2f2" : "#f8fafc",
                            }}
                          >
                            <td colSpan={colSpanDetalhe} style={{ padding: "14px 18px" }}>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                  gap: "12px 18px",
                                  fontSize: "13px",
                                  color: "#0f172a",
                                }}
                              >
                                {[
                                  { rotulo: "CADRI", valor: cliente.licenca_numero },
                                  {
                                    rotulo: "Venc CADRI",
                                    valor: cliente.validade ? formatarData(cliente.validade) : null,
                                    tag: venc.rotulo || undefined,
                                    tagBg: venc.bg,
                                    tagFg: venc.fg,
                                    tagBorda: venc.borda,
                                  },
                                  { rotulo: "Código IBAMA", valor: cliente.codigo_ibama },
                                  { rotulo: "Veículo", valor: cliente.descricao_veiculo },
                                  { rotulo: "Resíduo", valor: cliente.tipo_residuo },
                                  { rotulo: "Classe", valor: cliente.classificacao },
                                  { rotulo: "MTR de coleta", valor: cliente.mtr_coleta },
                                  { rotulo: "Destino", valor: cliente.destino },
                                  { rotulo: "MTR de destino", valor: cliente.mtr_destino },
                                  { rotulo: "Resíduo de destino", valor: cliente.residuo_destino },
                                  { rotulo: "Ajudante", valor: cliente.ajudante },
                                  { rotulo: "Solicitante", valor: cliente.solicitante },
                                  { rotulo: "Origem (planilha)", valor: cliente.origem_planilha_cliente },
                                  { rotulo: "E-mail NF", valor: cliente.email_nf },
                                ].map((item) => (
                                  <div key={item.rotulo}>
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        color: "#64748b",
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                        marginBottom: "3px",
                                      }}
                                    >
                                      {item.rotulo}
                                    </div>
                                    <div style={{ wordBreak: "break-word" }}>
                                      {item.valor ? (
                                        item.tag ? (
                                          <span
                                            style={{
                                              display: "inline-flex",
                                              alignItems: "center",
                                              gap: "6px",
                                              padding: "3px 8px",
                                              borderRadius: "999px",
                                              background: item.tagBg,
                                              color: item.tagFg,
                                              border: `1px solid ${item.tagBorda}`,
                                              fontSize: "12px",
                                              fontWeight: 700,
                                            }}
                                            title={item.tag}
                                          >
                                            {item.valor}
                                          </span>
                                        ) : (
                                          item.valor
                                        )
                                      ) : (
                                        <span style={{ color: "#94a3b8" }}>—</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {cliente.observacoes_operacionais ? (
                                <div style={{ marginTop: "12px" }}>
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      color: "#64748b",
                                      fontWeight: 700,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                      marginBottom: "3px",
                                    }}
                                  >
                                    Observações operacionais
                                  </div>
                                  <div
                                    style={{
                                      whiteSpace: "pre-wrap",
                                      wordBreak: "break-word",
                                      color: "#334155",
                                    }}
                                  >
                                    {cliente.observacoes_operacionais}
                                  </div>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}

                  {clientesFiltrados.length === 0 && (
                    <tr>
                      <td
                        colSpan={modoTabela === "compacta" ? 13 : 16}
                        style={{
                          textAlign: "center",
                          padding: "28px 12px",
                          color: "#64748b",
                        }}
                      >
                        {clientes.length === 0
                          ? "Nenhum cliente encontrado."
                          : "Nenhum cliente corresponde ao filtro de CADRI selecionado nesta página."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading && totalCount != null ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginTop: "16px",
                paddingTop: "14px",
                borderTop: "1px solid #e5e7eb",
              }}
            >
              <span style={{ fontSize: "13px", color: "#64748b" }}>
                {totalCount === 0
                  ? "Nenhum registo"
                  : `Mostrando ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} de ${totalCount}`}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                <label style={{ fontSize: "13px", color: "#475569", display: "flex", alignItems: "center", gap: "8px" }}>
                  Por página
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: page <= 1 ? "#f1f5f9" : "#ffffff",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  Anterior
                </button>
                <span style={{ fontSize: "13px", color: "#334155", fontWeight: 600 }}>
                  Página {page} / {totalPaginas}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPaginas}
                  onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: page >= totalPaginas ? "#f1f5f9" : "#ffffff",
                    cursor: page >= totalPaginas ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  Seguinte
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      </div>

      {clienteDetalhe
        ? createPortal(
            <ClienteDetalheModal
              cliente={clienteDetalhe}
              representanteRotulo={rotuloRepresentanteRgCliente(clienteDetalhe)}
              veiculoRotulo={rotuloVeiculoCliente(clienteDetalhe)}
              onClose={() => setClienteDetalhe(null)}
              onEditar={() => {
                const c = clienteDetalhe;
                setClienteDetalhe(null);
                void handleEditar(c);
              }}
            />,
            document.body
          )
        : null}
    </MainLayout>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "40px",
  borderRadius: "10px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  outline: "none",
  padding: "0 12px",
  fontSize: "14px",
  color: "#0f172a",
  boxSizing: "border-box",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 12px",
  color: "#0f172a",
  fontWeight: 800,
  whiteSpace: "normal",
  lineHeight: 1.35,
  verticalAlign: "bottom",
  hyphens: "auto",
};

/** Células de texto longo — quebram dentro da coluna (evita scroll horizontal). */
const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  color: "#1f2937",
  verticalAlign: "middle",
  whiteSpace: "normal",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
  lineHeight: 1.35,
};

const tdNowrap: React.CSSProperties = {
  whiteSpace: "nowrap",
};

/** Botão invisível com aspecto de hiperligação — abre o modal de detalhe completo do cliente. */
const nomeClienteEditarBtnStyle: React.CSSProperties = {
  display: "inline",
  padding: 0,
  margin: 0,
  border: "none",
  background: "transparent",
  font: "inherit",
  fontWeight: 700,
  color: "#15803d",
  cursor: "pointer",
  textAlign: "left",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
  textDecorationThickness: "1px",
  textDecorationColor: "rgba(21, 128, 61, 0.4)",
};

type ClienteDetalheModalProps = {
  cliente: Cliente;
  representanteRotulo: string;
  veiculoRotulo: string;
  onClose: () => void;
  onEditar: () => void;
};

function ClienteDetalheModal({
  cliente,
  representanteRotulo,
  veiculoRotulo,
  onClose,
  onEditar,
}: ClienteDetalheModalProps) {
  const dias = calcularDiasParaVencer(cliente.validade);
  const venc = classificarVencCadri(dias);

  const enderecoColeta = (() => {
    const partes: string[] = [];
    const linha = [cliente.rua?.trim(), cliente.numero?.trim()].filter(Boolean).join(", ");
    if (linha) partes.push(linha);
    if (cliente.complemento?.trim()) partes.push(cliente.complemento.trim());
    if (cliente.bairro?.trim()) partes.push(cliente.bairro.trim());
    const local = [cliente.cidade?.trim(), cliente.estado?.trim()].filter(Boolean).join("/");
    if (local) partes.push(local);
    if (cliente.cep?.trim()) partes.push(`CEP ${cliente.cep.trim()}`);
    const estruturado = partes.join(" · ");
    return estruturado || cliente.endereco_coleta?.trim() || "—";
  })();

  const enderecoFaturamento = (() => {
    const partes: string[] = [];
    const linha = [cliente.rua_faturamento?.trim(), cliente.numero_faturamento?.trim()]
      .filter(Boolean)
      .join(", ");
    if (linha) partes.push(linha);
    if (cliente.complemento_faturamento?.trim()) partes.push(cliente.complemento_faturamento.trim());
    if (cliente.bairro_faturamento?.trim()) partes.push(cliente.bairro_faturamento.trim());
    const local = [cliente.cidade_faturamento?.trim(), cliente.estado_faturamento?.trim()]
      .filter(Boolean)
      .join("/");
    if (local) partes.push(local);
    if (cliente.cep_faturamento?.trim()) partes.push(`CEP ${cliente.cep_faturamento.trim()}`);
    const estruturado = partes.join(" · ");
    return estruturado || cliente.endereco_faturamento?.trim() || "—";
  })();

  const residuos = montarResiduosDoCliente(cliente);
  const margemRotulo = margemLucroClienteRotuloLista(cliente.margem_lucro_percentual);
  const ativo = clienteEstaAtivo(cliente.status);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes do cliente ${cliente.razao_social || cliente.nome || ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "32px 16px",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1080,
          background: "#ffffff",
          borderRadius: 18,
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.35)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 64px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            padding: "20px 24px",
            background: "#0f172a",
            color: "#ffffff",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Cliente
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                lineHeight: 1.25,
                wordBreak: "break-word",
                marginTop: 4,
              }}
            >
              {cliente.razao_social?.trim() || cliente.nome?.trim() || "—"}
            </div>
            {cliente.nome && cliente.razao_social && cliente.nome !== cliente.razao_social ? (
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{cliente.nome}</div>
            ) : null}
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: ativo ? "#16a34a" : "#dc2626",
                  color: "#ffffff",
                }}
              >
                {ativo ? "Ativo" : "Inativo"}
              </span>
              {cliente.tipo_unidade_cliente ? (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.15)",
                    color: "#ffffff",
                  }}
                >
                  {cliente.tipo_unidade_cliente}
                </span>
              ) : null}
              {cliente.cnpj ? (
                <span style={{ fontSize: 13, opacity: 0.9 }}>{cliente.cnpj}</span>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={onEditar}
              style={{
                background: "#16a34a",
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                padding: "10px 16px",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              title="Fechar (Esc)"
              style={{
                background: "transparent",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 10,
                width: 40,
                height: 40,
                fontSize: 18,
                fontWeight: 700,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            padding: "22px 24px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 22,
          }}
        >
          <DetalheSecao titulo="Identificação">
            <DetalheCampo rotulo="Nome fantasia" valor={cliente.nome} />
            <DetalheCampo rotulo="Razão social" valor={cliente.razao_social} />
            <DetalheCampo rotulo="CNPJ/CPF" valor={cliente.cnpj} />
            <DetalheCampo rotulo="Tipo de unidade" valor={cliente.tipo_unidade_cliente} />
            <DetalheCampo rotulo="Raiz CNPJ" valor={cliente.cnpj_raiz} />
            <DetalheCampo rotulo="Status" valor={cliente.status} />
            <DetalheCampo
              rotulo="Ativo desde"
              valor={cliente.status_ativo_desde ? formatarData(cliente.status_ativo_desde) : null}
            />
            <DetalheCampo
              rotulo="Inativo desde"
              valor={cliente.status_inativo_desde ? formatarData(cliente.status_inativo_desde) : null}
            />
            <DetalheCampo rotulo="Origem (planilha)" valor={cliente.origem_planilha_cliente} />
          </DetalheSecao>

          <DetalheSecao titulo="Contato">
            <DetalheCampo rotulo="Responsável" valor={cliente.responsavel_nome} />
            <DetalheCampo rotulo="Telefone" valor={cliente.telefone} />
            <DetalheCampo rotulo="E-mail" valor={cliente.email} />
            <DetalheCampo rotulo="E-mail para NF" valor={cliente.email_nf} />
            <DetalheCampo rotulo="Solicitante" valor={cliente.solicitante} />
          </DetalheSecao>

          <DetalheSecao titulo="Endereços">
            <DetalheCampo rotulo="Endereço de coleta" valor={enderecoColeta} colunas={2} />
            <DetalheCampo rotulo="Endereço de faturamento" valor={enderecoFaturamento} colunas={2} />
          </DetalheSecao>

          <DetalheSecao titulo="Operacional (planilha CLIENTES)">
            <DetalheCampo rotulo="CADRI" valor={cliente.licenca_numero} />
            <div>
              <DetalheRotulo>Venc CADRI</DetalheRotulo>
              {cliente.validade ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: venc.bg,
                    color: venc.fg,
                    border: `1px solid ${venc.borda}`,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                  title={venc.rotulo}
                >
                  {formatarData(cliente.validade)}
                  {venc.rotulo ? <span style={{ fontWeight: 500, opacity: 0.85 }}>· {venc.rotulo}</span> : null}
                </span>
              ) : (
                <DetalheVazio />
              )}
            </div>
            <DetalheCampo rotulo="Código IBAMA" valor={cliente.codigo_ibama} />
            <DetalheCampo rotulo="Descrição do veículo" valor={cliente.descricao_veiculo} />
            <DetalheCampo rotulo="Resíduo (resumo)" valor={cliente.tipo_residuo} />
            <DetalheCampo rotulo="Classe" valor={cliente.classificacao} />
            <DetalheCampo rotulo="MTR de coleta" valor={cliente.mtr_coleta} colunas={2} />
            <DetalheCampo rotulo="Destino" valor={cliente.destino} />
            <DetalheCampo rotulo="MTR de destino" valor={cliente.mtr_destino} />
            <DetalheCampo rotulo="Resíduo de destino" valor={cliente.residuo_destino} />
            <DetalheCampo rotulo="Ajudante" valor={cliente.ajudante} />
            <DetalheCampo
              rotulo="Observações operacionais"
              valor={cliente.observacoes_operacionais}
              colunas={3}
              quebrarLinha
            />
          </DetalheSecao>

          <DetalheSecao titulo="Vínculos & Equipamentos">
            <DetalheCampo rotulo="Representante RG" valor={representanteRotulo} />
            <DetalheCampo rotulo="Veículo preferencial" valor={veiculoRotulo} />
            <DetalheCampo rotulo="Margem de lucro" valor={margemRotulo} />
            <DetalheCampo
              rotulo="Equipamentos desejados"
              valor={cliente.equipamentos}
              colunas={3}
              quebrarLinha
            />
          </DetalheSecao>

          {residuos.length > 0 && residuos.some((r) => r.tipo_residuo || r.classificacao || r.unidade_medida || r.frequencia_coleta) ? (
            <DetalheSecao titulo="Resíduos cadastrados">
              <div style={{ gridColumn: "1 / -1" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, color: "#0f172a" }}>
                        Tipo de resíduo
                      </th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, color: "#0f172a" }}>
                        Classe
                      </th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, color: "#0f172a" }}>
                        Unidade
                      </th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, color: "#0f172a" }}>
                        Frequência
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {residuos.map((r, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 10px", color: "#1f2937" }}>{r.tipo_residuo || "—"}</td>
                        <td style={{ padding: "8px 10px", color: "#1f2937" }}>{r.classificacao || "—"}</td>
                        <td style={{ padding: "8px 10px", color: "#1f2937" }}>{r.unidade_medida || "—"}</td>
                        <td style={{ padding: "8px 10px", color: "#1f2937" }}>{r.frequencia_coleta || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DetalheSecao>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetalheSecao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3
        style={{
          margin: "0 0 12px",
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "#0f172a",
          paddingBottom: 8,
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        {titulo}
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "14px 18px",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function DetalheRotulo({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function DetalheVazio() {
  return <span style={{ color: "#94a3b8" }}>—</span>;
}

function DetalheCampo({
  rotulo,
  valor,
  colunas = 1,
  quebrarLinha = false,
}: {
  rotulo: string;
  valor?: string | number | null;
  colunas?: 1 | 2 | 3;
  quebrarLinha?: boolean;
}) {
  const texto = valor == null ? "" : String(valor).trim();
  return (
    <div style={{ gridColumn: `span ${colunas}` }}>
      <DetalheRotulo>{rotulo}</DetalheRotulo>
      {texto ? (
        <div
          style={{
            color: "#1f2937",
            fontSize: 14,
            wordBreak: "break-word",
            whiteSpace: quebrarLinha ? "pre-wrap" : "normal",
            lineHeight: 1.45,
          }}
        >
          {texto}
        </div>
      ) : (
        <DetalheVazio />
      )}
    </div>
  );
}
