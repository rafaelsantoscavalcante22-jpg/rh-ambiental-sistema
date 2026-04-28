import { useMemo, useState } from 'react'
import brazilMap from '@svg-country-maps/brazil'
import type { RegiaoNome } from '../../lib/brasilRegioes'
import { REGIOES_ORDEM } from '../../lib/brasilRegioes'

type Props = {
  /** Contagem por sigla UF em maiúsculas (ex.: SP, RJ). */
  contagensPorUf: Record<string, number>
  contagensRegiao: Record<RegiaoNome, number>
  destaques: Record<RegiaoNome, string[]>
}

/**
 * Mapa coroplético do Brasil por UF.
 * Geometria: @svg-country-maps/brazil (CC-BY-4.0, Victor Cazanave).
 */
export function BrasilMapaEstados({ contagensPorUf, contagensRegiao, destaques }: Props) {
  const [hoverUf, setHoverUf] = useState<string | null>(null)

  const maxUf = useMemo(() => {
    let m = 0
    for (const v of Object.values(contagensPorUf)) {
      if (v > m) m = v
    }
    return Math.max(1, m)
  }, [contagensPorUf])

  /** UF sem cadastro: verde muito claro legível sobre fundo branco. */
  const MAPA_SEM_DADOS = 'hsl(138, 32%, 93%)'
  /** Divisas entre UFs — verde médio-escuro para relevo sobre branco. */
  const STROKE_UF = 'hsl(146, 28%, 36%)'
  const STROKE_UF_HOVER = 'hsl(158, 45%, 22%)'
  /** Início da escala com dados (poucos clientes) — mesma família da legenda à esquerda. */
  const DATA_HSL_LO = { h: 143, s: 48, l: 56 }
  /** Fim da escala (muitos clientes): verde floresta, levemente azulado para contraste elegante. */
  const DATA_HSL_HI = { h: 159, s: 56, l: 22 }

  function mixHex(a: string, b: string, t: number): string {
    const p = Math.max(0, Math.min(1, t))
    const x = (h: string) => parseInt(h, 16)
    const ar = x(a.slice(1, 3))
    const ag = x(a.slice(3, 5))
    const ab = x(a.slice(5, 7))
    const br = x(b.slice(1, 3))
    const bg = x(b.slice(3, 5))
    const bb = x(b.slice(5, 7))
    const r = Math.round(ar + (br - ar) * p)
    const g = Math.round(ag + (bg - ag) * p)
    const bl = Math.round(ab + (bb - ab) * p)
    const h = (n: number) => n.toString(16).padStart(2, '0')
    return `#${h(r)}${h(g)}${h(bl)}`
  }

  function mixHsl(
    a: { h: number; s: number; l: number },
    b: { h: number; s: number; l: number },
    t: number
  ): string {
    const p = Math.max(0, Math.min(1, t))
    const h = a.h + (b.h - a.h) * p
    const s = a.s + (b.s - a.s) * p
    const l = a.l + (b.l - a.l) * p
    return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`
  }

  function smoothstep01(x: number): number {
    const t = Math.max(0, Math.min(1, x))
    return t * t * (3 - 2 * t)
  }

  /**
   * Escala em HSL (verdes naturais) + raiz no numerador: quando o máximo é muito alto (ex.: SP),
   * UFs com poucos clientes (MG, RJ) ainda ganham tons claramente distintos do “sem dados”.
   */
  function corIntensidadeCliente(n: number, max: number): string {
    if (n <= 0 || max <= 0) return MAPA_SEM_DADOS
    const tLin = Math.min(1, n / max)
    const t = smoothstep01(Math.sqrt(tLin))
    return mixHsl(DATA_HSL_LO, DATA_HSL_HI, t)
  }

  function corUf(ufUpper: string): string {
    const n = contagensPorUf[ufUpper] ?? 0
    if (n === 0) return MAPA_SEM_DADOS
    return corIntensidadeCliente(n, maxUf)
  }

  function corRegiaoLegenda(r: RegiaoNome): string {
    if (r === 'Sem região') return '#cbd5e1'
    const n = contagensRegiao[r] ?? 0
    if (n === 0) return MAPA_SEM_DADOS
    const nums = REGIOES_ORDEM.filter((x) => x !== 'Sem região').map((x) => contagensRegiao[x] ?? 0)
    const max = Math.max(1, ...nums)
    return corIntensidadeCliente(n, max)
  }

  const hoverNome =
    hoverUf != null
      ? brazilMap.locations.find((l) => l.id.toUpperCase() === hoverUf)?.name ?? hoverUf
      : null
  const hoverN = hoverUf != null ? (contagensPorUf[hoverUf] ?? 0) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div
        style={{
          position: 'relative',
          borderRadius: '14px',
          background: '#ffffff',
          padding: '12px 10px 10px',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(45, 90, 60, 0.1)',
        }}
      >
        <svg
          viewBox={brazilMap.viewBox}
          role="img"
          aria-label="Mapa do Brasil — clientes por estado (UF)"
          style={{
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            display: 'block',
            filter: 'drop-shadow(0 2px 8px rgba(15, 23, 42, 0.06))',
          }}
        >
          <g>
            {brazilMap.locations.map((loc) => {
              const uf = loc.id.toUpperCase()
              const active = hoverUf === uf
              const fillBase = corUf(uf)
              const fill = active ? mixHex(fillBase, '#f7fef9', 0.22) : fillBase
              return (
                <path
                  key={loc.id}
                  d={loc.path}
                  fill={fill}
                  stroke={active ? STROKE_UF_HOVER : STROKE_UF}
                  strokeWidth={active ? 1.55 : 1.08}
                  strokeLinejoin="round"
                  paintOrder="fill stroke"
                  style={{
                    cursor: 'pointer',
                    transition: 'fill 0.18s ease, stroke 0.15s ease, stroke-width 0.12s ease',
                  }}
                  onMouseEnter={() => setHoverUf(uf)}
                  onMouseLeave={() => setHoverUf(null)}
                >
                  <title>{`${loc.name} (${uf}): ${contagensPorUf[uf] ?? 0} cliente(s)`}</title>
                </path>
              )
            })}
          </g>
        </svg>

        {hoverUf != null && hoverNome != null ? (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: '14px',
              transform: 'translateX(-50%)',
              background: '#0f172a',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              padding: '8px 14px',
              borderRadius: '10px',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
            }}
          >
            {hoverNome} · {hoverN} cliente{hoverN === 1 ? '' : 's'}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            marginTop: '8px',
            padding: '0 6px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.02em' }}>
            Intensidade = volume de clientes com UF no cadastro
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: '#64748b' }}>
            <span
              style={{
                width: '72px',
                height: '10px',
                borderRadius: '999px',
                border: '1px solid rgba(12, 74, 44, 0.2)',
                background: `linear-gradient(90deg, ${mixHsl(DATA_HSL_LO, DATA_HSL_HI, 0)}, ${mixHsl(DATA_HSL_LO, DATA_HSL_HI, 0.45)}, ${mixHsl(DATA_HSL_LO, DATA_HSL_HI, 1)})`,
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35)',
              }}
            />
            <span style={{ fontWeight: 600 }}>menos → mais</span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: '10px',
          fontSize: '13px',
          color: '#475569',
        }}
      >
        {REGIOES_ORDEM.filter((r) => r !== 'Sem região').map((r) => {
          const tops = destaques[r] ?? []
          return (
            <div
              key={r}
              style={{
                borderLeft: `3px solid ${corRegiaoLegenda(r)}`,
                paddingLeft: '10px',
                background: 'transparent',
                borderRadius: '0 8px 8px 0',
              }}
            >
              <div style={{ fontWeight: 800, color: '#0f172a' }}>
                {r}{' '}
                <span style={{ fontWeight: 600, color: '#64748b' }}>({contagensRegiao[r] ?? 0})</span>
              </div>
              {tops.length > 0 ? (
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                  {tops.map((nome) => (
                    <li key={nome} style={{ lineHeight: 1.35 }}>
                      {nome}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
                  Nenhum cliente com UF nesta região.
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
