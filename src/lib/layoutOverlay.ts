import type { CSSProperties } from 'react'

/**
 * Overlay em `position: fixed` que cobre só a coluna principal (à direita da sidebar),
 * evitando que modais escureçam ou cubram o menu lateral.
 */
export const overlayAreaPrincipal: Pick<
  CSSProperties,
  'position' | 'top' | 'right' | 'bottom' | 'left'
> = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 'var(--sidebar-width)',
}
