import type { CSSProperties } from 'react'
import {
  CHECKLIST_MOTORISTA_COL_DIR,
  CHECKLIST_MOTORISTA_COL_ESQ,
  type ItemChecklistMotorista,
  type RespostasChecklistMotorista,
} from '../lib/checklistMotoristaItens'
import type { FolhaConferenciaTransporte } from '../lib/conferenciaTransporteFolha'
import { ROTAS_CONFERENCIA_LINHAS } from '../lib/conferenciaTransporteFolha'

const cell: CSSProperties = {
  border: '1px solid #000',
  padding: '4px 6px',
  fontSize: '9pt',
  verticalAlign: 'middle',
}

const th: CSSProperties = {
  ...cell,
  fontWeight: 700,
  textAlign: 'center',
  background: '#f5f5f5',
}

function marcacoesSimNao(v: boolean | null | undefined): string {
  const sim = v === true ? 'X' : '\u00a0'
  const nao = v === false ? 'X' : '\u00a0'
  return `( ${sim} ) SIM    ( ${nao} ) NÃO`
}

function rotuloItemImpressao(label: string) {
  return label.replace(/EPI's/g, 'EPIs')
}

function renderColunaItens(itens: readonly ItemChecklistMotorista[], startNum: number, r: RespostasChecklistMotorista) {
  return itens.map((item, idx) => {
    const n = startNum + idx
    return (
      <tr key={item.id}>
        <td style={{ ...cell, width: 28, textAlign: 'center', fontWeight: 700 }}>{n}</td>
        <td style={{ ...cell, textAlign: 'left' }}>{rotuloItemImpressao(item.label)}</td>
        <td style={{ ...cell, fontSize: '8.5pt', whiteSpace: 'nowrap' }}>{marcacoesSimNao(r[item.id])}</td>
      </tr>
    )
  })
}

export type ColetaConferenciaPrint = {
  numero: string
  cliente: string
  placa: string
  motorista: string
  mtr_numero: string
}

export type ConferenciaTransporteFolhaPrintProps = {
  logoSrc: string
  coleta: ColetaConferenciaPrint
  folha: FolhaConferenciaTransporte
  dataExibicao: string
  respostas: RespostasChecklistMotorista
  assinaturaMotorista: string
  assinaturaResponsavel: string
}

/**
 * Layout A4 alinhado ao modelo papel «RG Ambiental Transportes Ltda» (conferência de caminhão).
 */
export function ConferenciaTransporteFolhaPrintView({
  logoSrc,
  coleta,
  folha,
  dataExibicao,
  respostas,
  assinaturaMotorista,
  assinaturaResponsavel,
}: ConferenciaTransporteFolhaPrintProps) {
  const placaTxt = coleta.placa || '___________'
  const motoristaTxt = coleta.motorista || '___________'
  const veiculoTxt = folha.veiculo.trim() || '___________'

  return (
    <div
      style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#000',
        fontSize: '9.5pt',
        lineHeight: 1.35,
        maxWidth: '190mm',
        margin: '0 auto',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <img src={logoSrc} alt="" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: '12pt', paddingTop: 4 }}>
          RG Ambiental Transportes Ltda
        </div>
        <div style={{ width: 72 }} />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: '16%' }}>
              <strong>Data</strong>
            </td>
            <td style={{ ...cell, width: '17%' }}>{dataExibicao}</td>
            <td style={{ ...cell, width: '16%' }}>
              <strong>Placa</strong>
            </td>
            <td style={{ ...cell, width: '17%' }}>{placaTxt}</td>
            <td style={{ ...cell, width: '17%' }}>
              <strong>Ticket nº</strong>
            </td>
            <td style={{ ...cell, width: '17%' }}>{folha.numeroTicket.trim() || '—'}</td>
          </tr>
          <tr>
            <td style={cell}>
              <strong>Horário saída RG</strong>
            </td>
            <td style={cell}>{folha.horarioSaidaRg.trim() || '\u00a0'}</td>
            <td style={cell}>
              <strong>Horário chegada</strong>
            </td>
            <td style={cell}>{folha.horarioChegada.trim() || '\u00a0'}</td>
            <td style={cell}>
              <strong>Pedágio</strong>
            </td>
            <td style={cell}>
              {folha.pedagio1.trim() || '—'} / {folha.pedagio2.trim() || '—'}
            </td>
          </tr>
          <tr>
            <td style={cell}>
              <strong>Nome motorista</strong>
            </td>
            <td style={cell} colSpan={2}>
              {motoristaTxt}
            </td>
            <td style={cell}>
              <strong>Nome ajudante</strong>
            </td>
            <td style={cell} colSpan={2}>
              {folha.nomeAjudante.trim() || '\u00a0'}
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <thead>
          <tr>
            <th style={th}>Veículo</th>
            <th style={th}>Quantidade combustível</th>
            <th style={th}>Km inicial</th>
            <th style={th}>Km final</th>
            <th style={th}>Km total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cell, textAlign: 'center' }}>{folha.veiculo.trim() || '\u00a0'}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{folha.qtdCombustivel.trim() || '\u00a0'}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{folha.kmInicial.trim() || '\u00a0'}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{folha.kmFinal.trim() || '\u00a0'}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{folha.kmTotal.trim() || '\u00a0'}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 36 }}>#</th>
            <th style={th}>Cliente</th>
            <th style={th}>Km chegada</th>
            <th style={th}>Hora entrada</th>
            <th style={th}>Hora saída</th>
          </tr>
        </thead>
        <tbody>
          {folha.rotas.slice(0, ROTAS_CONFERENCIA_LINHAS).map((row, i) => (
            <tr key={i}>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{i + 1}</td>
              <td style={cell}>{row.cliente.trim() || '\u00a0'}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{row.kmChegada.trim() || '\u00a0'}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{row.horaEntrada.trim() || '\u00a0'}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{row.horaSaida.trim() || '\u00a0'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontWeight: 800, fontSize: '10pt', textAlign: 'center', margin: '10px 0 6px' }}>
        CONFERÊNCIA DO CAMINHÃO
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, tableLayout: 'fixed' }}>
        <tbody>
          <tr style={{ verticalAlign: 'top' }}>
            <td style={{ ...cell, width: '50%', padding: 0, border: '1px solid #000' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>{renderColunaItens(CHECKLIST_MOTORISTA_COL_ESQ, 1, respostas)}</tbody>
              </table>
            </td>
            <td style={{ ...cell, width: '50%', padding: 0, border: '1px solid #000' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>{renderColunaItens(CHECKLIST_MOTORISTA_COL_DIR, 8, respostas)}</tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 800, fontSize: '10pt', marginBottom: 6 }}>TERMO DE RESPONSABILIDADE</div>
      <p style={{ margin: '0 0 8px', fontSize: '9.5pt', textAlign: 'justify' }}>
        Eu, <strong>{motoristaTxt}</strong>, declaro que estou saindo com caminhão <strong>{veiculoTxt}</strong>, placa{' '}
        <strong>{placaTxt}</strong>, e o mesmo encontra-se com todos os itens abaixo:
      </p>
      <div style={{ border: '1px solid #000', minHeight: 96, padding: 8, marginBottom: 10, background: '#fff' }}>
        <div style={{ fontWeight: 700, fontSize: '9pt', marginBottom: 4 }}>Avarias</div>
        <div style={{ fontSize: '9pt', whiteSpace: 'pre-wrap', minHeight: 72 }}>
          {folha.avarias.trim() || '\u00a0'}
        </div>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: '8.8pt', textAlign: 'justify', lineHeight: 1.45 }}>
        Declaro ainda que todos os itens acima relacionados encontram-se em perfeitas condições de uso, estando ciente
        de que eventuais danos, multas de trânsito ou ausência de equipamentos poderão ser de minha inteira
        responsabilidade, nos termos da legislação vigente e dos procedimentos internos da empresa.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16, fontSize: '9pt' }}>
        <div>
          <div style={{ marginBottom: 28, borderBottom: '1px solid #000', minHeight: 22 }} />
          <strong>Assinatura do motorista</strong>
          {assinaturaMotorista.trim() ? (
            <div style={{ marginTop: 4, fontSize: '8.5pt' }}>{assinaturaMotorista.trim()}</div>
          ) : null}
        </div>
        <div>
          <div style={{ marginBottom: 28, borderBottom: '1px solid #000', minHeight: 22 }} />
          <strong>Assinatura mecânico responsável</strong>
          {assinaturaResponsavel.trim() ? (
            <div style={{ marginTop: 4, fontSize: '8.5pt' }}>{assinaturaResponsavel.trim()}</div>
          ) : null}
        </div>
      </div>

      <p style={{ margin: '14px 0 0', fontSize: '7.8pt', color: '#333', textAlign: 'center' }}>
        Coleta nº {coleta.numero}
        {coleta.mtr_numero ? ` · MTR ${coleta.mtr_numero}` : ''} · {coleta.cliente || 'Cliente'}
      </p>
    </div>
  )
}
