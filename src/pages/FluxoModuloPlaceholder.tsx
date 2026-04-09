import { Link, useSearchParams } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'

type FluxoModuloPlaceholderProps = {
  titulo: string
  descricao: string
}

function montarLinkControleMassa(searchParams: URLSearchParams) {
  const p = new URLSearchParams()
  ;['coleta', 'mtr', 'programacao', 'cliente', 'controle'].forEach((key) => {
    const v = searchParams.get(key)
    if (v) p.set(key, v)
  })
  const qs = p.toString()
  return qs ? `/controle-massa?${qs}` : '/controle-massa'
}

/**
 * Base comum para módulos do fluxo operacional (checklist, ticket, etc.).
 * Lê contexto da URL (?coleta= & ?mtr= & ?programacao= & ?cliente= & ?controle=) e liga ao hub.
 */
export default function FluxoModuloPlaceholder({ titulo, descricao }: FluxoModuloPlaceholderProps) {
  const [searchParams] = useSearchParams()
  const linkHub = montarLinkControleMassa(searchParams)
  const temContexto = ['coleta', 'mtr', 'programacao', 'cliente', 'controle'].some(
    (k) => searchParams.get(k)
  )

  return (
    <MainLayout>
      <div className="page-shell" style={{ maxWidth: 720 }}>
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>{titulo}</h1>
        <p className="page-header__lead" style={{ margin: '10px 0 0', color: '#64748b', lineHeight: 1.5 }}>
          {descricao}
        </p>
        <div
          style={{
            marginTop: '20px',
            padding: '16px 18px',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            background: '#f8fafc',
            fontSize: '14px',
            color: '#475569',
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: '#0f172a' }}>Integração com o hub</strong>
          <p style={{ margin: '8px 0 0' }}>
            O fluxo oficial passa pelo <strong>Controle de Massa</strong>. Use os parâmetros na URL
            (<code style={{ fontSize: '12px' }}>?coleta=</code>, <code style={{ fontSize: '12px' }}>?mtr=</code>,{' '}
            <code style={{ fontSize: '12px' }}>?programacao=</code>, <code style={{ fontSize: '12px' }}>?cliente=</code>)
            para abrir cada módulo já contextualizado a partir da programação ou da coleta.
          </p>
          <p style={{ margin: '10px 0 0' }}>
            Estado atual da URL:{' '}
            {temContexto ? (
              <span style={{ color: '#15803d', fontWeight: 700 }}>contexto carregado</span>
            ) : (
              <span style={{ color: '#64748b' }}>sem parâmetros — escolha uma coleta no Controle de Massa e volte por aqui.</span>
            )}
          </p>
          <div style={{ marginTop: '14px' }}>
            <Link
              to={linkHub}
              style={{
                display: 'inline-block',
                padding: '10px 16px',
                borderRadius: '10px',
                background: '#16a34a',
                color: '#fff',
                fontWeight: 700,
                fontSize: '14px',
                textDecoration: 'none',
              }}
            >
              Ir ao Controle de Massa {temContexto ? 'com este contexto' : ''}
            </Link>
          </div>
        </div>
        <p style={{ marginTop: '18px', fontSize: '13px', color: '#94a3b8' }}>
          Módulo em evolução: formulários e regras de etapa serão ligados às tabelas Supabase na mesma ordem do processo
          real (sem saltos).
        </p>
      </div>
    </MainLayout>
  )
}
