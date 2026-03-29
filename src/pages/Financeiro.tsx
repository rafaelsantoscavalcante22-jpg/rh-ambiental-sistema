import { useEffect, useMemo, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import { supabase } from "../lib/supabase";

type StatusPagamento = "Pago" | "Pendente" | "Parcial" | "Cancelado";

type Coleta = {
  id: string;
  numero: string;
  cliente: string;
  data_agendada: string;
  tipo_residuo: string;
  prioridade: string;
  status: string;
  valor_coleta: number | null;
  status_pagamento: StatusPagamento | null;
  data_vencimento: string | null;
};

type ResumoCliente = {
  cliente: string;
  quantidade: number;
  total: number;
  pago: number;
  pendente: number;
  parcial: number;
  cancelado: number;
  vencido: number;
  aVencer: number;
};

type ResumoResiduo = {
  tipo_residuo: string;
  quantidade: number;
};

const STATUS_PAGAMENTO_OPTIONS: StatusPagamento[] = [
  "Pago",
  "Pendente",
  "Parcial",
  "Cancelado",
];

export default function Financeiro() {
  const [loading, setLoading] = useState(true);
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroPagamento, setFiltroPagamento] = useState("Todos");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);

    const { data, error } = await supabase
      .from("coletas")
      .select(
        "id, numero, cliente, data_agendada, tipo_residuo, prioridade, status, valor_coleta, status_pagamento, data_vencimento"
      )
      .order("data_agendada", { ascending: false });

    if (error) {
      console.error("Erro ao carregar financeiro:", error);
      alert("Erro ao carregar financeiro: " + error.message);
      setColetas([]);
      setLoading(false);
      return;
    }

    const registros = ((data as Coleta[]) || []).filter((item) =>
      String(item.status || "").toLowerCase().includes("final")
    );

    setColetas(registros);
    setLoading(false);
  }

  async function atualizarCampo(
    id: string,
    campo: "valor_coleta" | "status_pagamento" | "data_vencimento",
    valor: string | number | null
  ) {
    setSalvandoId(id);

    const { error } = await supabase
      .from("coletas")
      .update({
        [campo]: valor === "" ? null : valor,
      })
      .eq("id", id);

    if (error) {
      console.error("Erro ao atualizar coleta:", error);
      alert("Erro ao salvar alteração: " + error.message);
      setSalvandoId(null);
      return;
    }

    setColetas((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              [campo]: valor === "" ? null : valor,
            }
          : item
      )
    );

    setSalvandoId(null);
  }

  function formatarData(data?: string | null) {
    if (!data) return "-";
    const limpa = data.includes("T") ? data.split("T")[0] : data;
    const partes = limpa.split("-");
    if (partes.length !== 3) return data;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function normalizarDataInput(data?: string | null) {
    if (!data) return "";
    return data.includes("T") ? data.split("T")[0] : data;
  }

  function formatarMoeda(valor?: number | null) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function escaparCSV(valor: string | number | null | undefined) {
    const texto = String(valor ?? "");
    if (texto.includes(",") || texto.includes('"') || texto.includes("\n")) {
      return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
  }

  function baixarCSV(nomeArquivo: string, linhas: string[]) {
    const conteudo = "\uFEFF" + linhas.join("\n");
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", nomeArquivo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  }

  function dataInicioHoje() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return hoje;
  }

  function isVencido(item: Coleta) {
    if (!item.data_vencimento) return false;
    if (item.status_pagamento === "Pago" || item.status_pagamento === "Cancelado") {
      return false;
    }

    const hoje = dataInicioHoje();
    const vencimento = new Date(item.data_vencimento);
    vencimento.setHours(0, 0, 0, 0);

    return vencimento < hoje;
  }

  function isVenceHoje(item: Coleta) {
    if (!item.data_vencimento) return false;
    if (item.status_pagamento === "Pago" || item.status_pagamento === "Cancelado") {
      return false;
    }

    const hoje = dataInicioHoje();
    const vencimento = new Date(item.data_vencimento);
    vencimento.setHours(0, 0, 0, 0);

    return vencimento.getTime() === hoje.getTime();
  }

  function isAVencer(item: Coleta) {
    if (!item.data_vencimento) return false;
    if (item.status_pagamento === "Pago" || item.status_pagamento === "Cancelado") {
      return false;
    }

    const hoje = dataInicioHoje();
    const vencimento = new Date(item.data_vencimento);
    vencimento.setHours(0, 0, 0, 0);

    return vencimento > hoje;
  }

  const coletasFiltradas = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    return coletas.filter((item) => {
      const matchBusca =
        !termo ||
        String(item.numero || "").toLowerCase().includes(termo) ||
        String(item.cliente || "").toLowerCase().includes(termo) ||
        String(item.tipo_residuo || "").toLowerCase().includes(termo) ||
        String(item.prioridade || "").toLowerCase().includes(termo) ||
        String(item.status || "").toLowerCase().includes(termo) ||
        String(item.status_pagamento || "").toLowerCase().includes(termo);

      const matchPagamento =
        filtroPagamento === "Todos"
          ? true
          : (item.status_pagamento || "Pendente") === filtroPagamento;

      return matchBusca && matchPagamento;
    });
  }, [coletas, busca, filtroPagamento]);

  const totais = useMemo(() => {
    let valorTotal = 0;
    let recebido = 0;
    let pendente = 0;
    let parcial = 0;
    let vencido = 0;
    let aVencer = 0;
    let venceHoje = 0;

    for (const item of coletasFiltradas) {
      const valor = Number(item.valor_coleta || 0);
      const statusPagamento = item.status_pagamento || "Pendente";

      valorTotal += valor;

      if (statusPagamento === "Pago") recebido += valor;
      if (statusPagamento === "Pendente") pendente += valor;
      if (statusPagamento === "Parcial") parcial += valor;
      if (isVencido(item)) vencido += valor;
      if (isAVencer(item)) aVencer += valor;
      if (isVenceHoje(item)) venceHoje += valor;
    }

    return {
      valorTotal,
      recebido,
      pendente,
      parcial,
      vencido,
      aVencer,
      venceHoje,
    };
  }, [coletasFiltradas]);

  const contasReceber = useMemo(() => {
    return coletasFiltradas
      .filter(
        (item) =>
          item.status_pagamento !== "Pago" && item.status_pagamento !== "Cancelado"
      )
      .sort((a, b) => {
        const dataA = itemDateValue(a.data_vencimento);
        const dataB = itemDateValue(b.data_vencimento);
        return dataA - dataB;
      });
  }, [coletasFiltradas]);

  const contasVencidas = useMemo(
    () => contasReceber.filter((item) => isVencido(item)),
    [contasReceber]
  );

  const contasHoje = useMemo(
    () => contasReceber.filter((item) => isVenceHoje(item)),
    [contasReceber]
  );

  const contasAVencer = useMemo(
    () => contasReceber.filter((item) => isAVencer(item)),
    [contasReceber]
  );

  const resumoPorCliente = useMemo<ResumoCliente[]>(() => {
    const mapa = new Map<string, ResumoCliente>();

    for (const item of coletasFiltradas) {
      const cliente = item.cliente || "Não informado";
      const valor = Number(item.valor_coleta || 0);
      const statusPagamento = item.status_pagamento || "Pendente";

      if (!mapa.has(cliente)) {
        mapa.set(cliente, {
          cliente,
          quantidade: 0,
          total: 0,
          pago: 0,
          pendente: 0,
          parcial: 0,
          cancelado: 0,
          vencido: 0,
          aVencer: 0,
        });
      }

      const atual = mapa.get(cliente)!;
      atual.quantidade += 1;
      atual.total += valor;

      if (statusPagamento === "Pago") atual.pago += valor;
      if (statusPagamento === "Pendente") atual.pendente += valor;
      if (statusPagamento === "Parcial") atual.parcial += valor;
      if (statusPagamento === "Cancelado") atual.cancelado += valor;
      if (isVencido(item)) atual.vencido += valor;
      if (isAVencer(item)) atual.aVencer += valor;
    }

    return Array.from(mapa.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [coletasFiltradas]);

  const resumoPorResiduo = useMemo<ResumoResiduo[]>(() => {
    const mapa = new Map<string, number>();

    for (const item of coletasFiltradas) {
      const tipo = item.tipo_residuo || "Não informado";
      mapa.set(tipo, (mapa.get(tipo) || 0) + 1);
    }

    return Array.from(mapa.entries())
      .map(([tipo_residuo, quantidade]) => ({ tipo_residuo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }, [coletasFiltradas]);

  function exportarCSV() {
    const linhas = [
      [
        "Número",
        "Cliente",
        "Data",
        "Vencimento",
        "Resíduo",
        "Prioridade",
        "Status Operacional",
        "Valor",
        "Status Pagamento",
        "Vencido",
      ].join(","),
      ...coletasFiltradas.map((item) =>
        [
          escaparCSV(item.numero),
          escaparCSV(item.cliente),
          escaparCSV(formatarData(item.data_agendada)),
          escaparCSV(formatarData(item.data_vencimento)),
          escaparCSV(item.tipo_residuo),
          escaparCSV(item.prioridade),
          escaparCSV(item.status),
          escaparCSV(Number(item.valor_coleta || 0).toFixed(2).replace(".", ",")),
          escaparCSV(item.status_pagamento || "Pendente"),
          escaparCSV(isVencido(item) ? "Sim" : "Não"),
        ].join(",")
      ),
    ];

    baixarCSV("financeiro_coletas_finalizadas.csv", linhas);
  }

  function exportarContasReceberCSV() {
    const linhas = [
      [
        "Número",
        "Cliente",
        "Vencimento",
        "Valor",
        "Status Pagamento",
        "Situação",
      ].join(","),
      ...contasReceber.map((item) =>
        [
          escaparCSV(item.numero),
          escaparCSV(item.cliente),
          escaparCSV(formatarData(item.data_vencimento)),
          escaparCSV(Number(item.valor_coleta || 0).toFixed(2).replace(".", ",")),
          escaparCSV(item.status_pagamento || "Pendente"),
          escaparCSV(
            isVencido(item)
              ? "Vencido"
              : isVenceHoje(item)
              ? "Vence hoje"
              : "A vencer"
          ),
        ].join(",")
      ),
    ];

    baixarCSV("contas_a_receber.csv", linhas);
  }

  function corPrioridade(prioridade?: string) {
    const valor = String(prioridade || "").toLowerCase();

    if (valor === "urgente") {
      return { background: "#fee2e2", color: "#dc2626" };
    }

    if (valor === "alta") {
      return { background: "#ffedd5", color: "#ea580c" };
    }

    if (valor === "média" || valor === "media") {
      return { background: "#dbeafe", color: "#2563eb" };
    }

    return { background: "#dcfce7", color: "#16a34a" };
  }

  function corPagamento(status?: string | null) {
    if (status === "Pago") {
      return { background: "#dcfce7", color: "#15803d" };
    }

    if (status === "Parcial") {
      return { background: "#dbeafe", color: "#1d4ed8" };
    }

    if (status === "Cancelado") {
      return { background: "#fee2e2", color: "#dc2626" };
    }

    return { background: "#fef3c7", color: "#d97706" };
  }

  return (
    <MainLayout>
      <div style={{ padding: "20px 24px 28px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Financeiro
            </h1>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12,
                color: "#64748b",
              }}
            >
              Controle financeiro das coletas finalizadas
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={exportarCSV}
              style={botaoAzulStyle}
            >
              Exportar financeiro
            </button>

            <button
              onClick={exportarContasReceberCSV}
              style={botaoAzulStyle}
            >
              Exportar contas a receber
            </button>

            <button
              onClick={carregar}
              style={botaoAzulStyle}
            >
              Atualizar financeiro
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <CardResumo titulo="Coletas finalizadas" valor={String(coletasFiltradas.length)} />
          <CardResumo titulo="Valor total" valor={formatarMoeda(totais.valorTotal)} />
          <CardResumo titulo="Recebido" valor={formatarMoeda(totais.recebido)} />
          <CardResumo titulo="Pendente" valor={formatarMoeda(totais.pendente)} />
          <CardResumo titulo="Parcial" valor={formatarMoeda(totais.parcial)} />
          <CardResumo titulo="Vencido" valor={formatarMoeda(totais.vencido)} />
          <CardResumo titulo="Vence hoje" valor={formatarMoeda(totais.venceHoje)} />
          <CardResumo titulo="A vencer" valor={formatarMoeda(totais.aVencer)} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.65fr 1fr",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 14,
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  Coletas finalizadas
                </h2>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  Valor, pagamento e vencimento com edição direta
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  width: "100%",
                  maxWidth: 520,
                  justifyContent: "flex-end",
                }}
              >
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por número, cliente, resíduo, prioridade, status ou pagamento"
                  style={inputStyle}
                />

                <select
                  value={filtroPagamento}
                  onChange={(e) => setFiltroPagamento(e.target.value)}
                  style={{ ...inputStyle, width: 160, flex: "unset", minWidth: 160 }}
                >
                  <option value="Todos">Todos pagamentos</option>
                  {STATUS_PAGAMENTO_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    {[
                      "Número",
                      "Cliente",
                      "Data",
                      "Vencimento",
                      "Resíduo",
                      "Prioridade",
                      "Valor",
                      "Pagamento",
                      "Situação",
                    ].map((coluna) => (
                      <th
                        key={coluna}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          color: "#64748b",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {coluna}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={tdCentral}>
                        Carregando...
                      </td>
                    </tr>
                  ) : coletasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={tdCentral}>
                        Nenhuma coleta finalizada encontrada.
                      </td>
                    </tr>
                  ) : (
                    coletasFiltradas.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #eef2f7" }}>
                        <td style={tdStyle}>{item.numero || "-"}</td>
                        <td style={tdStyle}>{item.cliente || "-"}</td>
                        <td style={tdStyle}>{formatarData(item.data_agendada)}</td>
                        <td style={tdStyle}>
                          <input
                            type="date"
                            value={normalizarDataInput(item.data_vencimento)}
                            onChange={(e) =>
                              atualizarCampo(
                                item.id,
                                "data_vencimento",
                                e.target.value || null
                              )
                            }
                            style={{ ...inputMiniStyle, width: 140 }}
                          />
                        </td>
                        <td style={tdStyle}>{item.tipo_residuo || "-"}</td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              ...corPrioridade(item.prioridade),
                              display: "inline-block",
                              padding: "4px 10px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {item.prioridade || "-"}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <input
                            type="number"
                            step="0.01"
                            defaultValue={Number(item.valor_coleta || 0)}
                            onBlur={(e) =>
                              atualizarCampo(
                                item.id,
                                "valor_coleta",
                                Number(e.target.value || 0)
                              )
                            }
                            style={{ ...inputMiniStyle, width: 110 }}
                          />
                        </td>
                        <td style={tdStyle}>
                          <select
                            value={item.status_pagamento || "Pendente"}
                            onChange={(e) =>
                              atualizarCampo(item.id, "status_pagamento", e.target.value)
                            }
                            style={{ ...inputMiniStyle, width: 120 }}
                          >
                            {STATUS_PAGAMENTO_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              alignItems: "flex-start",
                            }}
                          >
                            <span
                              style={{
                                ...corPagamento(item.status_pagamento || "Pendente"),
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {item.status_pagamento || "Pendente"}
                            </span>

                            {isVencido(item) && (
                              <span style={badgeVermelho}>Vencido</span>
                            )}

                            {isVenceHoje(item) && (
                              <span style={badgeRoxo}>Vence hoje</span>
                            )}

                            {isAVencer(item) && (
                              <span style={badgeLilás}>A vencer</span>
                            )}

                            {salvandoId === item.id && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                }}
                              >
                                Salvando...
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <BlocoResumoClientes titulo="Resumo por cliente" linhas={resumoPorCliente} />
            <BlocoResumoResiduo titulo="Tipos de resíduo" linhas={resumoPorResiduo} />
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            padding: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                Contas a receber
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                Visão rápida das cobranças pendentes, parciais e vencimentos
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <MiniCardResumo
                titulo="Vencidas"
                valor={`${contasVencidas.length} | ${formatarMoeda(
                  somarValores(contasVencidas)
                )}`}
                cor="#dc2626"
              />
              <MiniCardResumo
                titulo="Vencem hoje"
                valor={`${contasHoje.length} | ${formatarMoeda(
                  somarValores(contasHoje)
                )}`}
                cor="#7c3aed"
              />
              <MiniCardResumo
                titulo="A vencer"
                valor={`${contasAVencer.length} | ${formatarMoeda(
                  somarValores(contasAVencer)
                )}`}
                cor="#2563eb"
              />
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  {[
                    "Número",
                    "Cliente",
                    "Data",
                    "Vencimento",
                    "Valor",
                    "Pagamento",
                    "Situação",
                  ].map((coluna) => (
                    <th
                      key={coluna}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        color: "#64748b",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {coluna}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={tdCentral}>
                      Carregando...
                    </td>
                  </tr>
                ) : contasReceber.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={tdCentral}>
                      Nenhuma conta a receber encontrada.
                    </td>
                  </tr>
                ) : (
                  contasReceber.map((item) => (
                    <tr key={`receber-${item.id}`} style={{ borderBottom: "1px solid #eef2f7" }}>
                      <td style={tdStyle}>{item.numero || "-"}</td>
                      <td style={tdStyle}>{item.cliente || "-"}</td>
                      <td style={tdStyle}>{formatarData(item.data_agendada)}</td>
                      <td style={tdStyle}>{formatarData(item.data_vencimento)}</td>
                      <td style={tdStyle}>{formatarMoeda(item.valor_coleta)}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...corPagamento(item.status_pagamento || "Pendente"),
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {item.status_pagamento || "Pendente"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {isVencido(item) ? (
                          <span style={badgeVermelho}>Vencido</span>
                        ) : isVenceHoje(item) ? (
                          <span style={badgeRoxo}>Vence hoje</span>
                        ) : (
                          <span style={badgeLilás}>A vencer</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

function itemDateValue(data?: string | null) {
  if (!data) return Number.MAX_SAFE_INTEGER;
  const dt = new Date(data);
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

function somarValores(itens: Coleta[]) {
  return itens.reduce((acc, item) => acc + Number(item.valor_coleta || 0), 0);
}

function CardResumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 14,
        padding: 14,
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        minHeight: 82,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#64748b",
          marginBottom: 10,
        }}
      >
        {titulo}
      </div>

      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "#0f172a",
          lineHeight: 1.3,
        }}
      >
        {valor}
      </div>
    </div>
  );
}

function MiniCardResumo({
  titulo,
  valor,
  cor,
}: {
  titulo: string;
  valor: string;
  cor: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "10px 12px",
        minWidth: 170,
        background: "#fff",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#64748b",
          marginBottom: 6,
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: cor,
        }}
      >
        {valor}
      </div>
    </div>
  );
}

function BlocoResumoClientes({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: ResumoCliente[];
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        padding: 14,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          {titulo}
        </h2>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {linhas.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Nenhum dado disponível.
          </div>
        ) : (
          linhas.map((item) => (
            <div
              key={`${titulo}-${item.cliente}`}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "#0f172a",
                    fontWeight: 600,
                  }}
                >
                  {item.cliente}
                </span>

                <span
                  style={{
                    fontSize: 12,
                    color: "#64748b",
                    fontWeight: 700,
                  }}
                >
                  {item.quantidade} coleta(s)
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 6,
                  fontSize: 11,
                  color: "#475569",
                }}
              >
                <span>Total: {formatarMoedaHelper(item.total)}</span>
                <span>Pago: {formatarMoedaHelper(item.pago)}</span>
                <span>Pendente: {formatarMoedaHelper(item.pendente)}</span>
                <span>Parcial: {formatarMoedaHelper(item.parcial)}</span>
                <span>Vencido: {formatarMoedaHelper(item.vencido)}</span>
                <span>A vencer: {formatarMoedaHelper(item.aVencer)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BlocoResumoResiduo({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: ResumoResiduo[];
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
        padding: 14,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          {titulo}
        </h2>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {linhas.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Nenhum dado disponível.
          </div>
        ) : (
          linhas.map((item) => (
            <div
              key={`${titulo}-${item.tipo_residuo}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "#0f172a",
                  fontWeight: 500,
                }}
              >
                {item.tipo_residuo}
              </span>

              <span
                style={{
                  fontSize: 12,
                  color: "#64748b",
                  fontWeight: 700,
                }}
              >
                {item.quantidade}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatarMoedaHelper(valor?: number | null) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const botaoAzulStyle: React.CSSProperties = {
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  height: 40,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 240,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 12,
  outline: "none",
  background: "#fff",
};

const inputMiniStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
  outline: "none",
  background: "#fff",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
};

const tdCentral: React.CSSProperties = {
  padding: 20,
  textAlign: "center",
  color: "#64748b",
};

const badgeVermelho: React.CSSProperties = {
  background: "#fee2e2",
  color: "#dc2626",
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
};

const badgeRoxo: React.CSSProperties = {
  background: "#ede9fe",
  color: "#7c3aed",
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
};

const badgeLilás: React.CSSProperties = {
  background: "#eff6ff",
  color: "#2563eb",
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
};