import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import MainLayout from "../layouts/MainLayout";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "../lib/coletasQueryLimits";
import { sanitizeIlikePattern } from "../lib/sanitizeIlike";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { limparSessionDraftKey, useCadastroFormDraft } from "../lib/useCadastroFormDraft";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { RgReportPdfIcon } from "../components/ui/RgReportPdfIcon";

type Motorista = {
  id: string;
  nome: string;
  cnh_numero: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  possui_nopp: boolean | null;
  nopp_validade: string | null;
  cnh_foto_url: string | null;
  created_at: string | null;
};

type FormMotorista = {
  nome: string;
  cnh_numero: string;
  cnh_categoria: string;
  cnh_validade: string;
  possui_nopp: boolean;
  nopp_validade: string;
};

const formInicial: FormMotorista = {
  nome: "",
  cnh_numero: "",
  cnh_categoria: "",
  cnh_validade: "",
  possui_nopp: false,
  nopp_validade: "",
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

function simOuNao(val: boolean | null | undefined) {
  return val ? "Sim" : "Não";
}

/** Bucket público definido em `20260428150000_motoristas_cnh_foto.sql`. */
const BUCKET_CNH_MOTORISTA = "motoristas-cnh";
const MAX_BYTES_FOTO_CNH = 8 * 1024 * 1024;

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

const nomeMotoristaFichaBtnStyle: CSSProperties = {
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

const MOTORISTAS_SELECT =
  "id, nome, cnh_numero, cnh_categoria, cnh_validade, possui_nopp, nopp_validade, cnh_foto_url, created_at";

const MOTORISTAS_CADASTRO_DRAFT_KEY = "rg-ambiental-motoristas-cadastro-draft";

export default function Motoristas() {
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const buscaDebounced = useDebouncedValue(busca, 400);
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [sucesso, setSucesso] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormMotorista>(formInicial);
  const [fichaMotorista, setFichaMotorista] = useState<Motorista | null>(null);
  const [enviandoFotoCnh, setEnviandoFotoCnh] = useState(false);
  const fichaDomBase = useId().replace(/:/g, "");
  const fichaTituloFichaId = `${fichaDomBase}-titulo-ficha`;
  const fichaCnhInputId = `${fichaDomBase}-cnh-file`;

  const cadastroDraftData = useMemo(() => ({ form, editingId }), [form, editingId]);
  useCadastroFormDraft({
    storageKey: MOTORISTAS_CADASTRO_DRAFT_KEY,
    open: mostrarCadastro,
    data: cadastroDraftData,
    onRestore: (d) => {
      setForm(d.form);
      setEditingId(d.editingId);
      setMostrarCadastro(true);
    },
  });

  const fetchMotoristas = useCallback(async () => {
    setLoading(true);

    const term = buscaDebounced.trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let countQ = supabase.from("motoristas").select("id", { count: "exact", head: true });
    let dataQ = supabase
      .from("motoristas")
      .select(MOTORISTAS_SELECT)
      .order("nome", { ascending: true });

    if (term) {
      const s = sanitizeIlikePattern(term);
      const orFilter = `nome.ilike.%${s}%,cnh_numero.ilike.%${s}%,cnh_categoria.ilike.%${s}%`;
      countQ = countQ.or(orFilter);
      dataQ = dataQ.or(orFilter);
    }

    const [{ count, error: errCount }, { data, error }] = await Promise.all([
      countQ,
      dataQ.range(from, to),
    ]);

    if (errCount) {
      console.error("Erro ao contar motoristas:", errCount);
    } else {
      setTotalCount(typeof count === "number" ? count : 0);
    }

    if (error) {
      console.error("Erro ao buscar motoristas:", error);
      setMotoristas([]);
      setLoading(false);
      return;
    }

    setMotoristas(
      ((data as Motorista[]) || []).map((r) => ({
        ...r,
        cnh_foto_url: r.cnh_foto_url ?? null,
      }))
    );
    setLoading(false);
  }, [page, pageSize, buscaDebounced]);

  const fetchMotoristasRelatorio = useCallback(async (): Promise<Motorista[]> => {
    const PAGE = 1000;
    const term = buscaDebounced.trim();
    let dataQ = supabase.from("motoristas").select(MOTORISTAS_SELECT).order("nome", { ascending: true });

    if (term) {
      const s = sanitizeIlikePattern(term);
      const orFilter = `nome.ilike.%${s}%,cnh_numero.ilike.%${s}%,cnh_categoria.ilike.%${s}%`;
      dataQ = dataQ.or(orFilter);
    }

    const out: Motorista[] = [];
    for (let from = 0; ; from += PAGE) {
      const to = from + PAGE - 1;
      const { data, error } = await dataQ.range(from, to);
      if (error) throw error;
      const chunk = ((data as Motorista[]) || []).filter(Boolean);
      out.push(
        ...chunk.map((r) => ({
          ...r,
          cnh_foto_url: r.cnh_foto_url ?? null,
        }))
      );
      if (chunk.length < PAGE) break;
    }
    return out;
  }, [buscaDebounced]);

  const handleGerarRelatorioPdf = useCallback(async () => {
    try {
      setGerandoRelatorio(true);
      const linhas = await fetchMotoristasRelatorio();

      const agora = new Date();
      const dataHora = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(agora);

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const titulo = "Relatório de motoristas";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(titulo, 40, 36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Gerado em: ${dataHora}`, 40, 54);
      doc.text(
        buscaDebounced.trim() ? `Filtro: "${buscaDebounced.trim()}"` : "Filtro: todos os motoristas",
        40,
        68
      );
      doc.text(`Total de registros: ${linhas.length}`, 40, 82);

      autoTable(doc, {
        startY: 96,
        head: [
          [
            "Nome",
            "Nº CNH",
            "Categoria",
            "Validade CNH",
            "Possui NOPP?",
            "Validade NOPP",
            "Cadastrado em",
            "CNH (foto)",
          ],
        ],
        body: linhas.map((m) => [
          m.nome ?? "",
          m.cnh_numero ?? "-",
          m.cnh_categoria ?? "-",
          formatarData(m.cnh_validade),
          simOuNao(!!m.possui_nopp),
          m.possui_nopp ? formatarData(m.nopp_validade) : "—",
          formatarDataHora(m.created_at),
          m.cnh_foto_url ? "Sim" : "Não",
        ]),
        styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak", cellWidth: "wrap" },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
        margin: { left: 40, right: 40 },
        tableWidth: "auto",
        columnStyles: {
          0: { cellWidth: 150 },
          1: { cellWidth: 88 },
          2: { cellWidth: 62 },
          3: { cellWidth: 78 },
          4: { cellWidth: 62 },
          5: { cellWidth: 78 },
          6: { cellWidth: 100 },
          7: { cellWidth: 58 },
        },
      });

      const iso = agora.toISOString().slice(0, 10);
      doc.save(`relatorio-motoristas_${iso}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar relatório de motoristas:", err);
      alert("Não foi possível gerar o relatório em PDF. Tente novamente.");
    } finally {
      setGerandoRelatorio(false);
    }
  }, [fetchMotoristasRelatorio, buscaDebounced]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchMotoristas();
    });
  }, [fetchMotoristas]);

  useEffect(() => {
    const id = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(id);
  }, [buscaDebounced, pageSize]);

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === "checkbox" && t.name === "possui_nopp") {
      setForm((prev) => ({
        ...prev,
        possui_nopp: t.checked,
        nopp_validade: t.checked ? prev.nopp_validade : "",
      }));
      return;
    }
    const { name, value } = t;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function limparFormulario() {
    limparSessionDraftKey(MOTORISTAS_CADASTRO_DRAFT_KEY);
    setForm(formInicial);
    setEditingId(null);
  }

  function abrirCadastroNovo() {
    limparFormulario();
    setMostrarCadastro(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditar(m: Motorista) {
    setForm({
      nome: m.nome || "",
      cnh_numero: m.cnh_numero || "",
      cnh_categoria: m.cnh_categoria || "",
      cnh_validade: m.cnh_validade
        ? m.cnh_validade.includes("T")
          ? m.cnh_validade.split("T")[0]
          : m.cnh_validade.slice(0, 10)
        : "",
      possui_nopp: Boolean(m.possui_nopp),
      nopp_validade:
        m.possui_nopp && m.nopp_validade
          ? m.nopp_validade.includes("T")
            ? m.nopp_validade.split("T")[0]
            : m.nopp_validade.slice(0, 10)
          : "",
    });
    setEditingId(m.id);
    setMostrarCadastro(true);
    setSucesso("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.nome.trim()) {
      alert("Preencha o nome do motorista.");
      return;
    }

    setSalvando(true);

    const payload = {
      nome: form.nome.trim(),
      cnh_numero: limparOuNull(form.cnh_numero),
      cnh_categoria: limparOuNull(form.cnh_categoria),
      cnh_validade: limparOuNull(form.cnh_validade),
      possui_nopp: form.possui_nopp,
      nopp_validade: form.possui_nopp ? limparOuNull(form.nopp_validade) : null,
    };

    let error: PostgrestError | null = null;

    if (editingId) {
      const response = await supabase.from("motoristas").update(payload).eq("id", editingId);
      error = response.error;
    } else {
      const response = await supabase.from("motoristas").insert([payload]);
      error = response.error;
    }

    if (error) {
      console.error("Erro ao salvar motorista:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });

      alert(
        `Erro ao salvar motorista.\n\nMensagem: ${error.message}${
          error.details ? `\nDetalhes: ${error.details}` : ""
        }`
      );

      setSalvando(false);
      return;
    }

    const mensagem = editingId
      ? "Motorista atualizado com sucesso!"
      : "Motorista cadastrado com sucesso!";

    limparFormulario();
    setSalvando(false);
    setMostrarCadastro(false);
    await fetchMotoristas();

    setSucesso(mensagem);

    setTimeout(() => {
      setSucesso("");
    }, 3000);
  }

  async function handleDelete(id: string) {
    const confirmar = window.confirm("Deseja realmente excluir este motorista?");
    if (!confirmar) return;

    const { data: rowFoto } = await supabase
      .from("motoristas")
      .select("cnh_foto_url")
      .eq("id", id)
      .maybeSingle();

    const urlFoto = (rowFoto as { cnh_foto_url?: string | null } | null)?.cnh_foto_url;
    if (urlFoto) {
      const p = pathFromSupabasePublicUrl(urlFoto, BUCKET_CNH_MOTORISTA);
      if (p) void supabase.storage.from(BUCKET_CNH_MOTORISTA).remove([p]);
    }

    const { error } = await supabase.from("motoristas").delete().eq("id", id);

    if (error) {
      console.error("Erro ao remover motorista:", error);
      alert("Erro ao remover motorista.");
      return;
    }

    if (editingId === id) {
      limparFormulario();
    }
    if (fichaMotorista?.id === id) {
      setFichaMotorista(null);
    }

    await fetchMotoristas();
  }

  const totalPaginas =
    totalCount != null && totalCount > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  const totalExibidoKpi = totalCount != null ? totalCount : motoristas.length;

  useEffect(() => {
    if (page <= totalPaginas) return;
    const id = window.setTimeout(() => setPage(totalPaginas), 0);
    return () => window.clearTimeout(id);
  }, [page, totalPaginas]);

  useEffect(() => {
    if (!fichaMotorista) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFichaMotorista(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fichaMotorista]);

  const abrirFichaMotorista = useCallback(async (m: Motorista) => {
    setFichaMotorista(m);
    const { data, error } = await supabase
      .from("motoristas")
      .select(MOTORISTAS_SELECT)
      .eq("id", m.id)
      .maybeSingle();
    if (!error && data) {
      setFichaMotorista(data as Motorista);
    }
  }, []);

  async function handleEscolherFotoCnh(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !fichaMotorista) return;

    if (!file.type.startsWith("image/")) {
      window.alert("Escolha uma imagem (JPEG, PNG, WebP ou GIF).");
      return;
    }
    if (file.size > MAX_BYTES_FOTO_CNH) {
      window.alert("A imagem deve ter no máximo 8 MB.");
      return;
    }

    setEnviandoFotoCnh(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const extSeguro =
        ext && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
      const path = `${fichaMotorista.id}/cnh.${extSeguro}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET_CNH_MOTORISTA)
        .upload(path, file, { upsert: true, contentType: file.type || undefined });

      if (upErr) {
        console.error(upErr);
        window.alert(
          "Não foi possível enviar a foto. Aplique a migração do bucket motoristas-cnh no Supabase ou verifique as políticas de Storage."
        );
        return;
      }

      const { data: pub } = supabase.storage.from(BUCKET_CNH_MOTORISTA).getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { error: dbErr } = await supabase
        .from("motoristas")
        .update({ cnh_foto_url: publicUrl })
        .eq("id", fichaMotorista.id);

      if (dbErr) {
        console.error(dbErr);
        window.alert(
          "A foto foi enviada, mas falhou ao gravar o endereço no cadastro. Verifique se a coluna cnh_foto_url existe (migração SQL)."
        );
        return;
      }

      const antiga = fichaMotorista.cnh_foto_url;
      if (antiga) {
        const pAnt = pathFromSupabasePublicUrl(antiga, BUCKET_CNH_MOTORISTA);
        if (pAnt && pAnt !== path) {
          void supabase.storage.from(BUCKET_CNH_MOTORISTA).remove([pAnt]);
        }
      }

      setFichaMotorista({ ...fichaMotorista, cnh_foto_url: publicUrl });
      await fetchMotoristas();
    } finally {
      setEnviandoFotoCnh(false);
    }
  }

  async function handleRemoverFotoCnh() {
    if (!fichaMotorista?.cnh_foto_url) return;
    if (!window.confirm("Remover a foto da CNH deste motorista?")) return;

    const p = pathFromSupabasePublicUrl(fichaMotorista.cnh_foto_url, BUCKET_CNH_MOTORISTA);
    if (p) {
      const { error: rmErr } = await supabase.storage.from(BUCKET_CNH_MOTORISTA).remove([p]);
      if (rmErr) console.warn("Storage remove:", rmErr);
    }

    const { error } = await supabase
      .from("motoristas")
      .update({ cnh_foto_url: null })
      .eq("id", fichaMotorista.id);

    if (error) {
      window.alert("Não foi possível limpar o registo da foto.");
      return;
    }

    setFichaMotorista({ ...fichaMotorista, cnh_foto_url: null });
    await fetchMotoristas();
  }

  async function handleDescarregarFotoCnh() {
    if (!fichaMotorista?.cnh_foto_url) return;
    const url = fichaMotorista.cnh_foto_url;
    const baseNome = (fichaMotorista.nome || "motorista")
      .replace(/[^a-zA-Z0-9À-úà-ú]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48) || "motorista";

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
      const nomeArquivo = `CNH_${baseNome}_${fichaMotorista.id.slice(0, 8)}.${ext}`;
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
                Motoristas e documentação (CNH)
              </h1>
              <p className="page-header__lead" style={{ margin: "6px 0 0" }}>
                Cadastro base de motoristas e CNH. Integração com <strong>Logística</strong> e outras
                etapas será feita nas próximas fases.
              </p>
            </div>

            <div className="rg-page-toolbar">
              <div className="rg-kpi-card">
                <div className="rg-kpi-card__label">Total de motoristas</div>
                <div className="rg-kpi-card__value">{totalExibidoKpi}</div>
              </div>

              <button
                type="button"
                className="rg-btn rg-btn--report"
                disabled={gerandoRelatorio}
                onClick={() => void handleGerarRelatorioPdf()}
                title="Gera um PDF com todos os motoristas conforme o filtro atual"
              >
                <RgReportPdfIcon className="rg-btn__icon" />
                {gerandoRelatorio ? "Gerando PDF…" : "Relatório (PDF)"}
              </button>

              <button type="button" className="rg-btn rg-btn--primary" onClick={abrirCadastroNovo}>
                Novo motorista
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
                  {editingId ? "Editar motorista" : "Novo motorista"}
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
                    Dados e CNH
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <input
                      name="nome"
                      value={form.nome}
                      onChange={handleInputChange}
                      placeholder="Nome completo"
                      style={inputStyle}
                    />

                    <input
                      name="cnh_numero"
                      value={form.cnh_numero}
                      onChange={handleInputChange}
                      placeholder="Número da CNH"
                      style={inputStyle}
                    />

                    <input
                      name="cnh_categoria"
                      value={form.cnh_categoria}
                      onChange={handleInputChange}
                      placeholder="Categoria (ex.: B, C, E)"
                      style={inputStyle}
                    />

                    <input
                      type="date"
                      name="cnh_validade"
                      value={form.cnh_validade}
                      onChange={handleInputChange}
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ marginTop: "6px" }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 800,
                        color: "#334155",
                        marginBottom: "10px",
                      }}
                    >
                      NOPP
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "14px",
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "10px",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#334155",
                          userSelect: "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          name="possui_nopp"
                          checked={form.possui_nopp}
                          onChange={handleInputChange}
                          style={{
                            width: "18px",
                            height: "18px",
                            accentColor: "#16a34a",
                            cursor: "pointer",
                          }}
                        />
                        Possui NOPP?
                      </label>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          minWidth: "min(100%, 220px)",
                          flex: "1 1 200px",
                        }}
                      >
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                          Data de validade do NOPP
                        </span>
                        <input
                          type="date"
                          name="nopp_validade"
                          value={form.nopp_validade}
                          onChange={handleInputChange}
                          disabled={!form.possui_nopp}
                          title={
                            form.possui_nopp
                              ? "Data de validade do NOPP"
                              : 'Marque "Possui NOPP?" para informar a validade'
                          }
                          style={{
                            ...inputStyle,
                            opacity: form.possui_nopp ? 1 : 0.65,
                            cursor: form.possui_nopp ? undefined : "not-allowed",
                          }}
                        />
                      </div>
                    </div>
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
                      : "Adicionar motorista"}
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
                  Lista de motoristas
                </h2>
              </div>

              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Busca (nome, nº CNH, categoria…)"
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
                Carregando motoristas...
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
                      <th style={thStyle}>Nome</th>
                      <th style={thStyle}>Nº CNH</th>
                      <th style={thStyle}>Categoria</th>
                      <th style={thStyle}>Validade CNH</th>
                      <th style={thStyle}>NOPP</th>
                      <th style={thStyle}>Val. NOPP</th>
                      <th style={thStyle}>Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {motoristas.map((m) => (
                      <tr
                        key={m.id}
                        style={{
                          borderBottom: "1px solid #eef2f7",
                        }}
                      >
                        <td style={{ ...tdStyle, whiteSpace: "normal", wordBreak: "break-word" }}>
                          <button
                            type="button"
                            onClick={() => void abrirFichaMotorista(m)}
                            style={nomeMotoristaFichaBtnStyle}
                            title="Ver ficha e foto da CNH"
                            aria-label={`Abrir ficha de ${m.nome}`}
                          >
                            {m.nome}
                          </button>
                        </td>
                        <td style={tdStyle}>{m.cnh_numero || "-"}</td>
                        <td style={tdStyle}>{m.cnh_categoria || "-"}</td>
                        <td style={tdStyle}>{formatarData(m.cnh_validade)}</td>
                        <td style={tdStyle}>{simOuNao(!!m.possui_nopp)}</td>
                        <td style={tdStyle}>
                          {m.possui_nopp ? formatarData(m.nopp_validade) : "—"}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap", verticalAlign: "middle" }}>
                          <div
                            role="group"
                            aria-label="Ações do motorista"
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
                              onClick={() => handleEditar(m)}
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
                              onClick={() => handleDelete(m.id)}
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
                    ))}

                    {motoristas.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            textAlign: "center",
                            padding: "28px 12px",
                            color: "#64748b",
                          }}
                        >
                          Nenhum motorista encontrado.
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

      {fichaMotorista ? (
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
          onClick={() => setFichaMotorista(null)}
          onKeyDown={(e) => e.key === "Escape" && setFichaMotorista(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={fichaTituloFichaId}
            style={{
              width: "100%",
              maxWidth: "520px",
              maxHeight: "min(92vh, 900px)",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: "16px",
              boxShadow: "0 25px 50px rgba(15, 23, 42, 0.2)",
              border: "1px solid #e2e8f0",
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
                id={fichaTituloFichaId}
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Ficha do motorista
              </h2>
              <button
                type="button"
                onClick={() => setFichaMotorista(null)}
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
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Nome</dt>
                <dd style={{ margin: 0, color: "#0f172a", fontWeight: 600 }}>{fichaMotorista.nome}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Nº CNH</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaMotorista.cnh_numero || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Categoria</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaMotorista.cnh_categoria || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Validade CNH</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{formatarData(fichaMotorista.cnh_validade)}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Possui NOPP?</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{simOuNao(!!fichaMotorista.possui_nopp)}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Validade NOPP</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>
                  {fichaMotorista.possui_nopp ? formatarData(fichaMotorista.nopp_validade) : "—"}
                </dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Cadastrado em</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{formatarDataHora(fichaMotorista.created_at)}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>ID</dt>
                <dd
                  style={{
                    margin: 0,
                    color: "#64748b",
                    fontSize: "12px",
                    wordBreak: "break-all",
                  }}
                >
                  {fichaMotorista.id}
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
                  Foto da CNH
                </div>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
                  Envie uma imagem legível da carteira (frente ou frente e verso num só ficheiro). Formatos:
                  JPEG, PNG, WebP ou GIF; máx. 8 MB.
                </p>

                {fichaMotorista.cnh_foto_url ? (
                  <a
                    href={fichaMotorista.cnh_foto_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "block", marginBottom: "12px" }}
                  >
                    <img
                      src={fichaMotorista.cnh_foto_url}
                      alt={`CNH de ${fichaMotorista.nome}`}
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
                    Nenhuma foto cadastrada.
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                  <input
                    id={fichaCnhInputId}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => void handleEscolherFotoCnh(e)}
                    disabled={enviandoFotoCnh}
                    style={{ display: "none" }}
                  />
                  <label
                    htmlFor={fichaCnhInputId}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: "40px",
                      padding: "0 16px",
                      borderRadius: "10px",
                      background: enviandoFotoCnh ? "#e2e8f0" : "#0f172a",
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: enviandoFotoCnh ? "wait" : "pointer",
                    }}
                  >
                    {enviandoFotoCnh ? "A enviar…" : fichaMotorista.cnh_foto_url ? "Substituir foto" : "Carregar foto"}
                  </label>
                  {fichaMotorista.cnh_foto_url ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleDescarregarFotoCnh()}
                        disabled={enviandoFotoCnh}
                        title="Guardar a imagem da CNH no computador"
                        style={{
                          minHeight: "40px",
                          padding: "0 14px",
                          borderRadius: "10px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: "#334155",
                          fontWeight: 700,
                          fontSize: "13px",
                          cursor: enviandoFotoCnh ? "not-allowed" : "pointer",
                        }}
                      >
                        Descarregar imagem
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoverFotoCnh()}
                        disabled={enviandoFotoCnh}
                        style={{
                          minHeight: "40px",
                          padding: "0 14px",
                          borderRadius: "10px",
                          border: "1px solid #fecaca",
                          background: "#ffffff",
                          color: "#b91c1c",
                          fontWeight: 700,
                          fontSize: "13px",
                          cursor: enviandoFotoCnh ? "not-allowed" : "pointer",
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
                    setFichaMotorista(null);
                    handleEditar(fichaMotorista);
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
                  onClick={() => setFichaMotorista(null)}
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
