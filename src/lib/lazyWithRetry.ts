import { lazy, type ComponentType } from 'react'

const CHUNK_RELOAD_KEY = 'rg-chunk-reload-once'

function isChunkOrImportFailure(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return (
    /Failed to fetch dynamically imported module/i.test(m) ||
    /Loading chunk \d+ failed/i.test(m) ||
    /Importing a module script failed/i.test(m) ||
    /error loading dynamically imported module/i.test(m)
  )
}

/**
 * Como `React.lazy`, mas após um novo deploy o utilizador pode ter o bundle antigo em memória
 * a referenciar chunks que já não existem. Recarrega a página uma vez para obter o HTML/JS novos.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await factory()
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      return mod
    } catch (e) {
      if (isChunkOrImportFailure(e) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
        window.location.reload()
        return {
          default: (() => null) as unknown as T,
        }
      }
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      throw e
    }
  })
}
