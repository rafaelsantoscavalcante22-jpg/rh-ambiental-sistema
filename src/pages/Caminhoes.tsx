import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import MainLayout from "../layouts/MainLayout";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "../lib/coletasQueryLimits";
import { sanitizeIlikePattern } from "../lib/sanitizeIlike";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { limparSessionDraftKey, useCadastroFormDraft } from "../lib/useCadastroFormDraft";
import {
  apenasDigitos,
  formatarPlacaDigitacao,
  formatarRenavamDigitacao,
  placaParaBanco,
  validarPlacaBr,
  validarRenavamBasico,
} from "../lib/brasilCadastro";

type Caminhao = {
  id: string;
  placa: string;
  modelo: string | null;
  tipo: string | null;
  rodizio: string | null;
  status_disponibilidade: string;
  crlv_validade: string | null;
  civ_numero: string | null;
  civ_arquivo_url: string | null;
  cipp_numero: string | null;
  cipp_arquivo_url: string | null;
  foto_url: string | null;
  renavam: string | null;
  peso_tara: string | null;
  peso_bruto: string | null;
  cmt: string | null;
  quant_ibcs: string | null;
  tipo_caixa: string | null;
  motorista_id: string | null;
  created_at: string | null;
};

type FormCaminhao = {
  placa: string;
  modelo: string;
  tipo: string;
  rodizio: string;
  status_disponibilidade: string;
  /** Exibição com máscara dd/mm/aaaa; gravado como date no backend após validação. */
  crlv_validade_br: string;
  civ_numero: string;
  cipp_numero: string;
  renavam: string;
  peso_tara: string;
  peso_bruto: string;
  cmt: string;
  quant_ibcs: string;
  tipo_caixa: string;
  motorista_id: string;
};

const STATUS_DISPONIBILIDADE_OPCOES = [
  "Disponível",
  "Em uso",
  "Manutenção",
  "Indisponível",
] as const;

const formInicial: FormCaminhao = {
  placa: "",
  modelo: "",
  tipo: "",
  rodizio: "",
  status_disponibilidade: "Disponível",
  crlv_validade_br: "",
  civ_numero: "",
  cipp_numero: "",
  renavam: "",
  peso_tara: "",
  peso_bruto: "",
  cmt: "",
  quant_ibcs: "",
  tipo_caixa: "",
  motorista_id: "",
};

function limparOuNull(valor: string) {
  const texto = valor.trim();
  return texto === "" ? null : texto;
}

/** Máscara de data dd/mm/aaaa durante a digitação. */
function mascararDataDDMMAAAA(input: string) {
  const d = apenasDigitos(input).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Converte dd/mm/aaaa válido para yyyy-mm-dd (Postgres date). */
function dataBRparaIsoDate(br: string): string | null {
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(yyyy, mm - 1, dd);
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function isoDateParaBRDisplay(iso?: string | null) {
  if (!iso) return "";
  const part = iso.includes("T") ? iso.split("T")[0] : iso.slice(0, 10);
  const [y, mo, d] = part.split("-");
  if (!y || !mo || !d) return "";
  return `${d}/${mo}/${y}`;
}

function formatarData(data?: string | null) {
  if (!data) return "—";
  const limpa = data.includes("T") ? data.split("T")[0] : data;
  const partes = limpa.split("-");
  if (partes.length !== 3) return data;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

/** Indisponível — feedback visual vermelho na listagem e ficha. */
function statusEhIndisponivel(status: string) {
  return status.trim().toLowerCase() === "indisponível";
}

function CelulaStatusDisponibilidade({ status }: { status: string }) {
  if (statusEhIndisponivel(status)) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
        <span
          title="Veículo indisponível"
          aria-hidden
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: "#dc2626",
            flexShrink: 0,
            boxShadow: "0 0 0 2px #fecaca",
          }}
        />
        <span
          style={{
            fontWeight: 800,
            color: "#b91c1c",
            background: "#fee2e2",
            padding: "4px 10px",
            borderRadius: "8px",
            fontSize: "12px",
            border: "1px solid #fecaca",
          }}
        >
          Indisponível
        </span>
      </span>
    );
  }
  return <span>{status}</span>;
}

function formatarDataHora(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const BUCKET_FOTO_CAMINHAO = "caminhoes-fotos";
const MAX_BYTES_FOTO_CAMINHAO = 8 * 1024 * 1024;

const BUCKET_CERT_CAMINHAO = "caminhoes-certificados";
const MAX_BYTES_CERT_CAMINHAO = 10 * 1024 * 1024;

function pathFromSupabasePublicUrl(url: string, bucketId: string): string | null {
  try {
    const u = new URL(url);
    const needle = `/object/public/${bucketId}/`;
    const idx = u.pathname.indexOf(needle);
    if (idx === -1) return null;
    return decodeURIComponent(u.pathname.slice(idx + needle.length));
  } catch {
    return null;
  }
}

const placaCaminhaoFichaBtnStyle: CSSProperties = {
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

const CAMINHOES_SELECT =
  "id, placa, modelo, tipo, rodizio, status_disponibilidade, crlv_validade, civ_numero, civ_arquivo_url, cipp_numero, cipp_arquivo_url, foto_url, renavam, peso_tara, peso_bruto, cmt, quant_ibcs, tipo_caixa, motorista_id, created_at";

const CAMINHOES_CADASTRO_DRAFT_KEY = "rg-ambiental-caminhoes-cadastro-draft";

type MotoristaOpcao = { id: string; nome: string };

export default function Caminhoes() {
  const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);
  const [motoristasOpcoes, setMotoristasOpcoes] = useState<MotoristaOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const buscaDebounced = useDebouncedValue(busca, 400);
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormCaminhao>(formInicial);
  const [fichaCaminhao, setFichaCaminhao] = useState<Caminhao | null>(null);
  const [enviandoFotoCaminhao, setEnviandoFotoCaminhao] = useState(false);
  const fichaCaminhaoDomBase = useId().replace(/:/g, "");
  const fichaCaminhaoTituloId = `${fichaCaminhaoDomBase}-titulo-ficha`;
  const fichaCaminhaoFotoInputId = `${fichaCaminhaoDomBase}-foto-file`;
  const cadastroFotoInputId = `${fichaCaminhaoDomBase}-cadastro-foto`;
  const cadastroCivInputId = `${fichaCaminhaoDomBase}-cadastro-civ`;
  const cadastroCippInputId = `${fichaCaminhaoDomBase}-cadastro-cipp`;

  /** URL já gravada no Supabase (edição ou após guardar). */
  const [cadastroFotoServidor, setCadastroFotoServidor] = useState<string | null>(null);
  /** Ficheiro escolhido antes de existir `id` (só cadastro novo). */
  const [cadastroFotoPendente, setCadastroFotoPendente] = useState<File | null>(null);
  /** Pré-visualização local (blob) para ficheiro pendente. */
  const [cadastroFotoBlobUrl, setCadastroFotoBlobUrl] = useState<string | null>(null);
  const [cadastroFotoEnviando, setCadastroFotoEnviando] = useState(false);

  const [cadastroCivUrlServidor, setCadastroCivUrlServidor] = useState<string | null>(null);
  const [cadastroCippUrlServidor, setCadastroCippUrlServidor] = useState<string | null>(null);
  const [cadastroCivPendente, setCadastroCivPendente] = useState<File | null>(null);
  const [cadastroCippPendente, setCadastroCippPendente] = useState<File | null>(null);
  const [cadastroCertEnviando, setCadastroCertEnviando] = useState<"civ" | "cipp" | null>(null);

  const motoristaNomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of motoristasOpcoes) m.set(o.id, o.nome);
    return m;
  }, [motoristasOpcoes]);

  const cadastroDraftData = useMemo(() => ({ form, editingId }), [form, editingId]);
  useCadastroFormDraft({
    storageKey: CAMINHOES_CADASTRO_DRAFT_KEY,
    open: mostrarCadastro,
    data: cadastroDraftData,
    onRestore: (d) => {
      setCadastroFotoBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setCadastroFotoServidor(null);
      setCadastroFotoPendente(null);
      setCadastroFotoEnviando(false);
      setCadastroCivUrlServidor(null);
      setCadastroCippUrlServidor(null);
      setCadastroCivPendente(null);
      setCadastroCippPendente(null);
      setCadastroCertEnviando(null);
      setForm(d.form);
      setEditingId(d.editingId);
      setMostrarCadastro(true);
      if (d.editingId) {
        queueMicrotask(() => {
          void supabase
            .from("caminhoes")
            .select("foto_url, civ_arquivo_url, cipp_arquivo_url")
            .eq("id", d.editingId as string)
            .maybeSingle()
            .then(({ data }) => {
              const row = data as {
                foto_url?: string | null;
                civ_arquivo_url?: string | null;
                cipp_arquivo_url?: string | null;
              } | null;
              setCadastroFotoServidor(row?.foto_url ?? null);
              setCadastroCivUrlServidor(row?.civ_arquivo_url ?? null);
              setCadastroCippUrlServidor(row?.cipp_arquivo_url ?? null);
            });
        });
      }
    },
  });

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const { data, error } = await supabase
        .from("motoristas")
        .select("id, nome")
        .order("nome", { ascending: true })
        .limit(3000);
      if (cancel) return;
      if (error) {
        console.error("Erro ao carregar motoristas (veículos):", error);
        setMotoristasOpcoes([]);
        return;
      }
      const rows = ((data as { id: string; nome: string }[]) || [])
        .map((r) => ({ id: r.id, nome: String(r.nome ?? "").trim() }))
        .filter((r) => r.nome.length > 0);
      setMotoristasOpcoes(rows);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const fetchCaminhoes = useCallback(async () => {
    setLoading(true);

    const term = buscaDebounced.trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let countQ = supabase.from("caminhoes").select("id", { count: "exact", head: true });
    let dataQ = supabase
      .from("caminhoes")
      .select(CAMINHOES_SELECT)
      .order("placa", { ascending: true });

    if (term) {
      const s = sanitizeIlikePattern(term);
      const orFilter = `placa.ilike.%${s}%,modelo.ilike.%${s}%,tipo.ilike.%${s}%,rodizio.ilike.%${s}%,status_disponibilidade.ilike.%${s}%,renavam.ilike.%${s}%,peso_tara.ilike.%${s}%,quant_ibcs.ilike.%${s}%,tipo_caixa.ilike.%${s}%`;
      countQ = countQ.or(orFilter);
      dataQ = dataQ.or(orFilter);
    }

    const [{ count, error: errCount }, { data, error }] = await Promise.all([
      countQ,
      dataQ.range(from, to),
    ]);

    if (errCount) {
      console.error("Erro ao contar caminhões:", errCount);
    } else {
      setTotalCount(typeof count === "number" ? count : 0);
    }

    if (error) {
      console.error("Erro ao buscar caminhões:", error);
      setCaminhoes([]);
      setLoading(false);
      return;
    }

    setCaminhoes(
      ((data as Caminhao[]) || []).map((c) => ({
        ...c,
        foto_url: c.foto_url ?? null,
        crlv_validade: c.crlv_validade ?? null,
        civ_numero: c.civ_numero ?? null,
        civ_arquivo_url: c.civ_arquivo_url ?? null,
        cipp_numero: c.cipp_numero ?? null,
        cipp_arquivo_url: c.cipp_arquivo_url ?? null,
        renavam: c.renavam ?? null,
        peso_tara: c.peso_tara ?? null,
        peso_bruto: c.peso_bruto ?? null,
        cmt: c.cmt ?? null,
        quant_ibcs: c.quant_ibcs ?? null,
        tipo_caixa: c.tipo_caixa ?? null,
        motorista_id: c.motorista_id ?? null,
      }))
    );
    setLoading(false);
  }, [page, pageSize, buscaDebounced]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchCaminhoes();
    });
  }, [fetchCaminhoes]);

  useEffect(() => {
    const id = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(id);
  }, [buscaDebounced, pageSize]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    if (name === "placa") {
      setForm((prev) => ({ ...prev, placa: formatarPlacaDigitacao(value) }));
      return;
    }
    if (name === "crlv_validade_br") {
      setForm((prev) => ({ ...prev, crlv_validade_br: mascararDataDDMMAAAA(value) }));
      return;
    }
    if (name === "renavam") {
      setForm((prev) => ({ ...prev, renavam: formatarRenavamDigitacao(value) }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function revogarBlobCadastroFoto() {
    setCadastroFotoBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function limparEstadoFotoCadastro() {
    revogarBlobCadastroFoto();
    setCadastroFotoServidor(null);
    setCadastroFotoPendente(null);
    setCadastroFotoEnviando(false);
  }

  function limparFormulario() {
    limparSessionDraftKey(CAMINHOES_CADASTRO_DRAFT_KEY);
    setForm(formInicial);
    setEditingId(null);
    limparEstadoFotoCadastro();
    setCadastroCivUrlServidor(null);
    setCadastroCippUrlServidor(null);
    setCadastroCivPendente(null);
    setCadastroCippPendente(null);
    setCadastroCertEnviando(null);
  }

  function abrirCadastroNovo() {
    limparFormulario();
    setMostrarCadastro(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditar(c: Caminhao) {
    revogarBlobCadastroFoto();
    setCadastroFotoPendente(null);
    setCadastroFotoServidor(c.foto_url ?? null);
    setCadastroCivUrlServidor(c.civ_arquivo_url ?? null);
    setCadastroCippUrlServidor(c.cipp_arquivo_url ?? null);
    setCadastroCivPendente(null);
    setCadastroCippPendente(null);
    setCadastroCertEnviando(null);
    setForm({
      placa: c.placa || "",
      modelo: c.modelo || "",
      tipo: c.tipo || "",
      rodizio: c.rodizio || "",
      status_disponibilidade: c.status_disponibilidade || "Disponível",
      crlv_validade_br: isoDateParaBRDisplay(c.crlv_validade),
      civ_numero: c.civ_numero || "",
      cipp_numero: c.cipp_numero || "",
      renavam: c.renavam || "",
      peso_tara: c.peso_tara || "",
      peso_bruto: c.peso_bruto || "",
      cmt: c.cmt || "",
      quant_ibcs: c.quant_ibcs || "",
      tipo_caixa: c.tipo_caixa || "",
      motorista_id: c.motorista_id || "",
    });
    setEditingId(c.id);
    setMostrarCadastro(true);
    setSucesso("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function persistirFotoCaminhao(
    caminhaoId: string,
    file: File,
    urlAnterior: string | null
  ): Promise<{ ok: true; publicUrl: string } | { ok: false }> {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const extSeguro =
      ext && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
    const path = `${caminhaoId}/foto.${extSeguro}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET_FOTO_CAMINHAO)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });

    if (upErr) {
      console.error(upErr);
      window.alert(
        "Não foi possível enviar a foto. Aplique a migração do bucket caminhoes-fotos no Supabase ou verifique as políticas de Storage."
      );
      return { ok: false };
    }

    const { data: pub } = supabase.storage.from(BUCKET_FOTO_CAMINHAO).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const { error: dbErr } = await supabase
      .from("caminhoes")
      .update({ foto_url: publicUrl })
      .eq("id", caminhaoId);

    if (dbErr) {
      console.error(dbErr);
      window.alert(
        "A foto foi enviada, mas falhou ao gravar o endereço no cadastro. Verifique se a coluna foto_url existe (migração SQL)."
      );
      return { ok: false };
    }

    if (urlAnterior) {
      const pAnt = pathFromSupabasePublicUrl(urlAnterior, BUCKET_FOTO_CAMINHAO);
      if (pAnt && pAnt !== path) {
        void supabase.storage.from(BUCKET_FOTO_CAMINHAO).remove([pAnt]);
      }
    }

    return { ok: true, publicUrl };
  }

  function extensaoArquivoCertSeguro(file: File): string {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext && ["pdf", "jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      if (ext === "jpeg") return "jpg";
      return ext;
    }
    if (file.type === "application/pdf") return "pdf";
    if (file.type === "image/jpeg") return "jpg";
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    if (file.type === "image/gif") return "gif";
    return "pdf";
  }

  async function persistirCertificadoCaminhao(
    caminhaoId: string,
    coluna: "civ_arquivo_url" | "cipp_arquivo_url",
    prefixoArquivo: "civ" | "cipp",
    file: File,
    urlAnterior: string | null
  ): Promise<{ ok: true; publicUrl: string } | { ok: false }> {
    const extSeguro = extensaoArquivoCertSeguro(file);
    const path = `${caminhaoId}/${prefixoArquivo}.${extSeguro}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET_CERT_CAMINHAO)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });

    if (upErr) {
      console.error(upErr);
      window.alert(
        "Não foi possível enviar o certificado. Aplique a migração do bucket caminhoes-certificados no Supabase ou verifique as políticas de Storage."
      );
      return { ok: false };
    }

    const { data: pub } = supabase.storage.from(BUCKET_CERT_CAMINHAO).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const { error: dbErr } = await supabase
      .from("caminhoes")
      .update({ [coluna]: publicUrl })
      .eq("id", caminhaoId);

    if (dbErr) {
      console.error(dbErr);
      window.alert(
        "O arquivo foi enviado, mas falhou ao gravar o endereço no cadastro. Verifique se as colunas civ_arquivo_url / cipp_arquivo_url existem (migração SQL)."
      );
      return { ok: false };
    }

    if (urlAnterior) {
      const pAnt = pathFromSupabasePublicUrl(urlAnterior, BUCKET_CERT_CAMINHAO);
      if (pAnt && pAnt !== path) {
        void supabase.storage.from(BUCKET_CERT_CAMINHAO).remove([pAnt]);
      }
    }

    return { ok: true, publicUrl };
  }

  function validarArquivoFotoCaminhao(file: File): boolean {
    if (!file.type.startsWith("image/")) {
      window.alert("Escolha uma imagem (JPEG, PNG, WebP ou GIF).");
      return false;
    }
    if (file.size > MAX_BYTES_FOTO_CAMINHAO) {
      window.alert("A imagem deve ter no máximo 8 MB.");
      return false;
    }
    return true;
  }

  function validarArquivoCertificado(file: File): boolean {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const extOk = ext && ["pdf", "jpg", "jpeg", "png", "webp", "gif"].includes(ext);
    const okTipo =
      file.type === "application/pdf" ||
      (file.type.startsWith("image/") && file.type !== "") ||
      Boolean(extOk);
    if (!okTipo) {
      window.alert("Escolha um PDF ou imagem (JPEG, PNG, WebP ou GIF).");
      return false;
    }
    if (file.size > MAX_BYTES_CERT_CAMINHAO) {
      window.alert("O arquivo deve ter no máximo 10 MB.");
      return false;
    }
    return true;
  }

  async function handleCadastroEscolherCertificado(
    tipo: "civ" | "cipp",
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!validarArquivoCertificado(file)) return;

    const coluna = tipo === "civ" ? "civ_arquivo_url" : "cipp_arquivo_url";
    const prefixo = tipo;
    const urlAtual = tipo === "civ" ? cadastroCivUrlServidor : cadastroCippUrlServidor;

    if (editingId) {
      setCadastroCertEnviando(tipo);
      try {
        const res = await persistirCertificadoCaminhao(editingId, coluna, prefixo, file, urlAtual);
        if (res.ok) {
          if (tipo === "civ") setCadastroCivUrlServidor(res.publicUrl);
          else setCadastroCippUrlServidor(res.publicUrl);
          await fetchCaminhoes();
          if (fichaCaminhao?.id === editingId) {
            setFichaCaminhao((prev) => (prev ? { ...prev, [coluna]: res.publicUrl } : prev));
          }
        }
      } finally {
        setCadastroCertEnviando(null);
      }
      return;
    }

    if (tipo === "civ") setCadastroCivPendente(file);
    else setCadastroCippPendente(file);
  }

  async function handleCadastroRemoverCertificado(tipo: "civ" | "cipp") {
    const coluna = tipo === "civ" ? "civ_arquivo_url" : "cipp_arquivo_url";
    const urlSrv = tipo === "civ" ? cadastroCivUrlServidor : cadastroCippUrlServidor;

    if (editingId) {
      if (!urlSrv) return;
      if (!window.confirm("Remover o arquivo deste certificado?")) return;
      setCadastroCertEnviando(tipo);
      try {
        const p = pathFromSupabasePublicUrl(urlSrv, BUCKET_CERT_CAMINHAO);
        if (p) {
          const { error: rmErr } = await supabase.storage.from(BUCKET_CERT_CAMINHAO).remove([p]);
          if (rmErr) console.warn("Storage remove cert:", rmErr);
        }
        const { error } = await supabase.from("caminhoes").update({ [coluna]: null }).eq("id", editingId);
        if (error) {
          window.alert("Não foi possível limpar o registo do arquivo.");
          return;
        }
        if (tipo === "civ") setCadastroCivUrlServidor(null);
        else setCadastroCippUrlServidor(null);
        await fetchCaminhoes();
        if (fichaCaminhao?.id === editingId) {
          setFichaCaminhao((prev) => (prev ? { ...prev, [coluna]: null } : prev));
        }
      } finally {
        setCadastroCertEnviando(null);
      }
      return;
    }

    if (tipo === "civ") setCadastroCivPendente(null);
    else setCadastroCippPendente(null);
  }

  async function handleCadastroEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!validarArquivoFotoCaminhao(file)) return;

    if (editingId) {
      setCadastroFotoEnviando(true);
      try {
        const res = await persistirFotoCaminhao(editingId, file, cadastroFotoServidor);
        if (res.ok) {
          setCadastroFotoServidor(res.publicUrl);
          revogarBlobCadastroFoto();
          setCadastroFotoPendente(null);
          await fetchCaminhoes();
          if (fichaCaminhao?.id === editingId) {
            setFichaCaminhao((prev) => (prev ? { ...prev, foto_url: res.publicUrl } : prev));
          }
        }
      } finally {
        setCadastroFotoEnviando(false);
      }
      return;
    }

    revogarBlobCadastroFoto();
    setCadastroFotoPendente(file);
    setCadastroFotoBlobUrl(URL.createObjectURL(file));
  }

  async function handleCadastroRemoverFoto() {
    if (editingId) {
      if (!cadastroFotoServidor) return;
      if (!window.confirm("Remover a fotografia deste veículo?")) return;
      setCadastroFotoEnviando(true);
      try {
        const p = pathFromSupabasePublicUrl(cadastroFotoServidor, BUCKET_FOTO_CAMINHAO);
        if (p) {
          const { error: rmErr } = await supabase.storage.from(BUCKET_FOTO_CAMINHAO).remove([p]);
          if (rmErr) console.warn("Storage remove:", rmErr);
        }
        const { error } = await supabase
          .from("caminhoes")
          .update({ foto_url: null })
          .eq("id", editingId);
        if (error) {
          window.alert("Não foi possível limpar o registo da foto.");
          return;
        }
        setCadastroFotoServidor(null);
        await fetchCaminhoes();
        if (fichaCaminhao?.id === editingId) {
          setFichaCaminhao((prev) => (prev ? { ...prev, foto_url: null } : prev));
        }
      } finally {
        setCadastroFotoEnviando(false);
      }
      return;
    }

    revogarBlobCadastroFoto();
    setCadastroFotoPendente(null);
  }

  async function handleSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const placa = placaParaBanco(form.placa);
    if (!placa) {
      alert("Preencha a placa do veículo.");
      return;
    }
    if (!validarPlacaBr(placa)) {
      alert("Placa inválida. Use o padrão antigo (ABC1234) ou Mercosul (ABC1D23).");
      return;
    }

    const renavamLimpo = formatarRenavamDigitacao(form.renavam);
    let renavam: string | null = null;
    if (renavamLimpo.length > 0) {
      if (!validarRenavamBasico(renavamLimpo)) {
        alert("RENAVAM inválido. Informe entre 9 e 11 dígitos ou deixe em branco.");
        return;
      }
      renavam = renavamLimpo;
    }

    const digitosCrlv = apenasDigitos(form.crlv_validade_br);
    let crlv_validade: string | null = null;
    if (digitosCrlv.length > 0) {
      if (digitosCrlv.length < 8) {
        alert("Data de validade da CRLV incompleta. Use o formato dd/mm/aaaa ou deixe em branco.");
        return;
      }
      const iso = dataBRparaIsoDate(form.crlv_validade_br.trim());
      if (!iso) {
        alert("Data de validade da CRLV inválida. Verifique dia, mês e ano.");
        return;
      }
      crlv_validade = iso;
    }

    setSalvando(true);

    const payload = {
      placa,
      modelo: limparOuNull(form.modelo),
      tipo: limparOuNull(form.tipo),
      rodizio: limparOuNull(form.rodizio),
      status_disponibilidade: form.status_disponibilidade.trim() || "Disponível",
      crlv_validade,
      civ_numero: limparOuNull(form.civ_numero),
      cipp_numero: limparOuNull(form.cipp_numero),
      renavam,
      peso_tara: limparOuNull(form.peso_tara),
      peso_bruto: limparOuNull(form.peso_bruto),
      cmt: limparOuNull(form.cmt),
      quant_ibcs: limparOuNull(form.quant_ibcs),
      tipo_caixa: limparOuNull(form.tipo_caixa),
      motorista_id: form.motorista_id.trim() || null,
    };

    let error: PostgrestError | null = null;

    let novoId: string | null = null;

    if (editingId) {
      const response = await supabase.from("caminhoes").update(payload).eq("id", editingId);
      error = response.error;
    } else {
      const response = await supabase.from("caminhoes").insert([payload]).select("id").single();
      error = response.error;
      novoId = response.data?.id ?? null;
    }

    if (error) {
      console.error("Erro ao salvar caminhão:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });

      const msgDuplicada =
        error.code === "23505" || /duplicate key|unique constraint/i.test(error.message || "");
      alert(
        msgDuplicada
          ? "Já existe um veículo com esta placa. Use outra placa ou edite o registo existente."
          : `Erro ao salvar veículo.\n\nMensagem: ${error.message}${
              error.details ? `\nDetalhes: ${error.details}` : ""
            }`
      );

      setSalvando(false);
      return;
    }

    if (!editingId && novoId && cadastroFotoPendente) {
      const fotoRes = await persistirFotoCaminhao(novoId, cadastroFotoPendente, null);
      if (!fotoRes.ok) {
        window.alert(
          "O veículo foi guardado, mas a foto não foi enviada. Pode anexá-la ao editar o registo."
        );
      }
    }

    if (!editingId && novoId && cadastroCivPendente) {
      const r = await persistirCertificadoCaminhao(
        novoId,
        "civ_arquivo_url",
        "civ",
        cadastroCivPendente,
        null
      );
      if (!r.ok) {
        window.alert(
          "O veículo foi guardado, mas o arquivo CIV não foi enviado. Pode anexá-lo ao editar o registo."
        );
      }
    }

    if (!editingId && novoId && cadastroCippPendente) {
      const r = await persistirCertificadoCaminhao(
        novoId,
        "cipp_arquivo_url",
        "cipp",
        cadastroCippPendente,
        null
      );
      if (!r.ok) {
        window.alert(
          "O veículo foi guardado, mas o arquivo CIPP não foi enviado. Pode anexá-lo ao editar o registo."
        );
      }
    }

    const mensagem = editingId
      ? "Veículo atualizado com sucesso!"
      : "Veículo cadastrado com sucesso!";

    limparFormulario();
    setSalvando(false);
    setMostrarCadastro(false);
    await fetchCaminhoes();

    setSucesso(mensagem);

    setTimeout(() => {
      setSucesso("");
    }, 3000);
  }

  async function handleDelete(id: string) {
    const confirmar = window.confirm("Deseja realmente excluir este veículo?");
    if (!confirmar) return;

    const { data: rowMidia } = await supabase
      .from("caminhoes")
      .select("foto_url, civ_arquivo_url, cipp_arquivo_url")
      .eq("id", id)
      .maybeSingle();

    const row = rowMidia as {
      foto_url?: string | null;
      civ_arquivo_url?: string | null;
      cipp_arquivo_url?: string | null;
    } | null;

    if (row?.foto_url) {
      const p = pathFromSupabasePublicUrl(row.foto_url, BUCKET_FOTO_CAMINHAO);
      if (p) void supabase.storage.from(BUCKET_FOTO_CAMINHAO).remove([p]);
    }
    if (row?.civ_arquivo_url) {
      const p = pathFromSupabasePublicUrl(row.civ_arquivo_url, BUCKET_CERT_CAMINHAO);
      if (p) void supabase.storage.from(BUCKET_CERT_CAMINHAO).remove([p]);
    }
    if (row?.cipp_arquivo_url) {
      const p = pathFromSupabasePublicUrl(row.cipp_arquivo_url, BUCKET_CERT_CAMINHAO);
      if (p) void supabase.storage.from(BUCKET_CERT_CAMINHAO).remove([p]);
    }

    const { error } = await supabase.from("caminhoes").delete().eq("id", id);

    if (error) {
      console.error("Erro ao remover caminhão:", error);
      alert("Erro ao remover veículo.");
      return;
    }

    if (editingId === id) {
      limparFormulario();
    }
    if (fichaCaminhao?.id === id) {
      setFichaCaminhao(null);
    }

    await fetchCaminhoes();
  }

  const totalPaginas =
    totalCount != null && totalCount > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  const totalExibidoKpi = totalCount != null ? totalCount : caminhoes.length;

  useEffect(() => {
    if (page <= totalPaginas) return;
    const id = window.setTimeout(() => setPage(totalPaginas), 0);
    return () => window.clearTimeout(id);
  }, [page, totalPaginas]);

  useEffect(() => {
    if (!fichaCaminhao) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFichaCaminhao(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fichaCaminhao]);

  const abrirFichaCaminhao = useCallback(async (c: Caminhao) => {
    setFichaCaminhao(c);
    const { data, error } = await supabase
      .from("caminhoes")
      .select(CAMINHOES_SELECT)
      .eq("id", c.id)
      .maybeSingle();
    if (!error && data) {
      setFichaCaminhao(data as Caminhao);
    }
  }, []);

  async function handleEscolherFotoCaminhao(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !fichaCaminhao) return;
    if (!validarArquivoFotoCaminhao(file)) return;

    setEnviandoFotoCaminhao(true);
    try {
      const res = await persistirFotoCaminhao(fichaCaminhao.id, file, fichaCaminhao.foto_url);
      if (res.ok) {
        setFichaCaminhao({ ...fichaCaminhao, foto_url: res.publicUrl });
        await fetchCaminhoes();
      }
    } finally {
      setEnviandoFotoCaminhao(false);
    }
  }

  async function handleRemoverFotoCaminhao() {
    if (!fichaCaminhao?.foto_url) return;
    if (!window.confirm("Remover a fotografia deste veículo?")) return;

    const p = pathFromSupabasePublicUrl(fichaCaminhao.foto_url, BUCKET_FOTO_CAMINHAO);
    if (p) {
      const { error: rmErr } = await supabase.storage.from(BUCKET_FOTO_CAMINHAO).remove([p]);
      if (rmErr) console.warn("Storage remove:", rmErr);
    }

    const { error } = await supabase
      .from("caminhoes")
      .update({ foto_url: null })
      .eq("id", fichaCaminhao.id);

    if (error) {
      window.alert("Não foi possível limpar o registo da foto.");
      return;
    }

    setFichaCaminhao({ ...fichaCaminhao, foto_url: null });
    await fetchCaminhoes();
  }

  async function handleDescarregarFotoCaminhao() {
    if (!fichaCaminhao?.foto_url) return;
    const url = fichaCaminhao.foto_url;
    const baseNome = (fichaCaminhao.placa || "caminhao")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 16) || "caminhao";

    function extPorMime(mime: string) {
      if (mime.includes("png")) return "png";
      if (mime.includes("webp")) return "webp";
      if (mime.includes("gif")) return "gif";
      return "jpg";
    }

    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = extPorMime(blob.type || "image/jpeg");
      const nomeArquivo = `Caminhao_${baseNome}_${fichaCaminhao.id.slice(0, 8)}.${ext}`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = nomeArquivo;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      console.warn("Download via fetch falhou, a abrir URL:", err);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

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
                Veículos
              </h1>
              <p className="page-header__lead" style={{ margin: "6px 0 0" }}>
                Cadastro da frota e disponibilidade. Integração com <strong>Logística</strong> e outras etapas
                será feita nas próximas fases.
              </p>
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div
                style={{
                  minWidth: "225px",
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "16px",
                  padding: "16px 18px",
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#64748b",
                    marginBottom: "6px",
                  }}
                >
                  Total de veículos
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 800,
                    color: "#0f172a",
                  }}
                >
                  {totalExibidoKpi}
                </div>
              </div>

              <button
                type="button"
                onClick={abrirCadastroNovo}
                style={{
                  background: "#16a34a",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "12px",
                  height: "50px",
                  padding: "0 18px",
                  fontWeight: 800,
                  cursor: "pointer",
                  alignSelf: "stretch",
                }}
              >
                Novo veículo
              </button>
            </div>
          </div>

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
                  {editingId ? "Editar veículo" : "Novo veículo"}
                </div>
              </div>

              <form
                onSubmit={handleSalvar}
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
                    Identificação e disponibilidade
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <input
                      name="placa"
                      value={form.placa}
                      onChange={handleInputChange}
                      placeholder="Placa (ex.: ABC1D23)"
                      style={inputStyle}
                      autoComplete="off"
                    />

                    <input
                      name="modelo"
                      value={form.modelo}
                      onChange={handleInputChange}
                      placeholder="Modelo"
                      style={inputStyle}
                    />

                    <input
                      name="tipo"
                      value={form.tipo}
                      onChange={handleInputChange}
                      placeholder="Tipo (ex.: truck, basculante)"
                      style={inputStyle}
                    />

                    <input
                      name="rodizio"
                      value={form.rodizio}
                      onChange={handleInputChange}
                      placeholder="Rodízio (dia ou regra local)"
                      style={inputStyle}
                    />

                    <select
                      name="status_disponibilidade"
                      value={form.status_disponibilidade}
                      onChange={handleInputChange}
                      style={{ ...inputStyle, gridColumn: "1 / -1" }}
                    >
                      {STATUS_DISPONIBILIDADE_OPCOES.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginTop: "18px" }}>
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: 800,
                        color: "#334155",
                        marginBottom: "12px",
                      }}
                    >
                      Operação e vínculo
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <select
                        name="motorista_id"
                        value={form.motorista_id}
                        onChange={handleInputChange}
                        style={{ ...inputStyle, gridColumn: "1 / -1" }}
                      >
                        <option value="">Motorista habitual (opcional)</option>
                        {motoristasOpcoes.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                      </select>
                      <input
                        name="renavam"
                        value={form.renavam}
                        onChange={handleInputChange}
                        placeholder="RENAVAM (9 a 11 dígitos)"
                        style={inputStyle}
                        inputMode="numeric"
                        autoComplete="off"
                      />
                      <input
                        name="peso_tara"
                        value={form.peso_tara}
                        onChange={handleInputChange}
                        placeholder="Peso tara (ex.: 10,91 T)"
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
                        name="cmt"
                        value={form.cmt}
                        onChange={handleInputChange}
                        placeholder="CMT"
                        style={inputStyle}
                      />
                      <input
                        name="quant_ibcs"
                        value={form.quant_ibcs}
                        onChange={handleInputChange}
                        placeholder="Quant. IBCs"
                        style={inputStyle}
                      />
                      <input
                        name="tipo_caixa"
                        value={form.tipo_caixa}
                        onChange={handleInputChange}
                        placeholder="Tipo de caixa (ex.: 30 m³)"
                        style={{ ...inputStyle, gridColumn: "1 / -1" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: "18px" }}>
                    <div
                      style={{
                        fontSize: "15px",
                        fontWeight: 800,
                        color: "#334155",
                        marginBottom: "12px",
                      }}
                    >
                      Documentação e certificações
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#64748b",
                            marginBottom: "6px",
                          }}
                        >
                          Validade da CRLV
                        </label>
                        <input
                          name="crlv_validade_br"
                          value={form.crlv_validade_br}
                          onChange={handleInputChange}
                          placeholder="dd/mm/aaaa"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={10}
                          style={inputStyle}
                        />
                        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#94a3b8" }}>
                          Digite a data de validade do documento CRLV (máscara automática).
                        </p>
                      </div>

                      <div style={{ gridColumn: "1 / -1" }}>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 800,
                            color: "#0f172a",
                            marginBottom: "8px",
                          }}
                        >
                          CIV — Certificado de Inspeção Veicular
                        </div>
                        <input
                          name="civ_numero"
                          value={form.civ_numero}
                          onChange={handleInputChange}
                          placeholder="Número do certificado (opcional)"
                          style={{ ...inputStyle, marginBottom: "10px" }}
                        />
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                          <input
                            id={cadastroCivInputId}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                            onChange={(e) => void handleCadastroEscolherCertificado("civ", e)}
                            disabled={Boolean(cadastroCertEnviando) || salvando}
                            style={{ display: "none" }}
                          />
                          <label
                            htmlFor={cadastroCivInputId}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minHeight: "40px",
                              padding: "0 16px",
                              borderRadius: "10px",
                              background:
                                cadastroCertEnviando === "civ" || salvando ? "#e2e8f0" : "#334155",
                              color: "#ffffff",
                              fontWeight: 700,
                              fontSize: "13px",
                              cursor:
                                cadastroCertEnviando === "civ" || salvando ? "wait" : "pointer",
                            }}
                          >
                            {cadastroCertEnviando === "civ"
                              ? "A enviar…"
                              : cadastroCivUrlServidor || cadastroCivPendente
                                ? "Substituir arquivo CIV"
                                : "Anexar arquivo CIV"}
                          </label>
                          {cadastroCivUrlServidor ? (
                            <a
                              href={cadastroCivUrlServidor}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: "13px", fontWeight: 700, color: "#15803d" }}
                            >
                              Ver arquivo atual
                            </a>
                          ) : null}
                          {cadastroCivPendente && !editingId ? (
                            <span style={{ fontSize: "12px", color: "#64748b" }}>
                              Pendente: {cadastroCivPendente.name}
                            </span>
                          ) : null}
                          {cadastroCivUrlServidor || cadastroCivPendente ? (
                            <button
                              type="button"
                              onClick={() => void handleCadastroRemoverCertificado("civ")}
                              disabled={Boolean(cadastroCertEnviando) || salvando}
                              style={{
                                minHeight: "36px",
                                padding: "0 12px",
                                borderRadius: "8px",
                                border: "1px solid #fecaca",
                                background: "#ffffff",
                                color: "#b91c1c",
                                fontWeight: 700,
                                fontSize: "12px",
                                cursor:
                                  cadastroCertEnviando || salvando ? "not-allowed" : "pointer",
                              }}
                            >
                              Remover arquivo
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ gridColumn: "1 / -1" }}>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 800,
                            color: "#0f172a",
                            marginBottom: "8px",
                          }}
                        >
                          CIPP — Certificado de Inspeção para o Transporte de Produtos Perigosos
                        </div>
                        <input
                          name="cipp_numero"
                          value={form.cipp_numero}
                          onChange={handleInputChange}
                          placeholder="Número do certificado (opcional)"
                          style={{ ...inputStyle, marginBottom: "10px" }}
                        />
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                          <input
                            id={cadastroCippInputId}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                            onChange={(e) => void handleCadastroEscolherCertificado("cipp", e)}
                            disabled={Boolean(cadastroCertEnviando) || salvando}
                            style={{ display: "none" }}
                          />
                          <label
                            htmlFor={cadastroCippInputId}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minHeight: "40px",
                              padding: "0 16px",
                              borderRadius: "10px",
                              background:
                                cadastroCertEnviando === "cipp" || salvando ? "#e2e8f0" : "#334155",
                              color: "#ffffff",
                              fontWeight: 700,
                              fontSize: "13px",
                              cursor:
                                cadastroCertEnviando === "cipp" || salvando ? "wait" : "pointer",
                            }}
                          >
                            {cadastroCertEnviando === "cipp"
                              ? "A enviar…"
                              : cadastroCippUrlServidor || cadastroCippPendente
                                ? "Substituir arquivo CIPP"
                                : "Anexar arquivo CIPP"}
                          </label>
                          {cadastroCippUrlServidor ? (
                            <a
                              href={cadastroCippUrlServidor}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: "13px", fontWeight: 700, color: "#15803d" }}
                            >
                              Ver arquivo atual
                            </a>
                          ) : null}
                          {cadastroCippPendente && !editingId ? (
                            <span style={{ fontSize: "12px", color: "#64748b" }}>
                              Pendente: {cadastroCippPendente.name}
                            </span>
                          ) : null}
                          {cadastroCippUrlServidor || cadastroCippPendente ? (
                            <button
                              type="button"
                              onClick={() => void handleCadastroRemoverCertificado("cipp")}
                              disabled={Boolean(cadastroCertEnviando) || salvando}
                              style={{
                                minHeight: "36px",
                                padding: "0 12px",
                                borderRadius: "8px",
                                border: "1px solid #fecaca",
                                background: "#ffffff",
                                color: "#b91c1c",
                                fontWeight: 700,
                                fontSize: "12px",
                                cursor:
                                  cadastroCertEnviando || salvando ? "not-allowed" : "pointer",
                              }}
                            >
                              Remover arquivo
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    borderTop: "1px solid #f1f5f9",
                    paddingTop: "18px",
                    marginTop: "4px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 800,
                      color: "#0f172a",
                      marginBottom: "8px",
                    }}
                  >
                    Fotografia do veículo
                  </div>
                  <p
                    style={{
                      margin: "0 0 14px",
                      fontSize: "13px",
                      color: "#64748b",
                      lineHeight: 1.5,
                    }}
                  >
                    Anexe uma imagem do veículo (lateral ou 3/4). JPEG, PNG, WebP ou GIF; máximo 8 MB.
                    {editingId
                      ? " A foto é guardada logo que escolhe o ficheiro."
                      : " Ao criar o registo, a foto é enviada automaticamente depois de guardar."}
                  </p>
                  {cadastroFotoBlobUrl || cadastroFotoServidor ? (
                    <a
                      href={cadastroFotoBlobUrl ?? cadastroFotoServidor ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "block", marginBottom: "12px" }}
                    >
                      <img
                        src={cadastroFotoBlobUrl ?? cadastroFotoServidor ?? ""}
                        alt="Pré-visualização do veículo"
                        style={{
                          width: "100%",
                          maxHeight: "240px",
                          objectFit: "contain",
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                          background: "#f8fafc",
                        }}
                      />
                    </a>
                  ) : (
                    <div
                      style={{
                        padding: "24px 16px",
                        textAlign: "center",
                        color: "#94a3b8",
                        fontSize: "13px",
                        borderRadius: "12px",
                        border: "1px dashed #cbd5e1",
                        background: "#f8fafc",
                        marginBottom: "12px",
                      }}
                    >
                      Nenhuma fotografia anexada.
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                    <input
                      id={cadastroFotoInputId}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(e) => void handleCadastroEscolherFoto(e)}
                      disabled={cadastroFotoEnviando || salvando}
                      style={{ display: "none" }}
                    />
                    <label
                      htmlFor={cadastroFotoInputId}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "40px",
                        padding: "0 16px",
                        borderRadius: "10px",
                        background:
                          cadastroFotoEnviando || salvando ? "#e2e8f0" : "#0f172a",
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: "13px",
                        cursor: cadastroFotoEnviando || salvando ? "wait" : "pointer",
                      }}
                    >
                      {cadastroFotoEnviando
                        ? "A enviar…"
                        : cadastroFotoBlobUrl || cadastroFotoServidor
                          ? "Substituir foto"
                          : "Anexar foto"}
                    </label>
                    {cadastroFotoBlobUrl || cadastroFotoServidor ? (
                      <button
                        type="button"
                        onClick={() => void handleCadastroRemoverFoto()}
                        disabled={cadastroFotoEnviando || salvando}
                        style={{
                          minHeight: "40px",
                          padding: "0 14px",
                          borderRadius: "10px",
                          border: "1px solid #fecaca",
                          background: "#ffffff",
                          color: "#b91c1c",
                          fontWeight: 700,
                          fontSize: "13px",
                          cursor: cadastroFotoEnviando || salvando ? "not-allowed" : "pointer",
                        }}
                      >
                        Remover foto
                      </button>
                    ) : null}
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
                    disabled={salvando || cadastroFotoEnviando || cadastroCertEnviando !== null}
                    style={{
                      background: "#16a34a",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "10px",
                      height: "42px",
                      padding: "0 18px",
                      fontWeight: 700,
                      cursor: "pointer",
                      opacity:
                        salvando || cadastroFotoEnviando || cadastroCertEnviando !== null
                          ? 0.8
                          : 1,
                    }}
                  >
                    {salvando
                      ? "Salvando..."
                      : editingId
                      ? "Salvar alterações"
                      : "Adicionar veículo"}
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
                  Lista de veículos
                </h2>
              </div>

              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Busca (placa, modelo, RENAVAM, tara, IBCs…)"
                style={{
                  width: "360px",
                  maxWidth: "100%",
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

            {loading ? (
              <div
                style={{
                  padding: "30px 0",
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: "14px",
                }}
              >
                Carregando veículos...
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
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
                      <th style={thStyle}>Placa</th>
                      <th style={thStyle}>Motorista</th>
                      <th style={thStyle}>Modelo</th>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}>Rodízio</th>
                      <th style={thStyle}>CRLV</th>
                      <th style={thStyle}>Disponibilidade</th>
                      <th style={thStyle}>Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {caminhoes.map((c) => {
                      const indisp = statusEhIndisponivel(c.status_disponibilidade);
                      return (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: "1px solid #eef2f7",
                          ...(indisp
                            ? {
                                background: "#fff1f2",
                                boxShadow: "inset 4px 0 0 #dc2626",
                              }
                            : {}),
                        }}
                      >
                        <td style={{ ...tdStyle, whiteSpace: "normal", wordBreak: "break-word" }}>
                          <button
                            type="button"
                            onClick={() => void abrirFichaCaminhao(c)}
                            style={placaCaminhaoFichaBtnStyle}
                            title="Ver ficha e fotografia do veículo"
                            aria-label={`Abrir ficha do veículo ${c.placa}`}
                          >
                            {c.placa}
                          </button>
                        </td>
                        <td style={{ ...tdStyle, maxWidth: "140px", fontSize: "13px" }}>
                          {c.motorista_id
                            ? motoristaNomePorId.get(c.motorista_id) ?? "—"
                            : "—"}
                        </td>
                        <td style={tdStyle}>{c.modelo || "-"}</td>
                        <td style={tdStyle}>{c.tipo || "-"}</td>
                        <td style={tdStyle}>{c.rodizio || "-"}</td>
                        <td style={tdStyle}>{formatarData(c.crlv_validade)}</td>
                        <td style={{ ...tdStyle, whiteSpace: "normal" }}>
                          <CelulaStatusDisponibilidade status={c.status_disponibilidade} />
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap", verticalAlign: "middle" }}>
                          <div
                            role="group"
                            aria-label="Ações do veículo"
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
                              onClick={() => handleEditar(c)}
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
                              onClick={() => handleDelete(c.id)}
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
                    );
                    })}

                    {caminhoes.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            textAlign: "center",
                            padding: "28px 12px",
                            color: "#64748b",
                          }}
                        >
                          Nenhum veículo encontrado.
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
                <div
                  style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}
                >
                  <label
                    style={{
                      fontSize: "13px",
                      color: "#475569",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
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

      {fichaCaminhao ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            overflowY: "auto",
          }}
          onClick={() => setFichaCaminhao(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={fichaCaminhaoTituloId}
            style={{
              width: "100%",
              maxWidth: "520px",
              maxHeight: "min(92vh, 900px)",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: "16px",
              boxShadow: "0 25px 50px rgba(15, 23, 42, 0.2)",
              border: statusEhIndisponivel(fichaCaminhao.status_disponibilidade)
                ? "2px solid #f87171"
                : "1px solid #e2e8f0",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
                padding: "18px 20px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <h2
                id={fichaCaminhaoTituloId}
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Ficha do veículo
              </h2>
              <button
                type="button"
                onClick={() => setFichaCaminhao(null)}
                aria-label="Fechar ficha"
                style={{
                  flexShrink: 0,
                  width: "36px",
                  height: "36px",
                  border: "none",
                  borderRadius: "10px",
                  background: "#f1f5f9",
                  color: "#475569",
                  fontSize: "20px",
                  lineHeight: 1,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "18px" }}>
              <dl
                style={{
                  margin: 0,
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 38%) 1fr",
                  gap: "10px 14px",
                  fontSize: "14px",
                }}
              >
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Placa</dt>
                <dd style={{ margin: 0, color: "#0f172a", fontWeight: 600 }}>{fichaCaminhao.placa}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Motorista habitual</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>
                  {fichaCaminhao.motorista_id
                    ? motoristaNomePorId.get(fichaCaminhao.motorista_id) ?? "—"
                    : "—"}
                </dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>RENAVAM</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.renavam || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Peso tara</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.peso_tara || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Peso bruto</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.peso_bruto || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>CMT</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.cmt || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Quant. IBCs</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.quant_ibcs || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Tipo de caixa</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.tipo_caixa || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Modelo</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.modelo || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Tipo</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.tipo || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Rodízio</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.rodizio || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Validade CRLV</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{formatarData(fichaCaminhao.crlv_validade)}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>CIV (nº / arquivo)</dt>
                <dd style={{ margin: 0, color: "#1f2937", wordBreak: "break-word" }}>
                  {fichaCaminhao.civ_numero || "—"}
                  {fichaCaminhao.civ_arquivo_url ? (
                    <>
                      {" "}
                      <a
                        href={fichaCaminhao.civ_arquivo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontWeight: 700, color: "#15803d" }}
                      >
                        Ver arquivo
                      </a>
                    </>
                  ) : null}
                </dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>CIPP (nº / arquivo)</dt>
                <dd style={{ margin: 0, color: "#1f2937", wordBreak: "break-word" }}>
                  {fichaCaminhao.cipp_numero || "—"}
                  {fichaCaminhao.cipp_arquivo_url ? (
                    <>
                      {" "}
                      <a
                        href={fichaCaminhao.cipp_arquivo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontWeight: 700, color: "#15803d" }}
                      >
                        Ver arquivo
                      </a>
                    </>
                  ) : null}
                </dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Disponibilidade</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>
                  <CelulaStatusDisponibilidade status={fichaCaminhao.status_disponibilidade} />
                </dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Cadastrado em</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{formatarDataHora(fichaCaminhao.created_at)}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>ID</dt>
                <dd
                  style={{
                    margin: 0,
                    color: "#64748b",
                    fontSize: "12px",
                    wordBreak: "break-all",
                  }}
                >
                  {fichaCaminhao.id}
                </dd>
              </dl>

              <div
                style={{
                  borderTop: "1px solid #e5e7eb",
                  paddingTop: "18px",
                }}
              >
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 800,
                    color: "#0f172a",
                    marginBottom: "10px",
                  }}
                >
                  Fotografia do veículo
                </div>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
                  Envie uma imagem do veículo (lateral ou 3/4, por exemplo). Formatos: JPEG, PNG, WebP ou
                  GIF; máx. 8 MB.
                </p>

                {fichaCaminhao.foto_url ? (
                  <a
                    href={fichaCaminhao.foto_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "block", marginBottom: "12px" }}
                  >
                    <img
                      src={fichaCaminhao.foto_url}
                      alt={`Veículo ${fichaCaminhao.placa}`}
                      style={{
                        width: "100%",
                        maxHeight: "280px",
                        objectFit: "contain",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    />
                  </a>
                ) : (
                  <div
                    style={{
                      padding: "28px 16px",
                      textAlign: "center",
                      color: "#94a3b8",
                      fontSize: "13px",
                      borderRadius: "12px",
                      border: "1px dashed #cbd5e1",
                      background: "#f8fafc",
                      marginBottom: "12px",
                    }}
                  >
                    Nenhuma fotografia cadastrada.
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                  <input
                    id={fichaCaminhaoFotoInputId}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => void handleEscolherFotoCaminhao(e)}
                    disabled={enviandoFotoCaminhao}
                    style={{ display: "none" }}
                  />
                  <label
                    htmlFor={fichaCaminhaoFotoInputId}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: "40px",
                      padding: "0 16px",
                      borderRadius: "10px",
                      background: enviandoFotoCaminhao ? "#e2e8f0" : "#0f172a",
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: enviandoFotoCaminhao ? "wait" : "pointer",
                    }}
                  >
                    {enviandoFotoCaminhao
                      ? "A enviar…"
                      : fichaCaminhao.foto_url
                        ? "Substituir foto"
                        : "Carregar foto"}
                  </label>
                  {fichaCaminhao.foto_url ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleDescarregarFotoCaminhao()}
                        disabled={enviandoFotoCaminhao}
                        title="Guardar a imagem no computador"
                        style={{
                          minHeight: "40px",
                          padding: "0 14px",
                          borderRadius: "10px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#334155",
                          fontWeight: 700,
                          fontSize: "13px",
                          cursor: enviandoFotoCaminhao ? "not-allowed" : "pointer",
                        }}
                      >
                        Descarregar imagem
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoverFotoCaminhao()}
                        disabled={enviandoFotoCaminhao}
                        style={{
                          minHeight: "40px",
                          padding: "0 14px",
                          borderRadius: "10px",
                          border: "1px solid #fecaca",
                          background: "#ffffff",
                          color: "#b91c1c",
                          fontWeight: 700,
                          fontSize: "13px",
                          cursor: enviandoFotoCaminhao ? "not-allowed" : "pointer",
                        }}
                      >
                        Remover foto
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  paddingTop: "4px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setFichaCaminhao(null);
                    handleEditar(fichaCaminhao);
                  }}
                  style={{
                    background: "#16a34a",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "10px",
                    height: "40px",
                    padding: "0 16px",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Editar cadastro
                </button>
                <button
                  type="button"
                  onClick={() => setFichaCaminhao(null)}
                  style={{
                    background: "#e5e7eb",
                    color: "#111827",
                    border: "none",
                    borderRadius: "10px",
                    height: "40px",
                    padding: "0 16px",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </MainLayout>
  );
}

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

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "14px 12px",
  color: "#0f172a",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "12px",
  color: "#1f2937",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};
