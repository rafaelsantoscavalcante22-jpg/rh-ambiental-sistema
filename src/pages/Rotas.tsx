import { useEffect, useMemo, useState, type CSSProperties } from "react";
import MainLayout from "../layouts/MainLayout";
import { COLETAS_LIST_MAX_ROWS } from "../lib/coletasQueryLimits";
import { supabase } from "../lib/supabase";

/** Colunas usadas na linha do tempo (evita `select *`). */
const COLETAS_SELECT_ROTAS =
  "id, numero, cliente, nome_cliente, data_agendada, data, data_coleta, created_at, tipo_servico, servico, tipo_residuo, etapa_operacional, status_processo, prioridade, caminhao, observacoes";

type EtapaFluxo =
  | "PROGRAMADA"
  | "MTR_EMITIDA"
  | "DOCUMENTACAO_ENTREGUE"
  | "COLETA_REALIZADA"
  | "CONTROLE_MASSA_LANCADO"
  | "LIBERADO_FINANCEIRO";

type Coleta = {
  id: string;
  numero?: string | null;
  cliente?: string | null;
  nome_cliente?: string | null;
  cliente_nome?: string | null;
  empresa?: string | null;
  data?: string | null;
  data_coleta?: string | null;
  data_agendada?: string | null;
  created_at?: string | null;
  tipo_servico?: string | null;
  servico?: string | null;
  tipo_residuo?: string | null;
  etapa_operacional?: string | null;
  status_processo?: string | null;
  prioridade?: string | null;
  caminhao?: string | null;
  observacoes?: string | null;
};

const ETAPAS_FLUXO: EtapaFluxo[] = [
  "PROGRAMADA",
  "MTR_EMITIDA",
  "DOCUMENTACAO_ENTREGUE",
  "COLETA_REALIZADA",
  "CONTROLE_MASSA_LANCADO",
  "LIBERADO_FINANCEIRO",
];

const etapaLabels: Record<EtapaFluxo, string> = {
  PROGRAMADA: "Programada",
  MTR_EMITIDA: "MTR emitida",
  DOCUMENTACAO_ENTREGUE: "Documentação entregue",
  COLETA_REALIZADA: "Coleta realizada",
  CONTROLE_MASSA_LANCADO: "Controle de massa lançado",
  LIBERADO_FINANCEIRO: "Liberado financeiro",
};

const etapaDescricoes: Record<EtapaFluxo, string> = {
  PROGRAMADA: "Solicitação recebida e coleta programada pelo operacional.",
  MTR_EMITIDA: "MTR emitida e documentação preparada.",
  DOCUMENTACAO_ENTREGUE: "Documentação entregue para execução logística.",
  COLETA_REALIZADA: "Coleta executada no cliente.",
  CONTROLE_MASSA_LANCADO: "Pesagem e controle de massa lançados no sistema.",
  LIBERADO_FINANCEIRO: "Processo concluído e liberado para financeiro.",
};

const etapaCores: Record<EtapaFluxo, string> = {
  PROGRAMADA: "#64748b",
  MTR_EMITIDA: "#2563eb",
  DOCUMENTACAO_ENTREGUE: "#0ea5e9",
  COLETA_REALIZADA: "#f97316",
  CONTROLE_MASSA_LANCADO: "#7c3aed",
  LIBERADO_FINANCEIRO: "#16a34a",
};

function obterCliente(coleta: Coleta) {
  return coleta.cliente || coleta.nome_cliente || coleta.cliente_nome || coleta.empresa || "-";
}

function obterServico(coleta: Coleta) {
  return coleta.tipo_servico || coleta.servico || "-";
}

function obterDataColeta(coleta: Coleta) {
  return coleta.data_agendada || coleta.data || coleta.data_coleta || coleta.created_at || null;
}

function formatarData(data?: string | null) {
  if (!data) return "-";
  const limpa = data.includes("T") ? data.split("T")[0] : data;
  const partes = limpa.split("-");
  if (partes.length !== 3) return data;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function normalizarFluxo(coleta: Coleta): EtapaFluxo {
  const etapa = coleta.etapa_operacional;

  if (etapa && ETAPAS_FLUXO.includes(etapa as EtapaFluxo)) {
    return etapa as EtapaFluxo;
  }

  switch (coleta.status_processo) {
    case "FATURAMENTO":
    case "FINALIZADO":
      return "LIBERADO_FINANCEIRO";
    case "APROVADO":
      return "CONTROLE_MASSA_LANCADO";
    case "EM_CONFERENCIA":
      return "COLETA_REALIZADA";
    case "MTR_EMITIDA":
      return "MTR_EMITIDA";
    case "AGUARDANDO_MTR":
    default:
      return "PROGRAMADA";
  }
}

function obterIndiceEtapa(etapa: EtapaFluxo) {
  return ETAPAS_FLUXO.indexOf(etapa);
}

export default function Rotas() {
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [buscaNumero, setBuscaNumero] = useState("");
  const [erro, setErro] = useState("");

  async function carregarColetas() {
    setCarregando(true);
    setErro("");

    const { data, error } = await supabase
      .from("coletas")
      .select(COLETAS_SELECT_ROTAS)
      .order("created_at", { ascending: false })
      .limit(Math.min(800, COLETAS_LIST_MAX_ROWS));

    if (error) {
      console.error("Erro ao carregar fluxo do processo:", error.message);
      setErro("Não foi possível carregar as coletas.");
      setColetas([]);
      setCarregando(false);
      return;
    }

    setColetas((data as Coleta[]) || []);
    setCarregando(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void carregarColetas();
    });
  }, []);

  const coletasFiltradas = useMemo(() => {
    const termo = buscaNumero.trim().toLowerCase();

    if (!termo) return coletas;

    return coletas.filter((coleta) =>
      String(coleta.numero || "").toLowerCase().includes(termo)
    );
  }, [coletas, buscaNumero]);

  const totalColetas = coletas.length;
  const emAndamento = coletas.filter((item) => {
    const etapa = normalizarFluxo(item);
    return etapa !== "LIBERADO_FINANCEIRO";
  }).length;
  const concluidas = coletas.filter(
    (item) => normalizarFluxo(item) === "LIBERADO_FINANCEIRO"
  ).length;

  return (
    <MainLayout>
      <div className="page-shell">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "26px",
                lineHeight: 1.15,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Linha do tempo
            </h1>

            <p className="page-header__lead" style={{ margin: "6px 0 0" }}>
              Visão do andamento de cada coleta (Programação → MTR → pesagem e etapas seguintes). Use o
              número para focar num registo.
            </p>
          </div>

          <button onClick={carregarColetas} style={secondaryButtonStyle}>
            Atualizar
          </button>
        </div>

        {erro && <div style={erroStyle}>{erro}</div>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
          }}
        >
          <div style={cardResumoStyle}>
            <div style={cardLabelStyle}>Coletas</div>
            <div style={cardValueStyle}>{totalColetas}</div>
          </div>

          <div style={cardResumoStyle}>
            <div style={cardLabelStyle}>Em andamento</div>
            <div style={cardValueStyle}>{emAndamento}</div>
          </div>

          <div style={cardResumoStyle}>
            <div style={cardLabelStyle}>Concluídas</div>
            <div style={cardValueStyle}>{concluidas}</div>
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "18px",
            padding: "18px",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                Buscar coleta
              </div>
              <div
                className="page-header__lead"
                style={{
                  margin: "4px 0 0",
                }}
              >
                Digite o número para abrir o detalhe e a linha do tempo.
              </div>
            </div>

            <input
              value={buscaNumero}
              onChange={(e) => setBuscaNumero(e.target.value)}
              placeholder="Digite o número da coleta"
              style={buscaInputStyle}
            />
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div
            style={{
              padding: "18px 20px",
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                color: "#0f172a",
                fontWeight: 800,
                fontSize: "24px",
                marginBottom: "4px",
              }}
            >
              Andamento por coleta
            </div>

            <div
              style={{
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              Cada barra reflete a etapa no fluxo (desde programação até liberação financeira).
            </div>
          </div>

          <div style={{ padding: "20px" }}>
            {carregando ? (
              <div style={emptyBoxStyle}>Carregando fluxo...</div>
            ) : coletasFiltradas.length === 0 ? (
              <div style={emptyBoxStyle}>Nenhuma coleta encontrada.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                {coletasFiltradas.map((coleta, index) => {
                  const etapaAtual = normalizarFluxo(coleta);
                  const indiceAtual = obterIndiceEtapa(etapaAtual);

                  return (
                    <div
                      key={coleta.id}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "18px",
                        padding: "18px",
                        background: "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: "14px",
                          marginBottom: "18px",
                        }}
                      >
                        <InfoBox
                          label="Número"
                          value={coleta.numero || `COL-${String(index + 1).padStart(3, "0")}`}
                        />
                        <InfoBox label="Cliente" value={obterCliente(coleta)} />
                        <InfoBox label="Data" value={formatarData(obterDataColeta(coleta))} />
                        <InfoBox label="Serviço" value={obterServico(coleta)} />
                        <InfoBox label="Caminhão" value={coleta.caminhao || "-"} />
                        <InfoBox label="Etapa atual" value={etapaLabels[etapaAtual]} />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "0",
                          flexWrap: "wrap",
                          alignItems: "stretch",
                        }}
                      >
                        {ETAPAS_FLUXO.map((etapa, etapaIndex) => {
                          const concluida = etapaIndex < indiceAtual;
                          const atual = etapaIndex === indiceAtual;
                          const pendente = etapaIndex > indiceAtual;

                          return (
                            <div
                              key={etapa}
                              style={{
                                flex: 1,
                                minWidth: "170px",
                                display: "flex",
                                alignItems: "stretch",
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  border: "1px solid #e2e8f0",
                                  background: atual
                                    ? etapaCores[etapa]
                                    : concluida
                                    ? "#dcfce7"
                                    : "#f8fafc",
                                  color: atual
                                    ? "#ffffff"
                                    : concluida
                                    ? "#166534"
                                    : "#64748b",
                                  padding: "14px 12px",
                                  borderRadius:
                                    etapaIndex === 0
                                      ? "12px 0 0 12px"
                                      : etapaIndex === ETAPAS_FLUXO.length - 1
                                      ? "0 12px 12px 0"
                                      : "0",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 800,
                                    fontSize: "13px",
                                    marginBottom: "6px",
                                  }}
                                >
                                  {etapaLabels[etapa]}
                                </div>

                                <div
                                  style={{
                                    fontSize: "12px",
                                    lineHeight: 1.4,
                                    opacity: atual ? 0.96 : 1,
                                  }}
                                >
                                  {etapaDescricoes[etapa]}
                                </div>

                                <div
                                  style={{
                                    marginTop: "10px",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                  }}
                                >
                                  {atual
                                    ? "ETAPA ATUAL"
                                    : concluida
                                    ? "CONCLUÍDA"
                                    : pendente
                                    ? "PENDENTE"
                                    : ""}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {coleta.observacoes && (
                        <div
                          style={{
                            marginTop: "16px",
                            padding: "14px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: "12px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: 800,
                              color: "#334155",
                              marginBottom: "6px",
                            }}
                          >
                            Observações
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "#475569",
                              lineHeight: 1.5,
                            }}
                          >
                            {coleta.observacoes}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </MainLayout>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "14px",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "12px",
          marginBottom: "6px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: "#0f172a",
          fontSize: "16px",
          fontWeight: 800,
          lineHeight: 1.3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const secondaryButtonStyle: CSSProperties = {
  background: "#ffffff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 18px",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

const buscaInputStyle: CSSProperties = {
  minWidth: "320px",
  maxWidth: "420px",
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  color: "#0f172a",
  fontSize: "14px",
  outline: "none",
};

const cardResumoStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "18px",
  padding: "18px",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const cardLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "13px",
  marginBottom: "8px",
};

const cardValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "42px",
  fontWeight: 800,
};

const emptyBoxStyle: CSSProperties = {
  padding: "30px 16px",
  textAlign: "center",
  color: "#64748b",
  fontSize: "14px",
  border: "1px dashed #cbd5e1",
  borderRadius: "14px",
  background: "#f8fafc",
};

const erroStyle: CSSProperties = {
  padding: "14px 16px",
  backgroundColor: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: "12px",
};