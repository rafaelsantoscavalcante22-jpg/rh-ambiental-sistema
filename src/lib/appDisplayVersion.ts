import { useEffect, useState } from 'react'

const LS_STAMP = 'rg_app_build_stamp_ok'
const LS_EXTRA = 'rg_versao_extra_balao_patch'

export const RG_VERSAO_DISPLAY_EVENT = 'rg-display-version-changed'

function parseSemverTriplet(v: string): [number, number, number] {
  const parts = v.trim().split('.')
  const a = parseInt(parts[0] ?? '1', 10)
  const b = parseInt(parts[1] ?? '0', 10)
  const c = parseInt(parts[2] ?? '0', 10)
  return [
    Number.isFinite(a) ? a : 1,
    Number.isFinite(b) ? b : 0,
    Number.isFinite(c) ? c : 0,
  ]
}

/** Zera o extra quando o utilizador já está num bundle novo (carimbo de build diferente). */
export function syncDisplayVersionWithCurrentBuild(): void {
  if (typeof window === 'undefined') return
  const stamp = String(import.meta.env.VITE_APP_BUILD_STAMP || '').trim()
  if (!stamp) return
  const prev = localStorage.getItem(LS_STAMP)
  if (prev !== stamp) {
    localStorage.setItem(LS_STAMP, stamp)
    localStorage.setItem(LS_EXTRA, '0')
  }
}

/**
 * Chamado quando o balão de atualização é mostrado (cada vez que passa de oculto → visível).
 * Regra de produto: cada ocorrência avança o número de patch **exibido** (soma ao patch do package.json).
 */
export function incrementarVersaoPorBalaoAtualizacao(): void {
  if (typeof window === 'undefined') return
  syncDisplayVersionWithCurrentBuild()
  const cur = parseInt(localStorage.getItem(LS_EXTRA) || '0', 10)
  const n = Number.isFinite(cur) && cur >= 0 ? cur : 0
  localStorage.setItem(LS_EXTRA, String(Math.min(n + 1, 999)))
}

export function emitVersaoRgDisplayChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(RG_VERSAO_DISPLAY_EVENT))
}

export function getVersaoRgParaExibir(): string {
  if (typeof window !== 'undefined') {
    syncDisplayVersionWithCurrentBuild()
  }
  const base = String(import.meta.env.VITE_APP_VERSION || '0.0.0').trim()
  const [maj, min, pat] = parseSemverTriplet(base)
  let extra = 0
  if (typeof window !== 'undefined') {
    const e = parseInt(localStorage.getItem(LS_EXTRA) || '0', 10)
    extra = Number.isFinite(e) && e > 0 ? e : 0
  }
  const patchShown = Math.min(pat + extra, 99999)
  return `R${maj}.${min}.${patchShown}`
}

export function useVersaoRgExibir(): string {
  const [label, setLabel] = useState(() => getVersaoRgParaExibir())
  useEffect(() => {
    const fn = () => setLabel(getVersaoRgParaExibir())
    window.addEventListener(RG_VERSAO_DISPLAY_EVENT, fn)
    return () => window.removeEventListener(RG_VERSAO_DISPLAY_EVENT, fn)
  }, [])
  return label
}
