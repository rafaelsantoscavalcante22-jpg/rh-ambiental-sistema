import { useCallback, useEffect, useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import MainLayout from "../layouts/MainLayout";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "../lib/coletasQueryLimits";
import { sanitizeIlikePattern } from "../lib/sanitizeIlike";
import { useDebouncedValue } from "../lib/useDebouncedValue";

type Motorista = {
  id: string;
  nome: string;
  cnh_numero: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  created_at: string | null;
};

type FormMotorista = {
  nome: string;
  cnh_numero: string;
  cnh_categoria: string;
  cnh_validade: string;
};

const formInicial: FormMotorista = {
  nome: "",
  cnh_numero: "",
  cnh_categoria: "",
  cnh_validade: "",
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

const MOTORISTAS_SELECT =
  "id, nome, cnh_numero, cnh_categoria, cnh_validade, created_at";

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
  const [sucesso, setSucesso] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormMotorista>(formInicial);

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

    setMotoristas((data as Motorista[]) || []);
    setLoading(false);
  }, [page, pageSize, buscaDebounced]);

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
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function limparFormulario() {
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
    const confirmar = window.confirm("Deseja realmente remover este motorista?");
    if (!confirmar) return;

    const { error } = await supabase.from("motoristas").delete().eq("id", id);

    if (error) {
      console.error("Erro ao remover motorista:", error);
      alert("Erro ao remover motorista.");
      return;
    }

    if (editingId === id) {
      limparFormulario();
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
                Motoristas
              </h1>
              <p className="page-header__lead" style={{ margin: "6px 0 0" }}>
                Cadastro base de motoristas e CNH. Integração com <strong>Logística</strong> e outras
                etapas será feita nas próximas fases.
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
                  Total de motoristas
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
                        <td style={tdStyle}>{m.nome}</td>
                        <td style={tdStyle}>{m.cnh_numero || "-"}</td>
                        <td style={tdStyle}>{m.cnh_categoria || "-"}</td>
                        <td style={tdStyle}>{formatarData(m.cnh_validade)}</td>
                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              alignItems: "center",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleEditar(m)}
                              style={{
                                background: "#16a34a",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "8px",
                                padding: "7px 14px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(m.id)}
                              style={{
                                background: "#ef4444",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "8px",
                                padding: "7px 14px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Remover
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
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  color: "#1f2937",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};
