import { useCallback, useEffect, useMemo, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import {
  formatarErroEdgeFunction,
  headersJwtSessao,
  obterSessaoParaEdgeFunctions,
} from '../lib/edgeFunctionErrors'
import { cargoPodeEmitirFaturamento } from '../lib/workflowPermissions'
import { registrarEnvioNfContaReceber } from '../services/financeiroReceber'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useSessionObjectDraft } from '../lib/usePageSessionPersistence'

type ClienteLista = {
  id: string
  nome: string
  razao_social: string
  email_nf: string | null
  status: string | null
}

type DestinatarioPayload = {
  cliente_id: string
  nome: string
  email: string
}

type EnvioLogRow = {
  id: string
  created_at: string
  modo: string
  total_destinatarios: number
  observacao: string | null
  destinatarios: unknown
}

const MAX_ANEXOS = 5
/** Total no e-mail: anexos de NF (até 5) + opcional boleto PDF (1). */
const MAX_TOTAL_ANEXOS_EMAIL = 6
const MAX_BYTES_ANEXO = 4 * 1024 * 1024 // 4 MiB

function formatarTamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result as string
      const i = r.indexOf(',')
      resolve(i >= 0 ? r.slice(i + 1) : r)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler ficheiro.'))
    reader.readAsDataURL(file)
  })
}

function formatarDataHora(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/**
 * Mala direta de NF: seleção de clientes com `email_nf`, envio simulado e registo em `nf_envios_log`.
 * Integração real (SMTP/API) pode substituir o modo `simulacao` mantendo o mesmo fluxo de seleção.
 */
export default function EnvioNF() {
  const [searchParams] = useSearchParams()
  const [clientes, setClientes] = useState<ClienteLista[]>([])
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<EnvioLogRow[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebouncedValue(busca, 300)
  const [somenteComEmail, setSomenteComEmail] = useState(true)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [observacao, setObservacao] = useState('')
  const [anexoFiles, setAnexoFiles] = useState<File[]>([])
  const [boletoFile, setBoletoFile] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [envioModo, setEnvioModo] = useState<'simulacao' | 'email' | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [usuarioCargo, setUsuarioCargo] = useState<string | null>(null)
  const [contasAbertasOpts, setContasAbertasOpts] = useState<
    { referencia_coleta_id: string; numero: string; saldoFmt: string }[]
  >([])
  const [coletasComContaMarcadas, setColetasComContaMarcadas] = useState<Set<string>>(new Set())

  const envioNfDraft = useMemo(
    () => ({
      busca,
      somenteComEmail,
      observacao,
      envioModo,
      selecionados: [...selecionados],
      coletasComContaMarcadas: [...coletasComContaMarcadas],
    }),
    [busca, somenteComEmail, observacao, envioModo, selecionados, coletasComContaMarcadas]
  )

  useSessionObjectDraft({
    cacheKey: 'envio-nf',
    data: envioNfDraft,
    onRestore: (d) => {
      setBusca(d.busca)
      setSomenteComEmail(d.somenteComEmail)
      setObservacao(d.observacao)
      setEnvioModo(d.envioModo)
      setSelecionados(new Set(d.selecionados))
      setColetasComContaMarcadas(new Set(d.coletasComContaMarcadas))
    },
  })

  const podeDisparar = cargoPodeEmitirFaturamento(usuarioCargo)
  const clienteParam = useMemo(() => (searchParams.get('cliente') || '').trim(), [searchParams])
  const coletaParam = useMemo(() => (searchParams.get('coleta') || '').trim(), [searchParams])

  const carregarClientes = useCallback(async () => {
    setLoading(true)
    setErro('')
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome, razao_social, email_nf, status')
      .order('nome', { ascending: true })

    if (error) {
      console.error(error)
      setErro(error.message)
      setClientes([])
    } else {
      setClientes((data || []) as ClienteLista[])
    }
    setLoading(false)
  }, [])

  const carregarLogs = useCallback(async () => {
    setLoadingLogs(true)
    const { data, error } = await supabase
      .from('nf_envios_log')
      .select('id, created_at, modo, total_destinatarios, observacao, destinatarios')
      .order('created_at', { ascending: false })
      .limit(15)

    if (!error && data) {
      setLogs(data as EnvioLogRow[])
    }
    setLoadingLogs(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void carregarClientes()
    })
  }, [carregarClientes])

  useEffect(() => {
    queueMicrotask(() => {
      void carregarLogs()
    })
  }, [carregarLogs])

  useEffect(() => {
    if (!clienteParam) return
    queueMicrotask(() => {
      setSelecionados(new Set([clienteParam]))
      setSomenteComEmail(false)
    })
  }, [clienteParam])

  useEffect(() => {
    if (clienteParam) return
    if (!coletaParam) return
    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('coletas')
          .select('cliente_id')
          .eq('id', coletaParam)
          .maybeSingle()
        if (cancelled) return
        if (error) {
          console.error(error)
          return
        }
        const id = (data?.cliente_id || '').trim()
        if (!id) return
        queueMicrotask(() => {
          setSelecionados(new Set([id]))
          setSomenteComEmail(false)
        })
      } catch (e) {
        console.error(e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clienteParam, coletaParam])

  useEffect(() => {
    queueMicrotask(() => {
      setColetasComContaMarcadas(new Set())
    })
  }, [selecionados])

  useEffect(() => {
    const clientIds = [...selecionados]
    if (clientIds.length === 0) {
      queueMicrotask(() => {
        setContasAbertasOpts([])
      })
      return
    }
    let cancel = false
    void (async () => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select('referencia_coleta_id, valor, valor_pago, status_pagamento, cliente_id')
        .in('cliente_id', clientIds)
        .limit(800)

      if (cancel) return
      if (error) {
        console.error(error)
        queueMicrotask(() => {
          setContasAbertasOpts([])
        })
        return
      }

      const rows = (data || []).filter(
        (r: { status_pagamento: string }) =>
          r.status_pagamento !== 'Pago' && r.status_pagamento !== 'Cancelado'
      )
      const refIds = rows.map((r: { referencia_coleta_id: string }) => r.referencia_coleta_id)
      const cmap = new Map<string, string>()
      if (refIds.length > 0) {
        const { data: cols } = await supabase.from('coletas').select('id, numero').in('id', refIds)
        for (const c of cols || []) {
          cmap.set((c as { id: string; numero: string }).id, (c as { id: string; numero: string }).numero)
        }
      }

      const opts = rows.map((r: { referencia_coleta_id: string; valor: number; valor_pago: number }) => {
        const saldo = Math.max(0, Number(r.valor) - Number(r.valor_pago))
        return {
          referencia_coleta_id: r.referencia_coleta_id,
          numero: cmap.get(r.referencia_coleta_id) || r.referencia_coleta_id.slice(0, 8),
          saldoFmt: saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        }
      })
      queueMicrotask(() => {
        setContasAbertasOpts(opts)
      })
    })()
    return () => {
      cancel = true
    }
  }, [selecionados])

  useEffect(() => {
    async function c() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setUsuarioCargo(null)
        return
      }
      const { data } = await supabase.from('usuarios').select('cargo').eq('id', user.id).maybeSingle()
      setUsuarioCargo(data?.cargo ?? null)
    }
    void c()
  }, [])

  const clientesFiltrados = useMemo(() => {
    let lista = clientes
    if (somenteComEmail) {
      lista = lista.filter((c) => (c.email_nf ?? '').trim() !== '')
    }
    const t = buscaDebounced.trim().toLowerCase()
    if (!t) return lista
    return lista.filter(
      (c) =>
        c.nome.toLowerCase().includes(t) ||
        c.razao_social.toLowerCase().includes(t) ||
        (c.email_nf ?? '').toLowerCase().includes(t)
    )
  }, [clientes, buscaDebounced, somenteComEmail])

  function toggleId(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selecionarTodosVisiveis() {
    const ids = clientesFiltrados
      .filter((c) => (c.email_nf ?? '').trim() !== '')
      .map((c) => c.id)
    setSelecionados(new Set(ids))
  }

  function limparSelecao() {
    setSelecionados(new Set())
  }

  const selecionadosComEmail = useMemo(() => {
    return clientes.filter((c) => selecionados.has(c.id) && (c.email_nf ?? '').trim() !== '')
  }, [clientes, selecionados])

  const semEmailNaSelecao = useMemo(() => {
    return clientes.filter((c) => selecionados.has(c.id) && !(c.email_nf ?? '').trim())
  }, [clientes, selecionados])

  function onEscolherAnexos(files: FileList | null) {
    if (!files?.length) return
    const picked = Array.from(files)
    setAnexoFiles((prev) => {
      const next = [...prev]
      const avisos: string[] = []
      for (const f of picked) {
        if (next.length >= MAX_ANEXOS) {
          avisos.push(`No máximo ${MAX_ANEXOS} anexos de NF por envio.`)
          break
        }
        if (next.length + (boletoFile ? 1 : 0) >= MAX_TOTAL_ANEXOS_EMAIL) {
          avisos.push(
            `No máximo ${MAX_TOTAL_ANEXOS_EMAIL} anexos no e-mail (notas + boleto). Remova o boleto ou um anexo.`
          )
          break
        }
        if (f.size > MAX_BYTES_ANEXO) {
          avisos.push(`"${f.name}" ultrapassa ${formatarTamanho(MAX_BYTES_ANEXO)}.`)
          continue
        }
        const dup = next.some((x) => x.name === f.name && x.size === f.size)
        if (!dup) next.push(f)
      }
      if (avisos.length > 0) {
        queueMicrotask(() => setErro(avisos[0]))
      }
      return next
    })
  }

  function removerAnexo(index: number) {
    setAnexoFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function limparAnexos() {
    setAnexoFiles([])
  }

  function onEscolherBoleto(files: FileList | null) {
    if (!files?.length) return
    const f = files[0]
    const ehPdf =
      f.type === 'application/pdf' || f.name.toLowerCase().trim().endsWith('.pdf')
    if (!ehPdf) {
      setErro('O boleto deve ser um ficheiro PDF.')
      return
    }
    if (f.size > MAX_BYTES_ANEXO) {
      setErro(`Boleto: "${f.name}" ultrapassa ${formatarTamanho(MAX_BYTES_ANEXO)}.`)
      return
    }
    if (anexoFiles.length + 1 > MAX_TOTAL_ANEXOS_EMAIL) {
      setErro(
        `No máximo ${MAX_TOTAL_ANEXOS_EMAIL} anexos no e-mail (notas + boleto). Remova um anexo da NF.`
      )
      return
    }
    setErro('')
    setBoletoFile(f)
  }

  function limparBoleto() {
    setBoletoFile(null)
  }

  function toggleColetaConta(id: string) {
    setColetasComContaMarcadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function aplicarEnvioNasContasMarcadas(
    modo: string,
    observacaoUsuario: string,
    nf_envio_log_id?: string | null
  ) {
    const ids =
      coletasComContaMarcadas.size > 0
        ? [...coletasComContaMarcadas]
        : coletaParam
          ? [coletaParam]
          : []
    for (const ref of ids) {
      const { error: crErr } = await registrarEnvioNfContaReceber(supabase, {
        referencia_coleta_id: ref,
        modo,
        observacaoUsuario,
        nf_envio_log_id: nf_envio_log_id ?? undefined,
      })
      if (crErr) console.warn('Conta a receber (NF):', crErr.message)
    }
  }

  async function handleSimularEnvio() {
    setErro('')
    setMensagem('')
    if (!podeDisparar) {
      setErro('Sem permissão para registar envio. Perfis: Faturamento, Financeiro, Diretoria ou Administrador.')
      return
    }
    if (selecionadosComEmail.length === 0) {
      setErro('Selecione pelo menos um cliente com e-mail de NF preenchido.')
      return
    }

    const destinatarios: DestinatarioPayload[] = selecionadosComEmail.map((c) => ({
      cliente_id: c.id,
      nome: c.nome,
      email: (c.email_nf ?? '').trim(),
    }))

    const nomesSimulacao = [
      ...(anexoFiles.length > 0
        ? [`NF: ${anexoFiles.map((f) => f.name).join(', ')}`]
        : []),
      ...(boletoFile ? [`Boleto: ${boletoFile.name}`] : []),
    ]
    const obsComAnexos =
      nomesSimulacao.length > 0
        ? [observacao.trim(), `Anexos (simulação, não enviados): ${nomesSimulacao.join(' · ')}`]
            .filter(Boolean)
            .join('\n')
        : observacao.trim()

    setEnviando(true)
    setEnvioModo('simulacao')
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { data: logRow, error } = await supabase
        .from('nf_envios_log')
        .insert({
          modo: 'simulacao',
          destinatarios,
          total_destinatarios: destinatarios.length,
          observacao: obsComAnexos || null,
          created_by: user?.id ?? null,
        })
        .select('id')
        .maybeSingle()

      if (error) throw error

      const logId =
        logRow && typeof logRow === 'object' && 'id' in logRow && logRow.id
          ? String(logRow.id)
          : null
      await aplicarEnvioNasContasMarcadas('simulacao', obsComAnexos, logId)

      setMensagem(
        `Simulação concluída: ${destinatarios.length} destinatário(s). Nenhum e-mail foi enviado.`
      )
      setObservacao('')
      limparAnexos()
      limparBoleto()
      setSelecionados(new Set())
      await carregarLogs()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao registar envio.')
    } finally {
      setEnviando(false)
      setEnvioModo(null)
    }
  }

  async function handleEnviarEmails() {
    setErro('')
    setMensagem('')
    if (!podeDisparar) {
      setErro('Sem permissão para envio. Perfis: Faturamento, Financeiro, Diretoria ou Administrador.')
      return
    }
    if (selecionadosComEmail.length === 0) {
      setErro('Selecione pelo menos um cliente com e-mail de NF preenchido.')
      return
    }

    const destinatarios: DestinatarioPayload[] = selecionadosComEmail.map((c) => ({
      cliente_id: c.id,
      nome: c.nome,
      email: (c.email_nf ?? '').trim(),
    }))

    const todosArquivosEmail: File[] = [...anexoFiles]
    if (boletoFile) todosArquivosEmail.push(boletoFile)
    if (todosArquivosEmail.length > MAX_TOTAL_ANEXOS_EMAIL) {
      setErro(
        `No máximo ${MAX_TOTAL_ANEXOS_EMAIL} anexos por envio (notas fiscais + boleto). Reduza a quantidade.`
      )
      return
    }

    let anexos:
      | { filename: string; contentType: string; contentBase64: string }[]
      | undefined
    if (todosArquivosEmail.length > 0) {
      anexos = await Promise.all(
        todosArquivosEmail.map(async (f) => ({
          filename: f.name,
          contentType: f.type || 'application/octet-stream',
          contentBase64: await fileToBase64(f),
        }))
      )
    }

    setEnviando(true)
    setEnvioModo('email')
    try {
      const sessao = await obterSessaoParaEdgeFunctions(supabase)
      const { data, error } = await supabase.functions.invoke('send-nf-email', {
        body: {
          destinatarios,
          observacao: observacao.trim() || null,
          ...(anexos && anexos.length > 0 ? { anexos } : {}),
        },
        headers: headersJwtSessao(sessao),
      })

      if (error) {
        if (error instanceof FunctionsHttpError) {
          let msg = error.message
          try {
            const payload = await error.context.json()
            if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
              msg = String(payload.error)
            }
          } catch {
            msg = await formatarErroEdgeFunction(error, 'enviar_nf')
          }
          throw new Error(msg)
        }
        throw new Error(await formatarErroEdgeFunction(error, 'enviar_nf'))
      }

      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error))
      }

      if (data && typeof data === 'object') {
        const logId =
          'nfEnvioLogId' in data && data.nfEnvioLogId ? String(data.nfEnvioLogId) : undefined
        const modo = 'modo' in data && data.modo ? String(data.modo) : 'email'
        await aplicarEnvioNasContasMarcadas(modo, observacao, logId ?? null)
      }

      const msg =
        data && typeof data === 'object' && 'message' in data && data.message
          ? String(data.message)
          : 'Pedido concluído.'
      setMensagem(msg)
      setObservacao('')
      limparAnexos()
      limparBoleto()
      setSelecionados(new Set())
      await carregarLogs()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar e-mails.')
    } finally {
      setEnviando(false)
      setEnvioModo(null)
    }
  }

  return (
    <MainLayout>
      <div className="page-shell">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '20px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '26px',
                  fontWeight: 800,
                  color: '#0f172a',
                }}
              >
                Mala direta a clientes
              </h1>
              <p className="page-header__lead" style={{ margin: '6px 0 0' }}>
                Selecione clientes com <strong>e-mail para NF</strong> em <strong>Clientes</strong>. Use{' '}
                <strong>Enviar e-mails</strong> para disparo real (Outlook/Hotmail SMTP ou Resend, conforme segredos na
                Edge Function) ou <strong>simulação</strong> só para testar o histórico sem enviar.
              </p>
              {coletaParam ? (
                <p
                  style={{
                    margin: '10px 0 0',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    fontSize: '13px',
                    color: '#065f46',
                    fontWeight: 600,
                  }}
                >
                  Contexto: coleta <code style={{ fontWeight: 800 }}>{coletaParam.slice(0, 8)}…</code> — após envio ou
                  simulação, o registo fica em <strong>contas a receber</strong> (se já existir linha para esta coleta).
                </p>
              ) : null}
              {usuarioCargo ? (
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                  Perfil: <span style={{ color: '#0f172a' }}>{usuarioCargo}</span>
                  {!podeDisparar
                    ? ' · apenas consulta / histórico'
                    : ' · pode enviar e-mails ou registar simulação'}
                </p>
              ) : null}
            </div>
            <div
              style={{
                minWidth: '200px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '16px',
                padding: '16px 18px',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '6px' }}>Selecionados com e-mail</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                {selecionadosComEmail.length}
              </div>
            </div>
          </div>

          {erro ? (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontWeight: 600,
              }}
            >
              {erro}
            </div>
          ) : null}
          {mensagem ? (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                background: '#ecfdf5',
                border: '1px solid #bbf7d0',
                color: '#15803d',
                fontWeight: 600,
              }}
            >
              {mensagem}
            </div>
          ) : null}

          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '18px',
              padding: '20px',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <input
                type="text"
                placeholder="Buscar cliente, razão social ou e-mail NF..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{
                  flex: '1',
                  minWidth: '220px',
                  height: '42px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  padding: '0 14px',
                  fontSize: '14px',
                }}
              />
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={somenteComEmail}
                  onChange={(e) => setSomenteComEmail(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#16a34a' }}
                />
                Só com e-mail NF
              </label>
              <button
                type="button"
                onClick={selecionarTodosVisiveis}
                style={{
                  background: '#0f172a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Selecionar todos (com e-mail)
              </button>
              <button
                type="button"
                onClick={limparSelecao}
                style={{
                  background: '#e5e7eb',
                  color: '#111827',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Limpar seleção
              </button>
              <button
                type="button"
                onClick={() => void carregarClientes()}
                disabled={loading}
                style={{
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                Atualizar lista
              </button>
            </div>

            {semEmailNaSelecao.length > 0 ? (
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#b45309', fontWeight: 600 }}>
                {semEmailNaSelecao.length} cliente(s) selecionado(s) sem e-mail NF — não entram no envio até
                preencher em Clientes.
              </p>
            ) : null}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '640px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '12px', width: '44px' }} />
                    <th style={{ textAlign: 'left', padding: '12px', color: '#0f172a', fontWeight: 800 }}>Cliente</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#0f172a', fontWeight: 800 }}>Razão social</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#0f172a', fontWeight: 800 }}>E-mail NF</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#0f172a', fontWeight: 800 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                        A carregar clientes…
                      </td>
                    </tr>
                  ) : clientesFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                        Nenhum cliente neste filtro. Ajuste a busca ou cadastre e-mail NF em Clientes.
                      </td>
                    </tr>
                  ) : (
                    clientesFiltrados.map((c) => {
                      const temEmail = (c.email_nf ?? '').trim() !== ''
                      const sel = selecionados.has(c.id)
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid #eef2f7' }}>
                          <td style={{ padding: '12px', verticalAlign: 'middle' }}>
                            <input
                              type="checkbox"
                              checked={sel}
                              onChange={() => toggleId(c.id)}
                              style={{
                                width: '18px',
                                height: '18px',
                                accentColor: '#16a34a',
                                cursor: 'pointer',
                              }}
                              title={!temEmail ? 'Preencha o e-mail NF no cadastro do cliente' : undefined}
                            />
                          </td>
                          <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>{c.nome}</td>
                          <td style={{ padding: '12px', color: '#334155' }}>{c.razao_social}</td>
                          <td style={{ padding: '12px', color: temEmail ? '#0f172a' : '#94a3b8' }}>
                            {temEmail ? c.email_nf : '—'}
                          </td>
                          <td style={{ padding: '12px' }}>{c.status || '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {contasAbertasOpts.length > 0 ? (
              <div
                style={{
                  marginTop: '18px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid #bae6fd',
                  background: '#f0f9ff',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0369a1', marginBottom: '8px' }}>
                  Contas em aberto (Fase 9) — marque as coletas para registar o envio em contas a receber
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#475569' }}>
                  Se não marcar nada, usa só o contexto <code>coleta=</code> na URL (se existir). Com marcas, todas
                  recebem o mesmo id de log do disparo.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                  {contasAbertasOpts.map((o) => (
                    <label
                      key={o.referencia_coleta_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={coletasComContaMarcadas.has(o.referencia_coleta_id)}
                        onChange={() => toggleColetaConta(o.referencia_coleta_id)}
                        style={{ width: '18px', height: '18px', accentColor: '#0284c7' }}
                      />
                      <span>
                        <strong>{o.numero}</strong> · saldo {o.saldoFmt}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>
                Observação interna (opcional, gravada no log)
              </div>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder="Ex.: Lote NF abril / referência interna"
                disabled={!podeDisparar}
                style={{
                  width: '100%',
                  maxWidth: '560px',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>
                Anexar Nota Fiscal
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#64748b', maxWidth: '720px' }}>
                PDF, XML ou imagens. Até {MAX_ANEXOS} ficheiros de NF, {formatarTamanho(MAX_BYTES_ANEXO)} cada. Pode
                anexar ainda <strong>um boleto em PDF</strong> abaixo (conta no limite de {MAX_TOTAL_ANEXOS_EMAIL}{' '}
                ficheiros no e-mail). Os anexos são enviados no e-mail real; na <strong>simulação</strong> só ficam
                registados os nomes no log.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: podeDisparar ? '#f8fafc' : '#e2e8f0',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#334155',
                    cursor: podeDisparar ? 'pointer' : 'not-allowed',
                  }}
                >
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.xml,.zip,application/pdf,application/xml,image/*"
                    disabled={
                      !podeDisparar ||
                      anexoFiles.length >= MAX_ANEXOS ||
                      anexoFiles.length + (boletoFile ? 1 : 0) >= MAX_TOTAL_ANEXOS_EMAIL
                    }
                    onChange={(e) => {
                      onEscolherAnexos(e.target.files)
                      e.target.value = ''
                    }}
                    style={{ display: 'none' }}
                  />
                  Anexar Nota Fiscal
                </label>
                {anexoFiles.length > 0 ? (
                  <button
                    type="button"
                    onClick={limparAnexos}
                    disabled={!podeDisparar}
                    style={{
                      background: '#ffffff',
                      color: '#64748b',
                      border: '1px solid #cbd5e1',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: podeDisparar ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Limpar anexos
                  </button>
                ) : null}
              </div>
              {anexoFiles.length > 0 ? (
                <ul
                  style={{
                    margin: '12px 0 0',
                    padding: '0 0 0 18px',
                    fontSize: '13px',
                    color: '#334155',
                    maxWidth: '560px',
                  }}
                >
                  {anexoFiles.map((f, i) => (
                    <li key={`${f.name}-${f.size}-${i}`} style={{ marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600 }}>{f.name}</span>
                      <span style={{ color: '#94a3b8' }}> · {formatarTamanho(f.size)}</span>
                      {podeDisparar ? (
                        <>
                          {' '}
                          <button
                            type="button"
                            onClick={() => removerAnexo(i)}
                            style={{
                              marginLeft: '6px',
                              border: 'none',
                              background: 'none',
                              color: '#b91c1c',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                              fontSize: '12px',
                            }}
                          >
                            remover
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>
                Anexar boleto (PDF)
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#64748b', maxWidth: '720px' }}>
                Um ficheiro <strong>PDF</strong> por envio, até {formatarTamanho(MAX_BYTES_ANEXO)}. É enviado junto com
                as notas fiscais no e-mail real.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: podeDisparar ? '#f8fafc' : '#e2e8f0',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#334155',
                    cursor: podeDisparar ? 'pointer' : 'not-allowed',
                  }}
                >
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={
                      !podeDisparar ||
                      anexoFiles.length + (boletoFile ? 0 : 1) > MAX_TOTAL_ANEXOS_EMAIL
                    }
                    onChange={(e) => {
                      onEscolherBoleto(e.target.files)
                      e.target.value = ''
                    }}
                    style={{ display: 'none' }}
                  />
                  Anexar Boleto
                </label>
                {boletoFile ? (
                  <>
                    <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                      {boletoFile.name}
                      <span style={{ color: '#94a3b8', fontWeight: 500 }}>
                        {' '}
                        · {formatarTamanho(boletoFile.size)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={limparBoleto}
                      disabled={!podeDisparar}
                      style={{
                        background: '#ffffff',
                        color: '#b91c1c',
                        border: '1px solid #fecaca',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: podeDisparar ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Remover boleto
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => void handleEnviarEmails()}
                disabled={enviando || !podeDisparar || selecionadosComEmail.length === 0}
                style={{
                  background: selecionadosComEmail.length === 0 || !podeDisparar ? '#94a3b8' : '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '14px 28px',
                  fontWeight: 800,
                  fontSize: '15px',
                  cursor:
                    enviando || !podeDisparar || selecionadosComEmail.length === 0
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {enviando && envioModo === 'email' ? 'A enviar e-mails…' : 'Enviar e-mails'}
              </button>
              <button
                type="button"
                onClick={() => void handleSimularEnvio()}
                disabled={enviando || !podeDisparar || selecionadosComEmail.length === 0}
                style={{
                  background: '#ffffff',
                  color: '#334155',
                  border: '2px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '12px 24px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor:
                    enviando || !podeDisparar || selecionadosComEmail.length === 0
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {enviando && envioModo === 'simulacao' ? 'A registar…' : 'Só simulação (histórico)'}
              </button>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#64748b', maxWidth: '820px' }}>
              <strong>Outlook/Hotmail (SMTP):</strong> ative 2FA e uma <strong>senha de app</strong>. Nos Secrets:
              <code style={{ fontSize: '11px' }}> OUTLOOK_USER </code> e{' '}
              <code style={{ fontSize: '11px' }}> OUTLOOK_APP_PASSWORD </code>. Use SMTP na porta <strong>465</strong>{' '}
              (as Edge Functions do Supabase bloqueiam <strong>587</strong>).{' '}
              <strong>Atenção:</strong> o SMTP da Microsoft pode ficar <strong>vários minutos</strong> pendurado nas Edge Functions (ex.: ~135s até responder).{' '}
              <strong>Resend</strong> (HTTPS) resolve isso: defina <code style={{ fontSize: '11px' }}> RESEND_API_KEY </code>; com{' '}
              <code style={{ fontSize: '11px' }}> EMAIL_PROVIDER=auto </code> (padrão), se existir Resend e Outlook, o envio usa{' '}
              <strong>Resend</strong>. Para forçar só Resend: <code style={{ fontSize: '11px' }}> EMAIL_PROVIDER=resend </code>.
              Opcional: <code style={{ fontSize: '11px' }}> NF_EMAIL_FROM </code> (domínio verificado na Resend, ex.{' '}
              <code style={{ fontSize: '11px' }}>@rgambiental.com.br</code>),{' '}
              <code style={{ fontSize: '11px' }}> NF_EMAIL_REPLY_TO </code> (ex.: Hotmail do faturamento — só para respostas),{' '}
              <code style={{ fontSize: '11px' }}> OUTLOOK_SMTP_HOST </code> /{' '}
              <code style={{ fontSize: '11px' }}> OUTLOOK_SMTP_PORT </code>. Publique{' '}
              <code style={{ fontSize: '11px' }}>send-nf-email</code>.
            </p>
          </div>

          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '18px',
              padding: '20px',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              Histórico recente
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
              Últimos registos em <code style={{ fontSize: '12px' }}>nf_envios_log</code> (simulação, Outlook, Resend ou
              parcial).
            </p>
            {loadingLogs ? (
              <p style={{ color: '#64748b' }}>A carregar…</p>
            ) : logs.length === 0 ? (
              <p style={{ color: '#64748b' }}>Ainda não há envios registados.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {logs.map((log) => (
                  <li
                    key={log.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      background: '#fafbfc',
                    }}
                  >
                    <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                      {formatarDataHora(log.created_at)} · {log.total_destinatarios} destinatário(s) · {log.modo}
                    </div>
                    {log.observacao ? (
                      <div style={{ fontSize: '13px', color: '#475569', marginBottom: '8px' }}>{log.observacao}</div>
                    ) : null}
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {(Array.isArray(log.destinatarios) ? log.destinatarios : []).map(
                        (
                          d: { email?: string; nome?: string; ok?: boolean; detalhe?: string },
                          i: number
                        ) => (
                          <span key={i}>
                            {i > 0 ? ' · ' : ''}
                            {d.email}
                            {typeof d.ok === 'boolean'
                              ? d.ok
                                ? ' (ok)'
                                : ` (falha${d.detalhe ? `: ${d.detalhe}` : ''})`
                              : ''}
                          </span>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
