import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import MainLayout from "../layouts/MainLayout";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "../lib/coletasQueryLimits";
import { sanitizeIlikePattern } from "../lib/sanitizeIlike";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { limparSessionDraftKey, useCadastroFormDraft } from "../lib/useCadastroFormDraft";
import { useSessionPersistedState } from "../lib/usePageSessionPersistence";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { RgReportPdfIcon } from "../components/ui/RgReportPdfIcon";

type RepresentanteRG = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  observacoes: string | null;
  created_at: string | null;
};

type FormRepresentanteRG = {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  observacoes: string;
};

const formInicial: FormRepresentanteRG = {
  nome: "",
  email: "",
  telefone: "",
  cpf: "",
  observacoes: "",
};

function limparOuNull(valor: string) {
  const texto = valor.trim();
  return texto === "" ? null : texto;
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

const nomeFichaBtnStyle: CSSProperties = {
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

const REPRESENTANTES_RG_SELECT =
  "id, nome, email, telefone, cpf, observacoes, created_at";

const REPRESENTANTES_RG_CADASTRO_DRAFT_KEY = "rg-ambiental-representantes-rg-cadastro-draft";

export default function RepresentantesRG() {
  const [lista, setLista] = useState<RepresentanteRG[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useSessionPersistedState("lista-busca", "");
  const [page, setPage] = useSessionPersistedState("lista-page", 1);
  const [pageSize, setPageSize] = useSessionPersistedState("lista-page-size", DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const buscaDebounced = useDebouncedValue(busca, 400);
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [sucesso, setSucesso] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormRepresentanteRG>(formInicial);
  const [ficha, setFicha] = useState<RepresentanteRG | null>(null);
  const fichaDomBase = useId().replace(/:/g, "");
  const fichaTituloId = `${fichaDomBase}-titulo-ficha`;

  const cadastroDraftData = useMemo(() => ({ form, editingId }), [form, editingId]);
  useCadastroFormDraft({
    storageKey: REPRESENTANTES_RG_CADASTRO_DRAFT_KEY,
    open: mostrarCadastro,
    data: cadastroDraftData,
    onRestore: (d) => {
      setForm(d.form);
      setEditingId(d.editingId);
      setMostrarCadastro(true);
    },
  });

  const fetchLista = useCallback(async () => {
    setLoading(true);

    const term = buscaDebounced.trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let countQ = supabase.from("representantes_rg").select("id", { count: "exact", head: true });
    let dataQ = supabase
      .from("representantes_rg")
      .select(REPRESENTANTES_RG_SELECT)
      .order("nome", { ascending: true });

    if (term) {
      const s = sanitizeIlikePattern(term);
      const orFilter = `nome.ilike.%${s}%,email.ilike.%${s}%,telefone.ilike.%${s}%,cpf.ilike.%${s}%,observacoes.ilike.%${s}%`;
      countQ = countQ.or(orFilter);
      dataQ = dataQ.or(orFilter);
    }

    const [{ count, error: errCount }, { data, error }] = await Promise.all([
      countQ,
      dataQ.range(from, to),
    ]);

    if (errCount) {
      console.error("Erro ao contar representantes:", errCount);
    } else {
      setTotalCount(typeof count === "number" ? count : 0);
    }

    if (error) {
      console.error("Erro ao buscar representantes:", error);
      setLista([]);
      setLoading(false);
      return;
    }

    setLista((data as RepresentanteRG[]) || []);
    setLoading(false);
  }, [page, pageSize, buscaDebounced]);

  const fetchListaRelatorio = useCallback(async (): Promise<RepresentanteRG[]> => {
    const PAGE = 1000;
    const term = buscaDebounced.trim();
    let dataQ = supabase
      .from("representantes_rg")
      .select(REPRESENTANTES_RG_SELECT)
      .order("nome", { ascending: true });

    if (term) {
      const s = sanitizeIlikePattern(term);
      const orFilter = `nome.ilike.%${s}%,email.ilike.%${s}%,telefone.ilike.%${s}%,cpf.ilike.%${s}%,observacoes.ilike.%${s}%`;
      dataQ = dataQ.or(orFilter);
    }

    const out: RepresentanteRG[] = [];
    for (let from = 0; ; from += PAGE) {
      const to = from + PAGE - 1;
      const { data, error } = await dataQ.range(from, to);
      if (error) throw error;
      const chunk = ((data as RepresentanteRG[]) || []).filter(Boolean);
      out.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    return out;
  }, [buscaDebounced]);

  const handleGerarRelatorioPdf = useCallback(async () => {
    try {
      setGerandoRelatorio(true);
      const linhas = await fetchListaRelatorio();

      const agora = new Date();
      const dataHora = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(agora);

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Relatório — Representantes RG (comercial)", 40, 36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Gerado em: ${dataHora}`, 40, 54);
      doc.text(
        buscaDebounced.trim() ? `Filtro: "${buscaDebounced.trim()}"` : "Filtro: todos os registos",
        40,
        68
      );
      doc.text(`Total de registros: ${linhas.length}`, 40, 82);

      autoTable(doc, {
        startY: 96,
        head: [["Nome", "E-mail", "Telefone", "CPF", "Observações", "Cadastrado em"]],
        body: linhas.map((r) => [
          r.nome ?? "",
          r.email ?? "-",
          r.telefone ?? "-",
          r.cpf ?? "-",
          (r.observacoes ?? "-").replace(/\s+/g, " ").trim().slice(0, 120),
          formatarDataHora(r.created_at),
        ]),
        styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak", cellWidth: "wrap" },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
        margin: { left: 40, right: 40 },
        tableWidth: "auto",
        columnStyles: {
          0: { cellWidth: 150 },
          1: { cellWidth: 140 },
          2: { cellWidth: 95 },
          3: { cellWidth: 85 },
          4: { cellWidth: 180 },
          5: { cellWidth: 100 },
        },
      });

      const iso = agora.toISOString().slice(0, 10);
      doc.save(`relatorio-representantes-rg_${iso}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar relatório:", err);
      alert("Não foi possível gerar o relatório em PDF. Tente novamente.");
    } finally {
      setGerandoRelatorio(false);
    }
  }, [fetchListaRelatorio, buscaDebounced]);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchLista();
    });
  }, [fetchLista]);

  useEffect(() => {
    const id = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(id);
  }, [buscaDebounced, pageSize]);

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function limparFormulario() {
    limparSessionDraftKey(REPRESENTANTES_RG_CADASTRO_DRAFT_KEY);
    setForm(formInicial);
    setEditingId(null);
  }

  function abrirCadastroNovo() {
    limparFormulario();
    setMostrarCadastro(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditar(r: RepresentanteRG) {
    setForm({
      nome: r.nome || "",
      email: r.email || "",
      telefone: r.telefone || "",
      cpf: r.cpf || "",
      observacoes: r.observacoes || "",
    });
    setEditingId(r.id);
    setMostrarCadastro(true);
    setSucesso("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.nome.trim()) {
      alert("Preencha o nome do representante.");
      return;
    }

    setSalvando(true);

    const payload = {
      nome: form.nome.trim(),
      email: limparOuNull(form.email),
      telefone: limparOuNull(form.telefone),
      cpf: limparOuNull(form.cpf),
      observacoes: limparOuNull(form.observacoes),
    };

    let error: PostgrestError | null = null;

    if (editingId) {
      const response = await supabase.from("representantes_rg").update(payload).eq("id", editingId);
      error = response.error;
    } else {
      const response = await supabase.from("representantes_rg").insert([payload]);
      error = response.error;
    }

    if (error) {
      console.error("Erro ao salvar:", error);
      alert(
        `Erro ao salvar.\n\nMensagem: ${error.message}${error.details ? `\nDetalhes: ${error.details}` : ""}`
      );
      setSalvando(false);
      return;
    }

    const mensagem = editingId ? "Registo atualizado com sucesso!" : "Representante cadastrado com sucesso!";

    limparFormulario();
    setSalvando(false);
    setMostrarCadastro(false);
    await fetchLista();

    setSucesso(mensagem);
    setTimeout(() => setSucesso(""), 3000);
  }

  async function handleDelete(id: string) {
    const confirmar = window.confirm("Deseja realmente excluir este representante?");
    if (!confirmar) return;

    const { error } = await supabase.from("representantes_rg").delete().eq("id", id);

    if (error) {
      console.error("Erro ao remover:", error);
      alert("Erro ao remover registo.");
      return;
    }

    if (editingId === id) limparFormulario();
    if (ficha?.id === id) setFicha(null);

    await fetchLista();
  }

  const totalPaginas =
    totalCount != null && totalCount > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  const totalExibidoKpi = totalCount != null ? totalCount : lista.length;

  useEffect(() => {
    if (page <= totalPaginas) return;
    const id = window.setTimeout(() => setPage(totalPaginas), 0);
    return () => window.clearTimeout(id);
  }, [page, totalPaginas]);

  useEffect(() => {
    if (!ficha) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFicha(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ficha]);

  const abrirFicha = useCallback(async (r: RepresentanteRG) => {
    setFicha(r);
    const { data, error } = await supabase
      .from("representantes_rg")
      .select(REPRESENTANTES_RG_SELECT)
      .eq("id", r.id)
      .maybeSingle();
    if (!error && data) setFicha(data as RepresentanteRG);
  }, []);

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
                Representante RG
              </h1>
              <p className="page-header__lead" style={{ margin: "6px 0 0" }}>
                Cadastro dos representantes comerciais <strong>RG Ambiental</strong>. Base para acompanhamento da
                equipa comercial.
              </p>
            </div>

            <div className="rg-page-toolbar">
              <div className="rg-kpi-card">
                <div className="rg-kpi-card__label">Total de representantes</div>
                <div className="rg-kpi-card__value">{totalExibidoKpi}</div>
              </div>

              <button
                type="button"
                className="rg-btn rg-btn--report"
                disabled={gerandoRelatorio}
                onClick={() => void handleGerarRelatorioPdf()}
                title="Gera um PDF com todos os registos conforme o filtro atual"
              >
                <RgReportPdfIcon className="rg-btn__icon" />
                {gerandoRelatorio ? "Gerando PDF…" : "Relatório (PDF)"}
              </button>

              <button type="button" className="rg-btn rg-btn--primary" onClick={abrirCadastroNovo}>
                Novo representante
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
              <div style={{ padding: "18px 20px", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                  {editingId ? "Editar representante" : "Novo representante"}
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
                    Dados do representante
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
                      name="cpf"
                      value={form.cpf}
                      onChange={handleInputChange}
                      placeholder="CPF (opcional)"
                      style={inputStyle}
                    />
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleInputChange}
                      placeholder="E-mail"
                      style={inputStyle}
                    />
                    <input
                      name="telefone"
                      value={form.telefone}
                      onChange={handleInputChange}
                      placeholder="Telefone"
                      style={inputStyle}
                    />
                    <textarea
                      name="observacoes"
                      value={form.observacoes}
                      onChange={handleInputChange}
                      placeholder="Observações (território, notas internas…)"
                      rows={4}
                      style={textareaStyle}
                    />
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
                    {salvando ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar representante"}
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
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                  Lista de representantes
                </h2>
              </div>

              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Busca (nome, e-mail, telefone, CPF…)"
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
              <div style={{ padding: "30px 0", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
                A carregar…
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={thStyle}>Nome</th>
                      <th style={thStyle}>E-mail</th>
                      <th style={thStyle}>Telefone</th>
                      <th style={thStyle}>CPF</th>
                      <th style={thStyle}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid #eef2f7" }}>
                        <td style={{ ...tdStyle, whiteSpace: "normal", wordBreak: "break-word" }}>
                          <button
                            type="button"
                            onClick={() => void abrirFicha(r)}
                            style={nomeFichaBtnStyle}
                            title="Ver ficha"
                            aria-label={`Abrir ficha de ${r.nome}`}
                          >
                            {r.nome}
                          </button>
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: "normal", wordBreak: "break-all" }}>
                          {r.email || "—"}
                        </td>
                        <td style={tdStyle}>{r.telefone || "—"}</td>
                        <td style={tdStyle}>{r.cpf || "—"}</td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap", verticalAlign: "middle" }}>
                          <div
                            role="group"
                            aria-label="Ações"
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
                              onClick={() => handleEditar(r)}
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
                              onClick={() => handleDelete(r.id)}
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

                    {lista.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{ textAlign: "center", padding: "28px 12px", color: "#64748b" }}
                        >
                          Nenhum representante encontrado.
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

      {ficha ? (
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
          onClick={() => setFicha(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={fichaTituloId}
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
              <h2 id={fichaTituloId} style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                Ficha do representante
              </h2>
              <button
                type="button"
                onClick={() => setFicha(null)}
                aria-label="Fechar"
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
                <dd style={{ margin: 0, color: "#0f172a", fontWeight: 600 }}>{ficha.nome}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>E-mail</dt>
                <dd style={{ margin: 0, color: "#1f2937", wordBreak: "break-all" }}>{ficha.email || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Telefone</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{ficha.telefone || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>CPF</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{ficha.cpf || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Observações</dt>
                <dd style={{ margin: 0, color: "#1f2937", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                  {ficha.observacoes?.trim() || "—"}
                </dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Cadastrado em</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{formatarDataHora(ficha.created_at)}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>ID</dt>
                <dd style={{ margin: 0, color: "#64748b", fontSize: "12px", wordBreak: "break-all" }}>
                  {ficha.id}
                </dd>
              </dl>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", paddingTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => {
                    const alvo = ficha;
                    setFicha(null);
                    handleEditar(alvo);
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
                  onClick={() => setFicha(null)}
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

const textareaStyle: CSSProperties = {
  ...inputStyle,
  gridColumn: "1 / -1",
  height: "auto",
  minHeight: "96px",
  padding: "10px 12px",
  resize: "vertical",
  lineHeight: 1.45,
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
