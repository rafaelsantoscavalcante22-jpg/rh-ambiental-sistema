import MainLayout from '../layouts/MainLayout'
import { usePerfilUsuario } from '../contexts/PerfilUsuarioContext'
import { cargoPodeVerDashboardExecutivo } from '../lib/workflowPermissions'
import { ExecutiveDashboard } from '../components/executive/ExecutiveDashboard'
import DashboardLegacy from './DashboardLegacy'

export default function Dashboard() {
  const { usuario, carregandoUsuario } = usePerfilUsuario()

  if (carregandoUsuario) {
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

  const cargo = usuario?.cargo ?? null

  if (cargoPodeVerDashboardExecutivo(cargo)) {
    return <ExecutiveDashboard />
  }

  return <DashboardLegacy />
}
