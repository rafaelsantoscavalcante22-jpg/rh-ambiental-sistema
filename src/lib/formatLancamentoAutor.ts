/**
 * Texto de auditoria «quem lançou» para programação / MTR (fuso America/Sao_Paulo).
 */
export function formatarLancadoPorResumo(
  nome: string | null | undefined,
  createdAtIso: string | null | undefined
): string | null {
  const raw = (createdAtIso ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  const tz = 'America/Sao_Paulo'
  const dataStr = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: tz,
  }).format(d)
  const horaStr = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(d)
  const quem = (nome ?? '').trim() || 'Usuário'
  return `Lançado por ${quem} em ${dataStr} as ${horaStr}`
}
