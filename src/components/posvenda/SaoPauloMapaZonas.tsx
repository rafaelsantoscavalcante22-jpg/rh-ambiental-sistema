import { useMemo, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
} from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ZonaSpCarteira } from '../../lib/saoPauloPosVendaZonas'
import {
  ZONAS_SP_MAPA_ORDEM,
  ZONA_SP_COR_BASE,
  ZONA_SP_LABEL,
} from '../../lib/saoPauloPosVendaZonas'

type Props = {
  contagensPorZona: Record<ZonaSpCarteira, number>
  destaques: Record<ZonaSpCarteira, string[]>
  filtroZona: 'todas' | ZonaSpCarteira
  onFiltroZonaChange: (z: 'todas' | ZonaSpCarteira) => void
}

/** Limites aproximados do estado de SP (sul-oeste → nordeste). */
const SP_BOUNDS: LatLngBoundsExpression = [
  [-24.35, -53.35],
  [-19.72, -44.05],
]

/**
 * Posições representativas (cidades / subprefeituras) para plotar volume da carteira.
 * Não é geocodificação por cliente — é um painel de agregação legível no mapa real.
 */
const ZONA_LATLNG: Record<Exclude<ZonaSpCarteira, 'fora_sp'>, [number, number]> = {
  interior_sp: [-22.2139, -49.9458],
  grande_sp: [-23.687, -46.619],
  zona_norte: [-23.482, -46.619],
  zona_sul: [-23.653, -46.72],
  zona_leste: [-23.541, -46.576],
  zona_oeste: [-23.568, -46.708],
  centro: [-23.545, -46.638],
  indefinido: [-23.555, -46.645],
}

const MAP_ZOOM_MAX = 9
const MAP_ZOOM_MIN = 6

function raioMarcador(n: number, max: number): number {
  if (n <= 0) return 11
  const t = Math.min(1, n / max)
  return Math.round(12 + t * 26)
}

function opacidadeFill(filtro: 'todas' | ZonaSpCarteira, z: ZonaSpCarteira): number {
  if (filtro === 'todas') return 0.82
  return filtro === z ? 0.9 : 0.18
}

/**
 * Mapa geográfico (Leaflet + basemap claro): bolhas proporcionais ao volume por zona.
 * “Fora de SP” permanece só na legenda (fora do território).
 */
export function SaoPauloMapaZonas({
  contagensPorZona,
  destaques,
  filtroZona,
  onFiltroZonaChange,
}: Props) {
  const [hoverZona, setHoverZona] = useState<ZonaSpCarteira | null>(null)

  const maxContagem = useMemo(() => {
    let m = 0
    for (const z of ZONAS_SP_MAPA_ORDEM) {
      if (z === 'fora_sp') continue
      const v = contagensPorZona[z] ?? 0
      if (v > m) m = v
    }
    return Math.max(1, m)
  }, [contagensPorZona])

  const marcadoresOrdenados = useMemo(() => {
    const lista = ZONAS_SP_MAPA_ORDEM.filter((z) => z !== 'fora_sp').map((z) => ({
      z,
      center: ZONA_LATLNG[z],
      n: contagensPorZona[z] ?? 0,
      r: raioMarcador(contagensPorZona[z] ?? 0, maxContagem),
    }))
    return lista.sort((a, b) => b.r - a.r)
  }, [contagensPorZona, maxContagem])

  function toggle(z: ZonaSpCarteira) {
    onFiltroZonaChange(filtroZona === z ? 'todas' : z)
  }

  const hoverLabel =
    hoverZona != null
      ? `${ZONA_SP_LABEL[hoverZona]} — ${contagensPorZona[hoverZona] ?? 0} cliente(s)`
      : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div
        className="posvenda-sp-map-wrap"
        style={{
          position: 'relative',
          borderRadius: '16px',
          background: 'linear-gradient(165deg, #f8fafc 0%, #f1f5f9 100%)',
          padding: '12px',
          boxShadow:
            '0 4px 24px rgba(15, 23, 42, 0.07), 0 0 0 1px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div
          className="posvenda-sp-map"
          style={{
            height: 340,
            width: '100%',
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(15, 23, 42, 0.08)',
          }}
        >
          <MapContainer
            bounds={SP_BOUNDS}
            boundsOptions={{ padding: [18, 18] }}
            maxBounds={SP_BOUNDS}
            maxBoundsViscosity={1}
            minZoom={MAP_ZOOM_MIN}
            maxZoom={MAP_ZOOM_MAX}
            zoomControl
            scrollWheelZoom
            style={{ height: '100%', width: '100%', background: '#e2e8f0' }}
            attributionControl
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={20}
            />
            {marcadoresOrdenados.map(({ z, center, n, r }) => {
              const base = ZONA_SP_COR_BASE[z]
              const filtrado = filtroZona !== 'todas' && filtroZona !== z
              const stroke = filtroZona === z ? '#0c4a6e' : hoverZona === z ? '#0369a1' : 'rgba(255,255,255,0.92)'
              const strokeW = filtroZona === z ? 3 : 2
              return (
                <CircleMarker
                  key={z}
                  center={center}
                  radius={r}
                  pathOptions={{
                    fillColor: base,
                    fillOpacity: opacidadeFill(filtroZona, z),
                    color: stroke,
                    weight: strokeW,
                    opacity: filtrado ? 0.35 : 0.95,
                  }}
                  eventHandlers={{
                    click: () => toggle(z),
                    mouseover: () => setHoverZona(z),
                    mouseout: () => setHoverZona(null),
                  }}
                >
                  <Tooltip
                    permanent={false}
                    direction="top"
                    offset={[0, -6]}
                    opacity={0.95}
                    className="posvenda-sp-tooltip"
                  >
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#0f172a' }}>
                      {ZONA_SP_LABEL[z]}
                    </div>
                    <div style={{ fontSize: 11, color: '#475569' }}>
                      {n} cliente{n === 1 ? '' : 's'}
                      {n === 0 ? ' · posição de referência' : ''}
                    </div>
                  </Tooltip>
                </CircleMarker>
              )
            })}
          </MapContainer>
        </div>

        {hoverLabel ? (
          <div
            style={{
              position: 'absolute',
              left: 20,
              bottom: 16,
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.93), rgba(30, 41, 59, 0.95))',
              color: '#f8fafc',
              fontSize: 12,
              fontWeight: 600,
              padding: '8px 12px',
              borderRadius: 10,
              pointerEvents: 'none',
              maxWidth: 'calc(100% - 40px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {hoverLabel}
          </div>
        ) : null}

        <style>{`
          .posvenda-sp-map .leaflet-container {
            font-family: system-ui, 'Segoe UI', sans-serif;
          }
          .posvenda-sp-map .leaflet-control-attribution {
            font-size: 10px;
            background: rgba(255, 255, 255, 0.82);
            border-radius: 6px 0 0 0;
          }
          .posvenda-sp-tooltip {
            border: none !important;
            border-radius: 8px !important;
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.12) !important;
            padding: 6px 10px !important;
          }
        `}</style>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => onFiltroZonaChange('todas')}
          style={{
            border: filtroZona === 'todas' ? '2px solid #047857' : '1px solid #cbd5e1',
            background: filtroZona === 'todas' ? 'linear-gradient(180deg,#ecfdf5,#d1fae5)' : '#fff',
            borderRadius: 999,
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 700,
            color: '#0f172a',
            cursor: 'pointer',
            boxShadow: filtroZona === 'todas' ? '0 1px 3px rgba(4,120,87,0.15)' : undefined,
          }}
        >
          Todas as zonas
        </button>
        {ZONAS_SP_MAPA_ORDEM.map((z) => {
          const n = contagensPorZona[z] ?? 0
          const ativo = filtroZona === z
          return (
            <button
              key={z}
              type="button"
              onClick={() => toggle(z)}
              title={[ZONA_SP_LABEL[z], `${n} cliente(s)`, ...(destaques[z] ?? []).slice(0, 3)].join(
                ' · '
              )}
              style={{
                border: ativo ? `2px solid ${ZONA_SP_COR_BASE[z]}` : '1px solid #e2e8f0',
                background: ativo ? '#f8fafc' : '#fff',
                borderRadius: 999,
                padding: '7px 13px',
                fontSize: 12,
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: ativo ? '0 2px 8px rgba(15,23,42,0.06)' : '0 1px 2px rgba(15,23,42,0.04)',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: ZONA_SP_COR_BASE[z],
                  flexShrink: 0,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
              />
              <span>
                {ZONA_SP_LABEL[z]} ({n})
              </span>
            </button>
          )
        })}
      </div>

      {filtroZona !== 'todas' ? (
        <div
          style={{
            fontSize: 13,
            color: '#475569',
            background: 'linear-gradient(180deg, #f8fafc, #f1f5f9)',
            borderRadius: 12,
            padding: '12px 14px',
            border: '1px solid #e2e8f0',
          }}
        >
          <strong style={{ color: '#0f172a' }}>Destaques — {ZONA_SP_LABEL[filtroZona]}:</strong>{' '}
          {(destaques[filtroZona] ?? []).length ? (destaques[filtroZona] ?? []).join(' · ') : '—'}
        </div>
      ) : null}

      <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
        Mapa real (OpenStreetMap / CARTO Voyager). Cada zona é um marcador na posição de referência
        usada pela equipe; o tamanho do círculo segue o número de clientes naquela categoria. Não é
        geocodificação endereço a endereço. “Fora de SP” só na legenda.
      </p>
    </div>
  )
}
