import { useEffect, useState } from 'react'
import MainLayout from '../layouts/MainLayout'
import { supabase } from '../lib/supabase'
import { cargoPodeVerDashboardExecutivo } from '../lib/workflowPermissions'
import { ExecutiveDashboard } from '../components/executive/ExecutiveDashboard'
import DashboardLegacy from './DashboardLegacy'

export default function Dashboard() {
  const [cargo, setCargo] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setCargo(null)
        return
      }
      const { data } = await supabase.from('usuarios').select('cargo').eq('id', user.id).maybeSingle()
      if (!cancelled) setCargo(data?.cargo ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (cargo === undefined) {
    return (
      <MainLayout>
        <div
          className="page-shell"
          style={{
            padding: 'min(12vh, 120px) 24px',
            textAlign: 'center',
            color: '#64748b',
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: '#475569' }}>A carregar o painel executivo…</p>
        </div>
      </MainLayout>
    )
  }

  if (cargoPodeVerDashboardExecutivo(cargo)) {
    return <ExecutiveDashboard />
  }

  return <DashboardLegacy />
}
