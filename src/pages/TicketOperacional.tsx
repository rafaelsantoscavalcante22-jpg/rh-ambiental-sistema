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

export default function TicketOperacional() {
  const [searchParams, setSearchParams] = useSearchParams()
  const idsCtx = useMemo(() => idsContextoFromSearchParams(searchParams), [searchParams])

  const [coletas, setColetas] = useState<TicketColetaSnapshot[]>([])
  const [carregandoColetas, setCarregandoColetas] = useState(true)
  const [cargo, setCargo] = useState<string | null>(null)

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
    () => resolverColetaPorContextoUrl(coletas, idsCtx),
    [coletas, idsCtx]
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
        <TicketOperacionalPanel
          variant="page"
          coletaAtiva={coletaAtiva}
          cargo={cargo}
          coletasOpcoes={coletas}
          carregandoColetas={carregandoColetas}
          onTrocarColeta={aoEscolherColeta}
          onEtapaColetaAlterada={() => void carregarColetas()}
        />
      </div>
    </MainLayout>
  )
}
