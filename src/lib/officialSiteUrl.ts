/**
 * Domínio oficial único do sistema em produção (Vercel).
 * Usar para links partilhados, documentação e redirects — não divulgar URLs de deployment
 * (ex.: *-xxxx.vercel.app), que são por build e podem ficar desatualizadas.
 */
export const OFFICIAL_SITE_ORIGIN = 'https://rh-ambiental-sistema.vercel.app' as const

/** Caminho com barra inicial, por defeito `/`. */
export function officialSiteUrl(path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${OFFICIAL_SITE_ORIGIN}${p}`
}
