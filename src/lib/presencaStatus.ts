export type PresencaStatus = 'online' | 'ausente' | 'offline'

const VALORES: ReadonlySet<string> = new Set(['online', 'ausente', 'offline'])

export function normalizarPresencaStatus(v: string | null | undefined): PresencaStatus {
  const s = (v || '').toLowerCase().trim()
  if (VALORES.has(s)) return s as PresencaStatus
  return 'online'
}

export function etiquetaPresenca(s: PresencaStatus): string {
  switch (s) {
    case 'ausente':
      return 'Ausente'
    case 'offline':
      return 'Offline'
    default:
      return 'Online'
  }
}
