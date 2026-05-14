import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import {
  TicketOperacionalPanel,
  type TicketColetaSnapshot,
} from '../components/TicketOperacionalPanel'
import { queryColetasListaFluxo } from '../lib/coletasSelectSeguimento'
import { idsContextoFromSearchParams, resolverColetaPorContextoUrl } from '../lib/coletaContextoUrl'
import { supabase } from '../lib/supabase'
import { normalizarEtapaColeta } from '../lib/fluxoEtapas'

async function carregarNumerosTicketPorColetaIds(ids: string[]): Promise<Map<string, string>> {
  const acc = new Map<string, string>()
  const chunk = 100
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const { data, error } = await supabase
      .from('tickets_operacionais')
      .select('coleta_id, numero')
      .in('coleta_id', slice)
    if (error) {
      console.error(error)
      continue
    }
    for (const row of (data ?? []) as Array<{ coleta_id: string; numero: string | null }>) {
      const cid = String(row.coleta_id)
      const n = String(row.numero ?? '').trim()
      if (n) acc.set(cid, n)
    }
  }
  return acc
}

export default function TicketOperacional() {
  const [searchParams, setSearchParams] = useSearchParams()
  const idsCtx = useMemo(() => idsContextoFromSearchParams(searchParams), [searchParams])

  const [coletas, setColetas] = useState<TicketColetaSnapshot[]>([])
  const [carregandoColetas, setCarregandoColetas] = useState(true)
  const [cargo, setCargo] = useState<string | null>(null)
  const [filtroListaColeta, setFiltroListaColeta] = useState('')
  const [numeroTicketPorColetaId, setNumeroTicketPorColetaId] = useState<Map<string, string>>(
    () => new Map()
  )

  const carregarColetas = useCallback(async () => {
    setCarregandoColetas(true)
    const { data, error } = await queryColetasListaFluxo(500)

    if (error) {
      console.error(error)
      setColetas([])
      setCarregandoColetas(false)
      return
    }

    const lista: TicketColetaSnapshot[] = ((data as Record<string, unknown>[]) || []).map((item) => {
      const etapaFluxo = normalizarEtapaColeta({
        fluxo_status: item.fluxo_status as string | null,
        etapa_operacional: item.etapa_operacional as string | null,
      })
      return {
        id: String(item.id),
        numero: String(item.numero_coleta ?? item.numero ?? item.id ?? ''),
        cliente: String(item.cliente ?? item.nome_cliente ?? ''),
        etapaFluxo,
        mtr_id: item.mtr_id != null ? String(item.mtr_id) : null,
        programacao_id: item.programacao_id != null ? String(item.programacao_id) : null,
        cliente_id: item.cliente_id != null ? String(item.cliente_id) : null,
        placa: String(item.placa ?? ''),
        motorista: String(item.motorista_nome ?? item.motorista ?? ''),
        tipo_residuo: String(item.tipo_residuo ?? item.residuo ?? ''),
        peso_tara:
          item.peso_tara !== null && item.peso_tara !== undefined ? Number(item.peso_tara) : null,
        peso_bruto:
          item.peso_bruto !== null && item.peso_bruto !== undefined ? Number(item.peso_bruto) : null,
        peso_liquido:
          item.peso_liquido !== null && item.peso_liquido !== undefined ? Number(item.peso_liquido) : null,
      }
    })

    setColetas(lista)
    setCarregandoColetas(false)
  }, [])

  useEffect(() => {
    if (coletas.length === 0) {
      setNumeroTicketPorColetaId(new Map())
      return
    }
    const ids = coletas.map((c) => c.id)
    void carregarNumerosTicketPorColetaIds(ids).then(setNumeroTicketPorColetaId)
  }, [coletas])

  const coletasComTicket = useMemo(() => {
    return coletas.map((c) => ({
      ...c,
      ticketOperacionalNumero: numeroTicketPorColetaId.get(c.id) ?? null,
    }))
  }, [coletas, numeroTicketPorColetaId])

  const coletasOpcoesFiltradas = useMemo(() => {
    const q = filtroListaColeta.trim().toLowerCase()
    if (!q) return coletasComTicket
    return coletasComTicket.filter((c) => {
      const ticketN = (c.ticketOperacionalNumero ?? '').toLowerCase()
      const num = String(c.numero ?? '').toLowerCase()
      const cli = (c.cliente ?? '').toLowerCase()
      return ticketN.includes(q) || num.includes(q) || cli.includes(q)
    })
  }, [coletasComTicket, filtroListaColeta])

  useEffect(() => {
    queueMicrotask(() => {
      void carregarColetas()
    })
  }, [carregarColetas])

  useEffect(() => {
    async function carregarCargo() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setCargo(null)
        return
      }
      const { data } = await supabase.from('usuarios').select('cargo').eq('id', user.id).maybeSingle()
      setCargo(data?.cargo ?? null)
    }
    void carregarCargo()
  }, [])

  const coletaAtiva = useMemo(
    () => resolverColetaPorContextoUrl(coletasComTicket, idsCtx),
    [coletasComTicket, idsCtx]
  )

  function aoEscolherColeta(id: string) {
    const p = new URLSearchParams(searchParams)
    if (id) p.set('coleta', id)
    else p.delete('coleta')
    setSearchParams(p, { replace: true })
  }

  return (
    <MainLayout>
      <div className="page-shell">
        <div style={{ marginBottom: 14, maxWidth: 480 }}>
          <label
            htmlFor="filtro-ticket-coleta"
            style={{ display: 'block', fontWeight: 800, color: '#0f172a', marginBottom: 6, fontSize: 13 }}
          >
            Filtrar lista (n.º ticket, coleta ou cliente)
          </label>
          <input
            id="filtro-ticket-coleta"
            type="search"
            value={filtroListaColeta}
            onChange={(e) => setFiltroListaColeta(e.target.value)}
            placeholder="Ex.: 1340 ou nome do cliente"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              fontSize: 14,
            }}
          />
        </div>
        <TicketOperacionalPanel
          variant="page"
          coletaAtiva={coletaAtiva}
          cargo={cargo}
          coletasOpcoes={coletasOpcoesFiltradas}
          carregandoColetas={carregandoColetas}
          onTrocarColeta={aoEscolherColeta}
          onEtapaColetaAlterada={() => void carregarColetas()}
        />
      </div>
    </MainLayout>
  )
}
