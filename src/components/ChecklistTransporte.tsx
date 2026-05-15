import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type {
  ItemChecklistMotorista,
  RespostaChecklistItem,
  RespostasChecklistMotorista,
} from '../lib/checklistMotoristaItens'

const ACCENT = '#0d9488'

type MotoristaCadastroRow = {
  id: string
  nome: string
  cpf: string
  cnh_numero: string
  cnh_categoria: string
}

function textoMotoristaParaBusca(m: MotoristaCadastroRow): string {
  return [m.nome, m.cpf, m.cnh_numero, m.cnh_categoria].join(' ').toLowerCase()
}

function motoristaCorrespondePesquisa(m: MotoristaCadastroRow, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  const hay = textoMotoristaParaBusca(m)
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t))
}

const cardInnerStyle: CSSProperties = {
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  overflow: 'hidden',
  background: '#fff',
}

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 14px',
  borderBottom: '1px solid #f1f5f9',
  fontSize: '14px',
  color: '#0f172a',
}

const btnSnStyle = (ativo: boolean, cor: string, dis: boolean): CSSProperties => ({
  padding: '6px 12px',
  borderRadius: '8px',
  border: `1px solid ${ativo ? cor : '#cbd5e1'}`,
  background: ativo ? `${cor}18` : '#fff',
  color: ativo ? '#0f172a' : '#64748b',
  fontWeight: 700,
  fontSize: '12px',
  cursor: dis ? 'not-allowed' : 'pointer',
  opacity: dis ? 0.75 : 1,
})

export type ChecklistTransporteProps = {
  itens: readonly ItemChecklistMotorista[]
  respostas: RespostasChecklistMotorista
  onRespostaChange: (id: string, valor: RespostaChecklistItem) => void
  assinaturaMotorista: string
  assinaturaResponsavel: string
  onAssinaturaMotoristaChange: (valor: string) => void
  onAssinaturaResponsavelChange: (valor: string) => void
  observacoes: string
  onObservacoesChange: (valor: string) => void
  /** Quando false, esconde a caixa de observações (ex.: conferência usa «Avarias» na folha). */
  mostrarObservacoes?: boolean
  /** Conteúdo extra entre o bloco de itens e as assinaturas (ex.: caixa «Avarias» na folha RG). */
  entreItensEAssinaturas?: ReactNode
  disabled: boolean
  loading?: boolean
}

/**
 * Checklist «conferência do caminhão»: 14 itens com SIM / NÃO / limpar, assinaturas e observações opcionais.
 * Integrado em Conferência de transportes; gravação em `checklist_transporte` via página pai.
 */
export default function ChecklistTransporte({
  itens,
  respostas,
  onRespostaChange,
  assinaturaMotorista,
  assinaturaResponsavel,
  onAssinaturaMotoristaChange,
  onAssinaturaResponsavelChange,
  observacoes,
  onObservacoesChange,
  mostrarObservacoes = true,
  entreItensEAssinaturas,
  disabled,
  loading,
}: ChecklistTransporteProps) {
  const [motoristasCadastro, setMotoristasCadastro] = useState<MotoristaCadastroRow[]>([])
  const [pesquisaMotorista, setPesquisaMotorista] = useState('')
  const [dropdownMotoristaAberto, setDropdownMotoristaAberto] = useState(false)
  const dropdownMotoristaRef = useRef<HTMLDivElement | null>(null)
  const buscaMotoristaInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancel = false
    void (async () => {
      const { data, error } = await supabase
        .from('motoristas')
        .select('id, nome, cpf, cnh_numero, cnh_categoria')
        .order('nome', { ascending: true })
        .limit(2000)
      if (cancel) return
      if (error) {
        console.error('ChecklistTransporte: motoristas', error)
        setMotoristasCadastro([])
        return
      }
      const rows = ((data as Record<string, unknown>[]) || [])
        .map((r) => ({
          id: String(r.id),
          nome: String(r.nome ?? '').trim(),
          cpf: String(r.cpf ?? '').trim(),
          cnh_numero: String(r.cnh_numero ?? '').trim(),
          cnh_categoria: String(r.cnh_categoria ?? '').trim(),
        }))
        .filter((r) => r.nome.length > 0)
      setMotoristasCadastro(rows)
    })()
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (!dropdownMotoristaAberto) return
    const t = window.setTimeout(() => buscaMotoristaInputRef.current?.focus(), 0)
    function onDocMouseDown(e: MouseEvent) {
      const el = dropdownMotoristaRef.current
      if (el && !el.contains(e.target as Node)) setDropdownMotoristaAberto(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDropdownMotoristaAberto(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [dropdownMotoristaAberto])

  const motoristasFiltrados = useMemo(
    () => motoristasCadastro.filter((m) => motoristaCorrespondePesquisa(m, pesquisaMotorista)),
    [motoristasCadastro, pesquisaMotorista]
  )

  function escolherMotoristaDoCadastro(m: MotoristaCadastroRow) {
    onAssinaturaMotoristaChange(m.nome)
    setPesquisaMotorista('')
    setDropdownMotoristaAberto(false)
  }

  if (loading) {
    return <p style={{ color: '#64748b' }}>A carregar checklist do motorista…</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {!disabled ? null : (
        <p style={{ color: '#92400e', fontSize: '14px', margin: 0 }}>
          O seu perfil só pode consultar. Operação e logística preenchem o checklist.
        </p>
      )}

      <div style={cardInnerStyle}>
        {itens.map((item, index) => {
          const v = respostas[item.id] ?? null
          return (
            <div
              key={item.id}
              style={{
                ...rowStyle,
                background: index % 2 === 0 ? '#ffffff' : '#fafbfc',
              }}
            >
              <span style={{ lineHeight: 1.45, fontWeight: 600 }}>{item.label}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={disabled}
                  style={btnSnStyle(v === true, '#0d9488', disabled)}
                  onClick={() => onRespostaChange(item.id, true)}
                >
                  SIM
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  style={btnSnStyle(v === false, '#b91c1c', disabled)}
                  onClick={() => onRespostaChange(item.id, false)}
                >
                  NÃO
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  style={btnSnStyle(v === null, '#94a3b8', disabled)}
                  onClick={() => onRespostaChange(item.id, null)}
                  title="Limpar resposta"
                >
                  —
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {entreItensEAssinaturas}

      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
          Assinatura — motorista (nome completo ou rubrica)
        </div>
        <input
          type="text"
          value={assinaturaMotorista}
          onChange={(e) => onAssinaturaMotoristaChange(e.target.value)}
          readOnly={disabled}
          placeholder="Texto da assinatura (use o dropdown para copiar do cadastro)"
          autoComplete="off"
          style={{
            width: '100%',
            maxWidth: '100%',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            fontSize: '14px',
            opacity: disabled ? 0.85 : 1,
            boxSizing: 'border-box',
          }}
        />

        {!disabled ? (
          <div ref={dropdownMotoristaRef} style={{ marginTop: '12px', position: 'relative' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                marginBottom: '6px',
              }}
            >
              Motoristas do cadastro
            </div>
            <button
              type="button"
              id="ct-mot-dropdown-trigger"
              aria-expanded={dropdownMotoristaAberto}
              aria-haspopup="listbox"
              aria-controls="ct-mot-dropdown-panel"
              onClick={() =>
                setDropdownMotoristaAberto((v) => {
                  if (!v) setPesquisaMotorista('')
                  return !v
                })
              }
              style={{
                width: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '11px 14px',
                borderRadius: '10px',
                border: `1px solid ${dropdownMotoristaAberto ? ACCENT : '#cbd5e1'}`,
                background: '#fff',
                fontSize: '14px',
                textAlign: 'left',
                cursor: 'pointer',
                color: assinaturaMotorista.trim() ? '#0f172a' : '#94a3b8',
                boxShadow: dropdownMotoristaAberto ? '0 0 0 3px rgba(13, 148, 136, 0.15)' : 'none',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {assinaturaMotorista.trim()
                  ? assinaturaMotorista.trim()
                  : 'Selecionar motorista do cadastro…'}
              </span>
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  fontSize: '10px',
                  color: '#64748b',
                  transform: dropdownMotoristaAberto ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                }}
              >
                ▼
              </span>
            </button>

            {dropdownMotoristaAberto ? (
              <div
                id="ct-mot-dropdown-panel"
                role="listbox"
                aria-labelledby="ct-mot-dropdown-trigger"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 40,
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.04)',
                }}
              >
                <label
                  htmlFor="ct-mot-busca"
                  style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '6px' }}
                >
                  Pesquisar (nome, CPF, CNH, categoria)
                </label>
                <input
                  ref={buscaMotoristaInputRef}
                  id="ct-mot-busca"
                  type="search"
                  value={pesquisaMotorista}
                  onChange={(e) => setPesquisaMotorista(e.target.value)}
                  placeholder="Ex.: paulo · 12345 · categoria E"
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    marginBottom: '10px',
                    outline: 'none',
                    background: '#fafafa',
                  }}
                />
                <div
                  style={{
                    maxHeight: 'min(260px, 34vh)',
                    overflow: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    background: '#f8fafc',
                  }}
                >
                  {motoristasCadastro.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      Nenhum motorista no cadastro ou não foi possível carregar.
                    </div>
                  ) : motoristasFiltrados.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      Nenhum resultado. Ajuste a pesquisa.
                    </div>
                  ) : (
                    motoristasFiltrados.map((m) => {
                      const ativo =
                        assinaturaMotorista.trim().toLowerCase() === m.nome.trim().toLowerCase()
                      const detalhe = [m.cnh_numero && `CNH ${m.cnh_numero}`, m.cnh_categoria && `Cat. ${m.cnh_categoria}`]
                        .filter(Boolean)
                        .join(' · ')
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="option"
                          aria-selected={ativo}
                          onClick={() => escolherMotoristaDoCadastro(m)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 12px',
                            fontSize: '13px',
                            lineHeight: 1.45,
                            border: 'none',
                            borderBottom: '1px solid #e2e8f0',
                            background: ativo ? '#ccfbf1' : '#fff',
                            cursor: 'pointer',
                            color: '#0f172a',
                          }}
                          onMouseEnter={(e) => {
                            if (!ativo) e.currentTarget.style.background = '#ecfdf5'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = ativo ? '#ccfbf1' : '#fff'
                          }}
                        >
                          <div style={{ fontWeight: 800, color: '#0f766e' }}>{m.nome}</div>
                          {detalhe ? (
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                              {detalhe}
                            </div>
                          ) : null}
                        </button>
                      )
                    })
                  )}
                </div>
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: '11px',
                    color: '#94a3b8',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  <span>
                    {motoristasFiltrados.length} de {motoristasCadastro.length}
                  </span>
                  {pesquisaMotorista.trim() ? (
                    <button
                      type="button"
                      onClick={() => setPesquisaMotorista('')}
                      style={{
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        cursor: 'pointer',
                        color: '#475569',
                      }}
                    >
                      Limpar pesquisa
                    </button>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
          Assinatura — responsável (nome completo ou rubrica)
        </div>
        <input
          type="text"
          value={assinaturaResponsavel}
          onChange={(e) => onAssinaturaResponsavelChange(e.target.value)}
          readOnly={disabled}
          placeholder="Nome do responsável"
          autoComplete="off"
          style={{
            width: '100%',
            maxWidth: '100%',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            fontSize: '14px',
            opacity: disabled ? 0.85 : 1,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {mostrarObservacoes ? (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>
            Observações (opcional)
          </div>
          <textarea
            value={observacoes}
            onChange={(e) => onObservacoesChange(e.target.value)}
            readOnly={disabled}
            rows={3}
            placeholder="Notas adicionais"
            style={{
              width: '100%',
              maxWidth: '100%',
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              fontSize: '14px',
              resize: 'vertical',
              opacity: disabled ? 0.85 : 1,
              boxSizing: 'border-box',
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
