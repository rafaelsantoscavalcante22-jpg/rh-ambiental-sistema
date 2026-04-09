/** Escapa `%`, `_` e `\` para uso seguro dentro de `ilike` no PostgREST. */
export function sanitizeIlikePattern(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
