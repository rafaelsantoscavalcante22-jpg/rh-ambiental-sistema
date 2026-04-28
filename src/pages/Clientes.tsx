import { useCallback, useEffect, useMemo, useState } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import MainLayout from "../layouts/MainLayout";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "../lib/coletasQueryLimits";
import { sanitizeIlikePattern } from "../lib/sanitizeIlike";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { limparSessionDraftKey, useCadastroFormDraft } from "../lib/useCadastroFormDraft";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { clienteEstaAtivo } from "../lib/brasilRegioes";

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

  endereco_coleta: string | null;
  endereco_faturamento: string | null;
  email_nf: string | null;

  responsavel_nome: string | null;
  telefone: string | null;
  email: string | null;

  tipo_residuo: string | null;
  classificacao: string | null;
  unidade_medida: string | null;
  frequencia_coleta: string | null;

  licenca_numero: string | null;
  validade: string | null;
  status_ativo_desde: string | null;
  status_inativo_desde: string | null;
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
  endereco_faturamento: string;
  email_nf: string;

  responsavel_nome: string;
  telefone: string;
  email: string;

  licenca_numero: string;
  validade: string;
  status_ativo_desde: string;
  status_inativo_desde: string;

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
  endereco_faturamento: "",
  email_nf: "",

  responsavel_nome: "",
  telefone: "",
  email: "",

  licenca_numero: "",
  validade: "",
  status_ativo_desde: "",
  status_inativo_desde: "",

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

/** Endereço para relatório: prioriza campos estruturados; senão texto livre de coleta/faturamento. */
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
  const livre = (c.endereco_coleta || c.endereco_faturamento || "").trim();
  if (livre) return livre;
  return "-";
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

function dividirLista(valor?: string | null) {
  if (!valor) return [];
  return valor
    .split(" | ")
    .map((item) => item.trim())
    .filter(Boolean);
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

/** Listagem / relatório: sem colunas opcionais recentes, para não falhar se a migração ainda não foi aplicada. */
const CLIENTES_SELECT_LIST =
  "id, nome, razao_social, cnpj, status, cep, rua, numero, complemento, bairro, cidade, estado, endereco_coleta, endereco_faturamento, email_nf, responsavel_nome, telefone, email, tipo_residuo, classificacao, unidade_medida, frequencia_coleta, licenca_numero, validade";

const CLIENTES_SELECT_FULL =
  CLIENTES_SELECT_LIST + ", status_ativo_desde, status_inativo_desde";

/** Rascunho do cadastro: evita perder dados se a aba for recarregada ou descartada pelo navegador. */
const CLIENTES_CADASTRO_DRAFT_KEY = "rg-ambiental-clientes-cadastro-draft";

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
  const [sucesso, setSucesso] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alternandoStatusId, setAlternandoStatusId] = useState<string | null>(null);
  const [form, setForm] = useState<FormCliente>(formInicial);

  const termoFiltro = useMemo(() => buscaDebounced.trim(), [buscaDebounced]);

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

    let countQ = supabase.from("clientes").select("id", { count: "exact", head: true });
    let dataQ = supabase.from("clientes").select(CLIENTES_SELECT_LIST).order("nome", { ascending: true });

    if (termoFiltro) {
      const s = sanitizeIlikePattern(termoFiltro);
      const orFilter = `nome.ilike.%${s}%,razao_social.ilike.%${s}%,cnpj.ilike.%${s}%,cidade.ilike.%${s}%,tipo_residuo.ilike.%${s}%,status.ilike.%${s}%,email_nf.ilike.%${s}%,endereco_coleta.ilike.%${s}%,endereco_faturamento.ilike.%${s}%`;
      countQ = countQ.or(orFilter);
      dataQ = dataQ.or(orFilter);
    }

    const [{ count, error: errCount }, { data, error }] = await Promise.all([
      countQ,
      dataQ.range(from, to),
    ]);

    if (errCount) {
      console.error("Erro ao contar clientes:", errCount);
    } else {
      setTotalCount(typeof count === "number" ? count : 0);
    }

    if (error) {
      console.error("Erro ao buscar clientes:", error);
      setClientes([]);
      setLoading(false);
      return;
    }

    setClientes((data as Cliente[]) || []);
    setLoading(false);
  }, [page, pageSize, termoFiltro]);

  const fetchClientesRelatorio = useCallback(async (): Promise<Cliente[]> => {
    const PAGE = 1000;
    let dataQ = supabase.from("clientes").select(CLIENTES_SELECT_LIST).order("nome", { ascending: true });

    if (termoFiltro) {
      const s = sanitizeIlikePattern(termoFiltro);
      const orFilter = `nome.ilike.%${s}%,razao_social.ilike.%${s}%,cnpj.ilike.%${s}%,cidade.ilike.%${s}%,tipo_residuo.ilike.%${s}%,status.ilike.%${s}%,email_nf.ilike.%${s}%,endereco_coleta.ilike.%${s}%,endereco_faturamento.ilike.%${s}%`;
      dataQ = dataQ.or(orFilter);
    }

    const out: Cliente[] = [];
    for (let from = 0; ; from += PAGE) {
      const to = from + PAGE - 1;
      const { data, error } = await dataQ.range(from, to);
      if (error) throw error;
      const chunk = ((data as Cliente[]) || []).filter(Boolean);
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
          "Endereço",
          "Responsável",
          "Telefone",
          "E-mail",
          "E-mail NF",
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
          c.responsavel_nome?.trim() || "-",
          c.telefone?.trim() || "-",
          c.email?.trim() || "-",
          c.email_nf?.trim() || "-",
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
          0: { cellWidth: 62 },
          1: { cellWidth: 72 },
          2: { cellWidth: 58 },
          3: { cellWidth: 44 },
          4: { cellWidth: 78 },
          5: { cellWidth: 48 },
          6: { cellWidth: 46 },
          7: { cellWidth: 54 },
          8: { cellWidth: 50 },
          9: { cellWidth: 44 },
          10: { cellWidth: 34 },
          11: { cellWidth: 40 },
          12: { cellWidth: 34 },
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

    setForm((prev) => ({
      ...prev,
      [name]: name === "cnpj" ? formatarCNPJ(value) : value,
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
    const { data: fullRow, error } = await supabase
      .from("clientes")
      .select(CLIENTES_SELECT_FULL)
      .eq("id", cliente.id)
      .maybeSingle();

    let row: Cliente = cliente
    if (!error && fullRow && typeof fullRow === "object" && fullRow !== null && "id" in fullRow) {
      row = fullRow as Cliente
    }

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
      endereco_faturamento: row.endereco_faturamento || "",
      email_nf: row.email_nf || "",

      responsavel_nome: row.responsavel_nome || "",
      telefone: row.telefone || "",
      email: row.email || "",

      licenca_numero: row.licenca_numero || "",
      validade: row.validade || "",
      status_ativo_desde: row.status_ativo_desde ?? "",
      status_inativo_desde: row.status_inativo_desde ?? "",

      residuos: montarResiduosDoCliente(row),
    });

    setEditingId(cliente.id);
    setMostrarCadastro(true);
    setSucesso("");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      alert("Preencha o CNPJ.");
      return;
    }

    const residuosValidos = form.residuos.filter((item) => item.tipo_residuo.trim());

    if (residuosValidos.length === 0) {
      alert("Adicione pelo menos um resíduo.");
      return;
    }

    setSalvando(true);

    const residuosSerializados = serializarResiduos(residuosValidos);

    const payload = {
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
      endereco_coleta: limparOuNull(form.endereco_coleta),
      endereco_faturamento: limparOuNull(form.endereco_faturamento),
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
      status: form.status?.trim() || "Ativo",
      status_ativo_desde: limparOuNull(form.status_ativo_desde),
      status_inativo_desde: limparOuNull(form.status_inativo_desde),
    };

    let error: PostgrestError | null = null;

    if (editingId) {
      const response = await supabase
        .from("clientes")
        .update(payload)
        .eq("id", editingId);

      error = response.error;
    } else {
      const response = await supabase.from("clientes").insert([payload]);
      error = response.error;
    }

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
                Total de clientes
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
              disabled={gerandoRelatorio}
              onClick={() => void handleGerarRelatorioPdf()}
              style={{
                background: "#0f172a",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                height: "50px",
                padding: "0 18px",
                fontWeight: 800,
                cursor: gerandoRelatorio ? "not-allowed" : "pointer",
                alignSelf: "stretch",
                opacity: gerandoRelatorio ? 0.85 : 1,
              }}
              title="Gera um PDF com todos os clientes conforme o filtro atual"
            >
              {gerandoRelatorio ? "Gerando PDF..." : "Relatório (PDF)"}
            </button>

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
              Novo cliente
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
                    placeholder="CNPJ"
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
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
                  Endereço
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
                  Coleta e faturamento
                </div>
                <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#64748b", lineHeight: 1.45 }}>
                  Endereços em texto livre para operação e faturamento (complementam o endereço estruturado acima).
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <textarea
                    name="endereco_coleta"
                    value={form.endereco_coleta}
                    onChange={handleInputChange}
                    placeholder="Endereço de coleta (completo)"
                    rows={4}
                    style={textareaStyle}
                  />
                  <textarea
                    name="endereco_faturamento"
                    value={form.endereco_faturamento}
                    onChange={handleInputChange}
                    placeholder="Endereço de faturamento (completo)"
                    rows={4}
                    style={textareaStyle}
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

              <div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 800,
                    color: "#334155",
                    marginBottom: "12px",
                  }}
                >
                  Dados para MTR
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                  }}
                >
                  <input
                    name="licenca_numero"
                    value={form.licenca_numero}
                    onChange={handleInputChange}
                    placeholder="Número da licença ambiental"
                    style={inputStyle}
                  />

                  <input
                    type="date"
                    name="validade"
                    value={form.validade}
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
              placeholder="Busca (aguarda digitar — nome, razão social, CNPJ, cidade, e-mail NF, resíduo, endereços…)"
              title="Filtra por nome, razão social, CNPJ, cidade, tipo de resíduo, status, e-mail NF ou endereços de coleta/faturamento."
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
            <div style={{ overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
              <table
                style={{
                  width: "100%",
                  tableLayout: "fixed",
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
                        width: "4%",
                        minWidth: 56,
                        maxWidth: 72,
                        textAlign: "center",
                        padding: "10px 6px",
                      }}
                      title="Marcar cliente como inativo na lista"
                    >
                      Inativo
                    </th>
                    <th style={{ ...thStyle, width: "18%" }} title="Nome e localização (cidade e UF)">
                      Cliente
                    </th>
                    <th style={{ ...thStyle, width: "16%" }}>Razão social</th>
                    <th style={{ ...thStyle, width: "10%", whiteSpace: "nowrap" }}>CNPJ</th>
                    <th style={{ ...thStyle, width: "12%" }}>E-mail NF</th>
                    <th style={{ ...thStyle, width: "14%" }}>Resíduo</th>
                    <th style={{ ...thStyle, width: "5%", whiteSpace: "nowrap" }}>Classe</th>
                    <th
                      scope="col"
                      style={{
                        ...thStyle,
                        width: "7%",
                        whiteSpace: "normal",
                        lineHeight: 1.25,
                      }}
                      title="Licença válida até"
                    >
                      Validade
                    </th>
                    <th style={{ ...thStyle, width: "6%", whiteSpace: "nowrap" }}>Status</th>
                    <th style={{ ...thStyle, width: "8%", whiteSpace: "nowrap" }}>Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {clientes.map((cliente) => {
                    const linhaInativa = !clienteEstaAtivo(cliente.status);
                    return (
                    <tr
                      key={cliente.id}
                      style={{
                        borderBottom: "1px solid #eef2f7",
                        backgroundColor: linhaInativa ? "#fef2f2" : undefined,
                      }}
                    >
                      <td
                        style={{
                          ...tdStyle,
                          ...tdNowrap,
                          width: "4%",
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
                      <td style={tdStyle}>
                        {(() => {
                          const nomeBruto = (cliente.nome ?? "").trim();
                          const sep = " — ";
                          const idx = nomeBruto.indexOf(sep);
                          const parteNome = idx >= 0 ? nomeBruto.slice(0, idx) : nomeBruto;
                          const parteSufixo = idx >= 0 ? nomeBruto.slice(idx) : "";
                          const labelEdicao =
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
                                      onClick={() => void handleEditar(cliente)}
                                      style={nomeClienteEditarBtnStyle}
                                      title="Abrir cadastro para edição"
                                      aria-label={`Editar ${labelEdicao}`}
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
                                    onClick={() => void handleEditar(cliente)}
                                    style={nomeClienteEditarBtnStyle}
                                    title="Abrir cadastro para edição"
                                    aria-label={`Editar ${cliente.razao_social.trim()}`}
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
                      <td style={{ ...tdStyle, ...tdNowrap }}>{cliente.cnpj || "—"}</td>
                      <td
                        style={{
                          ...tdStyle,
                          wordBreak: "break-all",
                        }}
                        title={cliente.email_nf || undefined}
                      >
                        {cliente.email_nf || "-"}
                      </td>
                      <td style={tdStyle}>{cliente.tipo_residuo || "-"}</td>
                      <td style={{ ...tdStyle, ...tdNowrap }}>{cliente.classificacao || "-"}</td>
                      <td style={{ ...tdStyle, ...tdNowrap }}>{formatarData(cliente.validade)}</td>
                      <td style={{ ...tdStyle, ...tdNowrap }}>{cliente.status || "Ativo"}</td>
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
                  );
                  })}

                  {clientes.length === 0 && (
                    <tr>
                      <td
                        colSpan={10}
                        style={{
                          textAlign: "center",
                          padding: "28px 12px",
                          color: "#64748b",
                        }}
                      >
                        Nenhum cliente encontrado.
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

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: "96px",
  padding: "10px 12px",
  resize: "vertical",
  lineHeight: 1.45,
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

/** Botão invisível com aspecto de hiperligação — abre o formulário de edição (mesmo fluxo que «Editar»). */
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
