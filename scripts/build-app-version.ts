import { readFileSync } from 'node:fs'

/**
 * Versão exibida no UI: semver do `package.json` + uma letra opcional no fim.
 * - V = build lançada pelo Vinicius
 * - R = build lançada pelo Rafael
 *
 * Definir em `.env` / Vercel: `APP_VERSION_AUTHOR=V` ou `=R` (também aceita `VITE_APP_VERSION_AUTHOR`).
 * O `version` em package.json deve ser semver sem sufixo (ex.: 1.0.0).
 */
export function getAppVersionDisplayString(
  pkgJsonPath: string,
  env: Record<string, string | undefined>
): string {
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
    version?: string
  }
  const rawVersion = typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  const base = rawVersion.replace(/[vVrR]$/u, '')
  const mark = String(
    env.APP_VERSION_AUTHOR ?? env.VITE_APP_VERSION_AUTHOR ?? ''
  )
    .trim()
    .toUpperCase()
    .slice(0, 1)
  const suffix = mark === 'V' || mark === 'R' ? mark : ''
  return suffix ? `${base}${suffix}` : base
}
