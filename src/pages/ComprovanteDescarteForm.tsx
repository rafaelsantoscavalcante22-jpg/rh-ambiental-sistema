import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import type {
  ComprovanteDescarteRow,
  ComprovanteFotoExtraItem,
  StatusDocumentoComprovante,
} from '../lib/comprovantesDescarteTypes'
import {
  calcularPesoLiquidoLocal,
  dataHoraIsoParaInputLocal,
  dataIsoParaInputDate,
  formatarTelefoneBr,
  inputLocalParaIsoUtc,
  parsePesoInput,
  validarFinalizacao,
} from '../lib/comprovantesDescarteUtils'
import { cargoPodeMutarComprovanteDescarte } from '../lib/workflowPermissions'
import { ComprovanteDescarteDocument } from '../components/comprovanteDescarte/ComprovanteDescarteDocument'
import { ComprovanteFotoSlot } from '../components/comprovanteDescarte/ComprovanteFotoSlot'
import {
  atualizarComprovanteDescarte,
  buscarColetaPorId,
  buscarColetasParaVinculo,
  buscarMtrPorId,
  buscarMtrsParaVinculo,
  criarRascunhoComprovanteDescarte,
  enviarImagemComprovante,
  obterComprovanteDescartePorId,
  pathFromPublicUrlComprovante,
  removerObjetoStorage,
  type ComprovanteDescartePayload,
  type ColetaVinculoResumo,
  type MtrAutofillComprovante,
  type MtrVinculoResumo,
} from '../services/comprovantesDescarte'

type FormState = {
  codigo_remessa: string
  data_remessa: string
  cadri: string
  tipo_efluente: string
  linha_tratamento: string
  numero_mtr: string
  volume: string
  acondicionamento: string
  gerador_razao_social: string
  gerador_nome_fantasia: string
  gerador_endereco: string
  gerador_responsavel: string
  gerador_telefone: string
  gerador_contrato: string
  transportador_razao_social: string
  transportador_telefone: string
  placa: string
  motorista_nome: string
  motorista_cnh: string
  transportador_responsavel_assinatura_nome: string
  transportador_responsavel_assinatura_data: string
  destinatario_razao_social: string
  destinatario_endereco: string
  destinatario_telefone: string
  destinatario_responsavel_assinatura_nome: string
  destinatario_responsavel_assinatura_data: string
  peso_entrada: string
  data_entrada: string
  peso_saida: string
  data_saida: string
  observacoes: string
  coleta_id: string
  mtr_id: string
  controle_massa_id: string
  faturamento_liberado: boolean
  status_documento: StatusDocumentoComprovante
  foto_entrada_url: string
  foto_saida_url: string
  foto_entrada_nome_arquivo: string
  foto_saida_nome_arquivo: string
  foto_entrada_conferida: boolean
  foto_entrada_observacao_conferencia: string
  foto_saida_conferida: boolean
  foto_saida_observacao_conferencia: string
  fotos_extras: ComprovanteFotoExtraItem[]
}

const formVazio = (): FormState => ({
  codigo_remessa: '',
  data_remessa: '',
  cadri: '',
  tipo_efluente: '',
  linha_tratamento: '',
  numero_mtr: '',
  volume: '',
  acondicionamento: '',
  gerador_razao_social: '',
  gerador_nome_fantasia: '',
  gerador_endereco: '',
  gerador_responsavel: '',
  gerador_telefone: '',
  gerador_contrato: '',
  transportador_razao_social: '',
  transportador_telefone: '',
  placa: '',
  motorista_nome: '',
  motorista_cnh: '',
  transportador_responsavel_assinatura_nome: '',
  transportador_responsavel_assinatura_data: '',
  destinatario_razao_social: '',
  destinatario_endereco: '',
  destinatario_telefone: '',
  destinatario_responsavel_assinatura_nome: '',
  destinatario_responsavel_assinatura_data: '',
  peso_entrada: '',
  data_entrada: '',
  peso_saida: '',
  data_saida: '',
  observacoes: '',
  coleta_id: '',
  mtr_id: '',
  controle_massa_id: '',
  faturamento_liberado: false,
  status_documento: 'rascunho',
  foto_entrada_url: '',
  foto_saida_url: '',
  foto_entrada_nome_arquivo: '',
  foto_saida_nome_arquivo: '',
  foto_entrada_conferida: false,
  foto_entrada_observacao_conferencia: '',
  foto_saida_conferida: false,
  foto_saida_observacao_conferencia: '',
  fotos_extras: [],
})

function rowParaForm(r: ComprovanteDescarteRow): FormState {
  return {
    codigo_remessa: r.codigo_remessa ?? '',
    data_remessa: dataIsoParaInputDate(r.data_remessa),
    cadri: r.cadri ?? '',
    tipo_efluente: r.tipo_efluente ?? '',
    linha_tratamento: r.linha_tratamento ?? '',
    numero_mtr: r.numero_mtr ?? '',
    volume: r.volume ?? '',
    acondicionamento: r.acondicionamento ?? '',
    gerador_razao_social: r.gerador_razao_social ?? '',
    gerador_nome_fantasia: r.gerador_nome_fantasia ?? '',
    gerador_endereco: r.gerador_endereco ?? '',
    gerador_responsavel: r.gerador_responsavel ?? '',
    gerador_telefone: r.gerador_telefone ?? '',
    gerador_contrato: r.gerador_contrato ?? '',
    transportador_razao_social: r.transportador_razao_social ?? '',
    transportador_telefone: r.transportador_telefone ?? '',
    placa: r.placa ?? '',
    motorista_nome: r.motorista_nome ?? '',
    motorista_cnh: r.motorista_cnh ?? '',
    transportador_responsavel_assinatura_nome:
      r.transportador_responsavel_assinatura_nome ?? '',
    transportador_responsavel_assinatura_data: dataIsoParaInputDate(
      r.transportador_responsavel_assinatura_data
    ),
    destinatario_razao_social: r.destinatario_razao_social ?? '',
    destinatario_endereco: r.destinatario_endereco ?? '',
    destinatario_telefone: r.destinatario_telefone ?? '',
    destinatario_responsavel_assinatura_nome:
      r.destinatario_responsavel_assinatura_nome ?? '',
    destinatario_responsavel_assinatura_data: dataIsoParaInputDate(
      r.destinatario_responsavel_assinatura_data
    ),
    peso_entrada:
      r.peso_entrada === null || r.peso_entrada === undefined
        ? ''
        : String(r.peso_entrada).replace('.', ','),
    data_entrada: dataHoraIsoParaInputLocal(r.data_entrada),
    peso_saida:
      r.peso_saida === null || r.peso_saida === undefined ? '' : String(r.peso_saida).replace('.', ','),
    data_saida: dataHoraIsoParaInputLocal(r.data_saida),
    observacoes: r.observacoes ?? '',
    coleta_id: r.coleta_id ?? '',
    mtr_id: r.mtr_id ?? '',
    controle_massa_id: r.controle_massa_id ?? '',
    faturamento_liberado: r.faturamento_liberado,
    status_documento: r.status_documento,
    foto_entrada_url: r.foto_entrada_url ?? '',
    foto_saida_url: r.foto_saida_url ?? '',
    foto_entrada_nome_arquivo: r.foto_entrada_nome_arquivo ?? '',
    foto_saida_nome_arquivo: r.foto_saida_nome_arquivo ?? '',
    foto_entrada_conferida: r.foto_entrada_conferida,
    foto_entrada_observacao_conferencia: r.foto_entrada_observacao_conferencia ?? '',
    foto_saida_conferida: r.foto_saida_conferida,
    foto_saida_observacao_conferencia: r.foto_saida_observacao_conferencia ?? '',
    fotos_extras: r.fotos_extras ?? [],
  }
}

function formParaPayload(f: FormState): ComprovanteDescartePayload {
  const pe = parsePesoInput(f.peso_entrada)
  const ps = parsePesoInput(f.peso_saida)
  return {
    codigo_remessa: f.codigo_remessa.trim() || null,
    data_remessa: f.data_remessa.trim() || null,
    cadri: f.cadri.trim() || null,
    tipo_efluente: f.tipo_efluente.trim() || null,
    linha_tratamento: f.linha_tratamento.trim() || null,
    numero_mtr: f.numero_mtr.trim() || null,
    volume: f.volume.trim() || null,
    acondicionamento: f.acondicionamento.trim() || null,
    gerador_razao_social: f.gerador_razao_social.trim() || null,
    gerador_nome_fantasia: f.gerador_nome_fantasia.trim() || null,
    gerador_endereco: f.gerador_endereco.trim() || null,
    gerador_responsavel: f.gerador_responsavel.trim() || null,
    gerador_telefone: f.gerador_telefone.trim() || null,
    gerador_contrato: f.gerador_contrato.trim() || null,
    transportador_razao_social: f.transportador_razao_social.trim() || null,
    transportador_telefone: f.transportador_telefone.trim() || null,
    placa: f.placa.trim() || null,
    motorista_nome: f.motorista_nome.trim() || null,
    motorista_cnh: f.motorista_cnh.trim() || null,
    transportador_responsavel_assinatura_nome:
      f.transportador_responsavel_assinatura_nome.trim() || null,
    transportador_responsavel_assinatura_data:
      f.transportador_responsavel_assinatura_data.trim() || null,
    destinatario_razao_social: f.destinatario_razao_social.trim() || null,
    destinatario_endereco: f.destinatario_endereco.trim() || null,
    destinatario_telefone: f.destinatario_telefone.trim() || null,
    destinatario_responsavel_assinatura_nome:
      f.destinatario_responsavel_assinatura_nome.trim() || null,
    destinatario_responsavel_assinatura_data:
      f.destinatario_responsavel_assinatura_data.trim() || null,
    peso_entrada: pe,
    peso_saida: ps,
    data_entrada: inputLocalParaIsoUtc(f.data_entrada),
    data_saida: inputLocalParaIsoUtc(f.data_saida),
    observacoes: f.observacoes.trim() || null,
    coleta_id: f.coleta_id.trim() || null,
    mtr_id: f.mtr_id.trim() || null,
    controle_massa_id: f.controle_massa_id.trim() || null,
    faturamento_liberado: f.faturamento_liberado,
    status_documento: f.status_documento,
    foto_entrada_url: f.foto_entrada_url.trim() || null,
    foto_saida_url: f.foto_saida_url.trim() || null,
    foto_entrada_nome_arquivo: f.foto_entrada_nome_arquivo.trim() || null,
    foto_saida_nome_arquivo: f.foto_saida_nome_arquivo.trim() || null,
    foto_entrada_conferida: f.foto_entrada_conferida,
    foto_entrada_observacao_conferencia: f.foto_entrada_observacao_conferencia.trim() || null,
    foto_saida_conferida: f.foto_saida_conferida,
    foto_saida_observacao_conferencia: f.foto_saida_observacao_conferencia.trim() || null,
    fotos_extras: f.fotos_extras,
  }
}

/** Garante que as fotos do comprovante estão carregadas antes do diálogo de impressão (Chrome PDF). */
async function aguardarImagensComprovantePrintRoot(): Promise<void> {
  const root = document.getElementById('comprovante-descarte-print-root')
  if (!root) return

  const imgs = [...root.querySelectorAll('img')] as HTMLImageElement[]
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (!img.getAttribute('src')?.trim()) {
            resolve()
            return
          }
          if (img.complete && img.naturalHeight > 0) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          void img.decode?.().catch(() => {})
        }),
    ),
  )
}

function formParaPreviewRow(f: FormState, base: ComprovanteDescarteRow): ComprovanteDescarteRow {
  const p = formParaPayload(f)
  const pe = p.peso_entrada ?? null
  const ps = p.peso_saida ?? null
  return {
    ...base,
    ...p,
    peso_entrada: pe,
    peso_saida: ps,
    peso_liquido: calcularPesoLiquidoLocal(pe, ps),
    fotos_extras: f.fotos_extras,
    foto_entrada_conferida: f.foto_entrada_conferida,
    foto_saida_conferida: f.foto_saida_conferida,
    foto_entrada_observacao_conferencia: f.foto_entrada_observacao_conferencia || null,
    foto_saida_observacao_conferencia: f.foto_saida_observacao_conferencia || null,
    foto_entrada_ocr_meta: base.foto_entrada_ocr_meta,
    foto_saida_ocr_meta: base.foto_saida_ocr_meta,
  } as ComprovanteDescarteRow
}

export default function ComprovanteDescarteForm() {
  const { id: idParam } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isNovo = location.pathname.endsWith('/novo')
  const isEditar = location.pathname.endsWith('/editar')
  const somenteLeitura = !isNovo && !isEditar

  const criouRascunho = useRef(false)

  const [cargo, setCargo] = useState<string | null>(null)
  const podeMutar = cargoPodeMutarComprovanteDescarte(cargo)
  const bloqueado = somenteLeitura || !podeMutar

  const [loading, setLoading] = useState(true)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState('')
  const [errosVal, setErrosVal] = useState<Record<string, string>>({})
  const [baseRow, setBaseRow] = useState<ComprovanteDescarteRow | null>(null)
  const [form, setForm] = useState<FormState>(formVazio)
  const [aba, setAba] = useState<'formulario' | 'documento'>('formulario')

  const [coletasOp, setColetasOp] = useState<ColetaVinculoResumo[]>([])
  const [mtrsOp, setMtrsOp] = useState<MtrVinculoResumo[]>([])

  const comprovanteId = baseRow?.id ?? idParam ?? ''

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('usuarios').select('cargo').eq('id', user.id).maybeSingle()
      setCargo(data?.cargo ?? null)
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      const [c, m] = await Promise.all([
        buscarColetasParaVinculo(supabase, 400),
        buscarMtrsParaVinculo(supabase, 400),
      ])
      if (!c.error) setColetasOp(c.data)
      if (!m.error) setMtrsOp(m.data)
    })()
  }, [])

  useEffect(() => {
    if (!isNovo || criouRascunho.current) return
    criouRascunho.current = true
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) {
        setErro('Sessão inválida.')
        setLoading(false)
        return
      }
      const { data, error } = await criarRascunhoComprovanteDescarte(supabase, user.id)
      if (error || !data) {
        setErro(error?.message ?? 'Não foi possível criar o rascunho.')
        setLoading(false)
        return
      }
      navigate(`/comprovantes-descarte/${data.id}/editar`, { replace: true })
    })()
  }, [isNovo, navigate])

  const carregarId = useCallback(
    async (rid: string) => {
      setLoading(true)
      setErro('')
      const { data, error } = await obterComprovanteDescartePorId(supabase, rid)
      if (error || !data) {
        setErro(error?.message ?? 'Comprovante não encontrado.')
        setBaseRow(null)
        setLoading(false)
        return
      }
      setBaseRow(data)
      setForm(rowParaForm(data))
      setLoading(false)
    },
    []
  )

  useEffect(() => {
    if (isNovo) return
    if (!idParam) {
      queueMicrotask(() => {
        setLoading(false)
      })
      return
    }
    queueMicrotask(() => {
      void carregarId(idParam)
    })
  }, [idParam, isNovo, carregarId])

  useEffect(() => {
    if (location.hash !== '#imprimir') return
    if (!baseRow) return
    let cancelled = false
    void (async () => {
      await new Promise((r) => window.setTimeout(r, 150))
      await aguardarImagensComprovantePrintRoot()
      if (cancelled) return
      window.print()
      navigate(location.pathname + location.search, { replace: true })
    })()
    return () => {
      cancelled = true
    }
  }, [location.hash, location.pathname, location.search, navigate, baseRow])

  const previewRow = useMemo(() => {
    if (!baseRow) return null
    return formParaPreviewRow(form, baseRow)
  }, [form, baseRow])

  async function persistir(extra?: Partial<ComprovanteDescartePayload>, formOverride?: FormState) {
    if (!baseRow?.id || bloqueado) return
    setGravando(true)
    setErro('')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) {
      setGravando(false)
      return
    }
    const baseForm = formOverride ?? form
    const payload = { ...formParaPayload(baseForm), ...extra }
    const { error } = await atualizarComprovanteDescarte(supabase, baseRow.id, payload, user.id)
    setGravando(false)
    if (error) {
      setErro(error.message)
      return
    }
    await carregarId(baseRow.id)
  }

  async function aoVincularColeta(cid: string) {
    setForm((prev) => ({ ...prev, coleta_id: cid }))
    if (!cid.trim()) return
    const { data, error } = await buscarColetaPorId(supabase, cid)
    if (error || !data) return
    setForm((prev) => ({
      ...prev,
      coleta_id: cid,
      gerador_razao_social: prev.gerador_razao_social || data.cliente,
      tipo_efluente: prev.tipo_efluente || data.tipo_residuo,
      placa: prev.placa || data.placa,
      motorista_nome: prev.motorista_nome || data.motorista,
      mtr_id: data.mtr_id || prev.mtr_id,
      volume:
        prev.volume ||
        (data.peso_liquido != null ? `${String(data.peso_liquido).replace('.', ',')} kg` : ''),
    }))
    if (data.mtr_id) {
      const m = await buscarMtrPorId(supabase, data.mtr_id)
      if (m.data) aplicarDadosMtr(m.data)
    }
  }

  function aplicarDadosMtr(m: MtrAutofillComprovante | null) {
    if (!m) return
    setForm((prev) => ({
      ...prev,
      numero_mtr: prev.numero_mtr || m.numero,
      gerador_razao_social: prev.gerador_razao_social || m.gerador,
      gerador_endereco: prev.gerador_endereco || m.gerador_endereco || '',
      gerador_responsavel: prev.gerador_responsavel || m.gerador_responsavel || '',
      gerador_telefone: prev.gerador_telefone || m.gerador_telefone || '',
      cadri: prev.cadri || m.cadri || '',
      transportador_razao_social: prev.transportador_razao_social || m.transportador,
      transportador_telefone: prev.transportador_telefone || m.transportador_telefone || '',
      tipo_efluente: prev.tipo_efluente || m.tipo_residuo,
      destinatario_razao_social: prev.destinatario_razao_social || m.destinatario_razao || '',
      destinatario_endereco: prev.destinatario_endereco || m.destinatario_endereco || '',
      destinatario_telefone: prev.destinatario_telefone || m.destinatario_telefone || '',
      volume:
        prev.volume ||
        (m.quantidade != null
          ? `${String(m.quantidade).replace('.', ',')} ${m.unidade ?? ''}`.trim()
          : ''),
    }))
  }

  async function aoEscolherMtr(mid: string) {
    setForm((prev) => ({ ...prev, mtr_id: mid }))
    if (!mid.trim()) return
    const { data } = await buscarMtrPorId(supabase, mid)
    aplicarDadosMtr(data)
  }

  async function uploadEntrada(file: File) {
    if (!comprovanteId) return
    const anterior = form.foto_entrada_url
    const { publicUrl, error } = await enviarImagemComprovante(supabase, comprovanteId, 'entrada', file)
    if (error) {
      window.alert(error.message)
      return
    }
    const pathAnt = pathFromPublicUrlComprovante(anterior)
    if (pathAnt) void removerObjetoStorage(supabase, [pathAnt])
    const next = {
      ...form,
      foto_entrada_url: publicUrl,
      foto_entrada_nome_arquivo: file.name,
    }
    setForm(next)
    await persistir(undefined, next)
  }

  async function uploadSaida(file: File) {
    if (!comprovanteId) return
    const anterior = form.foto_saida_url
    const { publicUrl, error } = await enviarImagemComprovante(supabase, comprovanteId, 'saida', file)
    if (error) {
      window.alert(error.message)
      return
    }
    const pathAnt = pathFromPublicUrlComprovante(anterior)
    if (pathAnt) void removerObjetoStorage(supabase, [pathAnt])
    const next = {
      ...form,
      foto_saida_url: publicUrl,
      foto_saida_nome_arquivo: file.name,
    }
    setForm(next)
    await persistir(undefined, next)
  }

  async function uploadExtra(file: File) {
    if (!comprovanteId) return
    const { publicUrl, error } = await enviarImagemComprovante(supabase, comprovanteId, 'extras', file)
    if (error) {
      window.alert(error.message)
      return
    }
    const next = {
      ...form,
      fotos_extras: [
        ...form.fotos_extras,
        {
          url: publicUrl,
          nome_arquivo: file.name,
          conferida_manual: false,
          observacao_conferencia: '',
        },
      ],
    }
    setForm(next)
    await persistir(undefined, next)
  }

  async function removerEntrada() {
    const anterior = form.foto_entrada_url
    const pathAnt = pathFromPublicUrlComprovante(anterior)
    if (pathAnt) void removerObjetoStorage(supabase, [pathAnt])
    const next = { ...form, foto_entrada_url: '', foto_entrada_nome_arquivo: '' }
    setForm(next)
    await persistir(undefined, next)
  }

  async function removerSaida() {
    const anterior = form.foto_saida_url
    const pathAnt = pathFromPublicUrlComprovante(anterior)
    if (pathAnt) void removerObjetoStorage(supabase, [pathAnt])
    const next = { ...form, foto_saida_url: '', foto_saida_nome_arquivo: '' }
    setForm(next)
    await persistir(undefined, next)
  }

  async function removerExtra(i: number) {
    const ex = form.fotos_extras[i]
    if (ex?.url) {
      const pathAnt = pathFromPublicUrlComprovante(ex.url)
      if (pathAnt) void removerObjetoStorage(supabase, [pathAnt])
    }
    const next = {
      ...form,
      fotos_extras: form.fotos_extras.filter((_, j) => j !== i),
    }
    setForm(next)
    await persistir(undefined, next)
  }

  function atualizarExtra(i: number, patch: Partial<ComprovanteFotoExtraItem>) {
    setForm((p) => ({
      ...p,
      fotos_extras: p.fotos_extras.map((it, j) => (j === i ? { ...it, ...patch } : it)),
    }))
  }

  const pesoLiquidoLocal = calcularPesoLiquidoLocal(
    parsePesoInput(form.peso_entrada),
    parsePesoInput(form.peso_saida)
  )

  async function salvarRascunho() {
    setErrosVal({})
    await persistir({ status_documento: 'rascunho' })
  }

  async function finalizar() {
    const payload = formParaPayload(form)
    const v = validarFinalizacao({
      codigo_remessa: payload.codigo_remessa ?? null,
      data_remessa: payload.data_remessa ?? null,
      numero_mtr: payload.numero_mtr ?? null,
      tipo_efluente: payload.tipo_efluente ?? null,
      gerador_razao_social: payload.gerador_razao_social ?? null,
      transportador_razao_social: payload.transportador_razao_social ?? null,
      motorista_nome: payload.motorista_nome ?? null,
      destinatario_razao_social: payload.destinatario_razao_social ?? null,
      peso_entrada: payload.peso_entrada ?? null,
      peso_saida: payload.peso_saida ?? null,
    })
    setErrosVal(v as Record<string, string>)
    if (Object.keys(v).length > 0) {
      setAba('formulario')
      return
    }
    await persistir({ status_documento: 'finalizado' })
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="cd-page">
          <p style={{ color: '#64748b' }}>A carregar comprovante…</p>
        </div>
      </MainLayout>
    )
  }

  if (!baseRow) {
    return (
      <MainLayout>
        <div className="cd-page">
          <p className="cd-erro-msg">{erro || 'Registo indisponível.'}</p>
          <Link to="/comprovantes-descarte" className="cd-btn cd-btn--secondary">
            Voltar
          </Link>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="cd-page">
        <div className="cd-page__hero no-print" style={{ marginBottom: 16 }}>
          <div>
            <h1 className="cd-page__title">Dados, fotos e conclusão do comprovante</h1>
            <p className="cd-page__lead">
              Preencha a ficha, valide as imagens e as assinaturas e finalize o documento — o nome curto do
              módulo permanece no cabeçalho.
            </p>
          </div>
        </div>
        <div className="cd-form-toolbar no-print">
          <Link to="/comprovantes-descarte" className="cd-btn cd-btn--secondary">
            Voltar à listagem
          </Link>
          {somenteLeitura && podeMutar ? (
            <Link to={`/comprovantes-descarte/${baseRow.id}/editar`} className="cd-btn">
              Editar
            </Link>
          ) : null}
          <button
            type="button"
            className="cd-btn cd-btn--secondary"
            onClick={() =>
              void (async () => {
                await aguardarImagensComprovantePrintRoot()
                window.print()
              })()
            }
          >
            Imprimir comprovante
          </button>
        </div>

        <div className="cd-tabs no-print" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={aba === 'formulario' ? 'cd-tabs__on' : ''}
            onClick={() => setAba('formulario')}
          >
            Formulário
          </button>
          <button
            type="button"
            className={aba === 'documento' ? 'cd-tabs__on' : ''}
            onClick={() => setAba('documento')}
          >
            Documento
          </button>
        </div>

        {erro ? <p className="cd-erro-msg">{erro}</p> : null}

        <div className="cd-form-layout">
          <div
            className="cd-form-stack no-print"
            style={{ display: aba === 'documento' ? 'none' : undefined }}
          >
            <div className="cd-secao">
              <h2 className="cd-secao__titulo">Controlo do documento</h2>
              <div className="cd-grid2">
                <div>
                  <label className="cd-label" htmlFor="cd-st">
                    Estado
                  </label>
                  <select
                    id="cd-st"
                    className="cd-select"
                    disabled={bloqueado}
                    value={form.status_documento}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        status_documento: e.target.value as StatusDocumentoComprovante,
                      }))
                    }
                  >
                    <option value="rascunho">Rascunho</option>
                    <option value="em_conferencia">Em conferência</option>
                    <option value="finalizado">Finalizado</option>
                    <option value="aprovado_faturamento">Aprovado p/ faturamento</option>
                  </select>
                </div>
                <label className="cd-check" style={{ marginTop: 22 }}>
                  <input
                    type="checkbox"
                    disabled={bloqueado}
                    checked={form.faturamento_liberado}
                    onChange={(e) => setForm((p) => ({ ...p, faturamento_liberado: e.target.checked }))}
                  />
                  <span>Liberar para faturamento</span>
                </label>
              </div>
              <div className="cd-grid2" style={{ marginTop: 12 }}>
                <div>
                  <label className="cd-label" htmlFor="cd-col">
                    Coleta (opcional)
                  </label>
                  <select
                    id="cd-col"
                    className="cd-select"
                    disabled={bloqueado}
                    value={form.coleta_id}
                    onChange={(e) => void aoVincularColeta(e.target.value)}
                  >
                    <option value="">—</option>
                    {coletasOp.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.cliente}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-mtr">
                    MTR (opcional)
                  </label>
                  <select
                    id="cd-mtr"
                    className="cd-select"
                    disabled={bloqueado}
                    value={form.mtr_id}
                    onChange={(e) => void aoEscolherMtr(e.target.value)}
                  >
                    <option value="">—</option>
                    {mtrsOp.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.numero} · {m.cliente}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-cm">
                    Controle de massa ID (opcional)
                  </label>
                  <input
                    id="cd-cm"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.controle_massa_id}
                    onChange={(e) => setForm((p) => ({ ...p, controle_massa_id: e.target.value }))}
                    placeholder="UUID futuro"
                  />
                </div>
              </div>
            </div>

            <div className="cd-secao">
              <h2 className="cd-secao__titulo">1. Descrição dos resíduos</h2>
              <div className="cd-grid2">
                <div>
                  <label className="cd-label cd-label__req" htmlFor="cd-cod">
                    Código da remessa
                  </label>
                  <input
                    id="cd-cod"
                    className={`cd-input ${errosVal.codigo_remessa ? 'cd-input--erro' : ''}`}
                    disabled={bloqueado}
                    value={form.codigo_remessa}
                    onChange={(e) => setForm((p) => ({ ...p, codigo_remessa: e.target.value }))}
                  />
                  {errosVal.codigo_remessa ? (
                    <div className="cd-erro-msg">{errosVal.codigo_remessa}</div>
                  ) : null}
                </div>
                <div>
                  <label className="cd-label cd-label__req" htmlFor="cd-dtr">
                    Data da remessa
                  </label>
                  <input
                    id="cd-dtr"
                    type="date"
                    className={`cd-input ${errosVal.data_remessa ? 'cd-input--erro' : ''}`}
                    disabled={bloqueado}
                    value={form.data_remessa}
                    onChange={(e) => setForm((p) => ({ ...p, data_remessa: e.target.value }))}
                  />
                  {errosVal.data_remessa ? (
                    <div className="cd-erro-msg">{errosVal.data_remessa}</div>
                  ) : null}
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-cadri">
                    CADRI
                  </label>
                  <input
                    id="cd-cadri"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.cadri}
                    onChange={(e) => setForm((p) => ({ ...p, cadri: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="cd-label cd-label__req" htmlFor="cd-tipo">
                    Tipo e origem do efluente
                  </label>
                  <input
                    id="cd-tipo"
                    className={`cd-input ${errosVal.tipo_efluente ? 'cd-input--erro' : ''}`}
                    disabled={bloqueado}
                    value={form.tipo_efluente}
                    onChange={(e) => setForm((p) => ({ ...p, tipo_efluente: e.target.value }))}
                  />
                  {errosVal.tipo_efluente ? (
                    <div className="cd-erro-msg">{errosVal.tipo_efluente}</div>
                  ) : null}
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-linha">
                    Linha de tratamento
                  </label>
                  <input
                    id="cd-linha"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.linha_tratamento}
                    onChange={(e) => setForm((p) => ({ ...p, linha_tratamento: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="cd-label cd-label__req" htmlFor="cd-nmtr">
                    Número MTR
                  </label>
                  <input
                    id="cd-nmtr"
                    className={`cd-input ${errosVal.numero_mtr ? 'cd-input--erro' : ''}`}
                    disabled={bloqueado}
                    value={form.numero_mtr}
                    onChange={(e) => setForm((p) => ({ ...p, numero_mtr: e.target.value }))}
                  />
                  {errosVal.numero_mtr ? <div className="cd-erro-msg">{errosVal.numero_mtr}</div> : null}
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-vol">
                    Volume
                  </label>
                  <input
                    id="cd-vol"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.volume}
                    onChange={(e) => setForm((p) => ({ ...p, volume: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-ac">
                    Acondicionamento
                  </label>
                  <input
                    id="cd-ac"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.acondicionamento}
                    onChange={(e) => setForm((p) => ({ ...p, acondicionamento: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="cd-secao">
              <h2 className="cd-secao__titulo">2. Gerador</h2>
              <div className="cd-grid2">
                <div>
                  <label className="cd-label cd-label__req" htmlFor="cd-grs">
                    Razão social
                  </label>
                  <input
                    id="cd-grs"
                    className={`cd-input ${errosVal.gerador_razao_social ? 'cd-input--erro' : ''}`}
                    disabled={bloqueado}
                    value={form.gerador_razao_social}
                    onChange={(e) => setForm((p) => ({ ...p, gerador_razao_social: e.target.value }))}
                  />
                  {errosVal.gerador_razao_social ? (
                    <div className="cd-erro-msg">{errosVal.gerador_razao_social}</div>
                  ) : null}
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-gnf">
                    Nome fantasia
                  </label>
                  <input
                    id="cd-gnf"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.gerador_nome_fantasia}
                    onChange={(e) => setForm((p) => ({ ...p, gerador_nome_fantasia: e.target.value }))}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="cd-label" htmlFor="cd-ge">
                    Endereço
                  </label>
                  <input
                    id="cd-ge"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.gerador_endereco}
                    onChange={(e) => setForm((p) => ({ ...p, gerador_endereco: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-gresp">
                    Responsável
                  </label>
                  <input
                    id="cd-gresp"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.gerador_responsavel}
                    onChange={(e) => setForm((p) => ({ ...p, gerador_responsavel: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-gtel">
                    Telefone
                  </label>
                  <input
                    id="cd-gtel"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.gerador_telefone}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, gerador_telefone: formatarTelefoneBr(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-gc">
                    Contrato
                  </label>
                  <input
                    id="cd-gc"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.gerador_contrato}
                    onChange={(e) => setForm((p) => ({ ...p, gerador_contrato: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="cd-secao">
              <h2 className="cd-secao__titulo">3. Transportador</h2>
              <div className="cd-grid2">
                <div>
                  <label className="cd-label cd-label__req" htmlFor="cd-trs">
                    Razão social
                  </label>
                  <input
                    id="cd-trs"
                    className={`cd-input ${errosVal.transportador_razao_social ? 'cd-input--erro' : ''}`}
                    disabled={bloqueado}
                    value={form.transportador_razao_social}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, transportador_razao_social: e.target.value }))
                    }
                  />
                  {errosVal.transportador_razao_social ? (
                    <div className="cd-erro-msg">{errosVal.transportador_razao_social}</div>
                  ) : null}
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-ttel">
                    Telefone
                  </label>
                  <input
                    id="cd-ttel"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.transportador_telefone}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        transportador_telefone: formatarTelefoneBr(e.target.value),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-placa">
                    Placa
                  </label>
                  <input
                    id="cd-placa"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.placa}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, placa: e.target.value.toUpperCase() }))
                    }
                  />
                </div>
                <div>
                  <label className="cd-label cd-label__req" htmlFor="cd-mot">
                    Motorista
                  </label>
                  <input
                    id="cd-mot"
                    className={`cd-input ${errosVal.motorista_nome ? 'cd-input--erro' : ''}`}
                    disabled={bloqueado}
                    value={form.motorista_nome}
                    onChange={(e) => setForm((p) => ({ ...p, motorista_nome: e.target.value }))}
                  />
                  {errosVal.motorista_nome ? (
                    <div className="cd-erro-msg">{errosVal.motorista_nome}</div>
                  ) : null}
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-cnh">
                    CNH
                  </label>
                  <input
                    id="cd-cnh"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.motorista_cnh}
                    onChange={(e) => setForm((p) => ({ ...p, motorista_cnh: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-tr-nome">
                    Responsável assinatura (nome)
                  </label>
                  <input
                    id="cd-tr-nome"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.transportador_responsavel_assinatura_nome}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        transportador_responsavel_assinatura_nome: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-tr-dt">
                    Data assinatura
                  </label>
                  <input
                    id="cd-tr-dt"
                    type="date"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.transportador_responsavel_assinatura_data}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        transportador_responsavel_assinatura_data: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="cd-secao">
              <h2 className="cd-secao__titulo">4. Destinatário</h2>
              <div className="cd-grid2">
                <div>
                  <label className="cd-label cd-label__req" htmlFor="cd-drs">
                    Razão social
                  </label>
                  <input
                    id="cd-drs"
                    className={`cd-input ${errosVal.destinatario_razao_social ? 'cd-input--erro' : ''}`}
                    disabled={bloqueado}
                    value={form.destinatario_razao_social}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, destinatario_razao_social: e.target.value }))
                    }
                  />
                  {errosVal.destinatario_razao_social ? (
                    <div className="cd-erro-msg">{errosVal.destinatario_razao_social}</div>
                  ) : null}
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-dtel">
                    Telefone
                  </label>
                  <input
                    id="cd-dtel"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.destinatario_telefone}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        destinatario_telefone: formatarTelefoneBr(e.target.value),
                      }))
                    }
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="cd-label" htmlFor="cd-dend">
                    Endereço
                  </label>
                  <input
                    id="cd-dend"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.destinatario_endereco}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, destinatario_endereco: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-dsig">
                    Responsável assinatura (nome)
                  </label>
                  <input
                    id="cd-dsig"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.destinatario_responsavel_assinatura_nome}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        destinatario_responsavel_assinatura_nome: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-ddt">
                    Data assinatura
                  </label>
                  <input
                    id="cd-ddt"
                    type="date"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.destinatario_responsavel_assinatura_data}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        destinatario_responsavel_assinatura_data: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="cd-secao">
              <h2 className="cd-secao__titulo">5. Pesagem</h2>
              <div className="cd-grid2">
                <div>
                  <label className="cd-label cd-label__req" htmlFor="cd-pe">
                    Peso entrada (kg)
                  </label>
                  <input
                    id="cd-pe"
                    className={`cd-input ${errosVal.peso_entrada ? 'cd-input--erro' : ''}`}
                    disabled={bloqueado}
                    inputMode="decimal"
                    value={form.peso_entrada}
                    onChange={(e) => setForm((p) => ({ ...p, peso_entrada: e.target.value }))}
                  />
                  {errosVal.peso_entrada ? (
                    <div className="cd-erro-msg">{errosVal.peso_entrada}</div>
                  ) : null}
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-de">
                    Data/hora entrada
                  </label>
                  <input
                    id="cd-de"
                    type="datetime-local"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.data_entrada}
                    onChange={(e) => setForm((p) => ({ ...p, data_entrada: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="cd-label cd-label__req" htmlFor="cd-ps">
                    Peso saída (kg)
                  </label>
                  <input
                    id="cd-ps"
                    className={`cd-input ${errosVal.peso_saida ? 'cd-input--erro' : ''}`}
                    disabled={bloqueado}
                    inputMode="decimal"
                    value={form.peso_saida}
                    onChange={(e) => setForm((p) => ({ ...p, peso_saida: e.target.value }))}
                  />
                  {errosVal.peso_saida ? (
                    <div className="cd-erro-msg">{errosVal.peso_saida}</div>
                  ) : null}
                </div>
                <div>
                  <label className="cd-label" htmlFor="cd-ds">
                    Data/hora saída
                  </label>
                  <input
                    id="cd-ds"
                    type="datetime-local"
                    className="cd-input"
                    disabled={bloqueado}
                    value={form.data_saida}
                    onChange={(e) => setForm((p) => ({ ...p, data_saida: e.target.value }))}
                  />
                </div>
              </div>
              <div
                className="cd-doc-peso-liquido"
                style={{ marginTop: 14, borderStyle: 'solid', borderWidth: 1 }}
              >
                <span className="cd-doc-peso-liquido__label">Peso líquido calculado</span>
                <span className="cd-doc-peso-liquido__valor">
                  {pesoLiquidoLocal == null ? '—' : `${String(pesoLiquidoLocal).replace('.', ',')} kg`}
                </span>
              </div>
            </div>

            <div className="cd-secao">
              <h2 className="cd-secao__titulo">Fotos de comprovação</h2>
              <div className="cd-grid2">
                <ComprovanteFotoSlot
                  titulo="Foto da entrada"
                  url={form.foto_entrada_url || null}
                  nomeArquivo={form.foto_entrada_nome_arquivo || null}
                  conferida={form.foto_entrada_conferida}
                  observacaoConferencia={form.foto_entrada_observacao_conferencia}
                  disabled={bloqueado}
                  onPick={(file) => void uploadEntrada(file)}
                  onRemove={() => void removerEntrada()}
                  onToggleConferida={(v) => setForm((p) => ({ ...p, foto_entrada_conferida: v }))}
                  onObservacaoConferencia={(v) =>
                    setForm((p) => ({ ...p, foto_entrada_observacao_conferencia: v }))
                  }
                />
                <ComprovanteFotoSlot
                  titulo="Foto da saída"
                  url={form.foto_saida_url || null}
                  nomeArquivo={form.foto_saida_nome_arquivo || null}
                  conferida={form.foto_saida_conferida}
                  observacaoConferencia={form.foto_saida_observacao_conferencia}
                  disabled={bloqueado}
                  onPick={(file) => void uploadSaida(file)}
                  onRemove={() => void removerSaida()}
                  onToggleConferida={(v) => setForm((p) => ({ ...p, foto_saida_conferida: v }))}
                  onObservacaoConferencia={(v) =>
                    setForm((p) => ({ ...p, foto_saida_observacao_conferencia: v }))
                  }
                />
              </div>
              <div style={{ marginTop: 14 }}>
                <div className="cd-label">Fotos extras</div>
                <div className="cd-extras-grid">
                  {form.fotos_extras.map((ex, i) => (
                    <div key={`${ex.url}-${i}`} className="cd-foto-slot">
                      <div className="cd-foto-slot__head">
                        <span className="cd-foto-slot__titulo">{ex.nome_arquivo}</span>
                        {ex.conferida_manual ? (
                          <span className="cd-foto-slot__badge">Conferido</span>
                        ) : null}
                      </div>
                      <img src={ex.url} alt="" className="cd-foto-slot__preview" />
                      <label className="cd-check">
                        <input
                          type="checkbox"
                          disabled={bloqueado}
                          checked={Boolean(ex.conferida_manual)}
                          onChange={(e) =>
                            atualizarExtra(i, { conferida_manual: e.target.checked })
                          }
                        />
                        <span>Conferido</span>
                      </label>
                      <textarea
                        className="cd-input cd-input--area"
                        rows={2}
                        disabled={bloqueado}
                        placeholder="Observação da conferência"
                        value={ex.observacao_conferencia ?? ''}
                        onChange={(e) =>
                          atualizarExtra(i, { observacao_conferencia: e.target.value })
                        }
                      />
                      {!bloqueado ? (
                        <button
                          type="button"
                          className="cd-btn cd-btn--danger"
                          style={{ marginTop: 8, width: '100%' }}
                          onClick={() => void removerExtra(i)}
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {!bloqueado ? (
                    <label className="cd-foto-slot" style={{ cursor: 'pointer' }}>
                      <div className="cd-foto-slot__titulo">Adicionar foto extra</div>
                      <div className="cd-foto-slot__empty" style={{ marginTop: 8 }}>
                        Clique para enviar
                      </div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="cd-visually-hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          e.target.value = ''
                          if (f) void uploadExtra(f)
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="cd-secao">
              <h2 className="cd-secao__titulo">Observações gerais</h2>
              <textarea
                className="cd-input cd-input--area"
                rows={4}
                disabled={bloqueado}
                value={form.observacoes}
                onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
              />
            </div>

            {!bloqueado ? (
              <div className="cd-form-toolbar">
                <button
                  type="button"
                  className="cd-btn cd-btn--secondary"
                  disabled={gravando}
                  onClick={() => void salvarRascunho()}
                >
                  Salvar rascunho
                </button>
                <button
                  type="button"
                  className="cd-btn"
                  disabled={gravando}
                  onClick={() => void finalizar()}
                >
                  Finalizar comprovante
                </button>
                <button
                  type="button"
                  className="cd-btn cd-btn--ghost"
                  disabled={gravando}
                  onClick={() => navigate('/comprovantes-descarte')}
                >
                  Cancelar
                </button>
              </div>
            ) : null}
          </div>

          <div
            className="cd-preview-sticky"
            style={aba === 'formulario' ? undefined : { gridColumn: '1 / -1' }}
          >
            <div id="comprovante-descarte-print-root">
              {previewRow ? <ComprovanteDescarteDocument row={previewRow} /> : null}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
