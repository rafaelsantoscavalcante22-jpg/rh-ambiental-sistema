import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  TicketOperacionalPanel,
  type TicketColetaSnapshot,
} from "../components/TicketOperacionalPanel";
import {
  COLETAS_SELECT_SEGUIMENTO,
  queryColetasListaFluxoControle,
} from "../lib/coletasSelectSeguimento";
import { supabase } from "../lib/supabase";
import MainLayout from "../layouts/MainLayout";
import { cargoPodeMutarControleMassa, cargoPodeMutarMtr } from "../lib/workflowPermissions";
import {
  type EtapaFluxo,
  formatarEtapaParaUI,
  normalizarEtapaColeta,
} from "../lib/fluxoEtapas";

/** Busca insensível a maiúsculas e acentos (MTR / cliente / coleta). */
function normalizarTextoBusca(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

type ColetaOpcao = {
  id: string;
  numero: string;
  cliente: string;
  tipo_residuo: string;
  placa: string;
  motorista: string;
  status: string;
  /** Etapa canônica (fluxo_status + etapa_operacional + legado). */
  etapaFluxo: EtapaFluxo;
  peso_tara: number | null;
  peso_bruto: number | null;
  peso_liquido: number | null;
  mtr_id?: string | null;
  programacao_id?: string | null;
  cliente_id?: string | null;
  /** Para ordenar a lista (mais recente primeiro). */
  created_at?: string | null;
};

/** Campos mínimos da tabela `mtrs` para o vínculo na pesagem. */
type MtrResumo = {
  id: string;
  numero: string;
  cliente: string;
  tipo_residuo: string;
  status: string;
};

type FormRegistro = {
  coleta_id: string;
  numero_ticket: string;
  data: string;
  empresa: string;
  residuo: string;
  placa: string;
  motorista: string;
  peso_tara: string;
  peso_bruto: string;
  peso_liquido: string;
  status: string;
};

const formInicial: FormRegistro = {
  coleta_id: "",
  numero_ticket: "",
  data: "",
  empresa: "",
  residuo: "",
  placa: "",
  motorista: "",
  peso_tara: "",
  peso_bruto: "",
  peso_liquido: "",
  status: "Pendente",
};

function limparOuNull(valor: string) {
  const texto = valor.trim();
  return texto === "" ? null : texto;
}

function converterNumero(valor: string) {
  const texto = valor.trim();
  if (texto === "") return null;
  const numero = Number(texto.replace(",", "."));
  return Number.isNaN(numero) ? null : numero;
}

function calcularPesoLiquido(pesoBruto: string, pesoTara: string) {
  const bruto = converterNumero(pesoBruto);
  const tara = converterNumero(pesoTara);
  if (bruto === null || tara === null) return "";
  return String(bruto - tara);
}

function mapRowToColetaOpcao(item: Record<string, unknown>): ColetaOpcao {
  const etapaFluxo = normalizarEtapaColeta({
    fluxo_status: item.fluxo_status == null ? null : String(item.fluxo_status),
    etapa_operacional: item.etapa_operacional == null ? null : String(item.etapa_operacional),
  });
  return {
    id: String(item.id),
    numero: String(item.numero_coleta ?? item.numero ?? item.id ?? ""),
    cliente: String(item.cliente ?? item.nome_cliente ?? ""),
    tipo_residuo: String(item.tipo_residuo ?? item.residuo ?? ""),
    placa: String(item.placa ?? ""),
    motorista: String(item.motorista_nome ?? item.motorista ?? ""),
    status: String(item.status ?? item.status_processo ?? ""),
    etapaFluxo,
    peso_tara:
      item.peso_tara !== null && item.peso_tara !== undefined
        ? Number(item.peso_tara)
        : null,
    peso_bruto:
      item.peso_bruto !== null && item.peso_bruto !== undefined
        ? Number(item.peso_bruto)
        : null,
    peso_liquido:
      item.peso_liquido !== null && item.peso_liquido !== undefined
        ? Number(item.peso_liquido)
        : null,
    mtr_id: item.mtr_id != null ? String(item.mtr_id) : null,
    programacao_id: item.programacao_id != null ? String(item.programacao_id) : null,
    cliente_id: item.cliente_id != null ? String(item.cliente_id) : null,
    created_at: item.created_at != null ? String(item.created_at) : null,
  };
}

function formatarHoraRelogio(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const s = String(raw).trim();
  if (s.includes("T")) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
  }
  if (/^\d{1,2}:\d{2}/.test(s)) return s.length > 8 ? s.slice(0, 8) : s;
  return s;
}

function formatarDataIsoCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = iso.includes("T") ? iso.split("T")[0]! : iso;
  if (t.length >= 10) {
    const [y, m, d] = t.slice(0, 10).split("-");
    if (y && m && d) return `${d}/${m}/${y}`;
  }
  return iso;
}

async function buscarColetasPorIds(ids: string[]): Promise<ColetaOpcao[]> {
  const uniq = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniq.length === 0) return [];

  const chunkSize = 120;
  const out: ColetaOpcao[] = [];

  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("coletas")
      .select(COLETAS_SELECT_SEGUIMENTO)
      .in("id", chunk);

    if (error) {
      console.error("Erro ao buscar coletas por id:", error);
      continue;
    }

    for (const row of (data as Record<string, unknown>[]) || []) {
      out.push(mapRowToColetaOpcao(row));
    }
  }

  return out;
}

async function fetchUltimaPesagemChunk(
  chunk: string[]
): Promise<Record<string, unknown>[] | null> {
  if (chunk.length === 0) return null;
  const lim = Math.min(5000, chunk.length * 40);
  const prim = await supabase
    .from("controle_massa")
    .select("coleta_id, data, hora_entrada, hora_saida, created_at")
    .in("coleta_id", chunk)
    .order("created_at", { ascending: false })
    .limit(lim);
  if (!prim.error && prim.data) return prim.data as Record<string, unknown>[];
  const alt = await supabase
    .from("controle_massa")
    .select("coleta_id, data, hora_entrada, hora_saida, id")
    .in("coleta_id", chunk)
    .order("id", { ascending: false })
    .limit(lim);
  if (!alt.error && alt.data) return alt.data as Record<string, unknown>[];
  return null;
}

/**
 * Última pesagem por coleta — consultas `.in(coleta_id)` em lotes em vez de varrer milhares de linhas.
 */
async function fetchUltimaPesagemPorColetaIds(
  coletaIds: string[]
): Promise<
  Map<string, { data: string | null; hora_entrada: string | null; hora_saida: string | null }>
> {
  const ultima = new Map<
    string,
    { data: string | null; hora_entrada: string | null; hora_saida: string | null }
  >();
  const uniq = [...new Set(coletaIds.map((id) => id.trim()).filter(Boolean))];
  const chunkSize = 100;
  const parallel = 5;
  for (let i = 0; i < uniq.length; i += chunkSize * parallel) {
    const wave: string[][] = [];
    for (let w = 0; w < parallel; w++) {
      const start = i + w * chunkSize;
      const ch = uniq.slice(start, start + chunkSize);
      if (ch.length > 0) wave.push(ch);
    }
    const rowsArrays = await Promise.all(wave.map((ch) => fetchUltimaPesagemChunk(ch)));
    for (const rows of rowsArrays) {
      if (!rows) continue;
      for (const r of rows) {
        const cid = r.coleta_id != null ? String(r.coleta_id) : "";
        if (!cid || ultima.has(cid)) continue;
        ultima.set(cid, {
          data: r.data != null ? String(r.data) : null,
          hora_entrada: r.hora_entrada != null ? String(r.hora_entrada) : null,
          hora_saida: r.hora_saida != null ? String(r.hora_saida) : null,
        });
      }
    }
  }
  return ultima;
}

/**
 * Cria ou atualiza o ticket operacional ligado à coleta após pesagem gravada,
 * para o painel poder imprimir de imediato.
 */
async function garantirTicketAposPesagem(params: {
  coletaId: string;
  numeroTicket: string;
  empresa: string;
  residuo: string;
  pesoLiquido: number | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pliquido =
    params.pesoLiquido !== null && params.pesoLiquido !== undefined
      ? Number(params.pesoLiquido).toLocaleString("pt-BR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        })
      : null;

  const descricao = [
    params.empresa.trim() && `Empresa: ${params.empresa.trim()}`,
    params.residuo.trim() && `Resíduo: ${params.residuo.trim()}`,
    pliquido && `Peso líquido: ${pliquido} kg`,
  ]
    .filter(Boolean)
    .join(" · ");

  const { data: existentes, error: errSel } = await supabase
    .from("tickets_operacionais")
    .select("id")
    .eq("coleta_id", params.coletaId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (errSel) {
    return { ok: false, message: errSel.message };
  }

  const existente = existentes?.[0];

  if (existente?.id) {
    const { error } = await supabase
      .from("tickets_operacionais")
      .update({
        numero: params.numeroTicket.trim() || null,
        descricao: descricao || null,
        tipo_ticket: "saida",
      })
      .eq("id", existente.id);

    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from("tickets_operacionais").insert({
    coleta_id: params.coletaId,
    numero: params.numeroTicket.trim() || null,
    descricao: descricao || "Pesagem — Controle de Massa.",
    tipo_ticket: "saida",
    created_by: user?.id ?? null,
  });

  if (error) {
    const msg = error.message || "";
    const code = (error as { code?: string }).code;
    if (code === "23505" || msg.toLowerCase().includes("duplicate") || msg.includes("unique")) {
      const { data: retryRows, error: errRetry } = await supabase
        .from("tickets_operacionais")
        .select("id")
        .eq("coleta_id", params.coletaId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (errRetry || !retryRows?.[0]?.id) {
        return { ok: false, message: error.message };
      }
      const { error: upErr } = await supabase
        .from("tickets_operacionais")
        .update({
          numero: params.numeroTicket.trim() || null,
          descricao: descricao || null,
          tipo_ticket: "saida",
        })
        .eq("id", retryRows[0].id);
      if (upErr) return { ok: false, message: upErr.message };
      return { ok: true };
    }
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

function coletaOpcaoParaTicketSnapshot(c: ColetaOpcao): TicketColetaSnapshot {
  return {
    id: c.id,
    numero: String(c.numero),
    cliente: c.cliente,
    etapaFluxo: c.etapaFluxo,
    mtr_id: c.mtr_id ?? null,
    programacao_id: c.programacao_id ?? null,
    cliente_id: c.cliente_id ?? null,
    placa: c.placa,
    motorista: c.motorista,
    tipo_residuo: c.tipo_residuo,
    peso_tara: c.peso_tara,
    peso_bruto: c.peso_bruto,
    peso_liquido: c.peso_liquido,
  };
}

function resolverColetaContexto(
  coletas: ColetaOpcao[],
  ids: {
    coleta: string | null;
    mtr: string | null;
    programacao: string | null;
    cliente: string | null;
  }
): ColetaOpcao | null {
  if (ids.coleta) {
    const c = coletas.find((x) => x.id === ids.coleta);
    if (c) return c;
  }
  if (ids.mtr) {
    const c = coletas.find((x) => x.mtr_id && x.mtr_id === ids.mtr);
    if (c) return c;
  }
  if (ids.programacao) {
    const c = coletas.find((x) => x.programacao_id && x.programacao_id === ids.programacao);
    if (c) return c;
  }
  if (ids.cliente) {
    const c = coletas.find((x) => x.cliente_id && x.cliente_id === ids.cliente);
    if (c) return c;
  }
  return null;
}

function formatarNumero(valor?: number | null) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) {
    return "-";
  }

  return Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Cria coleta vinculada à MTR quando ainda não existe (pesagem pode ser a primeira operação no fluxo).
 */
async function criarColetaVinculadaAMtr(
  mtrId: string,
  opts: {
    dataRef: string;
    pesoTara: number;
    pesoBruto: number;
    pesoLiquido: number;
    motorista: string;
    placa: string;
    residuoFallback: string;
  }
): Promise<{ ok: true; coletaId: string } | { ok: false; message: string }> {
  const { data: mtr, error: errMtr } = await supabase
    .from("mtrs")
    .select("id, programacao_id, cliente, cidade, tipo_residuo, endereco")
    .eq("id", mtrId)
    .maybeSingle();

  if (errMtr || !mtr) {
    return { ok: false, message: "MTR não encontrada. Atualize a lista e tente de novo." };
  }

  const m = mtr as Record<string, unknown>;
  let clienteId: string | null = null;
  let clienteNome = String(m.cliente ?? "");
  const progId = m.programacao_id != null ? String(m.programacao_id) : null;
  if (progId) {
    const { data: prog } = await supabase
      .from("programacoes")
      .select("cliente_id, cliente")
      .eq("id", progId)
      .maybeSingle();
    if (prog?.cliente_id) clienteId = String(prog.cliente_id);
    if (prog?.cliente) clienteNome = String(prog.cliente);
  }

  const { data: maxRow } = await supabase
    .from("coletas")
    .select("numero_coleta")
    .order("numero_coleta", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextNum = 90001;
  const rawMax = maxRow as { numero_coleta?: number } | null;
  if (
    rawMax &&
    typeof rawMax.numero_coleta === "number" &&
    !Number.isNaN(rawMax.numero_coleta)
  ) {
    nextNum = rawMax.numero_coleta + 1;
  }

  const dataAg =
    opts.dataRef.trim() || new Date().toISOString().slice(0, 10);
  const tipoRes =
    opts.residuoFallback.trim() ||
    String(m.tipo_residuo ?? "");

  const row: Record<string, unknown> = {
    mtr_id: mtrId,
    programacao_id: progId,
    cliente_id: clienteId,
    cliente: clienteNome,
    cidade: String(m.cidade ?? ""),
    tipo_residuo: tipoRes || "—",
    endereco: String(m.endereco ?? "—"),
    responsavel_interno: "—",
    data_agendada: dataAg,
    data_programada: dataAg,
    numero: String(nextNum),
    numero_coleta: nextNum,
    fluxo_status: "BRUTO_REGISTRADO",
    etapa_operacional: "BRUTO_REGISTRADO",
    status_processo: "EM_CONFERENCIA",
    liberado_financeiro: false,
    motorista: opts.motorista.trim() || null,
    motorista_nome: opts.motorista.trim() || null,
    placa: opts.placa.trim() || null,
    peso_tara: opts.pesoTara,
    peso_bruto: opts.pesoBruto,
    peso_liquido: opts.pesoLiquido,
    assinatura_coletada: true,
    assinatura_no_local: true,
  };

  const { data: ins, error: insErr } = await supabase
    .from("coletas")
    .insert([row])
    .select("id")
    .single();

  if (insErr || !ins?.id) {
    console.error(insErr);
    return {
      ok: false,
      message:
        insErr?.message ??
        "Não foi possível criar a coleta para esta MTR. Verifique permissões e campos obrigatórios no cadastro.",
    };
  }

  const coletaId = String(ins.id);

  if (progId) {
    await supabase.from("programacoes").update({ coleta_id: coletaId }).eq("id", progId);
  }

  return { ok: true, coletaId };
}

export default function ControleMassa() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlColetaId = searchParams.get("coleta");
  const urlMtrId = searchParams.get("mtr");
  const urlProgramacaoId = searchParams.get("programacao");
  const urlClienteId = searchParams.get("cliente");

  const prevContextoUrlKeyRef = useRef<string>("");

  /** Todas as coletas (validação, URL e atualização no save). */
  const [todasColetas, setTodasColetas] = useState<ColetaOpcao[]>([]);
  const [mtrsLista, setMtrsLista] = useState<MtrResumo[]>([]);
  const [loadingVinculo, setLoadingVinculo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [secaoPesagemAberta, setSecaoPesagemAberta] = useState(false);
  const [buscaColetasLista, setBuscaColetasLista] = useState("");
  const [tipoCaminhaoPorProgramacao, setTipoCaminhaoPorProgramacao] = useState<Record<string, string>>(
    {}
  );
  const [ultimaPesagemPorColeta, setUltimaPesagemPorColeta] = useState<
    Map<string, { data: string | null; hora_entrada: string | null; hora_saida: string | null }>
  >(() => new Map());
  const [sucesso, setSucesso] = useState("");
  const [erroTela, setErroTela] = useState("");
  const [form, setForm] = useState<FormRegistro>(formInicial);
  /** MTR escolhida no select quando ainda não existe coleta — mantém o valor visível no `<select>`. */
  const [mtrSemColetaSelecionado, setMtrSemColetaSelecionado] = useState<string | null>(null);
  const [mtrPickerAberto, setMtrPickerAberto] = useState(false);
  const [filtroMtr, setFiltroMtr] = useState("");
  const mtrComboRef = useRef<HTMLDivElement | null>(null);
  const [usuarioCargo, setUsuarioCargo] = useState<string | null>(null);
  const [excluindoColetaId, setExcluindoColetaId] = useState<string | null>(null);

  const podeMutarMassa = cargoPodeMutarControleMassa(usuarioCargo);
  const podeEditarOuExcluirColeta = cargoPodeMutarMtr(usuarioCargo);

  const temParametrosContexto = !!(
    urlColetaId ||
    urlMtrId ||
    urlProgramacaoId ||
    urlClienteId
  );

  const itemContextoResolvido = useMemo(
    () =>
      resolverColetaContexto(todasColetas, {
        coleta: urlColetaId,
        mtr: urlMtrId,
        programacao: urlProgramacaoId,
        cliente: urlClienteId,
      }),
    [todasColetas, urlColetaId, urlMtrId, urlProgramacaoId, urlClienteId]
  );

  const coletaTicketSnapshot = useMemo((): TicketColetaSnapshot | null => {
    const porId = (id: string) => {
      const c = todasColetas.find((x) => x.id === id);
      return c ? coletaOpcaoParaTicketSnapshot(c) : null;
    };
    const formId = form.coleta_id.trim();
    if (formId) {
      const s = porId(formId);
      if (s) return s;
    }
    if (itemContextoResolvido) {
      return coletaOpcaoParaTicketSnapshot(itemContextoResolvido);
    }
    return null;
  }, [form.coleta_id, todasColetas, itemContextoResolvido]);

  const coletasTicketOpcoes = useMemo(
    () => todasColetas.map(coletaOpcaoParaTicketSnapshot),
    [todasColetas]
  );

  function limparContextoUrl() {
    setSearchParams({}, { replace: true });
    prevContextoUrlKeyRef.current = "";
  }

  function montarParamsFluxo(c: ColetaOpcao) {
    const p = new URLSearchParams();
    p.set("coleta", c.id);
    if (c.mtr_id) p.set("mtr", c.mtr_id);
    if (c.programacao_id) p.set("programacao", c.programacao_id);
    if (c.cliente_id) p.set("cliente", c.cliente_id);
    return p;
  }

  function irProgramacao(c: ColetaOpcao) {
    navigate(`/programacao?${montarParamsFluxo(c).toString()}`);
  }
  function irMtr(c: ColetaOpcao) {
    navigate(`/mtr?${montarParamsFluxo(c).toString()}`);
  }

  const fetchMtrsEColetas = useCallback(async (opts?: { silent?: boolean; extraColetaIds?: string[] }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setLoadingVinculo(true);

    try {
      const [mRes, cRes, cmRes] = await Promise.all([
        supabase
          .from("mtrs")
          .select("id, numero, cliente, tipo_residuo, status, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        queryColetasListaFluxoControle(3000),
        supabase
          .from("controle_massa")
          .select("coleta_id")
          .not("coleta_id", "is", null)
          .limit(1200),
      ]);

      if (mRes.error) {
        console.error("Erro ao buscar MTRs:", mRes.error);
        setMtrsLista([]);
      } else {
        const mrows = ((mRes.data as Record<string, unknown>[]) || []).map(
          (item) => ({
            id: String(item.id),
            numero: String(item.numero ?? ""),
            cliente: String(item.cliente ?? ""),
            tipo_residuo: String(item.tipo_residuo ?? ""),
            status: String(item.status ?? "Rascunho"),
          })
        );
        setMtrsLista(mrows);
      }

      let base: ColetaOpcao[] = [];
      if (cRes.error) {
        console.error("Erro ao buscar coletas (lista principal):", cRes.error);
      } else {
        base = ((cRes.data as Record<string, unknown>[]) || []).map((item) =>
          mapRowToColetaOpcao(item)
        );
      }

      if (cmRes.error) {
        console.error("Erro ao listar coleta_id em controle_massa:", cmRes.error);
      }

      const idsMassa = [
        ...new Set(
          ((cmRes.data as { coleta_id?: string | null }[]) || [])
            .map((r) => r.coleta_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      const extrasParam = (opts?.extraColetaIds ?? []).filter(Boolean);
      const baseIds = new Set(base.map((c) => c.id));
      const faltando = [
        ...new Set([...idsMassa, ...extrasParam].filter((id) => id && !baseIds.has(id))),
      ] as string[];

      let merged = base;
      if (faltando.length > 0) {
        const porId = new Map(base.map((c) => [c.id, c]));
        const extraRows = await buscarColetasPorIds(faltando);
        for (const c of extraRows) {
          porId.set(c.id, c);
        }
        merged = Array.from(porId.values());
      }

      const progIds = [...new Set(merged.map((c) => c.programacao_id).filter(Boolean))] as string[];
      const tipoCam: Record<string, string> = {};
      const progChunk = 200;
      for (let pi = 0; pi < progIds.length; pi += progChunk) {
        const slice = progIds.slice(pi, pi + progChunk);
        const { data: prows, error: pErr } = await supabase
          .from("programacoes")
          .select("id, tipo_caminhao")
          .in("id", slice);
        if (!pErr && prows) {
          for (const p of prows as { id: string; tipo_caminhao?: string | null }[]) {
            tipoCam[p.id] = (p.tipo_caminhao ?? "").trim() || "—";
          }
        }
      }

      const ultima = await fetchUltimaPesagemPorColetaIds(merged.map((c) => c.id));

      setTipoCaminhaoPorProgramacao(tipoCam);
      setUltimaPesagemPorColeta(ultima);
      setTodasColetas(merged);
    } finally {
      setLoadingVinculo(false);
    }
  }, []);

  useEffect(() => {
    setLoadingVinculo(true);
    setErroTela("");
    const extraUrl = urlColetaId ? [urlColetaId] : [];
    void fetchMtrsEColetas({ silent: true, extraColetaIds: extraUrl });
  }, [fetchMtrsEColetas, urlColetaId]);

  useEffect(() => {
    if (location.hash !== "#ticket-operacional-anchor") return;
    const t = window.setTimeout(() => {
      document.getElementById("ticket-operacional-anchor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
    return () => window.clearTimeout(t);
  }, [location.hash, loadingVinculo]);

  /** Uma coleta por MTR (lista de coletas já vem por created_at desc — primeira ocorrência ganha). */
  const coletaPorMtrId = useMemo(() => {
    const map = new Map<string, ColetaOpcao>();
    for (const c of todasColetas) {
      if (!c.mtr_id) continue;
      if (!map.has(c.mtr_id)) map.set(c.mtr_id, c);
    }
    return map;
  }, [todasColetas]);

  /** Todas as MTRs não canceladas aparecem na lista (ordenação por coleta disponível). */
  const opcoesMtrParaPesagem = useMemo(() => {
    const resolved = resolverColetaContexto(todasColetas, {
      coleta: urlColetaId,
      mtr: urlMtrId,
      programacao: urlProgramacaoId,
      cliente: urlClienteId,
    });

    const linhas: { mtr: MtrResumo; coleta: ColetaOpcao | null }[] = [];

    for (const m of mtrsLista) {
      if (m.status === "Cancelado") continue;
      const coleta = coletaPorMtrId.get(m.id) ?? null;
      linhas.push({ mtr: m, coleta });
    }

    linhas.sort((a, b) => {
      const prioridade = (c: ColetaOpcao | null) => (c ? 0 : 1);
      return prioridade(a.coleta) - prioridade(b.coleta);
    });

    if (resolved?.mtr_id) {
      const ja = linhas.some((l) => l.mtr.id === resolved.mtr_id);
      if (!ja) {
        const m = mtrsLista.find((x) => x.id === resolved.mtr_id);
        if (m) {
          linhas.unshift({ mtr: m, coleta: resolved });
        }
      }
    }

    return linhas;
  }, [
    mtrsLista,
    coletaPorMtrId,
    todasColetas,
    urlColetaId,
    urlMtrId,
    urlProgramacaoId,
    urlClienteId,
  ]);

  /** Valor do `<select>`: id da MTR ou `coleta:uuid` para coleta sem MTR. */
  const valorSelectVinculo = useMemo(() => {
    if (!form.coleta_id.trim()) return "";
    const c = todasColetas.find((x) => x.id === form.coleta_id.trim());
    if (!c) return "";
    if (c.mtr_id) return c.mtr_id;
    return `coleta:${c.id}`;
  }, [form.coleta_id, todasColetas]);

  const valorSelectMtrExibido = mtrSemColetaSelecionado ?? valorSelectVinculo;

  const filtroMtrNorm = useMemo(
    () => normalizarTextoBusca(filtroMtr),
    [filtroMtr]
  );

  const opcoesMtrFiltradas = useMemo(() => {
    if (!filtroMtrNorm) return opcoesMtrParaPesagem;
    return opcoesMtrParaPesagem.filter(({ mtr, coleta }) => {
      const blob = [
        mtr.numero,
        mtr.cliente,
        mtr.tipo_residuo,
        mtr.status,
        coleta?.numero ?? "",
        coleta?.cliente ?? "",
        coleta ? formatarEtapaParaUI(coleta.etapaFluxo) : "",
        coleta?.placa ?? "",
        coleta?.motorista ?? "",
      ]
        .filter(Boolean)
        .join(" ");
      return normalizarTextoBusca(blob).includes(filtroMtrNorm);
    });
  }, [opcoesMtrParaPesagem, filtroMtrNorm]);

  useEffect(() => {
    async function carregarCargo() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUsuarioCargo(null);
        return;
      }
      const { data } = await supabase
        .from("usuarios")
        .select("cargo")
        .eq("id", user.id)
        .maybeSingle();
      setUsuarioCargo(data?.cargo ?? null);
    }
    void carregarCargo();
  }, []);

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;

    if (name === "peso_tara" || name === "peso_bruto") {
      const proximo = {
        ...form,
        [name]: value,
      };

      setForm({
        ...proximo,
        peso_liquido: calcularPesoLiquido(proximo.peso_bruto, proximo.peso_tara),
      });
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function aplicarColetaNoForm(coletaSelecionada: ColetaOpcao) {
    setMtrSemColetaSelecionado(null);
    setForm((prev) => ({
      ...prev,
      coleta_id: coletaSelecionada.id,
      empresa: coletaSelecionada.cliente || prev.empresa,
      residuo: coletaSelecionada.tipo_residuo || prev.residuo,
      placa: coletaSelecionada.placa || prev.placa,
      motorista: coletaSelecionada.motorista || prev.motorista,
      peso_tara:
        coletaSelecionada.peso_tara !== null ? String(coletaSelecionada.peso_tara) : "",
      peso_bruto:
        coletaSelecionada.peso_bruto !== null ? String(coletaSelecionada.peso_bruto) : "",
      peso_liquido: calcularPesoLiquido(
        coletaSelecionada.peso_bruto !== null ? String(coletaSelecionada.peso_bruto) : "",
        coletaSelecionada.peso_tara !== null ? String(coletaSelecionada.peso_tara) : ""
      ),
    }));
  }

  function aplicarSelecaoVinculo(v: string) {
    if (!v) {
      setMtrSemColetaSelecionado(null);
      setErroTela("");
      setForm((prev) => ({
        ...prev,
        coleta_id: "",
        empresa: "",
        residuo: "",
        placa: "",
        motorista: "",
        peso_tara: "",
        peso_bruto: "",
        peso_liquido: "",
      }));
      return;
    }

    if (v.startsWith("coleta:")) {
      const id = v.slice("coleta:".length);
      const c = todasColetas.find((item) => item.id === id);
      if (c) {
        setErroTela("");
        aplicarColetaNoForm(c);
      }
      return;
    }

    const c = todasColetas.find((item) => item.mtr_id === v);
    if (!c) {
      const m = mtrsLista.find((x) => x.id === v);
      setMtrSemColetaSelecionado(v);
      setForm((prev) => ({
        ...prev,
        coleta_id: "",
        empresa: m?.cliente ?? "",
        residuo: m?.tipo_residuo ? m.tipo_residuo : prev.residuo,
        placa: "",
        motorista: "",
        peso_tara: "",
        peso_bruto: "",
        peso_liquido: "",
      }));
      setErroTela(
        "Esta MTR ainda não tem coleta no sistema. Ao salvar a pesagem, uma coleta será criada e vinculada automaticamente a esta MTR."
      );
      return;
    }

    setErroTela("");
    aplicarColetaNoForm(c);
  }

  function limparFormularioPesagem() {
    setMtrSemColetaSelecionado(null);
    setMtrPickerAberto(false);
    setForm(formInicial);
    setErroTela("");
    setSucesso("");
  }

  function selecionarColetaParaPesagem(c: ColetaOpcao) {
    setMtrSemColetaSelecionado(null);
    setErroTela("");
    aplicarColetaNoForm(c);
    setSecaoPesagemAberta(true);
    window.setTimeout(() => {
      document.getElementById("massa-form-anchor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  async function excluirColetaDaLista(c: ColetaOpcao) {
    if (!podeEditarOuExcluirColeta) {
      setErroTela(
        "Seu perfil não pode excluir coletas. Apenas operacional ou administrador."
      );
      return;
    }
    const ok = window.confirm(
      `Excluir a coleta ${c.numero} (${c.cliente || "sem cliente"})?\n\nEsta ação não pode ser desfeita.`
    );
    if (!ok) return;

    setExcluindoColetaId(c.id);
    setErroTela("");
    setSucesso("");

    try {
      try {
        await supabase.from("programacoes").update({ coleta_id: null }).eq("coleta_id", c.id);
      } catch {
        /* ignore */
      }
      try {
        await supabase.from("controle_massa").update({ coleta_id: null }).eq("coleta_id", c.id);
      } catch {
        /* ignore */
      }

      const { error } = await supabase.from("coletas").delete().eq("id", c.id);
      if (error) {
        console.error(error);
        setErroTela(
          `Não foi possível excluir a coleta: ${error.message}${
            error.details ? ` (${error.details})` : ""
          }`
        );
        return;
      }

      if (form.coleta_id.trim() === c.id) {
        limparFormularioPesagem();
      }
      setSucesso(`Coleta ${c.numero} excluída.`);
      setTimeout(() => setSucesso(""), 4000);
      await fetchMtrsEColetas();
    } finally {
      setExcluindoColetaId(null);
    }
  }

  const opcaoColetaSemMtr = useMemo(() => {
    const id = form.coleta_id.trim();
    if (!id) return null;
    const c = todasColetas.find((x) => x.id === id);
    if (!c || c.mtr_id) return null;
    return c;
  }, [form.coleta_id, todasColetas]);

  const rotuloVinculoMtrExibido = useMemo(() => {
    const val = valorSelectMtrExibido;
    if (!val) return "";
    if (val.startsWith("coleta:")) {
      const id = val.slice("coleta:".length);
      const c =
        opcaoColetaSemMtr?.id === id
          ? opcaoColetaSemMtr
          : todasColetas.find((x) => x.id === id);
      if (c) return `Coleta ${c.numero} (sem MTR)`;
      return "Coleta (sem MTR)";
    }
    const linha = opcoesMtrParaPesagem.find((l) => l.mtr.id === val);
    if (linha) {
      const { mtr, coleta } = linha;
      return !coleta
        ? `${mtr.numero} · ${mtr.cliente} — sem coleta vinculada`
        : `${mtr.numero} · ${mtr.cliente} · coleta ${coleta.numero} (${formatarEtapaParaUI(coleta.etapaFluxo)})`;
    }
    const m = mtrsLista.find((x) => x.id === val);
    if (m) return `${m.numero} · ${m.cliente} — sem coleta vinculada`;
    return val;
  }, [
    valorSelectMtrExibido,
    opcoesMtrParaPesagem,
    opcaoColetaSemMtr,
    todasColetas,
    mtrsLista,
  ]);

  const mostrarOpcaoColetaSemMtr = useMemo(() => {
    if (!opcaoColetaSemMtr) return false;
    if (!filtroMtrNorm) return true;
    const blob = `coleta ${opcaoColetaSemMtr.numero} sem mtr ${opcaoColetaSemMtr.cliente} ${opcaoColetaSemMtr.tipo_residuo}`;
    return normalizarTextoBusca(blob).includes(filtroMtrNorm);
  }, [opcaoColetaSemMtr, filtroMtrNorm]);

  useEffect(() => {
    if (!mtrPickerAberto) return;
    function fecharFora(e: MouseEvent) {
      if (mtrComboRef.current && !mtrComboRef.current.contains(e.target as Node)) {
        setMtrPickerAberto(false);
      }
    }
    document.addEventListener("mousedown", fecharFora);
    return () => document.removeEventListener("mousedown", fecharFora);
  }, [mtrPickerAberto]);

  useEffect(() => {
    if (!mtrPickerAberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMtrPickerAberto(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mtrPickerAberto]);

  useEffect(() => {
    if (loadingVinculo) return;
    if (!temParametrosContexto) {
      prevContextoUrlKeyRef.current = "";
      return;
    }

    const target = resolverColetaContexto(todasColetas, {
      coleta: urlColetaId,
      mtr: urlMtrId,
      programacao: urlProgramacaoId,
      cliente: urlClienteId,
    });

    if (!target) return;

    const urlKey = [urlColetaId, urlMtrId, urlProgramacaoId, urlClienteId].join("|");
    if (prevContextoUrlKeyRef.current === urlKey) return;

    prevContextoUrlKeyRef.current = urlKey;
    queueMicrotask(() => {
      aplicarColetaNoForm(target);
    });

    window.setTimeout(() => {
      document.getElementById("massa-form-anchor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
  }, [
    loadingVinculo,
    todasColetas,
    temParametrosContexto,
    urlColetaId,
    urlMtrId,
    urlProgramacaoId,
    urlClienteId,
  ]);

  async function handleSalvarRegistro(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!podeMutarMassa) {
      setErroTela(
        "Seu perfil não pode lançar pesagem. Apenas balanceiro ou administrador."
      );
      return;
    }

    setErroTela("");
    setSucesso("");

    if (!form.numero_ticket.trim()) {
      setErroTela("Preencha o número do ticket.");
      return;
    }

    if (!form.data.trim()) {
      setErroTela("Preencha a data.");
      return;
    }

    const pesoTaraNumero = converterNumero(form.peso_tara);
    const pesoBrutoNumero = converterNumero(form.peso_bruto);
    const pesoLiquidoNumero = converterNumero(form.peso_liquido);

    if (pesoTaraNumero === null) {
      setErroTela("Preencha o peso tara.");
      return;
    }

    if (pesoBrutoNumero === null) {
      setErroTela("Preencha o peso bruto.");
      return;
    }

    if (pesoLiquidoNumero === null) {
      setErroTela("Não foi possível calcular o peso líquido.");
      return;
    }

    const mtrIdParaEmpresa =
      mtrSemColetaSelecionado ||
      (form.coleta_id.trim()
        ? todasColetas.find((c) => c.id === form.coleta_id.trim())?.mtr_id ?? null
        : null);

    const mtrLinha = mtrIdParaEmpresa
      ? mtrsLista.find((m) => m.id === mtrIdParaEmpresa)
      : undefined;
    const empresaDaMtr = (mtrLinha?.cliente ?? "").trim();

    const empresaFinal = (form.empresa.trim() || empresaDaMtr).trim();
    if (!empresaFinal) {
      setErroTela("Preencha a empresa (ou selecione uma MTR com cliente cadastrado).");
      return;
    }

    let coletaId = form.coleta_id.trim();
    let coletaAcabouDeSerCriada = false;

    if (!coletaId) {
      if (!mtrSemColetaSelecionado) {
        setErroTela(
          "Selecione uma MTR (ou coleta) no passo 1 para lançar a pesagem."
        );
        return;
      }

      setSalvando(true);
      const criada = await criarColetaVinculadaAMtr(mtrSemColetaSelecionado, {
        dataRef: form.data,
        pesoTara: pesoTaraNumero,
        pesoBruto: pesoBrutoNumero,
        pesoLiquido: pesoLiquidoNumero,
        motorista: form.motorista,
        placa: form.placa,
        residuoFallback: form.residuo,
      });

      if (!criada.ok) {
        setErroTela(criada.message);
        setSalvando(false);
        return;
      }

      coletaId = criada.coletaId;
      coletaAcabouDeSerCriada = true;
      setMtrSemColetaSelecionado(null);
      setForm((prev) => ({ ...prev, coleta_id: coletaId }));
    }

    const coletaVinculo = todasColetas.find((c) => c.id === coletaId);

    if (!coletaAcabouDeSerCriada && !coletaVinculo) {
      setErroTela(
        "Coleta não encontrada na lista. Recarregue a página ou navegue de novo e tente outra vez."
      );
      return;
    }

    setSalvando(true);

    const payload = {
      coleta_id: limparOuNull(coletaId),
      numero_ticket: form.numero_ticket.trim(),
      data: form.data,
      empresa: empresaFinal,
      residuo: limparOuNull(form.residuo),
      placa: limparOuNull(form.placa),
      motorista: limparOuNull(form.motorista),
      peso_liquido: pesoLiquidoNumero,
      status: form.status || "Pendente",
    };

    const { error } = await supabase.from("controle_massa").insert([payload]);

    if (error) {
      console.error("Erro ao salvar registro de massa:", error);
      setErroTela(
        `Erro ao salvar registro: ${error.message}${
          error.details ? ` (${error.details})` : ""
        }`
      );
      setSalvando(false);
      return;
    }

    const ticketAuto = await garantirTicketAposPesagem({
      coletaId,
      numeroTicket: form.numero_ticket,
      empresa: empresaFinal,
      residuo: form.residuo,
      pesoLiquido: pesoLiquidoNumero,
    });

    const fluxoPosPesagem = ticketAuto.ok ? "TICKET_GERADO" : "CONTROLE_PESAGEM_LANCADO";

    const { error: errorColeta } = await supabase
      .from("coletas")
      .update({
        peso_tara: pesoTaraNumero,
        peso_bruto: pesoBrutoNumero,
        peso_liquido: pesoLiquidoNumero,
        fluxo_status: fluxoPosPesagem,
        etapa_operacional: fluxoPosPesagem,
        status_processo: "EM_CONFERENCIA",
        liberado_financeiro: false,
      })
      .eq("id", coletaId);

    if (errorColeta) {
      console.error("Erro ao atualizar coleta após controle de massa:", errorColeta);
      setErroTela(
        "Registro de massa gravado, mas a coleta não foi atualizada no fluxo. Um administrador pode ajustar a etapa no fluxo (Controle de Massa / permissões) ou tente salvar novamente."
      );
    } else if (!ticketAuto.ok) {
      setErroTela(
        `Pesagem gravada, mas o ticket automático falhou (${ticketAuto.message}). Ajuste os dados e use «Gravar ticket» abaixo.`
      );
    } else {
      setErroTela("");
    }

    setMtrSemColetaSelecionado(null);
    await fetchMtrsEColetas({ extraColetaIds: [coletaId] });
    setForm({
      ...formInicial,
      coleta_id: coletaId,
    });
    setSalvando(false);

    setTimeout(() => {
      document.getElementById("ticket-operacional-anchor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);

    setSucesso(
      errorColeta
        ? "Pesagem registrada; verifique o aviso em vermelho sobre a etapa da coleta."
        : !ticketAuto.ok
          ? "Pesagem registrada. Verifique o aviso sobre o ticket e complete os dados abaixo se necessário."
          : "Pesagem registrada e ticket gerado. Use «Imprimir ticket» no bloco logo abaixo."
    );
    setTimeout(() => {
      setSucesso("");
    }, 5000);
  }

  const coletasListaOrdenadas = useMemo(() => {
    const arr = [...todasColetas];
    arr.sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      if (tb !== ta) return tb - ta;
      return String(b.numero).localeCompare(String(a.numero), undefined, { numeric: true });
    });
    return arr;
  }, [todasColetas]);

  const coletasListaFiltradas = useMemo(() => {
    const t = normalizarTextoBusca(buscaColetasLista);
    if (!t) return coletasListaOrdenadas;
    return coletasListaOrdenadas.filter((c) => {
      const mtrNo = c.mtr_id ? mtrsLista.find((m) => m.id === c.mtr_id)?.numero ?? "" : "";
      const tc = c.programacao_id ? tipoCaminhaoPorProgramacao[c.programacao_id] ?? "" : "";
      const up = c.id ? ultimaPesagemPorColeta.get(c.id) : undefined;
      const blob = [
        c.numero,
        c.cliente,
        c.tipo_residuo,
        c.placa,
        c.motorista,
        mtrNo,
        tc,
        formatarEtapaParaUI(c.etapaFluxo),
        up?.data ?? "",
      ]
        .join(" ");
      return normalizarTextoBusca(blob).includes(t);
    });
  }, [
    coletasListaOrdenadas,
    buscaColetasLista,
    mtrsLista,
    tipoCaminhaoPorProgramacao,
    ultimaPesagemPorColeta,
  ]);

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

        {erroTela && (
          <div
            style={{
              background: "#fef2f2",
              color: "#991b1b",
              padding: "14px 16px",
              borderRadius: "12px",
              fontWeight: 700,
              border: "1px solid #fecaca",
            }}
          >
            {erroTela}
          </div>
        )}

        {temParametrosContexto && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              padding: "12px 14px",
              borderRadius: "12px",
              fontSize: "13px",
              border: "1px solid",
              ...(itemContextoResolvido
                ? { background: "#f8fafc", borderColor: "#e2e8f0" }
                : { background: "#fffbeb", borderColor: "#fcd34d" }),
            }}
          >
            <div style={{ flex: "1", minWidth: "200px", color: "#475569", lineHeight: 1.45 }}>
              {itemContextoResolvido ? (
                <>
                  <strong style={{ color: "#0f172a" }}>Link na URL:</strong> coleta{" "}
                  {itemContextoResolvido.numero} · {itemContextoResolvido.cliente}
                </>
              ) : (
                <span style={{ color: "#92400e" }}>
                  Não encontrámos coleta para estes parâmetros da URL. Ajuste o mês na Programação ou
                  os filtros e volte a abrir o link.
                </span>
              )}
            </div>
            {itemContextoResolvido ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => irProgramacao(itemContextoResolvido)}
                  style={botaoContextoSecundarioStyle}
                >
                  Ver programação
                </button>
                <button
                  type="button"
                  onClick={() => irMtr(itemContextoResolvido)}
                  style={botaoContextoSecundarioStyle}
                >
                  Ver MTR
                </button>
              </div>
            ) : null}
            <button type="button" onClick={limparContextoUrl} style={botaoLimparUrlStyle}>
              Limpar URL
            </button>
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
              Controle de Massa
            </h1>
            <p className="page-header__lead" style={{ margin: "6px 0 0", maxWidth: "640px" }}>
              Escolha a <strong>MTR</strong>, lance a pesagem e use o bloco abaixo para o <strong>ticket</strong>{' '}
              (saída ou frete). Antes disto: Programação e MTR; depois: aprovação e faturamento no menu.
            </p>
            {usuarioCargo ? (
              <p
                style={{
                  marginTop: "8px",
                  marginBottom: 0,
                  fontSize: "12px",
                  color: "#64748b",
                  fontWeight: 600,
                }}
              >
                Perfil: <span style={{ color: "#0f172a" }}>{usuarioCargo}</span>
                {!podeMutarMassa ? " · somente consulta" : " · pode lançar pesagem"}
              </p>
            ) : null}
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid #e5e7eb" }}>
            <h2
              style={{
                margin: 0,
                fontSize: "17px",
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Todas as coletas
            </h2>
            <p
              style={{
                margin: "6px 0 10px",
                fontSize: "12px",
                color: "#64748b",
                lineHeight: 1.45,
              }}
            >
              Lista completa do sistema ({coletasListaOrdenadas.length} coletas). Datas e horas vêm do
              último registo de pesagem quando existir. Clique numa linha para carregar na pesagem.
            </p>
            <input
              value={buscaColetasLista}
              onChange={(e) => setBuscaColetasLista(e.target.value)}
              placeholder="Filtrar por coleta, cliente, MTR, placa, etapa…"
              style={{
                width: "100%",
                maxWidth: "440px",
                height: "36px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                padding: "0 12px",
                fontSize: "13px",
                outline: "none",
              }}
            />
          </div>
          <div
            style={{
              overflowX: "auto",
              maxHeight: "min(52vh, 520px)",
              overflowY: "auto",
            }}
          >
            {loadingVinculo ? (
              <div
                style={{
                  padding: "28px",
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: "13px",
                }}
              >
                A carregar coletas…
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "11px",
                  color: "#111827",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#f8fafc",
                      borderBottom: "1px solid #e5e7eb",
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    <th style={thListaColetaStyle}>Coleta</th>
                    <th style={thListaColetaStyle}>MTR</th>
                    <th style={thListaColetaStyle}>Data</th>
                    <th style={thListaColetaStyle}>Entrada</th>
                    <th style={thListaColetaStyle}>Saída</th>
                    <th style={thListaColetaStyle}>Placa</th>
                    <th style={thListaColetaStyle}>Tipo cam.</th>
                    <th style={{ ...thListaColetaStyle, minWidth: "140px" }}>Cliente</th>
                    <th style={{ ...thListaColetaStyle, minWidth: "100px" }}>Resíduo</th>
                    <th style={{ ...thListaColetaStyle, textAlign: "right" }}>Bruto</th>
                    <th style={{ ...thListaColetaStyle, textAlign: "right" }}>Tara</th>
                    <th style={{ ...thListaColetaStyle, textAlign: "right" }}>Líq.</th>
                    <th style={thListaColetaStyle}>Etapa</th>
                    <th style={{ ...thListaColetaStyle, whiteSpace: "nowrap" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {coletasListaFiltradas.map((c) => {
                    const mtrNo = c.mtr_id
                      ? mtrsLista.find((m) => m.id === c.mtr_id)?.numero ?? "—"
                      : "—";
                    const up = ultimaPesagemPorColeta.get(c.id);
                    const dataP = up?.data ? formatarDataIsoCurta(up.data) : "—";
                    const tc = c.programacao_id
                      ? tipoCaminhaoPorProgramacao[c.programacao_id] ?? "—"
                      : "—";
                    return (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          cursor: podeMutarMassa ? "pointer" : "default",
                        }}
                        onClick={() => {
                          if (!podeMutarMassa) return;
                          selecionarColetaParaPesagem(c);
                        }}
                        title={
                          podeMutarMassa
                            ? "Clique para carregar esta coleta no lançamento de pesagem"
                            : undefined
                        }
                      >
                        <td style={tdListaColetaStyle}>{c.numero}</td>
                        <td style={tdListaColetaStyle}>{mtrNo}</td>
                        <td style={tdListaColetaStyle}>{dataP}</td>
                        <td style={tdListaColetaStyle}>
                          {formatarHoraRelogio(up?.hora_entrada)}
                        </td>
                        <td style={tdListaColetaStyle}>
                          {formatarHoraRelogio(up?.hora_saida)}
                        </td>
                        <td style={tdListaColetaStyle}>{c.placa || "—"}</td>
                        <td style={tdListaColetaStyle}>{tc}</td>
                        <td
                          style={{
                            ...tdListaColetaStyle,
                            maxWidth: "200px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {c.cliente || "—"}
                        </td>
                        <td
                          style={{
                            ...tdListaColetaStyle,
                            maxWidth: "130px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {c.tipo_residuo || "—"}
                        </td>
                        <td style={{ ...tdListaColetaStyle, textAlign: "right" }}>
                          {formatarNumero(c.peso_bruto)}
                        </td>
                        <td style={{ ...tdListaColetaStyle, textAlign: "right" }}>
                          {formatarNumero(c.peso_tara)}
                        </td>
                        <td style={{ ...tdListaColetaStyle, textAlign: "right" }}>
                          {formatarNumero(c.peso_liquido)}
                        </td>
                        <td style={tdListaColetaStyle}>
                          {formatarEtapaParaUI(c.etapaFluxo)}
                        </td>
                        <td
                          style={{ ...tdListaColetaStyle, whiteSpace: "nowrap" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "4px",
                              alignItems: "center",
                              justifyContent: "flex-start",
                            }}
                          >
                            <button
                              type="button"
                              className="coleta-acao-btn"
                              onClick={() => selecionarColetaParaPesagem(c)}
                              title="Abrir no lançamento de pesagem"
                              style={botaoAcaoColetaListaStyle}
                            >
                              Acessar
                            </button>
                            <button
                              type="button"
                              className="coleta-acao-btn"
                              onClick={() =>
                                navigate(`/mtr?${montarParamsFluxo(c).toString()}`)
                              }
                              disabled={!podeEditarOuExcluirColeta}
                              title={
                                podeEditarOuExcluirColeta
                                  ? "Editar na página MTR"
                                  : "Apenas operacional ou administrador"
                              }
                              style={{
                                ...botaoAcaoColetaListaStyle,
                                ...(!podeEditarOuExcluirColeta ? botaoAcaoColetaListaDisabledStyle : {}),
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="coleta-acao-btn"
                              onClick={() => void excluirColetaDaLista(c)}
                              disabled={
                                !podeEditarOuExcluirColeta || excluindoColetaId === c.id
                              }
                              title={
                                podeEditarOuExcluirColeta
                                  ? "Excluir esta coleta"
                                  : "Apenas operacional ou administrador"
                              }
                              style={{
                                ...botaoAcaoColetaListaStyle,
                                background: "#fef2f2",
                                color: "#b91c1c",
                                borderColor: "#fecaca",
                                ...(!podeEditarOuExcluirColeta || excluindoColetaId === c.id
                                  ? botaoAcaoColetaListaDisabledStyle
                                  : {}),
                              }}
                            >
                              {excluindoColetaId === c.id ? "…" : "Excluir"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {!loadingVinculo && coletasListaFiltradas.length === 0 ? (
              <div
                style={{
                  padding: "22px",
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: "13px",
                }}
              >
                Nenhuma coleta com este filtro.
              </div>
            ) : null}
          </div>
        </div>

        <div
          id="massa-form-anchor"
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <button
            type="button"
            onClick={() => setSecaoPesagemAberta((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "16px 20px",
              border: "none",
              borderBottom: secaoPesagemAberta ? "1px solid #e5e7eb" : "none",
              background: "#ffffff",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Lançar pesagem
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#64748b", lineHeight: 1.45 }}>
                {secaoPesagemAberta
                  ? "Ao salvar, o ticket é gerado automaticamente — imprima na secção logo abaixo."
                  : "Clique para abrir o formulário (MTR, ticket e pesos). Fica fechado para poupar espaço no ecrã."}
              </p>
            </div>
            <span style={{ flexShrink: 0, fontSize: "12px", color: "#64748b" }} aria-hidden>
              {secaoPesagemAberta ? "▲" : "▼"}
            </span>
          </button>

          {secaoPesagemAberta ? (
            <>
            <form
              onSubmit={handleSalvarRegistro}
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
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#0f172a",
                    marginBottom: "10px",
                  }}
                >
                  1. MTR
                </div>

                <div
                  ref={mtrComboRef}
                  style={{ position: "relative", width: "100%", maxWidth: "100%" }}
                >
                  <button
                    type="button"
                    disabled={loadingVinculo}
                    onClick={() => {
                      if (loadingVinculo) return;
                      setMtrPickerAberto((aberto) => {
                        const prox = !aberto;
                        if (prox) setFiltroMtr("");
                        return prox;
                      });
                    }}
                    aria-expanded={mtrPickerAberto}
                    aria-haspopup="listbox"
                    style={{
                      ...inputStyle,
                      maxWidth: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      textAlign: "left",
                      cursor: loadingVinculo ? "not-allowed" : "pointer",
                      opacity: loadingVinculo ? 0.65 : 1,
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {loadingVinculo
                        ? "A carregar…"
                        : rotuloVinculoMtrExibido || "— Escolher MTR —"}
                    </span>
                    <span style={{ flexShrink: 0, color: "#64748b", fontSize: "11px" }} aria-hidden>
                      {mtrPickerAberto ? "▲" : "▼"}
                    </span>
                  </button>

                  {mtrPickerAberto && !loadingVinculo ? (
                    <div
                      role="listbox"
                      style={{
                        position: "absolute",
                        zIndex: 50,
                        left: 0,
                        right: 0,
                        top: "calc(100% + 6px)",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        boxShadow: "0 10px 40px rgba(15, 23, 42, 0.12)",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        maxHeight: "min(380px, 70vh)",
                      }}
                    >
                      <input
                        type="search"
                        autoComplete="off"
                        autoFocus
                        value={filtroMtr}
                        onChange={(e) => setFiltroMtr(e.target.value)}
                        placeholder="Pesquisar por n.º MTR, cliente, coleta, etapa, placa…"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setMtrPickerAberto(false);
                          }
                        }}
                        style={{
                          ...inputStyle,
                          borderRadius: 0,
                          border: "none",
                          borderBottom: "1px solid #e2e8f0",
                          height: "44px",
                        }}
                      />
                      <div
                        style={{
                          overflowY: "auto",
                          flex: 1,
                          minHeight: 0,
                          padding: "6px 0",
                        }}
                      >
                        <button
                          type="button"
                          role="option"
                          onClick={() => {
                            aplicarSelecaoVinculo("");
                            setMtrPickerAberto(false);
                            setFiltroMtr("");
                          }}
                          style={{
                            ...mtrComboOpcaoStyle,
                            color: "#64748b",
                            fontWeight: 600,
                          }}
                        >
                          — Limpar seleção —
                        </button>
                        {mostrarOpcaoColetaSemMtr && opcaoColetaSemMtr ? (
                          <button
                            type="button"
                            role="option"
                            onClick={() => {
                              aplicarSelecaoVinculo(`coleta:${opcaoColetaSemMtr.id}`);
                              setMtrPickerAberto(false);
                              setFiltroMtr("");
                            }}
                            style={{
                              ...mtrComboOpcaoStyle,
                              ...(valorSelectMtrExibido === `coleta:${opcaoColetaSemMtr.id}`
                                ? { background: "#eff6ff" }
                                : {}),
                            }}
                          >
                            Coleta {opcaoColetaSemMtr.numero} (sem MTR)
                          </button>
                        ) : null}
                        {opcoesMtrFiltradas.map(({ mtr, coleta }) => {
                          const semColeta = !coleta;
                          const label = semColeta
                            ? `${mtr.numero} · ${mtr.cliente} — sem coleta vinculada`
                            : `${mtr.numero} · ${mtr.cliente} · coleta ${coleta.numero} (${formatarEtapaParaUI(coleta.etapaFluxo)})`;
                          const sel = valorSelectMtrExibido === mtr.id;
                          return (
                            <button
                              key={mtr.id}
                              type="button"
                              role="option"
                              onClick={() => {
                                aplicarSelecaoVinculo(mtr.id);
                                setMtrPickerAberto(false);
                                setFiltroMtr("");
                              }}
                              style={{
                                ...mtrComboOpcaoStyle,
                                ...(sel ? { background: "#eff6ff" } : {}),
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                        {filtroMtrNorm &&
                        mtrsLista.length > 0 &&
                        opcoesMtrFiltradas.length === 0 &&
                        !(mostrarOpcaoColetaSemMtr && opcaoColetaSemMtr) ? (
                          <div
                            style={{
                              padding: "14px 16px",
                              fontSize: "13px",
                              color: "#64748b",
                              lineHeight: 1.4,
                            }}
                          >
                            Nenhum resultado para «{filtroMtr.trim()}». Tente outro termo.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                {!loadingVinculo && mtrsLista.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "#b45309", margin: "10px 0 0", lineHeight: 1.4 }}>
                    Ainda não há dados. Crie programação e MTR primeiro.
                  </p>
                ) : null}
              </div>

              <div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#0f172a",
                    marginBottom: "10px",
                  }}
                >
                  2. Ticket e pesagem
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: "12px",
                    marginBottom: "12px",
                  }}
                >
                  <input
                    name="numero_ticket"
                    value={form.numero_ticket}
                    onChange={handleInputChange}
                    placeholder="N.º ticket"
                    style={inputStyle}
                  />

                  <input
                    type="date"
                    name="data"
                    value={form.data}
                    onChange={handleInputChange}
                    style={inputStyle}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <input
                    name="empresa"
                    value={form.empresa}
                    onChange={handleInputChange}
                    placeholder="Empresa"
                    style={inputStyle}
                  />

                  <input
                    name="residuo"
                    value={form.residuo}
                    onChange={handleInputChange}
                    placeholder="Resíduo"
                    style={inputStyle}
                  />

                  <input
                    name="placa"
                    value={form.placa}
                    onChange={handleInputChange}
                    placeholder="Placa"
                    style={inputStyle}
                  />

                  <input
                    name="motorista"
                    value={form.motorista}
                    onChange={handleInputChange}
                    placeholder="Motorista"
                    style={inputStyle}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: "12px",
                    marginTop: "12px",
                  }}
                >
                  <input
                    name="peso_tara"
                    value={form.peso_tara}
                    onChange={handleInputChange}
                    placeholder="Peso tara"
                    style={inputStyle}
                  />

                  <input
                    name="peso_bruto"
                    value={form.peso_bruto}
                    onChange={handleInputChange}
                    placeholder="Peso bruto"
                    style={inputStyle}
                  />

                  <input
                    name="peso_liquido"
                    value={form.peso_liquido}
                    readOnly
                    placeholder="Peso líquido calculado"
                    style={{ ...inputStyle, background: "#f8fafc" }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  marginTop: "8px",
                }}
              >
                <button
                  type="submit"
                  disabled={salvando || !podeMutarMassa}
                  title={
                    !podeMutarMassa
                      ? "Apenas balanceiro ou administrador pode salvar."
                      : undefined
                  }
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "10px",
                    height: "42px",
                    padding: "0 18px",
                    fontWeight: 700,
                    cursor:
                      salvando || !podeMutarMassa ? "not-allowed" : "pointer",
                    opacity: salvando || !podeMutarMassa ? 0.55 : 1,
                  }}
                >
                  {salvando ? "Salvando..." : "Salvar registro"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    limparFormularioPesagem();
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
                  Limpar formulário
                </button>
              </div>
            </form>

            <div
              style={{
                marginTop: "8px",
                borderTop: "1px solid #e5e7eb",
                padding: "22px 20px 24px",
                background: "linear-gradient(180deg, #fafbfc 0%, #ffffff 100%)",
              }}
            >
              <TicketOperacionalPanel
                variant="embedded"
                coletaAtiva={coletaTicketSnapshot}
                cargo={usuarioCargo}
                coletasOpcoes={coletasTicketOpcoes}
                carregandoColetas={loadingVinculo}
                ocultarSeletorColeta={Boolean(form.coleta_id.trim())}
                onTrocarColeta={(id) => {
                  void (async () => {
                    if (!id) {
                      setMtrSemColetaSelecionado(null);
                      setForm((prev) => ({ ...prev, coleta_id: "" }));
                      return;
                    }
                    let c = todasColetas.find((x) => x.id === id);
                    if (!c) {
                      const extra = await buscarColetasPorIds([id]);
                      c = extra[0];
                      if (c) {
                        setTodasColetas((prev) =>
                          prev.some((x) => x.id === c!.id) ? prev : [...prev, c!]
                        );
                      }
                    }
                    if (c) aplicarColetaNoForm(c);
                  })();
                }}
                onEtapaColetaAlterada={() => {
                  void fetchMtrsEColetas();
                }}
              />
            </div>
            </>
          ) : null}
        </div>
      </div>
      </div>
    </MainLayout>
  );
}

const botaoContextoSecundarioStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  padding: "8px 12px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "13px",
  color: "#334155",
};

const botaoLimparUrlStyle: CSSProperties = {
  background: "#ffffff",
  color: "#64748b",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "8px 12px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "13px",
};

const inputStyle: CSSProperties = {
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

const mtrComboOpcaoStyle: CSSProperties = {
  width: "100%",
  border: "none",
  background: "#ffffff",
  textAlign: "left",
  padding: "10px 14px",
  fontSize: "14px",
  color: "#0f172a",
  cursor: "pointer",
  display: "block",
  fontWeight: 500,
  lineHeight: 1.35,
};

const thListaColetaStyle: CSSProperties = {
  textAlign: "left",
  padding: "5px 8px",
  fontWeight: 700,
  color: "#0f172a",
  whiteSpace: "nowrap",
  fontSize: "11px",
};

const tdListaColetaStyle: CSSProperties = {
  padding: "4px 8px",
  verticalAlign: "top",
  fontSize: "11px",
  color: "#1f2937",
};

const botaoAcaoColetaListaStyle: CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  padding: "3px 7px",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#1d4ed8",
  cursor: "pointer",
  lineHeight: 1.2,
};

const botaoAcaoColetaListaDisabledStyle: CSSProperties = {
  opacity: 0.45,
  cursor: "not-allowed",
};
