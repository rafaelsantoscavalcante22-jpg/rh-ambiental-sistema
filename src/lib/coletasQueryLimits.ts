/**
 * Teto de linhas para listas que ordenam por `created_at` desc.
 * Evita transferir a tabela `coletas` inteira (principal custo em Dashboard / Financeiro).
 */
export const COLETAS_LIST_MAX_ROWS = 2000

/** Dropdowns de coleta (Faturamento, Aprovação, etc.) — lista com colunas enxutas. */
export const COLETAS_DROPDOWN_MAX_ROWS = 2000

/** Tamanhos de página para listas administrativas. */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25
