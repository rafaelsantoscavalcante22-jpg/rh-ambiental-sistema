import { useEffect, useState } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'

type Cliente = {
  id: string
  nome: string
  status: string
  cidade: string
  tipo_residuo: string
}

type MTR = {
  id: string
  nome_cliente: string
  tipo_residuo: string
  destino_final: string
  status: string
  data_coleta: string
}

function Dashboard() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [mtrs, setMtrs] = useState<MTR[]>([])
  const [carregando, setCarregando] = useState(true)

  async function carregarDashboard() {
    setCarregando(true)

    const { data: clientesData, error: clientesError } = await supabase
      .from('clientes')
      .select('id, nome, status, cidade, tipo_residuo')
      .order('nome', { ascending: true })

    const { data: mtrsData, error: mtrsError } = await supabase
      .from('mtrs')
      .select('id, nome_cliente, tipo_residuo, destino_final, status, data_coleta')
      .order('created_at', { ascending: false })

    setCarregando(false)

    if (clientesError) {
      console.error('Erro ao buscar clientes:', clientesError.message)
      alert('Erro ao carregar clientes: ' + clientesError.message)
      return
    }

    if (mtrsError) {
      console.error('Erro ao buscar MTRs:', mtrsError.message)
      alert('Erro ao carregar MTRs: ' + mtrsError.message)
      return
    }

    setClientes(clientesData || [])
    setMtrs(mtrsData || [])
  }

  function formatarDataBr(dataIso: string) {
    if (!dataIso) return '-'

    const partes = dataIso.split('-')
    if (partes.length !== 3) return dataIso

    const [ano, mes, dia] = partes
    return `${dia}/${mes}/${ano}`
  }

  useEffect(() => {
    carregarDashboard()
  }, [])

  const totalClientes = clientes.length
  const clientesAtivos = clientes.filter((cliente) => cliente.status === 'Ativo').length
  const totalMtrs = mtrs.length
  const mtrsEmitidas = mtrs.filter((mtr) => mtr.status === 'Emitida').length
  const mtrsConcluidas = mtrs.filter((mtr) => mtr.status === 'Concluída').length
  const mtrsRascunho = mtrs.filter((mtr) => mtr.status === 'Rascunho').length

  const ultimasMtrs = mtrs.slice(0, 5)
  const ultimosClientes = clientes.slice(0, 5)

  return (
    <MainLayout>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '32px' }}>Dashboard</h1>
          <p style={{ margin: '8px 0 0', color: '#64748b' }}>
            Visão geral da operação da RG Ambiental
          </p>
        </div>

        <button onClick={carregarDashboard} style={botaoAtualizarStyle}>
          Atualizar painel
        </button>
      </div>

      {carregando ? (
        <div style={cardContainerStyle}>
          <div style={cardStyle}>
            <h3 style={{ margin: 0 }}>Carregando dashboard...</h3>
          </div>
        </div>
      ) : (
        <>
          <div style={cardsGridStyle}>
            <div style={cardIndicadorStyle}>
              <div style={cardTituloStyle}>Total de clientes</div>
              <div style={cardNumeroStyle}>{totalClientes}</div>
              <div style={cardRodapeStyle}>Base cadastrada</div>
            </div>

            <div style={cardIndicadorStyle}>
              <div style={cardTituloStyle}>Clientes ativos</div>
              <div style={cardNumeroStyle}>{clientesAtivos}</div>
              <div style={cardRodapeStyle}>Em operação</div>
            </div>

            <div style={cardIndicadorStyle}>
              <div style={cardTituloStyle}>Total de MTRs</div>
              <div style={cardNumeroStyle}>{totalMtrs}</div>
              <div style={cardRodapeStyle}>Registros emitidos</div>
            </div>

            <div style={cardIndicadorStyle}>
              <div style={cardTituloStyle}>MTRs emitidas</div>
              <div style={cardNumeroStyle}>{mtrsEmitidas}</div>
              <div style={cardRodapeStyle}>Status emitida</div>
            </div>
          </div>

          <div style={cardsGridStyleSecundario}>
            <div style={cardResumoStyle}>
              <h3 style={tituloSecaoStyle}>Resumo de status das MTRs</h3>

              <div style={linhaResumoStyle}>
                <span>Rascunho</span>
                <strong>{mtrsRascunho}</strong>
              </div>

              <div style={linhaResumoStyle}>
                <span>Emitida</span>
                <strong>{mtrsEmitidas}</strong>
              </div>

              <div style={linhaResumoStyle}>
                <span>Concluída</span>
                <strong>{mtrsConcluidas}</strong>
              </div>
            </div>

            <div style={cardResumoStyle}>
              <h3 style={tituloSecaoStyle}>Resumo de clientes</h3>

              <div style={linhaResumoStyle}>
                <span>Ativos</span>
                <strong>{clientes.filter((c) => c.status === 'Ativo').length}</strong>
              </div>

              <div style={linhaResumoStyle}>
                <span>Inativos</span>
                <strong>{clientes.filter((c) => c.status === 'Inativo').length}</strong>
              </div>

              <div style={linhaResumoStyle}>
                <span>Bloqueados</span>
                <strong>{clientes.filter((c) => c.status === 'Bloqueado').length}</strong>
              </div>
            </div>
          </div>

          <div style={duasColunasStyle}>
            <div style={cardTabelaStyle}>
              <div style={cabecalhoTabelaStyle}>
                <h3 style={tituloSecaoStyle}>Últimas MTRs</h3>
              </div>

              {ultimasMtrs.length === 0 ? (
                <div style={vazioStyle}>Nenhuma MTR cadastrada ainda.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={tabelaStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Cliente</th>
                        <th style={thStyle}>Resíduo</th>
                        <th style={thStyle}>Destino</th>
                        <th style={thStyle}>Data</th>
                        <th style={thStyle}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ultimasMtrs.map((mtr) => (
                        <tr key={mtr.id}>
                          <td style={tdStyle}>{mtr.nome_cliente}</td>
                          <td style={tdStyle}>{mtr.tipo_residuo}</td>
                          <td style={tdStyle}>{mtr.destino_final}</td>
                          <td style={tdStyle}>{formatarDataBr(mtr.data_coleta)}</td>
                          <td style={tdStyle}>{mtr.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={cardTabelaStyle}>
              <div style={cabecalhoTabelaStyle}>
                <h3 style={tituloSecaoStyle}>Últimos clientes</h3>
              </div>

              {ultimosClientes.length === 0 ? (
                <div style={vazioStyle}>Nenhum cliente cadastrado ainda.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={tabelaStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Nome</th>
                        <th style={thStyle}>Cidade</th>
                        <th style={thStyle}>Resíduo</th>
                        <th style={thStyle}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ultimosClientes.map((cliente) => (
                        <tr key={cliente.id}>
                          <td style={tdStyle}>{cliente.nome}</td>
                          <td style={tdStyle}>{cliente.cidade}</td>
                          <td style={tdStyle}>{cliente.tipo_residuo}</td>
                          <td style={tdStyle}>{cliente.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </MainLayout>
  )
}

const cardsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
  marginBottom: '20px',
}

const cardsGridStyleSecundario = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '16px',
  marginBottom: '20px',
}

const duasColunasStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
  gap: '16px',
}

const cardContainerStyle = {
  display: 'grid',
  gap: '16px',
}

const cardStyle = {
  background: '#ffffff',
  borderRadius: '14px',
  padding: '20px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
}

const cardIndicadorStyle = {
  background: '#ffffff',
  borderRadius: '14px',
  padding: '20px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
}

const cardResumoStyle = {
  background: '#ffffff',
  borderRadius: '14px',
  padding: '20px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
}

const cardTabelaStyle = {
  background: '#ffffff',
  borderRadius: '14px',
  padding: '20px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
}

const cardTituloStyle = {
  fontSize: '14px',
  color: '#64748b',
  marginBottom: '10px',
}

const cardNumeroStyle = {
  fontSize: '34px',
  fontWeight: 700,
  color: '#0f172a',
  lineHeight: 1,
}

const cardRodapeStyle = {
  marginTop: '10px',
  fontSize: '13px',
  color: '#94a3b8',
}

const tituloSecaoStyle = {
  margin: 0,
  fontSize: '18px',
  color: '#0f172a',
}

const linhaResumoStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: '1px solid #e5e7eb',
  fontSize: '14px',
  color: '#334155',
}

const cabecalhoTabelaStyle = {
  marginBottom: '16px',
}

const vazioStyle = {
  padding: '20px',
  textAlign: 'center' as const,
  color: '#64748b',
  border: '1px dashed #d1d5db',
  borderRadius: '10px',
  background: '#f8fafc',
}

const tabelaStyle = {
  width: '100%',
  borderCollapse: 'collapse' as const,
}

const thStyle = {
  textAlign: 'left' as const,
  padding: '12px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: '13px',
  color: '#64748b',
  background: '#f8fafc',
}

const tdStyle = {
  padding: '12px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: '14px',
  color: '#0f172a',
}

const botaoAtualizarStyle = {
  backgroundColor: '#16a34a',
  color: '#fff',
  border: 'none',
  padding: '10px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
}

export default Dashboard