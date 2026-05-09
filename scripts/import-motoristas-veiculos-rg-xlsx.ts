/**
 * Limpa motoristas e caminhões de teste, reaplica dados reais a partir das planilhas RG.
 *
 * Uso:
 *   npx tsx scripts/import-motoristas-veiculos-rg-xlsx.ts "C:\...\MOTORISTAS RG.xlsx" "C:\...\VEICULOS RG (1).xlsx"
 *   npx tsx scripts/import-motoristas-veiculos-rg-xlsx.ts "...motoristas..." "...veiculos..." --dry-run
 *
 * Requer migração `20260509180000_motoristas_cpf_caminhoes_operacao.sql` aplicada.
 * Requer: VITE_SUPABASE_URL (ou SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY no .env
 *
 * Nota: as planilhas analisadas não possuem coluna de vínculo motorista–veículo; `motorista_id` fica nulo
 * até preenchimento manual na tela ou em nova versão da planilha.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import * as XLSX from "xlsx";
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

function normalizarHeaderCelula(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function limparTexto(val: unknown): string {
  return String(val ?? "").replace(/\s+/g, " ").trim();
}

function sheetParaLinhas(path: string, sheetName: string): unknown[][] {
  const wb = XLSX.read(readFileSync(path), { type: "buffer", cellDates: true });
  const sh = wb.Sheets[sheetName];
  if (!sh) throw new Error(`Aba não encontrada: "${sheetName}" em ${path}`);
  return XLSX.utils.sheet_to_json(sh, { header: 1, defval: "" }) as unknown[][];
}

function indiceLinhaCabecalhoPlaca(rows: unknown[][]): number {
  for (let r = 0; r < rows.length; r++) {
    const c0 = normalizarHeaderCelula(rows[r]?.[0]);
    if (c0 === "placa") return r;
  }
  return -1;
}

function indiceLinhaRotuloMotorista(rows: unknown[][]): number {
  for (let r = 0; r < rows.length; r++) {
    const c0 = normalizarHeaderCelula(rows[r]?.[0]);
    if (c0 === "motorista") return r;
  }
  return -1;
}

function extrairNomesMotoristas(rows: unknown[][]): string[] {
  const idx = indiceLinhaRotuloMotorista(rows);
  if (idx < 0) return [];
  const out: string[] = [];
  for (let r = idx + 1; r < rows.length; r++) {
    const nome = limparTexto(rows[r]?.[0]);
    if (nome) out.push(nome);
  }
  return out;
}

type LinhaVeiculoPrincipal = {
  placa: string;
  modeloPlanilha: string;
  pesoTara: string;
  pesoBruto: string;
  cmt: string;
};

function parseVeiculosPrincipal(rows: unknown[][]): LinhaVeiculoPrincipal[] {
  const h = indiceLinhaCabecalhoPlaca(rows);
  if (h < 0) throw new Error("Cabeçalho com coluna PLACA não encontrado na aba principal.");
  const header = (rows[h] as unknown[]).map((c) => normalizarHeaderCelula(c));
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Coluna obrigatória ausente na planilha: ${name}`);
    return i;
  };
  const iPlaca = col("placa");
  const iModelo = col("modelo");
  let iPesoTara = header.findIndex((x) => x.includes("peso") && x.includes("tara"));
  if (iPesoTara < 0) iPesoTara = col("peso tara");
  let iPesoBruto = header.findIndex((x) => x.includes("peso") && x.includes("bruto"));
  if (iPesoBruto < 0) iPesoBruto = col("peso bruto");
  const iCmt = col("cmt");

  const out: LinhaVeiculoPrincipal[] = [];
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const placaRaw = limparTexto(row[iPlaca]);
    if (!placaRaw) continue;
    const placa = placaParaBanco(placaRaw);
    if (!validarPlacaBr(placa)) {
      console.warn(`[ignorar] Placa inválida na linha ${r + 1}: "${placaRaw}"`);
      continue;
    }
    out.push({
      placa,
      modeloPlanilha: limparTexto(row[iModelo]),
      pesoTara: limparTexto(row[iPesoTara]),
      pesoBruto: limparTexto(row[iPesoBruto]),
      cmt: limparTexto(row[iCmt]),
    });
  }
  return out;
}

type ExtraTara = { quantIbcs: string; tipoCaixa: string; pesoTaraKg: string };

function parseAbaTara(rows: unknown[][]): Map<string, ExtraTara[]> {
  const h = indiceLinhaCabecalhoPlaca(rows);
  const map = new Map<string, ExtraTara[]>();
  if (h < 0) return map;

  const header = (rows[h] as unknown[]).map((c) => normalizarHeaderCelula(c));
  const iPlaca = header.indexOf("placa");
  if (iPlaca < 0) return map;

  const iPesoTara = header.findIndex((x) => x.includes("peso") && x.includes("tara"));
  const iQuant = header.findIndex((x) => x.includes("quant") || x.includes("ibc"));
  const iTipoCaixa = header.findIndex((x) => x.includes("tipo") && x.includes("caixa"));

  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const placaRaw = limparTexto(row[iPlaca]);
    if (!placaRaw) continue;
    const placa = placaParaBanco(placaRaw);
    if (!validarPlacaBr(placa)) continue;

    const quantIbcs = iQuant >= 0 ? limparTexto(row[iQuant]) : "";
    const tipoCaixa = iTipoCaixa >= 0 ? limparTexto(row[iTipoCaixa]) : "";
    const pesoTaraKg = iPesoTara >= 0 ? limparTexto(row[iPesoTara]) : "";

    const arr = map.get(placa) ?? [];
    arr.push({ quantIbcs, tipoCaixa, pesoTaraKg });
    map.set(placa, arr);
  }
  return map;
}

function juntarExtras(extras: ExtraTara[]): { quant_ibcs: string | null; tipo_caixa: string | null } {
  const quants = [...new Set(extras.map((e) => e.quantIbcs).filter(Boolean))];
  const tipos = [...new Set(extras.map((e) => e.tipoCaixa).filter(Boolean))];
  return {
    quant_ibcs: quants.length ? quants.join(" · ") : null,
    tipo_caixa: tipos.length ? tipos.join(" · ") : null,
  };
}

carregarEnvArquivo();

const dryRun = process.argv.includes("--dry-run");
const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const pathMotoristas = resolve(args[0] || "");
const pathVeiculos = resolve(args[1] || "");

if (!pathMotoristas || !existsSync(pathMotoristas)) {
  console.error("Informe o caminho do arquivo MOTORISTAS RG.xlsx como primeiro argumento.");
  process.exit(1);
}
if (!pathVeiculos || !existsSync(pathVeiculos)) {
  console.error("Informe o caminho do arquivo VEICULOS RG.xlsx como segundo argumento.");
  process.exit(1);
}

const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";
const serviceKey = normalizarChaveSupabase(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

if (!dryRun && (!url || !serviceKey)) {
  console.error("Defina SUPABASE_SERVICE_ROLE_KEY e SUPABASE_URL (ou VITE_SUPABASE_URL) no .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const wbMot = XLSX.read(readFileSync(pathMotoristas), { type: "buffer" });
  const wbVeic = XLSX.read(readFileSync(pathVeiculos), { type: "buffer" });
  const abaPrincipal = "tara + bruto";
  const abaTara = "TARA";

  if (!wbMot.SheetNames.includes(abaPrincipal)) {
    throw new Error(`Motoristas: aba "${abaPrincipal}" não encontrada.`);
  }
  if (!wbVeic.SheetNames.includes(abaPrincipal)) {
    throw new Error(`Veículos: aba "${abaPrincipal}" não encontrada.`);
  }

  const rowsMotPrin = sheetParaLinhas(pathMotoristas, abaPrincipal);
  const nomes = extrairNomesMotoristas(rowsMotPrin);

  const rowsVeicPrin = sheetParaLinhas(pathVeiculos, abaPrincipal);
  const linhasV = parseVeiculosPrincipal(rowsVeicPrin);

  let extrasPorPlaca = new Map<string, ExtraTara[]>();
  if (wbVeic.SheetNames.includes(abaTara)) {
    extrasPorPlaca = parseAbaTara(sheetParaLinhas(pathVeiculos, abaTara));
  }

  const veiculosPorPlaca = new Map<string, (typeof linhasV)[0]>();
  for (const lv of linhasV) {
    veiculosPorPlaca.set(lv.placa, lv);
  }

  console.log(`Motoristas (nomes): ${nomes.length}`);
  console.log(`Veículos (placas únicas na aba principal): ${veiculosPorPlaca.size}`);

  if (dryRun) {
    console.log("[dry-run] Sem alterações no banco.");
    console.log("Amostra motoristas:", nomes.slice(0, 5));
    console.log("Amostra veículos:", [...veiculosPorPlaca.values()].slice(0, 3));
    return;
  }

  const dummy = "00000000-0000-0000-0000-000000000000";
  const { error: eDelCam } = await supabase.from("caminhoes").delete().neq("id", dummy);
  if (eDelCam) {
    console.error("Falha ao excluir caminhões:", eDelCam);
    process.exit(1);
  }

  const { error: eDelMot } = await supabase.from("motoristas").delete().neq("id", dummy);
  if (eDelMot) {
    console.error("Falha ao excluir motoristas:", eDelMot);
    process.exit(1);
  }

  const insertsMot = nomes.map((nome) => {
    const row: Record<string, unknown> = {
      nome,
      cnh_numero: null,
      cnh_categoria: null,
      cnh_validade: null,
      possui_nopp: false,
      nopp_validade: null,
      cpf: null,
    };
    return row;
  });

  const CHUNK = 80;
  for (let i = 0; i < insertsMot.length; i += CHUNK) {
    const { error } = await supabase.from("motoristas").insert(insertsMot.slice(i, i + CHUNK));
    if (error) {
      console.error("Insert motoristas:", error);
      process.exit(1);
    }
  }

  const insertsCam: Record<string, unknown>[] = [];
  for (const lv of veiculosPorPlaca.values()) {
    const extras = extrasPorPlaca.get(lv.placa) ?? [];
    const { quant_ibcs, tipo_caixa } = juntarExtras(extras);
    insertsCam.push({
      placa: lv.placa,
      modelo: lv.modeloPlanilha || null,
      tipo: null,
      rodizio: null,
      status_disponibilidade: "Disponível",
      peso_tara: lv.pesoTara || null,
      peso_bruto: lv.pesoBruto || null,
      cmt: lv.cmt || null,
      quant_ibcs,
      tipo_caixa,
      renavam: null,
      motorista_id: null,
    });
  }

  for (let i = 0; i < insertsCam.length; i += CHUNK) {
    const { error } = await supabase.from("caminhoes").insert(insertsCam.slice(i, i + CHUNK));
    if (error) {
      console.error("Insert caminhões:", error);
      process.exit(1);
    }
  }

  console.log("Importação concluída com sucesso.");
  console.log(
    "Obs.: não há coluna de vínculo nas planilhas; associe motoristas aos veículos na tela «Veículos» se necessário."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
