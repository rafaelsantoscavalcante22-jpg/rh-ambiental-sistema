import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import MainLayout from "../layouts/MainLayout";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "../lib/coletasQueryLimits";
import { sanitizeIlikePattern } from "../lib/sanitizeIlike";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { limparSessionDraftKey, useCadastroFormDraft } from "../lib/useCadastroFormDraft";

type Caminhao = {
  id: string;
  placa: string;
  modelo: string | null;
  tipo: string | null;
  rodizio: string | null;
  status_disponibilidade: string;
  foto_url: string | null;
  created_at: string | null;
};

type FormCaminhao = {
  placa: string;
  modelo: string;
  tipo: string;
  rodizio: string;
  status_disponibilidade: string;
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
};

function limparOuNull(valor: string) {
  const texto = valor.trim();
  return texto === "" ? null : texto;
}

/** Normaliza placa para maiúsculas e remove espaços (Mercosul / formato antigo). */
function formatarPlacaDigitacao(valor: string) {
  return valor.toUpperCase().replace(/\s+/g, "").slice(0, 8);
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
  "id, placa, modelo, tipo, rodizio, status_disponibilidade, foto_url, created_at";

const CAMINHOES_CADASTRO_DRAFT_KEY = "rg-ambiental-caminhoes-cadastro-draft";

export default function Caminhoes() {
  const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);
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

  const cadastroDraftData = useMemo(() => ({ form, editingId }), [form, editingId]);
  useCadastroFormDraft({
    storageKey: CAMINHOES_CADASTRO_DRAFT_KEY,
    open: mostrarCadastro,
    data: cadastroDraftData,
    onRestore: (d) => {
      setForm(d.form);
      setEditingId(d.editingId);
      setMostrarCadastro(true);
    },
  });

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
      const orFilter = `placa.ilike.%${s}%,modelo.ilike.%${s}%,tipo.ilike.%${s}%,rodizio.ilike.%${s}%,status_disponibilidade.ilike.%${s}%`;
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
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function limparFormulario() {
    limparSessionDraftKey(CAMINHOES_CADASTRO_DRAFT_KEY);
    setForm(formInicial);
    setEditingId(null);
  }

  function abrirCadastroNovo() {
    limparFormulario();
    setMostrarCadastro(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditar(c: Caminhao) {
    setForm({
      placa: c.placa || "",
      modelo: c.modelo || "",
      tipo: c.tipo || "",
      rodizio: c.rodizio || "",
      status_disponibilidade: c.status_disponibilidade || "Disponível",
    });
    setEditingId(c.id);
    setMostrarCadastro(true);
    setSucesso("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const placa = formatarPlacaDigitacao(form.placa);
    if (!placa) {
      alert("Preencha a placa do veículo.");
      return;
    }

    setSalvando(true);

    const payload = {
      placa,
      modelo: limparOuNull(form.modelo),
      tipo: limparOuNull(form.tipo),
      rodizio: limparOuNull(form.rodizio),
      status_disponibilidade: form.status_disponibilidade.trim() || "Disponível",
    };

    let error: PostgrestError | null = null;

    if (editingId) {
      const response = await supabase.from("caminhoes").update(payload).eq("id", editingId);
      error = response.error;
    } else {
      const response = await supabase.from("caminhoes").insert([payload]);
      error = response.error;
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
          ? "Já existe um caminhão com esta placa. Use outra placa ou edite o registo existente."
          : `Erro ao salvar caminhão.\n\nMensagem: ${error.message}${
              error.details ? `\nDetalhes: ${error.details}` : ""
            }`
      );

      setSalvando(false);
      return;
    }

    const mensagem = editingId
      ? "Caminhão atualizado com sucesso!"
      : "Caminhão cadastrado com sucesso!";

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
    const confirmar = window.confirm("Deseja realmente excluir este caminhão?");
    if (!confirmar) return;

    const { data: rowFoto } = await supabase
      .from("caminhoes")
      .select("foto_url")
      .eq("id", id)
      .maybeSingle();

    const urlFoto = (rowFoto as { foto_url?: string | null } | null)?.foto_url;
    if (urlFoto) {
      const p = pathFromSupabasePublicUrl(urlFoto, BUCKET_FOTO_CAMINHAO);
      if (p) void supabase.storage.from(BUCKET_FOTO_CAMINHAO).remove([p]);
    }

    const { error } = await supabase.from("caminhoes").delete().eq("id", id);

    if (error) {
      console.error("Erro ao remover caminhão:", error);
      alert("Erro ao remover caminhão.");
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

    if (!file.type.startsWith("image/")) {
      window.alert("Escolha uma imagem (JPEG, PNG, WebP ou GIF).");
      return;
    }
    if (file.size > MAX_BYTES_FOTO_CAMINHAO) {
      window.alert("A imagem deve ter no máximo 8 MB.");
      return;
    }

    setEnviandoFotoCaminhao(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const extSeguro =
        ext && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
      const path = `${fichaCaminhao.id}/foto.${extSeguro}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET_FOTO_CAMINHAO)
        .upload(path, file, { upsert: true, contentType: file.type || undefined });

      if (upErr) {
        console.error(upErr);
        window.alert(
          "Não foi possível enviar a foto. Aplique a migração do bucket caminhoes-fotos no Supabase ou verifique as políticas de Storage."
        );
        return;
      }

      const { data: pub } = supabase.storage.from(BUCKET_FOTO_CAMINHAO).getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { error: dbErr } = await supabase
        .from("caminhoes")
        .update({ foto_url: publicUrl })
        .eq("id", fichaCaminhao.id);

      if (dbErr) {
        console.error(dbErr);
        window.alert(
          "A foto foi enviada, mas falhou ao gravar o endereço no cadastro. Verifique se a coluna foto_url existe (migração SQL)."
        );
        return;
      }

      const antiga = fichaCaminhao.foto_url;
      if (antiga) {
        const pAnt = pathFromSupabasePublicUrl(antiga, BUCKET_FOTO_CAMINHAO);
        if (pAnt && pAnt !== path) {
          void supabase.storage.from(BUCKET_FOTO_CAMINHAO).remove([pAnt]);
        }
      }

      setFichaCaminhao({ ...fichaCaminhao, foto_url: publicUrl });
      await fetchCaminhoes();
    } finally {
      setEnviandoFotoCaminhao(false);
    }
  }

  async function handleRemoverFotoCaminhao() {
    if (!fichaCaminhao?.foto_url) return;
    if (!window.confirm("Remover a fotografia deste caminhão?")) return;

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
                Frota e cadastro de veículos
              </h1>
              <p className="page-header__lead" style={{ margin: "6px 0 0" }}>
                Frota e disponibilidade. Integração com <strong>Logística</strong> e outras etapas será
                feita nas próximas fases.
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
                  Total de caminhões
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
                Novo caminhão
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
                  {editingId ? "Editar caminhão" : "Novo caminhão"}
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
                      : "Adicionar caminhão"}
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
                  Lista de caminhões
                </h2>
              </div>

              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Busca (placa, modelo, tipo, rodízio, status…)"
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
                Carregando caminhões...
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
                      <th style={thStyle}>Modelo</th>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}>Rodízio</th>
                      <th style={thStyle}>Disponibilidade</th>
                      <th style={thStyle}>Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {caminhoes.map((c) => (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: "1px solid #eef2f7",
                        }}
                      >
                        <td style={{ ...tdStyle, whiteSpace: "normal", wordBreak: "break-word" }}>
                          <button
                            type="button"
                            onClick={() => void abrirFichaCaminhao(c)}
                            style={placaCaminhaoFichaBtnStyle}
                            title="Ver ficha e fotografia do veículo"
                            aria-label={`Abrir ficha do caminhão ${c.placa}`}
                          >
                            {c.placa}
                          </button>
                        </td>
                        <td style={tdStyle}>{c.modelo || "-"}</td>
                        <td style={tdStyle}>{c.tipo || "-"}</td>
                        <td style={tdStyle}>{c.rodizio || "-"}</td>
                        <td style={tdStyle}>{c.status_disponibilidade}</td>
                        <td style={{ ...tdStyle, whiteSpace: "nowrap", verticalAlign: "middle" }}>
                          <div
                            role="group"
                            aria-label="Ações do caminhão"
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
                    ))}

                    {caminhoes.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            textAlign: "center",
                            padding: "28px 12px",
                            color: "#64748b",
                          }}
                        >
                          Nenhum caminhão encontrado.
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
                id={fichaCaminhaoTituloId}
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Ficha do caminhão
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
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Modelo</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.modelo || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Tipo</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.tipo || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Rodízio</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.rodizio || "—"}</dd>
                <dt style={{ color: "#64748b", fontWeight: 700 }}>Disponibilidade</dt>
                <dd style={{ margin: 0, color: "#1f2937" }}>{fichaCaminhao.status_disponibilidade}</dd>
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
                  Envie uma imagem do caminhão (lateral ou 3/4, por exemplo). Formatos: JPEG, PNG, WebP ou
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
                      alt={`Caminhão ${fichaCaminhao.placa}`}
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
